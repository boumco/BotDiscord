import "dotenv/config";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  InteractionType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import { configCommand } from "./slash/config.js";
import { helpCommand } from "./slash/help.js";
import { musicCommand } from "./slash/music.js";
import { whitelistCommand } from "./slash/whitelist.js";
import { readState } from "./lib/storage.js";
import { getModerationConfig } from "./lib/moderationConfig.js";
import { enforceChannelDeleteProtection, enforceMessageProtections } from "./lib/moderation.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Missing DISCORD_TOKEN in environment.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

client.commands = new Collection();
client.commands.set(configCommand.data.name, configCommand);
client.commands.set(helpCommand.data.name, helpCommand);
client.commands.set(musicCommand.data.name, musicCommand);
client.commands.set(whitelistCommand.data.name, whitelistCommand);

const verifyChallenges = new Map(); // userId -> { code, guildId, expiresAt }

async function getLogChannel(guild) {
  const state = await readState();
  const chId = state?.[guild.id]?.channels?.logs;
  if (!chId) return null;
  try {
    return await guild.channels.fetch(chId);
  } catch {
    return null;
  }
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    // Verify button
    if (interaction.isButton() && interaction.customId === "verify:start") {
      if (!interaction.inGuild()) return;

      const code = randomCode();
      verifyChallenges.set(interaction.user.id, {
        code,
        guildId: interaction.guildId,
        expiresAt: Date.now() + 2 * 60 * 1000
      });

      const modal = new ModalBuilder().setCustomId("verify:modal").setTitle("Vérification");
      const input = new TextInputBuilder()
        .setCustomId("verify:code")
        .setLabel(`Recopie ce code: ${code}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(16);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // Verify modal submit
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "verify:modal") {
      if (!interaction.inGuild()) return;

      const entry = verifyChallenges.get(interaction.user.id);
      verifyChallenges.delete(interaction.user.id);

      if (!entry || entry.guildId !== interaction.guildId || entry.expiresAt < Date.now()) {
        await interaction.reply({ content: "⏱️ Vérification expirée. Recommence.", ephemeral: true });
        return;
      }

      const typed = interaction.fields.getTextInputValue("verify:code")?.trim()?.toUpperCase();
      if (typed !== entry.code) {
        await interaction.reply({ content: "❌ Code incorrect. Recommence.", ephemeral: true });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const memberRole = interaction.guild.roles.cache.find((r) => r.name === "Membre");
      const unverifiedRole = interaction.guild.roles.cache.find((r) => r.name === "Non vérifié");
      if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});
      if (memberRole) await member.roles.add(memberRole).catch(() => {});

      await interaction.reply({ content: "✅ Vérification réussie. Bienvenue !", ephemeral: true });
      return;
    }

    // Role select menus
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("roles:")) {
      if (!interaction.inGuild()) return;
      const member = await interaction.guild.members.fetch(interaction.user.id);

      const selectedRoleIds = interaction.values;
      // Remove all roles that belong to this group (by matching options present in this message)
      const groupOptionRoleIds = interaction.component.options.map((o) => o.value);

      const toRemove = groupOptionRoleIds.filter((rid) => member.roles.cache.has(rid) && !selectedRoleIds.includes(rid));
      const toAdd = selectedRoleIds.filter((rid) => !member.roles.cache.has(rid));

      await member.roles.remove(toRemove).catch(() => {});
      await member.roles.add(toAdd).catch(() => {});

      await interaction.reply({ content: "✅ Rôles mis à jour.", ephemeral: true });
      return;
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({ content: "Erreur interne.", ephemeral: true });
      } catch {
        // ignore
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) return;
  const state = await readState();
  const logChannel = await getLogChannel(message.guild);
  const moderation = getModerationConfig(state, message.guild.id);
  await enforceMessageProtections(message, { logChannel, moderation });

  // Salon médias: uniquement images/vidéos
  try {
    const mediasId = state?.[message.guild.id]?.channels?.medias;
    if (mediasId && message.channelId === mediasId && !message.author.bot) {
      const hasMedia =
        (message.attachments && message.attachments.size > 0) || (message.stickers && message.stickers.size > 0);
      if (!hasMedia) {
        await message.delete().catch(() => {});
      }
    }
  } catch {
    // ignore
  }
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  const state = await readState();
  const logChannel = await getLogChannel(channel.guild);
  const moderation = getModerationConfig(state, channel.guild.id);
  await enforceChannelDeleteProtection(channel, { logChannel, moderation });
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

await client.login(token);

