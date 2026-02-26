import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { readState, writeState } from "../lib/storage.js";
import { buildVerificationEmbed, buildRolesEmbed, buildRulesEmbed } from "../lib/embeds.js";
import {
  buildVerificationComponents,
  buildRoleSelectComponents,
  SELECT_GROUPS
} from "../lib/serverBlueprint.js";

const CONFIG_KEYS = [
  { name: "verification", description: "Salon de vérification (bouton + code)", value: "verification" },
  { name: "regles", description: "Salon du règlement", value: "regles" },
  { name: "annonces", description: "Salon des annonces", value: "annonces" },
  { name: "general", description: "Salon général", value: "general" },
  { name: "medias", description: "Salon médias (images/vidéos uniquement)", value: "medias" },
  { name: "roles", description: "Salon de sélection des rôles", value: "roles" },
  { name: "staff", description: "Salon staff", value: "staff" },
  { name: "logs", description: "Salon des logs modération", value: "logs" }
];

function canConfig(interaction) {
  if (interaction.guild?.ownerId === interaction.user?.id) return true;
  return interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function buildRoleIdByToken(guild) {
  const out = {};
  for (const group of SELECT_GROUPS) {
    for (const r of group.roles) {
      const role = guild.roles.cache.find((role) => role.name === r.label);
      out[r.id] = role?.id ?? r.id;
    }
  }
  return out;
}

export const configCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure un salon du bot (sauvegardé sur le disque).")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Type de salon à configurer")
        .setRequired(true)
        .addChoices(...CONFIG_KEYS)
    )
    .addChannelOption((opt) =>
      opt
        .setName("salon")
        .setDescription("Le salon à utiliser")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Utilise cette commande dans un serveur.", ephemeral: true });
      return;
    }
    if (!canConfig(interaction)) {
      await interaction.reply({ content: "Tu dois être propriétaire du serveur ou avoir « Gérer le serveur ».", ephemeral: true });
      return;
    }

    const type = interaction.options.getString("type", true);
    const channel = interaction.options.getChannel("salon", true);

    const state = await readState();
    if (!state[interaction.guildId]) state[interaction.guildId] = {};
    if (!state[interaction.guildId].channels) state[interaction.guildId].channels = {};
    if (!state[interaction.guildId].messages) state[interaction.guildId].messages = {};

    state[interaction.guildId].channels[type] = channel.id;

    // Envoi ou mise à jour du message persistant pour vérification / regles / roles
    if (type === "verification") {
      const payload = {
        embeds: [buildVerificationEmbed({ guildName: interaction.guild.name })],
        components: buildVerificationComponents()
      };
      const stored = state[interaction.guildId].messages?.verification;
      if (stored?.channelId === channel.id && stored?.messageId) {
        try {
          const msg = await channel.messages.fetch(stored.messageId);
          await msg.edit(payload);
        } catch {
          const sent = await channel.send(payload);
          state[interaction.guildId].messages.verification = { channelId: channel.id, messageId: sent.id };
        }
      } else {
        const sent = await channel.send(payload);
        state[interaction.guildId].messages.verification = { channelId: channel.id, messageId: sent.id };
      }
    } else if (type === "regles") {
      const payload = { embeds: [buildRulesEmbed()] };
      const stored = state[interaction.guildId].messages?.rules;
      if (stored?.channelId === channel.id && stored?.messageId) {
        try {
          const msg = await channel.messages.fetch(stored.messageId);
          await msg.edit(payload);
        } catch {
          const sent = await channel.send(payload);
          state[interaction.guildId].messages.rules = { channelId: channel.id, messageId: sent.id };
        }
      } else {
        const sent = await channel.send(payload);
        state[interaction.guildId].messages.rules = { channelId: channel.id, messageId: sent.id };
      }
    } else if (type === "roles") {
      const roleIdByToken = buildRoleIdByToken(interaction.guild);
      const payload = {
        embeds: [buildRolesEmbed()],
        components: buildRoleSelectComponents(roleIdByToken)
      };
      const stored = state[interaction.guildId].messages?.roles;
      if (stored?.channelId === channel.id && stored?.messageId) {
        try {
          const msg = await channel.messages.fetch(stored.messageId);
          await msg.edit(payload);
        } catch {
          const sent = await channel.send(payload);
          state[interaction.guildId].messages.roles = { channelId: channel.id, messageId: sent.id };
        }
      } else {
        const sent = await channel.send(payload);
        state[interaction.guildId].messages.roles = { channelId: channel.id, messageId: sent.id };
      }
    }

    await writeState(state);
    await interaction.reply({
      content: `✅ Salon **${type}** configuré : <#${channel.id}>.`,
      ephemeral: true
    });
  }
};
