import { EmbedBuilder } from "discord.js";

export function buildVerificationEmbed({ guildName }) {
  return new EmbedBuilder()
    .setColor(0x2b90ff)
    .setTitle("✅ Vérification SpeedRunMC")
    .setThumbnail("https://images.unsplash.com/photo-1618005198919-d3d4b5a92eee?auto=format&fit=crop&w=256&q=80")
    .setDescription(
      [
        "Bienvenue sur **" + guildName + "** !",
        "",
        "Pour accéder au serveur, clique sur le bouton **Vérifier** puis recopie **exactement** le code affiché.",
        "",
        "◆ Anti-raid & anti-spam actifs",
        "◆ Liens d'invitations Discord interdits",
        "◆ Mentions abusives sanctionnées",
        "",
        "En te vérifiant, tu confirmes avoir lu le règlement."
      ].join("\n")
    )
    .setImage("https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80")
    .setFooter({ text: "SpeedRunMC • Vérification" });
}

export function buildRolesEmbed() {
  return new EmbedBuilder()
    .setColor(0x8a2be2)
    .setTitle("🎭 Choisis tes rôles")
    .setThumbnail("https://images.unsplash.com/photo-1618005198919-9e96c4ae8f54?auto=format&fit=crop&w=256&q=80")
    .setDescription(
      [
        "Personnalise ton profil pour que la communauté te connaisse mieux.",
        "",
        "- Genre, âge, passions, etc.",
        "- Tu peux modifier tes choix à tout moment.",
        "",
        "Utilise les menus ci-dessous pour sélectionner ou retirer des rôles."
      ].join("\n")
    )
    .setImage("https://images.unsplash.com/photo-1626379954088-62ba77da9f2b?auto=format&fit=crop&w=1200&q=80")
    .setFooter({ text: "SpeedRunMC • Rôles" });
}

export function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor(0xffc107)
    .setTitle("📜 Règlement SpeedRunMC")
    .setThumbnail("https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=256&q=80")
    .setDescription(
      [
        "### Respect",
        "- Pas d'insultes, harcèlement ou discrimination",
        "",
        "### Sécurité",
        "- Pas de liens d'invitation Discord",
        "- Pas de spam / mention abusive",
        "",
        "### Sanctions",
        "- Les abus peuvent mener à un mute, kick ou ban"
      ].join("\n")
    )
    .setImage("https://images.unsplash.com/photo-1510511459019-5dda7724fd87?auto=format&fit=crop&w=1200&q=80")
    .setFooter({ text: "SpeedRunMC • Règles" });
}

