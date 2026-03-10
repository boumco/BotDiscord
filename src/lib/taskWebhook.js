import fs from "fs";
import path from "path";
import { TASKS_WEBHOOK_URL } from "./tasksConfig.js";

/**
 * Envoie un message au webhook des tâches (embeds + optionnel content pour @everyone).
 * Si options.files est fourni (tableau de { path, name }), envoie en multipart/form-data avec les pièces jointes.
 */
export async function sendTaskWebhook(options) {
  const { content = null, embeds = [], files = [] } = options;
  const body = {};
  if (content) body.content = content;
  if (embeds.length) body.embeds = embeds.map((e) => (e.toJSON ? e.toJSON() : e));

  if (files.length === 0) {
    const res = await fetch(TASKS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[TASKS_WEBHOOK] Erreur:", res.status, text);
    }
    return;
  }

  const formData = new FormData();
  formData.append("payload_json", JSON.stringify(body));
  for (let i = 0; i < files.length; i++) {
    const { path: filePath, name } = files[i];
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.error("[TASKS_WEBHOOK] Fichier introuvable:", fullPath);
      continue;
    }
    formData.append(`files[${i}]`, new Blob([fs.readFileSync(fullPath)]), name);
  }

  const res = await fetch(TASKS_WEBHOOK_URL, {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[TASKS_WEBHOOK] Erreur:", res.status, text);
  }
}
