/**
 * Clés de configuration modération (stockées dans state[guildId].moderation).
 * Valeur par défaut = true (activé).
 */
export const MODERATION_DEFAULTS = {
  antiInvite: true,
  antiMentionSpam: true,
  antiWebhook: true,
  antiChannelDelete: true
};

export const MODERATION_RULES = [
  { key: "antiInvite", value: "anti_invite", name: "Anti-lien d'invitation Discord", description: "Supprime les messages contenant discord.gg/ ou discord.com/invite/" },
  { key: "antiMentionSpam", value: "anti_mention", name: "Anti-spam de mentions", description: "Timeout + suppression si trop de mentions (≥6)" },
  { key: "antiWebhook", value: "anti_webhook", name: "Anti-webhook", description: "Supprime les messages envoyés par webhook" },
  { key: "antiChannelDelete", value: "anti_suppression_salon", name: "Protection suppression de salon", description: "Sanction si quelqu'un supprime un salon (sans whitelist)" }
];

/**
 * Retourne la config modération pour un serveur (fusion avec les défauts).
 * @param {Object} state - state global (readState())
 * @param {string} guildId
 * @returns {Object} { antiInvite, antiMentionSpam, antiWebhook, antiChannelDelete }
 */
export function getModerationConfig(state, guildId) {
  const base = state?.[guildId]?.moderation ?? {};
  return {
    antiInvite: base.antiInvite ?? MODERATION_DEFAULTS.antiInvite,
    antiMentionSpam: base.antiMentionSpam ?? MODERATION_DEFAULTS.antiMentionSpam,
    antiWebhook: base.antiWebhook ?? MODERATION_DEFAULTS.antiWebhook,
    antiChannelDelete: base.antiChannelDelete ?? MODERATION_DEFAULTS.antiChannelDelete
  };
}

export function getRuleByValue(value) {
  return MODERATION_RULES.find((r) => r.value === value);
}

export function getRuleByKey(key) {
  return MODERATION_RULES.find((r) => r.key === key);
}
