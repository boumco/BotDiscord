import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTasks, getTaskEndDate } from "../lib/tasksGantt.js";
import { buildTaskListEmbed } from "../lib/taskEmbeds.js";

export const tasklistCommand = {
  data: new SlashCommandBuilder()
    .setName("tasklist")
    .setDescription("Affiche toutes les tâches non terminées, triées par date de début."),

  async execute(interaction) {
    const data = await getTasks();
    const tasks = (data.tasks || [])
      .filter((t) => !t.completed)
      .sort((a, b) => {
        const cmp = (a.start || "").localeCompare(b.start || "");
        if (cmp !== 0) return cmp;
        return (a.name || "").localeCompare(b.name || "");
      });

    const embed = buildTaskListEmbed(tasks);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
