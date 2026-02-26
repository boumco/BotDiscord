import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const helpCommand = {
  data: new SlashCommandBuilder().setName("help").setDescription("Affiche l'aide du bot SpeedRunMC."),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x00bcd4)
      .setTitle("❓ Aide SpeedRunMC")
      .setThumbnail("https://images.unsplash.com/photo-1604079628040-94301bb21b11?auto=format&fit=crop&w=256&q=80")
      .setDescription(
        [
          "Voici un aperçu des principales fonctionnalités du bot.",
          "",
          "**Configuration**",
          "- `/config type salon` – définit un salon (ex. `/config verification #verification`).",
          "  Types : verification, regles, annonces, general, medias, roles, staff, logs.",
          "- `/whitelist ajouter/retirer/liste` – gère la whitelist (bypass des protections).",
          "",
          "**Utilisation générale**",
          "- Vérification dans le salon configuré (bouton + code).",
          "- Rôles auto dans le salon « roles ».",
          "- Salon « medias » : images/vidéos uniquement.",
          "",
          "**Modération & sécurité**",
          "- Anti-lien d'invitation Discord, anti spam mention, anti webhook.",
          "",
          "**Musique**",
          "- `/music play <url>`, `/music skip`, `/music stop`, `/music leave`."
        ].join("\n")
      )
      .setFooter({ text: "SpeedRunMC • Besoin d'aide supplémentaire ? Contacte le staff." });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

