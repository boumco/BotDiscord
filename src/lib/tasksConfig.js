/**
 * Configuration des tâches Gantt : mapping ressources → Discord, webhook, etc.
 */

export const TASKS_WEBHOOK_URL =
  process.env.TASKS_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1480308058730008769/cIraOfM5w5mI1Z_2MslkimTZ57HsM6N4j5XzIDtTR-FStIxVCpyfUbBSKG3A8HgE4Yrr";

/** Noms Gantt → ID Discord */
export const RESOURCE_NAME_TO_IDS = {
  Kura: "575644322091761684",
  Boumco: "546735493346230272",
  Oualid: "1097147077559079013",
  Redki: "1365764514385236078"
};

/** "Cursor" = les 4 personnes */
export const CURSOR_DISCORD_IDS = [
  RESOURCE_NAME_TO_IDS.Kura,
  RESOURCE_NAME_TO_IDS.Boumco,
  RESOURCE_NAME_TO_IDS.Oualid,
  RESOURCE_NAME_TO_IDS.Redki
];

/** resource id dans .gan (0=Redki, 1=Kura, 2=Boumco, 3=Oualid, 4=Cursor) → Discord IDs */
export function resourceIdToDiscordIds(resourceId) {
  const id = String(resourceId);
  const map = {
    "0": [RESOURCE_NAME_TO_IDS.Redki],
    "1": [RESOURCE_NAME_TO_IDS.Kura],
    "2": [RESOURCE_NAME_TO_IDS.Boumco],
    "3": [RESOURCE_NAME_TO_IDS.Oualid],
    "4": CURSOR_DISCORD_IDS
  };
  return map[id] || [];
}

/** Tous les IDs Discord concernés par le projet (pour vérifier qui peut /tachefini) */
export const ALL_TASK_USER_IDS = [
  ...new Set([
    ...Object.values(RESOURCE_NAME_TO_IDS),
    ...CURSOR_DISCORD_IDS
  ])
];

export const RESPONSIBLE_CHOICES = [
  { name: "Kura", value: "Kura" },
  { name: "Boumco", value: "Boumco" },
  { name: "Oualid", value: "Oualid" },
  { name: "Redki", value: "Redki" },
  { name: "Cursor (tous)", value: "Cursor" }
];

export function choiceToDiscordIds(value) {
  if (value === "Cursor") return [...CURSOR_DISCORD_IDS];
  return RESOURCE_NAME_TO_IDS[value] ? [RESOURCE_NAME_TO_IDS[value]] : [];
}

/**
 * Convertit une chaîne "Ressources" de l'export HTML (ex: "Kura", "Redki, Boumco", "Cursor") en liste d'IDs Discord.
 */
export function resourceNamesToDiscordIds(resourcesStr) {
  if (!resourcesStr || typeof resourcesStr !== "string") return [];
  const names = resourcesStr.split(",").map((s) => s.trim()).filter(Boolean);
  const ids = [];
  for (const name of names) {
    if (name === "Cursor") {
      for (const id of CURSOR_DISCORD_IDS) if (!ids.includes(id)) ids.push(id);
    } else if (RESOURCE_NAME_TO_IDS[name]) {
      if (!ids.includes(RESOURCE_NAME_TO_IDS[name])) ids.push(RESOURCE_NAME_TO_IDS[name]);
    }
  }
  return ids;
}
