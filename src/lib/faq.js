import { EmbedBuilder } from "discord.js";

/** Normalise le texte pour la comparaison (minuscules, sans accents, sans double espaces). */
function normalize(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vérifie si le texte ressemble à une question en français. */
function looksLikeQuestion(text) {
  const n = normalize(text);
  if (n.includes("?")) return true;
  const questionStart = [
    "quelle ", "quel ", "quels ", "quelles ",
    "comment ", "combien ", "pourquoi ", "quand ", "ou ", "où ",
    "qui ", "quoi ", "est ce que ", "est-ce que ", "c est quoi ", "c'est quoi ",
    "c quoi ", "dis moi ", "tu peux ", "vous pouvez ", "j aimerais ", "je voudrais ",
    "donne ", "donne moi ", "indique ", "indique moi "
  ];
  return questionStart.some((q) => n.startsWith(q) || n.includes(" " + q));
}

/**
 * FAQ : mots-clés (normalisés) -> { keywords: string[], response: string | 'embed' }
 * Si response === 'embed', on renverra l'embed "comment rejoindre".
 */
const FAQ_ENTRIES = [
  {
    keywords: ["crack", "cracked", "crak", "compte crack", "offline", "pirate", "gratuit"],
    response: "**Crack autorisé ?**\nNon, le serveur n’accepte pas les clients crack. Tu dois posséder une copie légale de Minecraft (compte Java premium)."
  },
  {
    keywords: ["ip", "ipp", "adresse", "connect", "connexion", "serveur", "join", "adresse du serveur"],
    response: "**IP du serveur**\nL’adresse du serveur est **speedrunmc.com** et la version est **1.21.5**."
  },
  {
    keywords: ["version", "version du serveur", "quelle version", "version minecraft", "verssion"],
    response: "**Version du serveur**\nLe serveur tourne en **1.21.5**. Pense à utiliser cette version pour te connecter."
  },
  {
    keywords: ["recrutement", "recrute", "recrut", "rejoindre l equipe", "rejoindre lequipe"],
    response: "**Recrutement**\nOui, nous recrutons ! Rendez-vous dans le salon **#recrutement** pour voir les offres et postuler."
  },
  {
    keywords: ["condition staff", "condition pour etre staff", "critere staff", "exigence staff", "avoir staff", "postuler staff", "conditions staff"],
    response: "**Conditions pour être staff**\n• Avoir **16 ans minimum**\n• Connaître les bases de Minecraft\n• Être **autodidacte** (important)\n• Avoir un micro"
  },
  {
    keywords: ["comment rejoindre", "rejoindre le serveur", "connecter serveur", "tuto", "tutorial", "comment se connecter", "jouer sur le serveur", "rejoindre minecraft"],
    response: "embed"
  }
];

/** Construit l’embed « Comment rejoindre le serveur Minecraft ». */
export function buildJoinServerEmbed() {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎮 Comment rejoindre le serveur Minecraft")
    .setDescription(
      [
        "Voici les étapes pour te connecter à **SpeedRunMC** :",
        "",
        "**1.** Ouvre **Minecraft Java** (version **1.21.5**).",
        "**2.** Clique sur **Multijoueur** dans le menu principal.",
        "**3.** Clique sur **Ajouter un serveur**.",
        "**4.** Renseigne :",
        "　・ **Nom** : SpeedRunMC (ou ce que tu veux)",
        "　・ **Adresse du serveur** : `speedrunmc.com`",
        "**5.** Valide puis double-clique sur le serveur pour t’y connecter.",
        "",
        "Tu dois posséder un compte **Minecraft Java premium** (pas de crack)."
      ].join("\n")
    )
    .setFooter({ text: "SpeedRunMC • Besoin d’aide ? Demande en salon !" })
    .setTimestamp();
}

/**
 * Cherche une réponse FAQ pour le message.
 * @param {string} content - Contenu du message
 * @returns {null | { type: 'text', content: string } | { type: 'embed', embed: EmbedBuilder }}
 */
export function getFaqResponse(content) {
  if (!content || typeof content !== "string") return null;
  const n = normalize(content);
  if (n.length < 2) return null;
  if (!looksLikeQuestion(content)) return null;

  for (const entry of FAQ_ENTRIES) {
    const hasKeyword = entry.keywords.some((kw) => n.includes(kw));
    if (hasKeyword) {
      if (entry.response === "embed") {
        return { type: "embed", embed: buildJoinServerEmbed() };
      }
      return { type: "text", content: entry.response };
    }
  }
  return null;
}
