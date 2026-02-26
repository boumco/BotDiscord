import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder
} from "discord.js";

import { buildRolesEmbed, buildRulesEmbed, buildVerificationEmbed } from "./embeds.js";

export const ROLE_KEYS = {
  MEMBER: "Membre",
  UNVERIFIED: "Non vérifié",
  VIP: "VIP",
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF_LEAD: "Resp. Staff",
  MOD: "Modérateur",
  HELPER: "Helper",
  DEV: "Dev",
  BUILDER: "Builder"
};

export const SELECT_GROUPS = [
  {
    customId: "roles:genre",
    placeholder: "Genre",
    maxValues: 1,
    roles: [
      { id: "role:genre:homme", label: "Homme" },
      { id: "role:genre:femme", label: "Femme" },
      { id: "role:genre:autre", label: "Autre" }
    ]
  },
  {
    customId: "roles:age",
    placeholder: "Âge",
    maxValues: 1,
    roles: [
      { id: "role:age:-18", label: "-18" },
      { id: "role:age:18-24", label: "18-24" },
      { id: "role:age:25+", label: "25+" }
    ]
  },
  {
    customId: "roles:passion",
    placeholder: "Passion",
    maxValues: 2,
    roles: [
      { id: "role:passion:mc", label: "Minecraft" },
      { id: "role:passion:speedrun", label: "Speedrun" },
      { id: "role:passion:build", label: "Build" },
      { id: "role:passion:dev", label: "Dev" }
    ]
  }
];

function roleBasePositionHint(name) {
  const order = [
    ROLE_KEYS.OWNER,
    ROLE_KEYS.ADMIN,
    ROLE_KEYS.STAFF_LEAD,
    ROLE_KEYS.MOD,
    ROLE_KEYS.HELPER,
    ROLE_KEYS.DEV,
    ROLE_KEYS.BUILDER,
    ROLE_KEYS.VIP,
    ROLE_KEYS.MEMBER,
    ROLE_KEYS.UNVERIFIED
  ];
  return order.indexOf(name) === -1 ? 999 : order.indexOf(name);
}

export function requiredBotPermissions() {
  return [
    PermissionsBitField.Flags.ManageGuild,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageWebhooks,
    PermissionsBitField.Flags.ViewAuditLog,
    PermissionsBitField.Flags.KickMembers,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.ModerateMembers,
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.ReadMessageHistory
  ];
}

export async function ensureRole(guild, { name, color, hoist = false, mentionable = false, permissions = [] }) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return await guild.roles.create({
    name,
    color,
    hoist,
    mentionable,
    permissions
  });
}

export async function ensureRoles(guild) {
  const roles = {};
  roles[ROLE_KEYS.OWNER] = await ensureRole(guild, {
    name: ROLE_KEYS.OWNER,
    color: 0xff3b30,
    hoist: true,
    permissions: [PermissionsBitField.Flags.Administrator]
  });
  roles[ROLE_KEYS.ADMIN] = await ensureRole(guild, {
    name: ROLE_KEYS.ADMIN,
    color: 0xff9500,
    hoist: true,
    permissions: [
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.ViewAuditLog,
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.ModerateMembers,
      PermissionsBitField.Flags.ManageMessages
    ]
  });
  roles[ROLE_KEYS.STAFF_LEAD] = await ensureRole(guild, { name: ROLE_KEYS.STAFF_LEAD, color: 0x6f42c1, hoist: true });
  roles[ROLE_KEYS.MOD] = await ensureRole(guild, { name: ROLE_KEYS.MOD, color: 0x2ecc71, hoist: true });
  roles[ROLE_KEYS.HELPER] = await ensureRole(guild, { name: ROLE_KEYS.HELPER, color: 0x1abc9c, hoist: true });
  roles[ROLE_KEYS.DEV] = await ensureRole(guild, { name: ROLE_KEYS.DEV, color: 0x3498db, hoist: true });
  roles[ROLE_KEYS.BUILDER] = await ensureRole(guild, { name: ROLE_KEYS.BUILDER, color: 0xe056fd, hoist: true });
  roles[ROLE_KEYS.VIP] = await ensureRole(guild, { name: ROLE_KEYS.VIP, color: 0xf1c40f, hoist: true, mentionable: true });

  roles[ROLE_KEYS.MEMBER] = await ensureRole(guild, { name: ROLE_KEYS.MEMBER, color: 0x95a5a6, hoist: false });
  roles[ROLE_KEYS.UNVERIFIED] = await ensureRole(guild, { name: ROLE_KEYS.UNVERIFIED, color: 0x7f8c8d, hoist: false });

  // Self-assign roles
  for (const group of SELECT_GROUPS) {
    for (const roleDef of group.roles) {
      const name = roleDef.label;
      roles[roleDef.id] =
        guild.roles.cache.find((r) => r.name === name) ||
        (await ensureRole(guild, { name, color: 0x5865f2, hoist: false, mentionable: false }));
    }
  }

  // Best-effort ordering (Discord may constrain positioning)
  const sortable = Object.values(roles)
    .filter(Boolean)
    .sort((a, b) => roleBasePositionHint(a.name) - roleBasePositionHint(b.name));
  for (const r of sortable) {
    try {
      await r.setPosition(guild.roles.cache.size - 1);
    } catch {
      // ignore
    }
  }

  return roles;
}

export async function ensureCategory(guild, name) {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (existing) return existing;
  return await guild.channels.create({ name, type: ChannelType.GuildCategory });
}

export async function ensureTextChannel(guild, { name, parent, topic, permissionOverwrites }) {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name);
  if (existing) return existing;
  return await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic,
    permissionOverwrites
  });
}

export function buildVerificationComponents() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("verify:start").setLabel("Vérifier").setStyle(ButtonStyle.Primary)
  );
  return [row];
}

export function buildRoleSelectComponents(roleIdByToken) {
  const rows = [];
  for (const group of SELECT_GROUPS) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(group.customId)
      .setPlaceholder(group.placeholder)
      .setMinValues(0)
      .setMaxValues(group.maxValues);

    for (const r of group.roles) {
      const roleId = roleIdByToken[r.id];
      menu.addOptions({ label: r.label, value: roleId ?? r.id });
    }

    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return rows;
}

export async function sendOrUpdateCoreMessages({ guild, channels, state, persistKey, definition }) {
  const channel = channels[definition.channelKey];
  if (!channel) throw new Error(`Missing channel for ${definition.channelKey}`);

  const stored = state?.[guild.id]?.messages?.[persistKey];
  if (stored?.channelId && stored?.messageId) {
    try {
      const ch = await guild.channels.fetch(stored.channelId);
      const msg = await ch.messages.fetch(stored.messageId);
      await msg.edit(definition.payload);
      return { channelId: stored.channelId, messageId: stored.messageId, updated: true };
    } catch {
      // fall through to re-send
    }
  }

  const msg = await channel.send(definition.payload);
  return { channelId: channel.id, messageId: msg.id, updated: false };
}

export function coreMessageDefinitions({ guildName, roleIdByToken }) {
  return {
    verification: {
      channelKey: "verification",
      payload: { embeds: [buildVerificationEmbed({ guildName })], components: buildVerificationComponents() }
    },
    roles: {
      channelKey: "roles",
      payload: { embeds: [buildRolesEmbed()], components: buildRoleSelectComponents(roleIdByToken) }
    },
    rules: {
      channelKey: "regles",
      payload: { embeds: [buildRulesEmbed()] }
    }
  };
}

