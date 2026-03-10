/**
 * Planificateur : rappels DM (veille, début, 50 %, 2 h), tâches en retard, programme de la semaine.
 */
import { getTasks, getTaskEndDate, getOverdueTasks, getSuccessorIds, enrichFromHtml, loadTasksFromHtml } from "./tasksGantt.js";
import {
  buildRappelVeilleEmbed,
  buildTacheCommenceEmbed,
  buildTache50Embed,
  buildTache2hEmbed,
  buildTacheFinAujourdhuiEmbed,
  buildTacheRetardJoursEmbed,
  buildTacheRetardEmbed,
  buildPredecesseurNonFiniEmbed,
  buildProgrammeSemaineEmbed
} from "./taskEmbeds.js";
import { sendTaskWebhook } from "./taskWebhook.js";
import { writeTasks } from "./storage.js";

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const WEEKLY_CHECK_HOUR = 9; // 9h pour envoyer le dimanche
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Clé de la semaine déjà envoyée (évite doublon startup + dimanche 9h). */
let lastWeeklySendKey = null;

export function setLastWeeklySendKey(key) {
  lastWeeklySendKey = key;
}

/** Envoie un DM à un utilisateur (client Discord). Retourne true si envoyé, false sinon. */
async function sendDM(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
      console.warn("[TASKS] DM impossible: utilisateur introuvable", userId);
      return false;
    }
    await user.send(payload);
    return true;
  } catch (e) {
    console.warn("[TASKS] DM refusé pour", userId, "—", e.message || String(e));
    return false;
  }
}

/** Date du jour en YYYY-MM-DD (date locale serveur, pas UTC). */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Demain en YYYY-MM-DD (date locale). */
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Nombre de jours entre deux dates YYYY-MM-DD (entier). */
function daysBetween(startYmd, endYmd) {
  const a = new Date(startYmd + "T12:00:00");
  const b = new Date(endYmd + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

/** Date au format YYYY-MM-DD (locale, pas UTC). */
function toLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Heure actuelle en ms depuis minuit (pour "2h avant fin"). */
function nowMsSinceMidnight() {
  const d = new Date();
  return d.getHours() * 3600000 + d.getMinutes() * 60000 + d.getSeconds() * 1000;
}

/**
 * Exécute tous les rappels DM pour les tâches (veille, démarrage, 50 %, 2 h, fin du jour, chaque jour de retard).
 * Modifie data.tasks[].remindersSent.
 * @param {object} opts - { atStartup: boolean } si true, on envoie toujours "veille" et "démarrage" quand la date correspond (pour que tout le monde reçoive au démarrage).
 */
async function runReminderDMs(client, data, now, today, tomorrow, opts = {}) {
  const atStartup = opts.atStartup === true;
  const tasks = data.tasks || [];
  let sent = 0;
  for (const task of tasks) {
    if (task.completed) continue;
    const end = getTaskEndDate(task);
    const userIds = task.responsibleIds || [];
    if (userIds.length === 0) continue;

    const endDate = new Date(end + "T23:59:59");

    for (const userId of userIds) {
      const reminders = task.remindersSent || {};

      const sendDayBefore = task.start === tomorrow && (atStartup || !reminders.dayBefore);
      if (sendDayBefore) {
        if (await sendDM(client, userId, { embeds: [buildRappelVeilleEmbed(task)] })) sent++;
        reminders.dayBefore = true;
      }
      const sendStarted = task.start === today && (atStartup || !reminders.started);
      if (sendStarted) {
        if (await sendDM(client, userId, { embeds: [buildTacheCommenceEmbed(task)] })) sent++;
        reminders.started = true;
      }

      const startDate = new Date(task.start + "T00:00:00");
      const midMs = startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2;
      if (!reminders.fiftyPercent && now.getTime() >= midMs - 60000) {
        if (await sendDM(client, userId, { embeds: [buildTache50Embed(task)] })) sent++;
        reminders.fiftyPercent = true;
      }

      const twoHoursBeforeEnd = endDate.getTime() - TWO_HOURS_MS;
      if (!reminders.twoHoursLeft && now.getTime() >= twoHoursBeforeEnd - 60000) {
        if (await sendDM(client, userId, { embeds: [buildTache2hEmbed(task)] })) sent++;
        reminders.twoHoursLeft = true;
      }

      if (end === today && !reminders.endDay) {
        if (await sendDM(client, userId, { embeds: [buildTacheFinAujourdhuiEmbed(task)] })) sent++;
        reminders.endDay = true;
      }

      if (end < today) {
        const joursRetard = daysBetween(end, today);
        const lastSent = reminders.overdueDayCount ?? 0;
        if (joursRetard > lastSent) {
          if (await sendDM(client, userId, { embeds: [buildTacheRetardJoursEmbed(task, joursRetard)] })) sent++;
          reminders.overdueDayCount = joursRetard;
        }
      }

      task.remindersSent = reminders;
    }
  }
  return sent;
}

/**
 * Démarre le planificateur (rappels, retard, programme semaine).
 */
export function startTaskScheduler(client) {
  const lateTaskIdsSent = new Set(); // pour ne pas spam "en retard"

  async function tick() {
    try {
      const data = await getTasks();
      const tasks = data.tasks || [];
      const now = new Date();
      const today = todayStr();
      const tomorrow = tomorrowStr();

      const _sent = await runReminderDMs(client, data, now, today, tomorrow);

      // ——— Tâches en retard (webhook @everyone, une fois par tâche) ———
      const overdue = getOverdueTasks(tasks);
      for (const task of overdue) {
        if (lateTaskIdsSent.has(task.id)) continue;
        await sendTaskWebhook({
          content: "@everyone",
          embeds: [buildTacheRetardEmbed(task)]
        });
        lateTaskIdsSent.add(task.id);

        const successorIds = getSuccessorIds(tasks, task.id);
        if (successorIds.length > 0) {
          const successorNames = tasks.filter((t) => successorIds.includes(t.id)).map((t) => t.name);
          await sendTaskWebhook({
            content: "@everyone",
            embeds: [buildPredecesseurNonFiniEmbed(task, successorNames)]
          });
        }
      }

      // ——— Programme de la semaine : chaque dimanche à 9h uniquement ———
      const day = now.getDay();
      const hour = now.getHours();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - day);
      const ws = toLocalYmd(weekStart);
      const weekKey = ws;
      if (day === 0 && hour >= WEEKLY_CHECK_HOUR && lastWeeklySendKey !== weekKey) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const we = toLocalYmd(weekEnd);
        const tasksSemaine = tasks.filter((t) => !t.completed && t.start <= we && getTaskEndDate(t) >= ws);
        await sendTaskWebhook({
          content: "@everyone",
          embeds: [buildProgrammeSemaineEmbed(tasksSemaine, ws, we)],
          files: [{ path: "data/Projet BrokenRealm.png", name: "Projet BrokenRealm.png" }]
        });
        lastWeeklySendKey = weekKey;
      }

      await writeTasks(data);
    } catch (err) {
      console.error("[TASK_SCHEDULER]", err);
    }
  }

  setInterval(tick, CHECK_INTERVAL_MS);
  tick();
}

/**
 * Au démarrage du bot : exécute une fois toute la logique de rappels DM (veille, démarrage, 50 %, 2 h, fin du jour, chaque jour de retard).
 */
export async function runAllRemindersOnStart(client) {
  let data = await getTasks();
  let tasks = data.tasks || [];

  await enrichFromHtml(data);
  tasks = data.tasks || [];

  let withResponsibles = tasks.filter((t) => !t.completed && (t.responsibleIds?.length ?? 0) > 0);
  if (withResponsibles.length === 0 && tasks.some((t) => !t.completed)) {
    const htmlTasks = await loadTasksFromHtml();
    if (htmlTasks.length > 0) {
      const byName = new Map((data.tasks || []).map((t) => [t.name.trim().toLowerCase(), t]));
      for (const t of htmlTasks) {
        const old = byName.get(t.name.trim().toLowerCase());
        if (old) {
          t.completed = old.completed;
          t.completedAt = old.completedAt;
          t.completedBy = old.completedBy;
          t.remindersSent = old.remindersSent || t.remindersSent || {};
        }
      }
      data.tasks = htmlTasks;
      await writeTasks(data);
      tasks = htmlTasks;
      withResponsibles = tasks.filter((t) => !t.completed && (t.responsibleIds?.length ?? 0) > 0);
      console.log("[TASKS] Aucun responsable trouvé — tâches rechargées depuis l’export HTML, responsables:", withResponsibles.length);
    }
  }

  const now = new Date();
  const today = todayStr();
  const tomorrow = tomorrowStr();
  console.log("[TASKS] Démarrage rappels — date locale:", today, "demain:", tomorrow, "| tâches (non terminées avec responsables):", withResponsibles.length, "/", tasks.length);

  const sent = await runReminderDMs(client, data, now, today, tomorrow, { atStartup: true });
  console.log("[TASKS] Rappels DM envoyés au démarrage:", sent);

  await writeTasks(data);
}

/**
 * Au démarrage du bot : envoie d’abord les rappels DM (priorité), puis le programme de la semaine au webhook.
 */
export async function sendWeeklyProgramOnStart(client) {
  await runAllRemindersOnStart(client);

  const data = await getTasks();
  const tasks = data.tasks || [];
  const now = new Date();
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - day);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const ws = toLocalYmd(weekStart);
  const we = toLocalYmd(weekEnd);
  const tasksSemaine = tasks.filter((t) => !t.completed && t.start <= we && getTaskEndDate(t) >= ws);
  setLastWeeklySendKey(ws);
  try {
    await sendTaskWebhook({
      content: "@everyone",
      embeds: [buildProgrammeSemaineEmbed(tasksSemaine, ws, we)],
      files: [{ path: "data/Projet BrokenRealm.png", name: "Projet BrokenRealm.png" }]
    });
  } catch (err) {
    console.error("[TASKS] Webhook programme semaine:", err.message);
  }
}
