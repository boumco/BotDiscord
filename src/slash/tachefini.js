import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getCurrentTasksForUser, getTasks, getTaskEndDate } from "../lib/tasksGantt.js";
import { readTasks, writeTasks } from "../lib/storage.js";
import { buildTacheCompleteEmbed } from "../lib/taskEmbeds.js";
import { sendTaskWebhook } from "../lib/taskWebhook.js";
import { ALL_TASK_USER_IDS } from "../lib/tasksConfig.js";

export const tachefiniCommand = {
  data: new SlashCommandBuilder()
    .setName("tachefini")
    .setDescription("Marquer une tâche en cours comme terminée (menu déroulant)."),

  async execute(interaction) {
    const userId = interaction.user.id;
    if (!ALL_TASK_USER_IDS.includes(userId)) {
      await interaction.reply({
        content: "Tu n’es pas assigné à des tâches du projet. Seuls les responsables peuvent utiliser cette commande.",
        ephemeral: true
      });
      return;
    }

    const current = await getCurrentTasksForUser(userId);
    if (current.length === 0) {
      await interaction.reply({
        content: "Tu n’as aucune tâche **en cours** à marquer comme terminée. (Une tâche est « en cours » si nous sommes entre sa date de début et sa date de fin.)",
        ephemeral: true
      });
      return;
    }

    const options = current.slice(0, 25).map((t) => ({
      label: t.name.length > 100 ? t.name.slice(0, 97) + "…" : t.name,
      value: t.id,
      description: `${t.start} → ${getTaskEndDate(t)} (${t.durationDays} j)`
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("tachefini:select")
        .setPlaceholder("Choisis la tâche terminée…")
        .addOptions(options)
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Marquer une tâche comme terminée")
      .setDescription("Sélectionne dans le menu ci-dessous la tâche que tu as terminée.")
      .setFooter({ text: "Broken Realm • Planification" });

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};

/** Gère la sélection du menu tachefini:select */
export async function handleTachefiniSelect(interaction) {
  if (interaction.customId !== "tachefini:select" || !interaction.isStringSelectMenu()) return false;
  const taskId = interaction.values[0];
  const userId = interaction.user.id;

  const data = await readTasks();
  const task = (data.tasks || []).find((t) => t.id === taskId);
  if (!task) {
    await interaction.update({ content: "Tâche introuvable.", embeds: [], components: [] }).catch(() => {});
    return true;
  }
  if (task.completed) {
    await interaction.update({ content: "Cette tâche est déjà marquée comme terminée.", embeds: [], components: [] }).catch(() => {});
    return true;
  }
  if (!task.responsibleIds || !task.responsibleIds.includes(userId)) {
    await interaction.update({ content: "Tu n’es pas responsable de cette tâche.", embeds: [], components: [] }).catch(() => {});
    return true;
  }

  const today = new Date().toISOString().slice(0, 10);
  const end = getTaskEndDate(task);
  if (today > end) {
    await interaction.update({ content: "La date de fin est dépassée ; tu ne peux plus marquer cette tâche comme terminée via ce menu.", embeds: [], components: [] }).catch(() => {});
    return true;
  }
  if (today < task.start) {
    await interaction.update({ content: "Cette tâche n’a pas encore commencé.", embeds: [], components: [] }).catch(() => {});
    return true;
  }

  task.completed = true;
  task.completedAt = new Date().toISOString();
  task.completedBy = userId;
  await writeTasks(data);

  const embedDone = buildTacheCompleteEmbed(task, interaction.user.tag, userId);
  await sendTaskWebhook({ embeds: [embedDone] });

  const confirmEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ Tâche marquée comme terminée")
    .setDescription(`**${task.name}** a bien été enregistrée comme terminée. Une notification a été envoyée sur le canal prévu.`)
    .setFooter({ text: "Broken Realm • Planification" })
    .setTimestamp();

  await interaction.update({ content: null, embeds: [confirmEmbed], components: [] }).catch(() => {});
  return true;
}
