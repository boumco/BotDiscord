import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { getTasks, getTaskEndDate } from "../lib/tasksGantt.js";
import { readTasks, writeTasks } from "../lib/storage.js";
import { buildAddTaskConfirmEmbed } from "../lib/taskEmbeds.js";
import { RESPONSIBLE_CHOICES, choiceToDiscordIds } from "../lib/tasksConfig.js";

const ADD_TASK_STATE = new Map(); // userId -> { name, durationDays }

export const addtaskCommand = {
  data: new SlashCommandBuilder()
    .setName("addtask")
    .setDescription("Ajouter une tâche au planning (nom, durée, prédécesseur, responsables)."),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("addtask:modal")
      .setTitle("Nouvelle tâche");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("addtask:name")
          .setLabel("Nom de la tâche")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
          .setPlaceholder("Ex: Intégration API")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("addtask:duration")
          .setLabel("Durée (en jours)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("Ex: 5")
      )
    );
    await interaction.showModal(modal);
  }
};

/** Après envoi du modal : afficher les menus Prédécesseur + Responsables + bouton Envoyer */
export async function handleAddTaskModal(interaction) {
  if (interaction.customId !== "addtask:modal" || !interaction.isModalSubmit()) return false;
  const name = interaction.fields.getTextInputValue("addtask:name")?.trim();
  const durationStr = interaction.fields.getTextInputValue("addtask:duration")?.trim();
  if (!name) {
    await interaction.reply({ content: "Le nom de la tâche est requis.", ephemeral: true }).catch(() => {});
    return true;
  }
  const durationDays = parseInt(durationStr, 10);
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    await interaction.reply({ content: "La durée doit être un nombre de jours (entier ≥ 1).", ephemeral: true }).catch(() => {});
    return true;
  }

  ADD_TASK_STATE.set(interaction.user.id, { name, durationDays });
  addTaskSelections.set(interaction.user.id, { predecessorId: "none", responsibleValues: [] });

  const data = await getTasks();
  const tasks = (data.tasks || []).filter((t) => !t.completed);
  const predOptions = tasks.slice(0, 25).map((t) => ({
    label: t.name.length > 100 ? t.name.slice(0, 97) + "…" : t.name,
    value: t.id,
    description: `Fin: ${getTaskEndDate(t)}`
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("addtask:predecessor")
      .setPlaceholder("Prédécesseur (optionnel)")
      .addOptions([{ label: "Aucun prédécesseur", value: "none", description: "La tâche peut commencer dès que possible" }, ...predOptions])
  );
  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("addtask:responsibles")
      .setPlaceholder("Responsable(s) de la tâche")
      .setMinValues(1)
      .setMaxValues(RESPONSIBLE_CHOICES.length)
      .addOptions(RESPONSIBLE_CHOICES.map((c) => ({ label: c.name, value: c.value })))
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("addtask:submit").setLabel("Créer la tâche").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("➕ Étape 2 : Prédécesseur et responsables")
    .setDescription(`Tâche : **${name}** — Durée : **${durationDays}** jour(s).\nChoisis le prédécesseur (optionnel) et au moins un responsable, puis clique sur **Créer la tâche**.`)
    .setFooter({ text: "Broken Realm • Planification" });

  await interaction.reply({ embeds: [embed], components: [row1, row2, row3], ephemeral: true }).catch(() => {});
  return true;
}

/** Stocke la sélection prédécesseur ou responsables */
const addTaskSelections = new Map(); // userId -> { predecessorId, responsibleValues[] }

export function handleAddTaskPredecessorSelect(interaction) {
  if (interaction.customId !== "addtask:predecessor" || !interaction.isStringSelectMenu()) return false;
  const userId = interaction.user.id;
  if (!addTaskSelections.has(userId)) addTaskSelections.set(userId, { predecessorId: "none", responsibleValues: [] });
  addTaskSelections.get(userId).predecessorId = interaction.values[0];
  interaction.deferUpdate().catch(() => {});
  return true;
}

export function handleAddTaskResponsiblesSelect(interaction) {
  if (interaction.customId !== "addtask:responsibles" || !interaction.isStringSelectMenu()) return false;
  const userId = interaction.user.id;
  if (!addTaskSelections.has(userId)) addTaskSelections.set(userId, { predecessorId: "none", responsibleValues: [] });
  addTaskSelections.get(userId).responsibleValues = interaction.values;
  interaction.deferUpdate().catch(() => {});
  return true;
}

/** Bouton "Créer la tâche" : crée la tâche et envoie la confirmation */
export async function handleAddTaskSubmit(interaction) {
  if (interaction.customId !== "addtask:submit" || !interaction.isButton()) return false;
  const userId = interaction.user.id;
  const state = ADD_TASK_STATE.get(userId);
  const selections = addTaskSelections.get(userId);
  if (!state) {
    await interaction.reply({ content: "Session expirée. Refais /addtask.", ephemeral: true }).catch(() => {});
    return true;
  }
  const responsibleValues = selections?.responsibleValues || [];
  if (responsibleValues.length === 0) {
    await interaction.reply({ content: "Choisis au moins un responsable avant de créer la tâche.", ephemeral: true }).catch(() => {});
    return true;
  }

  const data = await readTasks();
  const tasks = data.tasks || [];
  let startDate;
  const predecessorId = selections?.predecessorId === "none" ? null : selections?.predecessorId;
  if (predecessorId) {
    const pred = tasks.find((t) => t.id === predecessorId);
    if (pred) {
      const endPred = getTaskEndDate(pred);
      const next = new Date(endPred + "T12:00:00");
      next.setDate(next.getDate() + 1);
      startDate = next.toISOString().slice(0, 10);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      startDate = tomorrow.toISOString().slice(0, 10);
    }
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    startDate = tomorrow.toISOString().slice(0, 10);
  }

  const responsibleIds = [];
  for (const v of responsibleValues) {
    for (const id of choiceToDiscordIds(v)) {
      if (!responsibleIds.includes(id)) responsibleIds.push(id);
    }
  }

  const existingIds = (data.tasks || []).map((t) => parseInt(t.id, 10)).filter((n) => !Number.isNaN(n));
  const newId = String((existingIds.length ? Math.max(...existingIds) : 0) + 1);
  const newTask = {
    id: newId,
    name: state.name,
    start: startDate,
    durationDays: state.durationDays,
    completed: false,
    completedAt: null,
    completedBy: null,
    predecessorIds: predecessorId ? [predecessorId] : [],
    responsibleIds,
    remindersSent: {}
  };
  tasks.push(newTask);
  data.tasks = tasks;
  await writeTasks(data);

  ADD_TASK_STATE.delete(userId);
  addTaskSelections.delete(userId);

  const embed = buildAddTaskConfirmEmbed(newTask);
  await interaction.update({ content: null, embeds: [embed], components: [] }).catch(() => {});
  return true;
}
