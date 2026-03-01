import { AuditLogEvent, PermissionFlagsBits } from "discord.js";
import { readWhitelist } from "./storage.js";

function hasInviteLink(content) {
  if (!content) return false;
  const c = content.toLowerCase();
  return c.includes("discord.gg/") || c.includes("discord.com/invite/") || c.includes("discordapp.com/invite/");
}

function mentionCount(message) {
  return (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
}

export async function isWhitelistedUserId(userId) {
  const wl = await readWhitelist();
  return wl.userIds?.includes(String(userId)) ?? false;
}

export async function enforceMessageProtections(message, { logChannel, moderation } = {}) {
  if (!message.guild || message.author?.bot) return;
  if (!message.member) return;

  const bypass = (await isWhitelistedUserId(message.author.id)) || message.member.permissions.has(PermissionFlagsBits.Administrator);
  if (bypass) return;

  const mod = moderation ?? {};

  // Anti-webhook
  if (mod.antiWebhook !== false && message.webhookId) {
    try {
      await message.delete();
    } catch {}
    await logChannel?.send?.({ content: `🛡️ Webhook supprimé dans <#${message.channelId}>.` }).catch(() => {});
    return;
  }

  // Anti invite Discord
  if (mod.antiInvite !== false && hasInviteLink(message.content)) {
    try {
      await message.delete();
    } catch {}
    await logChannel
      ?.send?.({ content: `🛡️ Lien d'invitation supprimé (auteur: <@${message.author.id}>) dans <#${message.channelId}>.` })
      .catch(() => {});
    return;
  }

  // Anti mention spam
  if (mod.antiMentionSpam !== false) {
    const mentions = mentionCount(message);
    if (mentions >= 6) {
      try {
        await message.delete();
      } catch {}
      try {
        await message.member.timeout(10 * 60 * 1000, "Spam mention");
      } catch {}
      await logChannel
        ?.send?.({ content: `🛡️ Spam mention: timeout 10 min pour <@${message.author.id}> (mentions: ${mentions}).` })
        .catch(() => {});
      return;
    }
  }
}

async function fetchLastAuditActor(guild, type) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    const entry = logs.entries.first();
    if (!entry) return null;
    return { executorId: entry.executor?.id ?? null, createdTimestamp: entry.createdTimestamp ?? 0 };
  } catch {
    return null;
  }
}

export async function enforceChannelDeleteProtection(channel, { logChannel, moderation } = {}) {
  if (moderation?.antiChannelDelete === false) return;

  const guild = channel.guild;
  const actor = await fetchLastAuditActor(guild, AuditLogEvent.ChannelDelete);
  if (!actor?.executorId) return;
  if (actor.executorId === guild.client.user?.id) return;

  const bypass = await isWhitelistedUserId(actor.executorId);
  if (bypass) return;

  // Best-effort punishment
  try {
    const member = await guild.members.fetch(actor.executorId);
    if (member?.bannable) await member.ban({ reason: "Suppression de salon (protection)" });
    else if (member?.kickable) await member.kick("Suppression de salon (protection)");
  } catch {}

  await logChannel
    ?.send?.({ content: `🛡️ Protection: salon supprimé par <@${actor.executorId}> → sanction appliquée (best-effort).` })
    .catch(() => {});
}

