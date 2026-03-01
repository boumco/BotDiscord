import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

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

/**
 * Embed de bienvenue quand un membre rejoint le serveur.
 * @param {Object} options
 * @param {string} options.memberDisplayName - Pseudo du nouveau membre
 * @param {string} options.memberAvatarURL - URL de l'avatar (ou null)
 * @param {string|null} options.inviterDisplayName - Pseudo de l'inviteur (null si inconnu)
 * @param {number} options.inviterInviteCount - Nombre d'invitations utilisées par l'inviteur
 */
export function buildWelcomeEmbed({ memberDisplayName, memberAvatarURL, inviterDisplayName, inviterInviteCount }) {
  const inviterName = inviterDisplayName ?? "Inconnu";
  const line2 = inviterDisplayName != null
    ? `**${inviterDisplayName}** possède **${inviterInviteCount}** invitation(s) utilisée(s)`
    : "—";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `Bienvenue ${memberDisplayName}`,
      iconURL: memberAvatarURL || undefined
    })
    .setThumbnail(memberAvatarURL || null)
    .setDescription(
      [
        `**Invité par** ${inviterName}`,
        line2,
        "",
        "*Passe un bon moment sur le serveur !*"
      ].join("\n")
    )
    .setTimestamp()
    .setFooter({ text: "SpeedRunMC • Bienvenue" });
}

export function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor(0xffc107)
    .setTitle("📜 Règlement SpeedRunMC")
    .setThumbnail("https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=256&q=80")
    .setDescription(
      [
        "### Respect & Comportement",
        "Le respect envers les autres est une obligation pour chaque membre. Il est interdit d'insulter, de tenir des propos haineux, discriminatoires, de harceler ou de provoquer. Pour assurer le bon fonctionnement du serveur et offrir une expérience optimale, il est essentiel d'avoir une bonne ambiance.",
        "",
        "### Contenus & Discussions",
        "La présence de contenus choquants, violents, pornographiques, illégaux ou inappropriés est proscrite et peut entraîner des sanctions. ",
        "Il est important que les discussions restent dans le thème des salons correspondants et qu'elles respectent les règles de Discord et celles du serveur, c'est-à-dire Minecraft.",
        "",
        "### Spam & Publicité",
        "Il est strictement interdit de faire du spam, du flood, de l'abus de majuscules ou d'emojis. Il est strictement interdit de faire de la publicité, de l'autopromotion ou de partager des liens. Cela conduit également à des sanctions préalables.",
        "",
        "### Pseudos & Profils",
        "Assurez-vous que les pseudos et les photos de profil soient lisibles et respectueux. Tout contenu considéré comme offensant ou inapproprié pourra faire l'objet d'une demande de modification.",
        "",
        "### Staff & Modération",
        "Il est impératif que les membres respectent les décisions du personnel. ",
        "Une demande (ticket) est nécessaire pour toute contestation qui doit être faite calmement. Il est formellement interdit de se faire passer pour un membre du personnel.",
        "",
        "### Sanctions",
        "En cas de non-conformité au règlement, des sanctions graduelles pourront être appliquées, allant de l'avertissement au bannissement permanent, en fonction de la gravité des faits. ",
        "Chaque individu jugé irrespectueux sur le serveur (voc ou textuel) sera examiné par l'équipe du staff."
      ].join("\n")
    )
    .setImage("https://images.unsplash.com/photo-1510511459019-5dda7724fd87?auto=format&fit=crop&w=1200&q=80")
    .setFooter({ text: "SpeedRunMC • Règles" });
}

/** Embed « Contacter le Support » pour le système de tickets. */
export function buildTicketSupportEmbed() {
  return new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("Contacter le Support de SpeedRunMC")
    .setDescription(
      [
        "⭐ Le support du serveur est disponible 24h/24 et 7j/7. ⭐",
        "",
        "**📝 Les Tickets :**",
        "Choisis le type de ticket ci-dessous :",
        "",
        "❓ **Poser une question** : pour toute question sur le serveur, les rôles ou le fonctionnement.",
        "",
        "👑 **Contacter un Owner** : pour contacter l'équipe owner (partenariats, décales, fournisseurs, etc.).",
        "",
        "🚨 **Dénoncer un problème** : pour signaler un abus, un conflit avec un membre ou un staff, ou contester une sanction.",
        "",
        "⚠️ Toutes demandes concernant les giveaways et concours nitro ne sont pas prises en charge.",
        "",
        "*— Support SpeedRunMC*"
      ].join("\n")
    )
    .setFooter({ text: "SpeedRunMC • Support" });
}

/** Boutons pour ouvrir un ticket (Poser une question, Owner, Dénoncer). */
export function buildTicketSupportComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:question")
        .setLabel("Poser une question")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❓"),
      new ButtonBuilder()
        .setCustomId("ticket:owner")
        .setLabel("Contacter un Owner")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("👑"),
      new ButtonBuilder()
        .setCustomId("ticket:denoncer")
        .setLabel("Dénoncer un problème")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🚨")
    )
  ];
}

/** Embed pour supprimer le ticket rapidement (staff/admin). */
export function buildTicketDeleteNowEmbed() {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🗑️ Supprimer le ticket")
    .setDescription("Clique sur le bouton ci-dessous pour **supprimer ce ticket immédiatement** (réservé au staff/admin).")
    .setFooter({ text: "SpeedRunMC • Support" });
}

/** Boutons dans le ticket : Claim (staff), Fermer, Supprimer maintenant (staff/admin). */
export function buildTicketChannelComponents(claimedBy = null) {
  const row1 = new ActionRowBuilder();
  if (!claimedBy) {
    row1.addComponents(
      new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claim").setStyle(ButtonStyle.Primary).setEmoji("✋")
    );
  }
  row1.addComponents(
    new ButtonBuilder().setCustomId("ticket:close").setLabel("Fermer le ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
  );
  row1.addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:deleteNow")
      .setLabel("Supprimer maintenant")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🗑️")
  );
  return [row1];
}

/** Boutons étoiles 1 à 5 (pour le sondage DM). */
export function buildStarButtons(customIdPrefix) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${customIdPrefix}:1`).setLabel("1").setStyle(ButtonStyle.Secondary).setEmoji("⭐"),
      new ButtonBuilder().setCustomId(`${customIdPrefix}:2`).setLabel("2").setStyle(ButtonStyle.Secondary).setEmoji("⭐"),
      new ButtonBuilder().setCustomId(`${customIdPrefix}:3`).setLabel("3").setStyle(ButtonStyle.Secondary).setEmoji("⭐"),
      new ButtonBuilder().setCustomId(`${customIdPrefix}:4`).setLabel("4").setStyle(ButtonStyle.Secondary).setEmoji("⭐"),
      new ButtonBuilder().setCustomId(`${customIdPrefix}:5`).setLabel("5").setStyle(ButtonStyle.Secondary).setEmoji("⭐")
    )
  ];
}

/** Boutons Oui / Non (sondage commentaire). */
export function buildYesNoButtons(customIdPrefix) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${customIdPrefix}:yes`).setLabel("Oui").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${customIdPrefix}:no`).setLabel("Non").setStyle(ButtonStyle.Secondary)
    )
  ];
}
