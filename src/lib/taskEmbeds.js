import { EmbedBuilder } from "discord.js";
import { getTaskEndDate } from "./tasksGantt.js";

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  info: 0x00bcd4
};

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatDuree(jours) {
  if (jours <= 0) return "—";
  return jours === 1 ? "1 jour" : `${jours} jours`;
}

/** Embed : rappel veille (DM) */
export function buildRappelVeilleEmbed(task) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("📅 Rappel : tâche demain")
    .setDescription(`Ta tâche **${task.name}** commence **demain**.`)
    .addFields(
      { name: "Début", value: formatDate(task.start), inline: true },
      { name: "Fin", value: formatDate(end), inline: true },
      { name: "Durée", value: formatDuree(task.durationDays), inline: true }
    )
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();
}

/** Embed : tâche commence aujourd'hui (DM) */
export function buildTacheCommenceEmbed(task) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("▶️ C’est parti !")
    .setDescription(`La tâche **${task.name}** commence **aujourd’hui**.`)
    .addFields(
      { name: "Fin prévue", value: formatDate(end), inline: true },
      { name: "Durée", value: formatDuree(task.durationDays), inline: true }
    )
    .setFooter({ text: "Pense à utiliser /tachefini une fois terminée." })
    .setTimestamp();
}

/** Embed : 50 % du temps écoulé (DM) */
export function buildTache50Embed(task) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle("⏳ À mi-parcours")
    .setDescription(`Tu es à environ **50 %** du temps pour la tâche **${task.name}**.`)
    .addFields(
      { name: "Fin prévue", value: formatDate(end), inline: true },
      { name: "Durée totale", value: formatDuree(task.durationDays), inline: true }
    )
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();
}

/** Embed : plus que 2 h (DM) */
export function buildTache2hEmbed(task) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle("⏰ Dernière ligne droite")
    .setDescription(`La tâche **${task.name}** se termine dans **environ 2 heures**.`)
    .addFields(
      { name: "Fin prévue", value: formatDate(end), inline: true }
    )
    .setFooter({ text: "Pense à finaliser et à faire /tachefini si c’est fait." })
    .setTimestamp();
}

/** Embed : fin de la tâche aujourd'hui (DM) */
export function buildTacheFinAujourdhuiEmbed(task) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle("🏁 Dernier jour")
    .setDescription(`La tâche **${task.name}** se termine **aujourd’hui**.`)
    .addFields(
      { name: "Date de fin", value: formatDate(end), inline: true },
      { name: "Durée", value: formatDuree(task.durationDays), inline: true }
    )
    .setFooter({ text: "Pense à faire /tachefini une fois terminée." })
    .setTimestamp();
}

/** Embed : tâche en retard de N jours (DM, chaque jour) */
export function buildTacheRetardJoursEmbed(task, joursRetard) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle(`🚨 Tâche en retard (${joursRetard} jour${joursRetard > 1 ? "s" : ""})`)
    .setDescription(`La tâche **${task.name}** n’a pas été marquée comme terminée. Elle était prévue pour le **${formatDate(end)}**.`)
    .addFields(
      { name: "Jours de retard", value: String(joursRetard), inline: true },
      { name: "Action", value: "Marque la tâche comme terminée avec /tachefini dès que c’est fait.", inline: false }
    )
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();
}

/** Embed : tâche complétée (webhook) */
export function buildTacheCompleteEmbed(task, userTag, userId) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("✅ Tâche terminée")
    .setDescription(`**${task.name}** a été marquée comme terminée.`)
    .addFields(
      { name: "Effectuée par", value: `<@${userId}> (${userTag})`, inline: true },
      { name: "Date de fin prévue", value: formatDate(end), inline: true },
      { name: "Durée prévue", value: formatDuree(task.durationDays), inline: true }
    )
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();
}

/** Embed : tâche en retard (webhook @everyone) */
export function buildTacheRetardEmbed(task) {
  const end = getTaskEndDate(task);
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle("🚨 Tâche en retard")
    .setDescription(`La tâche **${task.name}** n’a pas été marquée comme terminée après la date de fin prévue.`)
    .addFields(
      { name: "Date de fin prévue", value: formatDate(end), inline: true },
      { name: "Durée", value: formatDuree(task.durationDays), inline: true }
    )
    .setFooter({ text: "Merci de la finaliser et d’utiliser /tachefini." })
    .setTimestamp();
}

/** Embed : prédécesseur non fini, successeurs bloqués (webhook) */
export function buildPredecesseurNonFiniEmbed(taskEnRetard, successeurNames) {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle("⛔ Tâches en attente")
    .setDescription(
      `La tâche **${taskEnRetard.name}** n’est pas terminée. Les tâches suivantes ne peuvent pas démarrer : **${successeurNames.join(", ")}**.`
    )
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();
}

const MS_PER_DAY = 86400000;

/** Génère une barre Gantt texte sur 7 jours (2 caractères par jour = 14 chars). */
function ganttBar(task, ws, we) {
  const wsDate = new Date(ws + "T00:00:00");
  const weDate = new Date(we + "T00:00:00");
  const taskStart = new Date(task.start + "T00:00:00");
  const taskEnd = new Date(getTaskEndDate(task) + "T00:00:00");
  const visibleStart = taskStart < wsDate ? wsDate : taskStart;
  const visibleEnd = taskEnd > weDate ? weDate : taskEnd;
  if (visibleStart > visibleEnd) return "·".repeat(14);
  const startIdx = Math.max(0, Math.floor((visibleStart - wsDate) / MS_PER_DAY));
  const endIdx = Math.min(6, Math.floor((visibleEnd - wsDate) / MS_PER_DAY));
  let s = "";
  for (let i = 0; i < 7; i++) s += i >= startIdx && i <= endIdx ? "██" : "··";
  return s;
}

/** Embed : programme de la semaine (webhook) — style épuré type addtask */
export function buildProgrammeSemaineEmbed(tasksSemaine, weekStart, weekEnd) {
  const ws = weekStart;
  const we = weekEnd;
  const dayLabels = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(new Date(ws + "T12:00:00").getTime() + i * MS_PER_DAY);
    dayLabels.push(String(d.getDate()).padStart(2));
  }
  const headerLine = " " + dayLabels.join(" ");
  const sep = "─".repeat(14);

  const ganttBlock = [];
  const taskDetails = [];

  if (tasksSemaine.length) {
    for (const t of tasksSemaine) {
      const end = getTaskEndDate(t);
      const resp = t.responsibleIds?.length ? t.responsibleIds.map((id) => `<@${id}>`).join(", ") : "—";
      const shortName = t.name.length > 26 ? t.name.slice(0, 23) + "…" : t.name;
      ganttBlock.push(`${ganttBar(t, ws, we)} ${shortName}`);
      taskDetails.push(`**${t.name}**\n${formatDate(t.start)} → ${formatDate(end)} • ${formatDuree(t.durationDays)}\nResponsables : ${resp}`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("📋 Programme de la semaine")
    .setDescription(`**Période** — Du ${formatDate(ws)} au ${formatDate(we)}`)
    .setImage("attachment://Projet BrokenRealm.png")
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();

  if (ganttBlock.length) {
    embed.addFields({
      name: "📆 Calendrier (un bloc = 1 jour)",
      value: "```\n" + headerLine + "\n" + sep + "\n" + ganttBlock.join("\n") + "\n```",
      inline: false
    });
    const value = taskDetails.join("\n\n").slice(0, 1024);
    embed.addFields({ name: "👤 Tâches et responsables", value: value, inline: false });
  } else {
    embed.addFields({ name: "Aucune tâche", value: "_Aucune tâche prévue cette semaine._", inline: false });
  }

  return embed;
}

/** Embed : ajout de tâche (confirmation) */
export function buildAddTaskConfirmEmbed(task) {
  const end = getTaskEndDate(task);
  const pred = task.predecessorIds?.length ? task.predecessorIds.join(", ") : "Aucune";
  const resp = task.responsibleIds?.length ? task.responsibleIds.map((id) => `<@${id}>`).join(", ") : "—";
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("➕ Tâche ajoutée")
    .setDescription(`**${task.name}** a été ajoutée au planning.`)
    .addFields(
      { name: "Début", value: formatDate(task.start), inline: true },
      { name: "Fin", value: formatDate(end), inline: true },
      { name: "Durée", value: formatDuree(task.durationDays), inline: true },
      { name: "Prédécesseur(s)", value: pred, inline: false },
      { name: "Responsable(s)", value: resp, inline: false }
    )
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();
}

/** Embed : liste des tâches non terminées (/tasklist), triées par date de début */
export function buildTaskListEmbed(tasks) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("📌 Tâches à faire")
    .setDescription(
      tasks.length === 0
        ? "Aucune tâche en attente. Tout est à jour."
        : `${tasks.length} tâche(s) non terminée(s), par ordre de début.`
    )
    .setFooter({ text: "Broken Realm • /tachefini pour marquer une tâche terminée" })
    .setTimestamp();

  if (tasks.length === 0) return embed;

  const lines = [];
  for (let i = 0; i < Math.min(tasks.length, 25); i++) {
    const t = tasks[i];
    const end = getTaskEndDate(t);
    const resp = t.responsibleIds?.length ? t.responsibleIds.map((id) => `<@${id}>`).join(", ") : "—";
    lines.push(
      `**${i + 1}. ${t.name}**\n   Début : ${formatDate(t.start)} • Fin : ${formatDate(end)} • ${formatDuree(t.durationDays)}\n   Responsable(s) : ${resp}`
    );
  }
  const value = lines.join("\n\n").slice(0, 1024);
  embed.addFields({ name: "📅 Planning", value: value, inline: false });
  if (tasks.length > 25) embed.addFields({ name: "…", value: `_Et ${tasks.length - 25} autre(s) tâche(s)._`, inline: false });
  return embed;
}
