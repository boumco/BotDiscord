import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { readWhitelist, writeWhitelist } from "../lib/storage.js";

const WHITELIST_ADMIN_ID = process.env.WHITELIST_ADMIN_ID || "546735493346230272";

export const whitelistCommand = {
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Gère la whitelist (bypass des protections). Réservé à l’admin whitelist.")
    .addSubcommand((sub) =>
      sub.setName("liste").setDescription("Affiche la liste des utilisateurs whitelistés.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("ajouter")
        .setDescription("Ajoute un utilisateur à la whitelist.")
        .addUserOption((opt) =>
          opt.setName("utilisateur").setDescription("Utilisateur à ajouter").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("retirer")
        .setDescription("Retire un utilisateur de la whitelist.")
        .addUserOption((opt) =>
          opt.setName("utilisateur").setDescription("Utilisateur à retirer").setRequired(true)
        )
    ),

  async execute(interaction) {
    if (interaction.user.id !== String(WHITELIST_ADMIN_ID)) {
      await interaction.reply({ content: "Tu n’es pas autorisé à gérer la whitelist.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const wl = await readWhitelist();
    wl.userIds = Array.from(new Set((wl.userIds ?? []).map(String)));

    if (sub === "liste") {
      const list = wl.userIds.length
        ? wl.userIds.map((id) => `- <@${id}> (\`${id}\`)`).join("\n")
        : "_Aucun utilisateur._";
      await interaction.reply({ content: `**Whitelist**\n${list}`, ephemeral: true });
      return;
    }

    const user = interaction.options.getUser("utilisateur", true);
    if (sub === "ajouter") {
      if (!wl.userIds.includes(user.id)) wl.userIds.push(user.id);
      await writeWhitelist(wl);
      await interaction.reply({ content: `✅ <@${user.id}> a été ajouté à la whitelist.`, ephemeral: true });
      return;
    }
    if (sub === "retirer") {
      wl.userIds = wl.userIds.filter((id) => id !== user.id);
      await writeWhitelist(wl);
      await interaction.reply({ content: `✅ <@${user.id}> a été retiré de la whitelist.`, ephemeral: true });
    }
  }
};
