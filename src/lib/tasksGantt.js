/**
 * Import Gantt : priorité à l'export HTML (tâches + colonne Ressources), secours .gan.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { readTasks, writeTasks } from "./storage.js";
import { resourceIdToDiscordIds, resourceNamesToDiscordIds } from "./tasksConfig.js";
import { log, logTask, logImport } from "./tasksDebug.js";

const DATA_DIR = path.resolve(process.cwd(), "data");

/** Fichiers à utiliser : on détecte tout ce qui est dans data (HTML + .gan). */
async function findDataFiles() {
  const files = { tasksHtml: [], resourcesHtml: [], gan: [], chartHtml: [], mainHtml: [] };
  try {
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const name = e.name.toLowerCase();
      if (name.endsWith("-tasks.html") || (name.includes("tasks") && name.endsWith(".html")))
        files.tasksHtml.push(path.join(DATA_DIR, e.name));
      else if (name.endsWith("-resources.html") || (name.includes("resources") && name.endsWith(".html")))
        files.resourcesHtml.push(path.join(DATA_DIR, e.name));
      else if (name.endsWith("-chart.html")) files.chartHtml.push(path.join(DATA_DIR, e.name));
      else if (name.endsWith(".gan")) files.gan.push(path.join(DATA_DIR, e.name));
      else if (name.endsWith(".html") && !name.includes("tasks") && !name.includes("resources") && !name.includes("chart"))
        files.mainHtml.push(path.join(DATA_DIR, e.name));
    }
    files.tasksHtml.sort();
    files.resourcesHtml.sort();
    files.gan.sort();
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return files;
}

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ocirc;/g, "ô")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** DD/MM/YYYY → YYYY-MM-DD */
function toIsoDate(ddmmyyyy) {
  const m = ddmmyyyy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Parse l'export HTML des tâches (Projet BrokenRealm-tasks.html).
 * Chaque ligne = Nom, Date début (DD/MM/YYYY), Date fin, Ressources (ex: "Kura" ou "Redki, Boumco").
 */
export function parseTasksFromHtml(htmlStr) {
  const tasks = [];
  const rowRegex = /<tr>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let m;
  let index = 0;
  while ((m = rowRegex.exec(htmlStr)) !== null) {
    const nameCell = decodeEntities(stripHtml(m[1]));
    const startCell = stripHtml(m[2]);
    const endCell = stripHtml(m[3]);
    const resourcesCell = stripHtml(m[4]);
    if (!nameCell || nameCell === "Nom" || startCell === "Date de début") continue;
    const start = toIsoDate(startCell);
    const end = toIsoDate(endCell);
    if (!start || !end) continue;
    const diffMs = new Date(end + "T12:00:00") - new Date(start + "T12:00:00");
    const durationDays = Math.max(1, Math.round(diffMs / 86400000) + 1);
    const responsibleIds = resourceNamesToDiscordIds(resourcesCell);
    const task = {
      id: String(index),
      name: nameCell,
      start,
      durationDays,
      completed: false,
      completedAt: null,
      completedBy: null,
      predecessorIds: [],
      responsibleIds,
      remindersSent: {}
    };
    tasks.push(task);
    logTask("HTML task", task);
    index += 1;
  }
  return tasks;
}

/**
 * Parse un fichier .gan (XML simplifié) et retourne une liste de tâches au format interne.
 */
export function parseGanttXml(xmlStr) {
  const tasks = [];
  const resourceById = {};
  const allocationsByTask = {}; // taskId -> [ { resourceId, responsible } ]

  // Ressources: <resource id="0" name="Redki" .../>
  const resourceRegex = /<resource\s+id="(\d+)"\s+name="([^"]+)"/g;
  let m;
  while ((m = resourceRegex.exec(xmlStr)) !== null) {
    resourceById[m[1]] = m[2];
  }

  // Allocations: <allocation task-id="3" resource-id="0" responsible="true" .../>
  const allocRegex = /<allocation\s+task-id="(\d+)"\s+resource-id="(\d+)"\s+responsible="(true|false)"/g;
  while ((m = allocRegex.exec(xmlStr)) !== null) {
    const taskId = m[1];
    const resourceId = m[2];
    const responsible = m[3] === "true";
    if (!allocationsByTask[taskId]) allocationsByTask[taskId] = [];
    allocationsByTask[taskId].push({ resourceId, responsible });
  }

  // Tâches: <task id="0" name="..." start="2026-03-09" duration="5" complete="0"> ... <depend id="1" .../>
  const taskBlockRegex = /<task\s+id="(\d+)"[^>]*name="([^"]*)"[^>]*start="(\d{4}-\d{2}-\d{2})"[^>]*duration="(\d+)"[^>]*complete="(\d+)"[^>]*>([\s\S]*?)<\/task>/g;
  while ((m = taskBlockRegex.exec(xmlStr)) !== null) {
    const taskId = m[1];
    const name = m[2];
    const start = m[3];
    const durationDays = parseInt(m[4], 10);
    const complete = parseInt(m[5], 10);
    const inner = m[6];
    const dependRegex = /<depend\s+id="(\d+)"/g;
    const predecessorIds = [];
    let dm;
    while ((dm = dependRegex.exec(inner)) !== null) predecessorIds.push(dm[1]);

    const allocs = allocationsByTask[taskId] || [];
    const responsibleIds = [];
    for (const a of allocs) {
      for (const did of resourceIdToDiscordIds(a.resourceId)) {
        if (!responsibleIds.includes(did)) responsibleIds.push(did);
      }
    }

    tasks.push({
      id: taskId,
      name,
      start,
      durationDays,
      completed: complete >= 100,
      completedAt: null,
      completedBy: null,
      predecessorIds,
      responsibleIds,
      remindersSent: {}
    });
  }

  return tasks;
}

/**
 * Charge l'export HTML des tâches depuis tous les *-tasks.html trouvés dans data.
 */
export async function loadTasksFromHtml() {
  const { tasksHtml } = await findDataFiles();
  const tried = tasksHtml.length ? tasksHtml : [path.join(DATA_DIR, "Projet BrokenRealm-tasks.html")];
  for (const filePath of tried) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const tasks = parseTasksFromHtml(raw);
      if (tasks.length > 0) {
        logImport("HTML " + path.basename(filePath), tasks.length, tasks[0]);
        return tasks;
      }
    } catch (e) {
      if (e.code === "ENOENT") log("HTML not found:", filePath);
      else log("HTML parse error", filePath, e.message);
    }
  }
  log("No tasks loaded from any HTML file. Tried:", tried.map((p) => path.basename(p)));
  return [];
}

/**
 * Charge un fichier .gan (tous ceux trouvés dans data, premier valide utilisé).
 */
export async function loadGanttFile() {
  const { gan } = await findDataFiles();
  const tried = gan.length ? gan : [path.join(DATA_DIR, "Projet BrokenRealm.gan")];
  for (const filePath of tried) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const tasks = parseGanttXml(raw);
      if (tasks.length > 0) {
        logImport(".gan " + path.basename(filePath), tasks.length, tasks[0]);
        return tasks;
      }
    } catch (e) {
      if (e.code === "ENOENT") log(".gan not found:", filePath);
      else log(".gan parse error", e.message);
    }
  }
  return [];
}

/**
 * Enrichit les tâches existantes (responsibleIds vides) à partir de l'export HTML (match par nom).
 */
export async function enrichFromHtml(data) {
  const htmlTasks = await loadTasksFromHtml();
  if (htmlTasks.length === 0) return data;
  const byName = new Map(htmlTasks.map((t) => [t.name.trim().toLowerCase(), t]));
  let updated = 0;
  for (const task of data.tasks || []) {
    if (task.responsibleIds?.length > 0) continue;
    const key = task.name.trim().toLowerCase();
    const match = byName.get(key) || [...byName.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1];
    if (match?.responsibleIds?.length) {
      task.responsibleIds = match.responsibleIds;
      updated += 1;
      logTask("enriched from HTML", task);
    }
  }
  if (updated > 0) {
    await writeTasks(data);
    log("enrichFromHtml: updated", updated, "tasks with responsibleIds");
  }
  return data;
}

/**
 * Retourne les tâches : si tasks.json a des tâches, on les utilise (et on enrichit depuis HTML si responsibleIds vides) ;
 * sinon import depuis l'export HTML (prioritaire) puis .gan en secours.
 */
export async function getTasks() {
  const fileList = await findDataFiles();
  log(
    "Sources data:",
    "tasksHtml=" + fileList.tasksHtml.map((p) => path.basename(p)).join(",") || "—",
    "resourcesHtml=" + (fileList.resourcesHtml.map((p) => path.basename(p)).join(",") || "—"),
    "gan=" + (fileList.gan.map((p) => path.basename(p)).join(",") || "—")
  );

  const data = await readTasks();
  if (data.tasks && data.tasks.length > 0) {
    const withResponsibles = data.tasks.filter((t) => t.responsibleIds?.length > 0).length;
    log("getTasks: using tasks.json", "total=" + data.tasks.length, "with responsibleIds=" + withResponsibles);
    if (withResponsibles < data.tasks.length) await enrichFromHtml(data);
    return data;
  }
  let imported = await loadTasksFromHtml();
  if (imported.length === 0) {
    log("HTML empty, fallback to .gan");
    imported = await loadGanttFile();
  }
  if (imported.length > 0) {
    const toSave = { tasks: imported, lastGanttImport: new Date().toISOString() };
    await writeTasks(toSave);
    log("getTasks: saved imported tasks", imported.length);
    return toSave;
  }
  log("getTasks: no import source, returning empty");
  return data;
}

/**
 * Calcule la date de fin (inclusive) : start + durationDays - 1 jour.
 */
export function getTaskEndDate(task) {
  const d = new Date(task.start);
  d.setDate(d.getDate() + (task.durationDays || 0) - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Retourne true si la date du jour est dans [start, end] (inclusive).
 */
export function isTaskCurrent(task) {
  const today = new Date().toISOString().slice(0, 10);
  const end = getTaskEndDate(task);
  return !task.completed && task.start <= today && end >= today;
}

/**
 * Tâches dont l'utilisateur est responsable et qui sont "en cours" (complétables).
 */
export async function getCurrentTasksForUser(userId) {
  const { tasks } = await getTasks();
  return tasks.filter(
    (t) => isTaskCurrent(t) && t.responsibleIds && t.responsibleIds.includes(userId)
  );
}

/**
 * Tâches en retard (date de fin passée, non complétées).
 */
export function getOverdueTasks(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.filter((t) => {
    if (t.completed) return false;
    const end = getTaskEndDate(t);
    return end < today;
  });
}

/**
 * Successeurs d'une tâche (tâches qui ont cette tâche en prédécesseur).
 */
export function getSuccessorIds(tasks, taskId) {
  return tasks.filter((t) => t.predecessorIds && t.predecessorIds.includes(taskId)).map((t) => t.id);
}

/**
 * Génère un ID unique pour les nouvelles tâches ajoutées via /addtask.
 */
export async function nextTaskId() {
  const data = await getTasks();
  const ids = (data.tasks || []).map((t) => parseInt(t.id, 10)).filter((n) => !Number.isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return String(max + 1);
}
