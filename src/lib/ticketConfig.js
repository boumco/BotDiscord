import { PermissionFlagsBits } from "discord.js";

/** Rôle Staff (peut claim les tickets, voir tous les tickets). */
export const STAFF_ROLE_ID = "1476706338120925275";

/** Rôles Admin (mêmes droits que staff + supprimer ticket immédiatement). */
export const ADMIN_ROLE_IDS = ["1475942756735254700", "1475942757704007700"];

export function isStaffOrAdmin(member) {
  if (!member?.roles?.cache) return false;
  if (member.roles.cache.has(STAFF_ROLE_ID)) return true;
  return ADMIN_ROLE_IDS.some((id) => member.roles.cache.has(id));
}

export function isAdmin(member) {
  if (!member?.roles?.cache) return false;
  return ADMIN_ROLE_IDS.some((id) => member.roles.cache.has(id));
}

/** Permissions pour les salons ticket (voir + écrire). */
export const TICKET_OVERWRITE_ALLOW =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles;
