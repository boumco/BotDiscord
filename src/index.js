import "dotenv/config";
import {
  Client,
  Collection,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  InteractionType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} from "discord.js";

import { configCommand } from "./slash/config.js";
import { helpCommand } from "./slash/help.js";
import { musicCommand } from "./slash/music.js";
import { whitelistCommand } from "./slash/whitelist.js";
import { readState, writeState, readConfigVocal, writeConfigVocal } from "./lib/storage.js";
import { getModerationConfig } from "./lib/moderationConfig.js";
import { enforceChannelDeleteProtection, enforceMessageProtections } from "./lib/moderation.js";
import { buildWelcomeEmbed, buildTicketChannelComponents, buildTicketDeleteNowEmbed, buildStarButtons, buildYesNoButtons } from "./lib/embeds.js";
import { getFaqResponse } from "./lib/faq.js";
import { STAFF_ROLE_ID, ADMIN_ROLE_IDS, isStaffOrAdmin, isAdmin, TICKET_OVERWRITE_ALLOW } from "./lib/ticketConfig.js";
import { statstaffCommand } from "./slash/statstaff.js";
import { tachefiniCommand, handleTachefiniSelect } from "./slash/tachefini.js";
import {
  addtaskCommand,
  handleAddTaskModal,
  handleAddTaskPredecessorSelect,
  handleAddTaskResponsiblesSelect,
  handleAddTaskSubmit
} from "./slash/addtask.js";
import { tasklistCommand } from "./slash/tasklist.js";
import { startTaskScheduler, sendWeeklyProgramOnStart } from "./lib/taskScheduler.js";

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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();
client.commands.set(configCommand.data.name, configCommand);
client.commands.set(helpCommand.data.name, helpCommand);
client.commands.set(musicCommand.data.name, musicCommand);
client.commands.set(whitelistCommand.data.name, whitelistCommand);
client.commands.set(statstaffCommand.data.name, statstaffCommand);
client.commands.set(tachefiniCommand.data.name, tachefiniCommand);
client.commands.set(addtaskCommand.data.name, addtaskCommand);
client.commands.set(tasklistCommand.data.name, tasklistCommand);

const verifyChallenges = new Map(); // userId -> { code, guildId, expiresAt }
/** Cache des invitations par serveur : guildId -> Map(code -> { uses, inviterId, inviterTag }) */
const inviteCache = new Map();
/** Salon vocal vide en attente de suppression après 30 s : channelId -> { timeoutId, guildId } */
const pendingDeleteVoiceChannels = new Map();
const VOICE_EMPTY_DELAY_MS = 30_000;
const TICKET_DELETE_DELAY_MS = 24 * 60 * 60 * 1000; // 24 h
/** Empêche de créer 2 salons en parallèle pour le même utilisateur */
const voiceCreationInProgress = new Set();
/** Sondage post-ticket : userId -> { step, staffId, guildId, resolution, sympathy, rapidite, wantComment } */
const surveyState = new Map();

const DEBUG_VOICE = true;
const _c = {
  R: "\x1b[0m",
  g: "\x1b[32m",
  y: "\x1b[33m",
  b: "\x1b[34m",
  m: "\x1b[35m",
  c: "\x1b[36m",
  w: "\x1b[90m",
  r: "\x1b[31m",
  bold: "\x1b[1m"
};
function debugVoice(label, ...rest) {
  if (!DEBUG_VOICE) return;
  const ts = new Date().toISOString().slice(11, 23);
  const head = `${_c.w}${ts} ${_c.R}${_c.c}[VOICE]${_c.R} ${_c.y}${label}${_c.R}`;
  if (rest.length === 0) {
    console.log(head);
    return;
  }
  const out = [head];
  for (const x of rest) {
    if (x !== null && typeof x === "object" && !(x instanceof Error)) {
      const entries = Object.entries(x);
      if (entries.length === 0) out.push(`  ${_c.w}(vide)${_c.R}`);
      else entries.forEach(([k, v]) => {
        const val = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
        out.push(`  ${_c.b}${k}${_c.R} ${_c.g}${val}${_c.R}`);
      });
    } else if (x instanceof Error) {
      out.push(`  ${_c.r}${x.message}${_c.R}`);
    } else {
      out.push(`  ${_c.g}${String(x)}${_c.R}`);
    }
  }
  console.log(out.join("\n"));
}

async function saveSurveyAndFinish(survey, comment = null) {
  const state = await readState();
  const gid = survey.guildId;
  if (!state[gid]) state[gid] = {};
  if (!state[gid].staffStats) state[gid].staffStats = {};
  const staffId = survey.staffId;
  const prev = state[gid].staffStats[staffId] || { ticketsResolved: 0, sumResolution: 0, sumSympathy: 0, sumRapidite: 0, countRatings: 0, lastComment: "" };
  state[gid].staffStats[staffId] = {
    ticketsResolved: prev.ticketsResolved + 1,
    sumResolution: (prev.sumResolution || 0) + (survey.resolution ?? 0),
    sumSympathy: (prev.sumSympathy || 0) + (survey.sympathy ?? 0),
    sumRapidite: (prev.sumRapidite || 0) + (survey.rapidite ?? 0),
    countRatings: (prev.countRatings || 0) + 1,
    lastComment: comment != null && String(comment).trim() ? String(comment).trim().slice(0, 1000) : (prev.lastComment || "")
  };
  await writeState(state);
}

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

async function sendLog(guild, embed) {
  if (!guild) return;
  const ch = await getLogChannel(guild);
  if (!ch) return;
  await ch.send({ embeds: [embed] }).catch(() => {});
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
      const taskCommandNames = ["tasklist", "tachefini", "addtask"];
      const isTaskCommand = taskCommandNames.includes(interaction.commandName);
      if (!interaction.inGuild() && !isTaskCommand) {
        await interaction.reply({
          content: "Cette commande n’est disponible que sur un serveur.",
          ephemeral: true
        }).catch(() => {});
        return;
      }
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

    // Tâches : menu tachefini
    if (interaction.isStringSelectMenu() && interaction.customId === "tachefini:select") {
      const handled = await handleTachefiniSelect(interaction);
      if (handled) return;
    }

    // Tâches : modal addtask
    if (interaction.isModalSubmit() && interaction.customId === "addtask:modal") {
      const handled = await handleAddTaskModal(interaction);
      if (handled) return;
    }
    // Tâches : sélections addtask
    if (interaction.isStringSelectMenu() && interaction.customId === "addtask:predecessor") {
      if (handleAddTaskPredecessorSelect(interaction)) return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === "addtask:responsibles") {
      if (handleAddTaskResponsiblesSelect(interaction)) return;
    }
    if (interaction.isButton() && interaction.customId === "addtask:submit") {
      const handled = await handleAddTaskSubmit(interaction);
      if (handled) return;
    }

    // Tickets : ouvrir (question / owner / denoncer)
    if (interaction.isButton() && interaction.customId.startsWith("ticket:") && !["ticket:close", "ticket:claim", "ticket:deleteNow"].includes(interaction.customId)) {
      if (!interaction.inGuild()) return;
      const type = interaction.customId.replace("ticket:", "");
      const state = await readState();
      const catOuvert = state?.[interaction.guildId]?.categories?.ticketOuvert;
      const catFerme = state?.[interaction.guildId]?.categories?.ticketFerme;
      if (!catOuvert || !catFerme) {
        await interaction.reply({ content: "Les catégories tickets ne sont pas configurées.", ephemeral: true });
        return;
      }
      if (!state[interaction.guildId].ticketChannels) state[interaction.guildId].ticketChannels = {};
      const open = Object.entries(state[interaction.guildId].ticketChannels).find(
        ([_, v]) => v.ownerId === interaction.user.id && v.closed !== true
      );
      if (open) {
        await interaction.reply({ content: `Tu as déjà un ticket ouvert : <#${open[0]}>.`, ephemeral: true });
        return;
      }
      const name = `ticket-${interaction.user.username}`.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 100);
      const overwrites = [
        { id: interaction.guildId, deny: PermissionFlagsBits.ViewChannel },
        { id: interaction.user.id, allow: TICKET_OVERWRITE_ALLOW },
        { id: STAFF_ROLE_ID, allow: TICKET_OVERWRITE_ALLOW }
      ];
      for (const adminId of ADMIN_ROLE_IDS) {
        overwrites.push({ id: adminId, allow: TICKET_OVERWRITE_ALLOW });
      }
      const ch = await interaction.guild.channels.create({
        name,
        parent: catOuvert,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites
      });
      const typeLabels = { question: "Question", owner: "Owner", denoncer: "Dénoncer un problème" };
      const embedWelcome = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Ticket ${typeLabels[type] ?? type}`)
        .setDescription(`Bienvenue <@${interaction.user.id}>.\nDécris ta demande ci-dessous. Un staff peut **Claim** le ticket pour en prendre la charge.\n\n🔒 **Fermer le ticket** une fois la demande traitée.`)
        .setFooter({ text: "SpeedRunMC • Support" })
        .setTimestamp();
      const embedDelete = buildTicketDeleteNowEmbed();
      await ch.send({
        embeds: [embedWelcome, embedDelete],
        components: buildTicketChannelComponents(null)
      });
      state[interaction.guildId].ticketChannels[ch.id] = { ownerId: interaction.user.id, type };
      await writeState(state);
      await interaction.reply({ content: `Ticket créé : <#${ch.id}>`, ephemeral: true });
      return;
    }

    // Ticket : claim (staff seulement)
    if (interaction.isButton() && interaction.customId === "ticket:claim") {
      if (!interaction.inGuild()) return;
      if (!isStaffOrAdmin(interaction.member)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
      }
      const state = await readState();
      const meta = state?.[interaction.guildId]?.ticketChannels?.[interaction.channelId];
      if (!meta || meta.closed) {
        await interaction.reply({ content: "Ce salon n'est pas un ticket ou il est fermé.", ephemeral: true });
        return;
      }
      if (meta.claimedBy) {
        await interaction.reply({ content: `Ce ticket est déjà pris en charge par <@${meta.claimedBy}>.`, ephemeral: true });
        return;
      }
      meta.claimedBy = interaction.user.id;
      await writeState(state);
      const messages = await interaction.channel.messages.fetch({ limit: 5 });
      const botMsg = messages.find((m) => m.author.id === interaction.client.user.id && m.embeds?.length >= 2);
      if (botMsg) {
        await botMsg.edit({ components: buildTicketChannelComponents(interaction.user.id) }).catch(() => {});
      }
      await interaction.reply({ content: `✋ <@${interaction.user.id}> prend en charge ce ticket.`, ephemeral: false });
      return;
    }

    // Ticket : fermer (envoi DM sondage si claimé)
    if (interaction.isButton() && interaction.customId === "ticket:close") {
      if (!interaction.inGuild()) return;
      const state = await readState();
      const meta = state?.[interaction.guildId]?.ticketChannels?.[interaction.channelId];
      const catFerme = state?.[interaction.guildId]?.categories?.ticketFerme;
      if (!meta || meta.closed || !catFerme) {
        await interaction.reply({ content: "Ce salon n'est pas un ticket ou il est déjà fermé.", ephemeral: true });
        return;
      }
      meta.closed = true;
      await writeState(state);
      const channel = interaction.channel;
      await channel.setParent(catFerme).catch(() => {});
      await interaction.reply({ content: "🔒 Ticket fermé. Ce salon sera **supprimé automatiquement dans 24 heures**.", ephemeral: false });

      const ownerId = meta.ownerId;
      const claimedBy = meta.claimedBy;
      if (claimedBy && ownerId) {
        try {
          const user = await interaction.client.users.fetch(ownerId).catch(() => null);
          if (user) {
            surveyState.set(ownerId, { step: 1, staffId: claimedBy, guildId: interaction.guildId });
            await user.send({
              content: "**Votre réponse est anonyme.**\n\nNotez la résolution de votre problème sur 5 :",
              components: buildStarButtons("survey:resolution")
            }).catch(() => {});
          }
        } catch {}
      }

      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      const timeoutId = setTimeout(async () => {
        try {
          const st = await readState();
          if (st[guildId]?.ticketChannels?.[channelId]) {
            delete st[guildId].ticketChannels[channelId];
            await writeState(st);
          }
          const guild = interaction.client.guilds.cache.get(guildId);
          const ch = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
          if (ch) await ch.delete().catch(() => {});
        } catch {}
      }, TICKET_DELETE_DELAY_MS);
      if (!client._ticketDeleteTimeouts) client._ticketDeleteTimeouts = new Map();
      client._ticketDeleteTimeouts.set(channelId, timeoutId);
      return;
    }

    // Ticket : supprimer maintenant (staff/admin)
    if (interaction.isButton() && interaction.customId === "ticket:deleteNow") {
      if (!interaction.inGuild()) return;
      if (!isStaffOrAdmin(interaction.member)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
      }
      const state = await readState();
      const meta = state?.[interaction.guildId]?.ticketChannels?.[interaction.channelId];
      if (!meta) {
        await interaction.reply({ content: "Ce salon n'est pas un ticket.", ephemeral: true });
        return;
      }
      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      if (state[guildId]?.ticketChannels?.[channelId]) {
        delete state[guildId].ticketChannels[channelId];
        await writeState(state);
      }
      const ch = interaction.channel;
      await interaction.reply({ content: "🗑️ Suppression du ticket…", ephemeral: false }).catch(() => {});
      await ch.delete().catch(() => {});
      return;
    }

    // Sondage DM : boutons étoiles et Oui/Non
    if (interaction.isButton() && interaction.customId.startsWith("survey:")) {
      const parts = interaction.customId.split(":");
      const survey = surveyState.get(interaction.user.id);
      if (!survey) return;
      if (parts[1] === "resolution" && parts[2]) {
        survey.resolution = parseInt(parts[2], 10);
        survey.step = 2;
        await interaction.update({
          content: "**Votre réponse est anonyme.**\n\nNotez la sympathie du staff sur 5 :",
          components: buildStarButtons("survey:sympathy")
        }).catch(() => interaction.reply({ content: "Notez la sympathie du staff sur 5 :", components: buildStarButtons("survey:sympathy"), ephemeral: true }));
        return;
      }
      if (parts[1] === "sympathy" && parts[2]) {
        survey.sympathy = parseInt(parts[2], 10);
        survey.step = 3;
        await interaction.update({
          content: "**Votre réponse est anonyme.**\n\nNotez la rapidité de réponse sur 5 :",
          components: buildStarButtons("survey:rapidite")
        }).catch(() => interaction.reply({ content: "Notez la rapidité sur 5 :", components: buildStarButtons("survey:rapidite"), ephemeral: true }));
        return;
      }
      if (parts[1] === "rapidite" && parts[2]) {
        survey.rapidite = parseInt(parts[2], 10);
        survey.step = 4;
        await interaction.update({
          content: "**Votre réponse est anonyme.**\n\nRajoutez un commentaire ? (Optionnel)",
          components: buildYesNoButtons("survey:comment")
        }).catch(() => interaction.reply({ content: "Rajoutez un commentaire ? (Optionnel)", components: buildYesNoButtons("survey:comment"), ephemeral: true }));
        return;
      }
      if (parts[1] === "comment") {
        if (parts[2] === "no") {
          await saveSurveyAndFinish(survey);
          surveyState.delete(interaction.user.id);
          await interaction.update({ content: "Merci pour votre retour !", components: [] }).catch(() => {});
          return;
        }
        if (parts[2] === "yes") {
          const modal = new ModalBuilder()
            .setCustomId("survey:comment:modal")
            .setTitle("Commentaire (optionnel)");
          const input = new TextInputBuilder()
            .setCustomId("survey:comment:text")
            .setLabel("Votre commentaire")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000)
            .setPlaceholder("Laissez vide ou écrivez votre avis…");
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
          return;
        }
      }
    }

    // Sondage DM : envoi du modal commentaire
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "survey:comment:modal") {
      const survey = surveyState.get(interaction.user.id);
      if (!survey) {
        await interaction.reply({ content: "Session expirée. Merci quand même !", ephemeral: true });
        return;
      }
      const comment = interaction.fields.getTextInputValue("survey:comment:text")?.trim() || null;
      await saveSurveyAndFinish(survey, comment);
      surveyState.delete(interaction.user.id);
      await interaction.reply({ content: "Merci pour votre retour !", ephemeral: true });
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

  // +add [id] : ajouter quelqu'un au ticket (staff/admin)
  const addMatch = message.content?.trim().match(/^\+\s*add\s+(\d+)$/i) || message.content?.trim().match(/^\+\s*add\s+<@!?(\d+)>$/i);
  if (addMatch && state?.[message.guild.id]?.ticketChannels?.[message.channelId] && isStaffOrAdmin(message.member)) {
    const targetId = addMatch[1];
    try {
      await message.channel.permissionOverwrites.edit(targetId, { allow: TICKET_OVERWRITE_ALLOW });
      await message.reply({ content: `✅ <@${targetId}> a été ajouté au ticket.`, allowedMentions: { repliedUser: true } });
    } catch {
      await message.reply({ content: "Impossible d'ajouter cet utilisateur.", allowedMentions: { repliedUser: false } });
    }
    return;
  }

  // Assistant FAQ : détection des questions (mots-clés + forme question)
  if (!message.author.bot && message.content?.trim()) {
    const faq = getFaqResponse(message.content.trim());
    if (faq) {
      try {
        if (faq.type === "text") {
          await message.reply({ content: faq.content, allowedMentions: { repliedUser: true } });
        } else if (faq.type === "embed") {
          await message.reply({ embeds: [faq.embed], allowedMentions: { repliedUser: true } });
        }
      } catch {
        // ignore (salon supprimé, permissions, etc.)
      }
      return;
    }
  }

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

/**
 * Récupère l'inviteur d'un membre en comparant les invitations avant/après.
 * Retourne { inviterDisplayName, inviterInviteCount } ou null si inconnu.
 */
async function getInviterForMember(guild, memberId) {
  try {
    const invites = await guild.invites.fetch();
    const prev = inviteCache.get(guild.id);
    let found = null;
    for (const [, inv] of invites) {
      const prevUses = prev?.get(inv.code)?.uses ?? 0;
      if (inv.uses > prevUses) {
        found = {
          inviterDisplayName: inv.inviter?.displayName ?? inv.inviter?.username ?? "Inconnu",
          inviterInviteCount: inv.uses
        };
        break;
      }
    }
    const next = new Map();
    for (const [, inv] of invites) {
      next.set(inv.code, {
        uses: inv.uses,
        inviterId: inv.inviter?.id,
        inviterTag: inv.inviter?.displayName ?? inv.inviter?.username
      });
    }
    inviteCache.set(guild.id, next);
    return found;
  } catch {
    return null;
  }
}

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const state = await readState();
    const welcomeChannelId = state?.[member.guild.id]?.channels?.bienvenue;
    if (!welcomeChannelId) return;

    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (!channel) return;

    const inviterInfo = await getInviterForMember(member.guild, member.id);
    const embed = buildWelcomeEmbed({
      memberDisplayName: member.displayName ?? member.user.username,
      memberAvatarURL: member.user.displayAvatarURL({ size: 256 }),
      inviterDisplayName: inviterInfo?.inviterDisplayName ?? null,
      inviterInviteCount: inviterInfo?.inviterInviteCount ?? 0
    });
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Welcome message error:", err);
  }
});

/** Permissions du propriétaire (sans ManageChannels pour qu'il ne puisse pas supprimer le salon). */
const VOICE_OWNER_PERMISSIONS =
  PermissionFlagsBits.Connect |
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.UseVAD |
  PermissionFlagsBits.PrioritySpeaker |
  PermissionFlagsBits.Stream |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.MuteMembers |
  PermissionFlagsBits.DeafenMembers;

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const oldChannelId = oldState.channelId ?? null;
  const newChannelId = newState.channelId ?? null;
  const memberId = newState.member?.id ?? oldState.member?.id ?? "?";
  const guild = newState.guild ?? oldState.guild;

  debugVoice("VoiceStateUpdate", {
    oldChannelId,
    newChannelId,
    memberId,
    memberTag: newState.member?.user?.tag ?? oldState.member?.user?.tag ?? "?",
    guildId: guild?.id,
    guildName: guild?.name
  });

  try {
    if (!guild) {
      debugVoice("Skip: pas de guild");
      return;
    }
    const state = await readState();
    const salonVocalId = state?.[guild.id]?.channels?.salonVocal;
    const categoryId = state?.[guild.id]?.categories?.creerTonSalon;
    if (!state[guild.id]) state[guild.id] = {};
    if (!state[guild.id].dynamicVoiceChannels) state[guild.id].dynamicVoiceChannels = {};

    // Nettoyer les salons dynamiques qui n'existent plus (bot redémarré ou salon supprimé ailleurs)
    const dynamicChannels = state[guild.id].dynamicVoiceChannels || {};
    for (const chId of Object.keys(dynamicChannels)) {
      try {
        await guild.channels.fetch(chId);
      } catch {
        debugVoice("Nettoyage entrée orpheline (salon n'existe plus)", chId, dynamicChannels[chId]);
        delete state[guild.id].dynamicVoiceChannels[chId];
        await writeState(state);
      }
    }

    const dynKeys = Object.keys(state[guild.id].dynamicVoiceChannels || {});
    debugVoice("Config lue", {
      salonVocalId: salonVocalId ?? "—",
      categoryId: categoryId ?? "—",
      dynamicChannels: dynKeys.length ? dynKeys.join(", ") : "aucun",
      inProgress: Array.from(voiceCreationInProgress).join(", ") || "aucun",
      pendingDelete: Array.from(pendingDeleteVoiceChannels.keys()).join(", ") || "aucun"
    });

    // Annuler une suppression planifiée si quelqu'un rejoint ce salon
    const joinedChannelId = newState.channelId;
    if (joinedChannelId && pendingDeleteVoiceChannels.has(joinedChannelId)) {
      debugVoice("Annulation suppression planifiée pour salon", joinedChannelId);
      clearTimeout(pendingDeleteVoiceChannels.get(joinedChannelId).timeoutId);
      pendingDeleteVoiceChannels.delete(joinedChannelId);
    }

    // Quelqu'un rejoint le salon "créer ton salon" → créer un seul vocal à son nom puis le déplacer dedans
    const isJoiningCreateChannel = salonVocalId && newChannelId === salonVocalId && newState.member;
    debugVoice("Branch check", {
      isJoiningCreateChannel,
      "newChannelId === salonVocalId": newChannelId === salonVocalId,
      hasMember: !!newState.member
    });

    if (isJoiningCreateChannel) {
      if (!categoryId) {
        debugVoice("SKIP création: categoryId manquant");
        return;
      }
      const member = newState.member;
      const dynamicList = state[guild.id].dynamicVoiceChannels || {};
      const ownerIds = Object.values(dynamicList).map((v) => v.ownerId);
      const alreadyOwner = ownerIds.includes(member.id);
      const inProgress = voiceCreationInProgress.has(member.id);

      debugVoice("Création vocale – checks", {
        memberId: member.id,
        memberTag: member.user?.tag,
        alreadyOwner,
        ownerIds: ownerIds.join(", ") || "—",
        inProgress
      });

      if (alreadyOwner) {
        debugVoice("SKIP: déjà un salon dynamique (ownerIds)", ownerIds.join(", "));
        return;
      }
      if (inProgress) {
        debugVoice("SKIP création: voiceCreationInProgress (création déjà en cours pour cet user)");
        return;
      }

      voiceCreationInProgress.add(member.id);
      debugVoice("Création vocale – début", { memberId: member.id });
      try {
        const configVocal = await readConfigVocal();
        const saved = configVocal[guild.id]?.[member.id];
        const name = saved?.name ?? `${member.displayName ?? member.user.username}'s vocal`;
        const bitrate = saved?.bitrate ?? 64000;
        const userLimit = saved?.userLimit ?? 0;
        debugVoice("Config vocal utilisateur", { saved: !!saved, name, bitrate, userLimit });

        const channel = await guild.channels.create({
          name: name.substring(0, 100),
          type: ChannelType.GuildVoice,
          parent: categoryId,
          bitrate: Math.min(96000, Math.max(8000, bitrate)),
          userLimit: userLimit || undefined,
          permissionOverwrites: [
            { id: member.id, allow: VOICE_OWNER_PERMISSIONS }
          ]
        });
        debugVoice("Salon vocal créé", { channelId: channel.id, channelName: channel.name });

        state[guild.id].dynamicVoiceChannels[channel.id] = { ownerId: member.id };
        await writeState(state);
        debugVoice("State écrit", { channelIds: Object.keys(state[guild.id].dynamicVoiceChannels).join(", ") });

        await member.voice.setChannel(channel.id).catch((err) => {
          console.error("[VOICE_DEBUG] setChannel error:", err);
        });
        debugVoice("setChannel appelé, création terminée OK");
      } catch (err) {
        debugVoice("ERREUR pendant création vocale", err);
        console.error("[VOICE_DEBUG] Full error:", err);
      } finally {
        voiceCreationInProgress.delete(member.id);
        debugVoice("voiceCreationInProgress.remove(", member.id, ")");
      }
      return;
    }

    // Quelqu'un quitte un salon dynamique → si vide, DM au propriétaire puis planifier suppression après 30 s
    const leftChannelId = oldState.channelId;
    const isDynamicLeft = leftChannelId && state[guild.id].dynamicVoiceChannels[leftChannelId];
    debugVoice("Leave check", { leftChannelId, isDynamicLeft });

    if (isDynamicLeft) {
      const voiceChannel = await guild.channels.fetch(leftChannelId).catch(() => null);
      const memberCount = voiceChannel?.members?.size ?? "?";
      debugVoice("Salon quitté (dynamique)", { leftChannelId, memberCount, channelName: voiceChannel?.name });

      if (voiceChannel?.members?.size === 0) {
        if (pendingDeleteVoiceChannels.has(leftChannelId)) {
          debugVoice("Reset timer suppression pour", leftChannelId);
          clearTimeout(pendingDeleteVoiceChannels.get(leftChannelId).timeoutId);
        }
        const { ownerId } = state[guild.id].dynamicVoiceChannels[leftChannelId];
        debugVoice("Envoi DM au propriétaire", { ownerId });
        const owner = await guild.members.fetch(ownerId).catch(() => null);
        if (owner?.user) {
          await owner.send({
            content: `🔊 Ton salon vocal **${voiceChannel.name}** sera supprimé dans 30 secondes (plus personne dedans). Ta config sera sauvegardée pour la prochaine fois.`
          }).catch((e) => debugVoice("DM échoué", e?.message));
        }
        const timeoutId = setTimeout(async () => {
          pendingDeleteVoiceChannels.delete(leftChannelId);
          debugVoice("Timeout 30s: suppression du salon", leftChannelId);
          try {
            const currentState = await readState();
            const meta = currentState[guild.id]?.dynamicVoiceChannels?.[leftChannelId];
            if (!meta) {
              debugVoice("Timeout: meta manquant, abandon");
              return;
            }
            const ch = await guild.channels.fetch(leftChannelId).catch(() => null);
            if (!ch || ch.members?.size > 0) {
              debugVoice("Timeout: abandon (salon absent ou plus vide)", String(ch?.members?.size ?? "?"));
              return;
            }
            const { ownerId: oid } = meta;
            const configVocal = await readConfigVocal();
            if (!configVocal[guild.id]) configVocal[guild.id] = {};
            configVocal[guild.id][oid] = {
              name: ch.name,
              bitrate: ch.bitrate ?? 64000,
              userLimit: ch.userLimit ?? 0
            };
            await writeConfigVocal(configVocal);
            debugVoice("Config vocal sauvegardée", { ownerId: oid, name: ch.name });
            const st = await readState();
            if (st[guild.id]?.dynamicVoiceChannels) {
              delete st[guild.id].dynamicVoiceChannels[leftChannelId];
              await writeState(st);
              debugVoice("State mis à jour, salon retiré de dynamicVoiceChannels");
            }
            await ch.delete().catch((err) => console.error("Delete voice channel error:", err));
            debugVoice("Salon supprimé OK", leftChannelId);
          } catch (e) {
            console.error("[VOICE_DEBUG] Pending delete voice error:", e);
          }
        }, VOICE_EMPTY_DELAY_MS);
        pendingDeleteVoiceChannels.set(leftChannelId, { timeoutId, guildId: guild.id });
        debugVoice("Suppression planifiée dans 30s", leftChannelId);
      }
    }
  } catch (err) {
    console.error("[VOICE_DEBUG] VoiceStateUpdate error:", err);
  }
});

// ——— Logs serveur (tout ce qui se passe) ———
function truncate(str, max = 500) {
  if (!str || typeof str !== "string") return "—";
  return str.length <= max ? str : str.slice(0, max) + "…";
}

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Salon créé")
    .addFields(
      { name: "Nom", value: channel.name, inline: true },
      { name: "Type", value: channel.type.toString(), inline: true },
      { name: "ID", value: channel.id, inline: true }
    )
    .setTimestamp();
  if (channel.parent) embed.addFields({ name: "Catégorie", value: channel.parent.name, inline: true });
  await sendLog(channel.guild, embed);
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Salon supprimé")
    .addFields(
      { name: "Nom", value: channel.name, inline: true },
      { name: "Type", value: (channel.type ?? "?").toString(), inline: true },
      { name: "ID", value: channel.id, inline: true }
    )
    .setTimestamp();
  await sendLog(channel.guild, embed);
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const fields = [
    { name: "Salon", value: `<#${newChannel.id}>`, inline: false }
  ];
  if (oldChannel.name !== newChannel.name) {
    fields.push({ name: "Ancien nom", value: oldChannel.name ?? "—", inline: true }, { name: "Nouveau nom", value: newChannel.name ?? "—", inline: true });
  }
  if (fields.length <= 1) return;
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Salon modifié")
    .addFields(fields)
    .setTimestamp();
  await sendLog(newChannel.guild, embed);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Message envoyé")
    .addFields(
      { name: "Auteur", value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
      { name: "Contenu", value: truncate(message.content) || "*（pièce jointe / embed）*", inline: false }
    )
    .setTimestamp();
  await sendLog(message.guild, embed);
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;
  const content = message.content ? truncate(message.content) : (message.attachments?.size ? "*(message avec pièce(s) jointe(s))*" : "—");
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Message supprimé")
    .addFields(
      { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
      { name: "Auteur", value: (message.author?.tag ?? "Inconnu") + ` (${message.author?.id ?? "?"})`, inline: true },
      { name: "Contenu", value: content, inline: false }
    )
    .setTimestamp();
  await sendLog(message.guild, embed);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Message modifié")
    .addFields(
      { name: "Auteur", value: `${newMessage.author?.tag ?? "?"} (${newMessage.author?.id ?? "?"})`, inline: true },
      { name: "Salon", value: `<#${newMessage.channel.id}>`, inline: true },
      { name: "Avant", value: truncate(oldMessage.content) || "—", inline: false },
      { name: "Après", value: truncate(newMessage.content) || "—", inline: false }
    )
    .setTimestamp();
  await sendLog(newMessage.guild, embed);
});

client.on(Events.GuildMemberAdd, async (member) => {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Membre rejoint")
    .addFields(
      { name: "Utilisateur", value: `${member.user.tag} (${member.id})`, inline: true },
      { name: "Compte créé le", value: member.user.createdAt?.toISOString() ?? "—", inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  await sendLog(member.guild, embed);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Membre parti")
    .addFields(
      { name: "Utilisateur", value: `${member.user?.tag ?? "?"} (${member.id})`, inline: true },
      { name: "Rôles", value: member.roles?.cache?.filter((r) => r.name !== "@everyone")?.map((r) => r.name).join(", ") || "—", inline: false }
    )
    .setThumbnail(member.user?.displayAvatarURL())
    .setTimestamp();
  await sendLog(member.guild, embed);
});

client.on(Events.GuildRoleCreate, async (role) => {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Rôle créé")
    .addFields(
      { name: "Nom", value: role.name, inline: true },
      { name: "ID", value: role.id, inline: true },
      { name: "Couleur", value: role.hexColor ?? "—", inline: true }
    )
    .setTimestamp();
  await sendLog(role.guild, embed);
});

client.on(Events.GuildRoleDelete, async (role) => {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Rôle supprimé")
    .addFields(
      { name: "Nom", value: role.name, inline: true },
      { name: "ID", value: role.id, inline: true }
    )
    .setTimestamp();
  await sendLog(role.guild, embed);
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const fields = [{ name: "Rôle", value: newRole.name, inline: true }];
  if (oldRole.name !== newRole.name) fields.push({ name: "Ancien nom", value: oldRole.name, inline: true }, { name: "Nouveau nom", value: newRole.name, inline: true });
  if (oldRole.hexColor !== newRole.hexColor) fields.push({ name: "Couleur", value: newRole.hexColor ?? "—", inline: true });
  if (fields.length <= 1) return;
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Rôle modifié")
    .addFields(fields)
    .setTimestamp();
  await sendLog(newRole.guild, embed);
});

client.on(Events.ThreadCreate, async (thread) => {
  if (!thread.guild) return;
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Fil créé")
    .addFields(
      { name: "Nom", value: thread.name, inline: true },
      { name: "ID", value: thread.id, inline: true },
      { name: "Parent", value: thread.parent ? `<#${thread.parent.id}>` : "—", inline: true }
    )
    .setTimestamp();
  await sendLog(thread.guild, embed);
});

client.on(Events.ThreadDelete, async (thread) => {
  if (!thread.guild) return;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Fil supprimé")
    .addFields(
      { name: "Nom", value: thread.name ?? "—", inline: true },
      { name: "ID", value: thread.id, inline: true }
    )
    .setTimestamp();
  await sendLog(thread.guild, embed);
});

client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
  if (!newThread.guild) return;
  if (oldThread.name === newThread.name) return;
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Fil modifié")
    .addFields(
      { name: "Fil", value: newThread.name, inline: true },
      { name: "Ancien nom", value: oldThread.name ?? "—", inline: true },
      { name: "Nouveau nom", value: newThread.name ?? "—", inline: true }
    )
    .setTimestamp();
  await sendLog(newThread.guild, embed);
});

client.on(Events.GuildBanAdd, async (ban) => {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Membre banni")
    .addFields(
      { name: "Utilisateur", value: ban.user?.tag ?? "?", inline: true },
      { name: "ID", value: ban.user?.id ?? "?", inline: true },
      { name: "Raison", value: truncate(ban.reason) || "—", inline: false }
    )
    .setTimestamp();
  await sendLog(ban.guild, embed);
});

client.on(Events.GuildBanRemove, async (ban) => {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Ban retiré")
    .addFields(
      { name: "Utilisateur", value: ban.user?.tag ?? "?", inline: true },
      { name: "ID", value: ban.user?.id ?? "?", inline: true }
    )
    .setTimestamp();
  await sendLog(ban.guild, embed);
});

client.on(Events.InviteCreate, async (invite) => {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Invitation créée")
    .addFields(
      { name: "Code", value: invite.code, inline: true },
      { name: "Créée par", value: invite.inviter?.tag ?? "?", inline: true },
      { name: "Salon", value: invite.channel?.name ?? "?", inline: true },
      { name: "Utilisations max", value: invite.maxUses?.toString() ?? "∞", inline: true }
    )
    .setTimestamp();
  await sendLog(invite.guild, embed);
});

client.on(Events.InviteDelete, async (invite) => {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Invitation supprimée")
    .addFields(
      { name: "Code", value: invite.code, inline: true },
      { name: "Salon", value: invite.channel?.name ?? "?", inline: true }
    )
    .setTimestamp();
  await sendLog(invite.guild, embed);
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  startTaskScheduler(client);
  setTimeout(async () => {
    try {
      await sendWeeklyProgramOnStart(client);
    } catch (err) {
      console.error("[TASKS] Démarrage (rappels + webhook):", err);
    }
  }, 2000);
});

await client.login(token);

