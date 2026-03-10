/**
 * Debug des tâches : activé avec DEBUG_TASKS=1 ou TASKS_DEBUG=1.
 * Logs en console avec préfixe [TASKS_DEBUG]. Optionnel : écriture dans data/tasks-debug.log.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DEBUG = process.env.DEBUG_TASKS === "1" || process.env.TASKS_DEBUG === "1";

function ts() {
  return new Date().toISOString();
}

export function log(...args) {
  if (!DEBUG) return;
  const line = `[TASKS_DEBUG] ${ts()} ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`;
  console.log(line);
  if (process.env.TASKS_DEBUG_LOG === "1") {
    const p = path.resolve(process.cwd(), "data", "tasks-debug.log");
    fs.appendFile(p, line + "\n", "utf8").catch(() => {});
  }
}

export function logTask(label, task) {
  if (!DEBUG) return;
  log(
    label,
    "id=" + task?.id,
    "name=" + (task?.name ?? "?"),
    "start=" + (task?.start ?? "?"),
    "responsibleIds=" + (task?.responsibleIds?.length ?? 0),
    task?.responsibleIds ?? []
  );
}

export function logImport(source, count, sample) {
  if (!DEBUG) return;
  log("Import", source, "count=" + count, sample != null ? "sample:" : "", sample ?? "");
}
