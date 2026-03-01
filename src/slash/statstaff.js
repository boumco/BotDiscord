import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { readState } from "../lib/storage.js";

export const statstaffCommand = {
  data: new SlashCommandBuilder()
    .setName("statstaff")
    .setDescription("Voir les statistiques staff (tickets résolus, notes moyennes).")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Membre dont voir les stats (vide = tes propres stats)").setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Utilise cette commande dans un serveur.", ephemeral: true });
      return;
    }
    const target = interaction.options.getUser("user") ?? interaction.user;
    const state = await readState();
    const stats = state?.[interaction.guildId]?.staffStats?.[target.id];
    const isSelf = target.id === interaction.user.id;

    if (!stats || stats.ticketsResolved === 0) {
      const msg = isSelf
        ? "Tu n'as pas encore de statistiques staff (aucun ticket résolu)."
        : `${target.tag} n'a pas encore de statistiques staff.`;
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    const n = stats.countRatings || 1;
    const avgRes = (stats.sumResolution ?? 0) / n;
    const avgSym = (stats.sumSympathy ?? 0) / n;
    const avgRap = (stats.sumRapidite ?? 0) / n;
    const round = (x) => Math.round(x * 10) / 10;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: isSelf ? "Tes statistiques staff" : `Statistiques de ${target.tag}`,
        iconURL: target.displayAvatarURL()
      })
      .addFields(
        { name: "Tickets résolus", value: String(stats.ticketsResolved), inline: true },
        { name: "Nombre d'avis", value: String(n), inline: true },
        {
          name: "⭐ Moy. résolution du problème",
          value: `${round(avgRes)}/5`,
          inline: true
        },
        {
          name: "⭐ Moy. sympathie",
          value: `${round(avgSym)}/5`,
          inline: true
        },
        {
          name: "⭐ Moy. rapidité",
          value: `${round(avgRap)}/5`,
          inline: true
        }
      )
      .setFooter({ text: "SpeedRunMC • Stats staff" })
      .setTimestamp();

    if (isSelf && stats.lastComment) {
      embed.addFields({
        name: "Dernier commentaire reçu",
        value: stats.lastComment.slice(0, 1024) + (stats.lastComment.length > 1024 ? "…" : ""),
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
