import { SlashCommandBuilder } from "discord.js";
import {
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus
} from "@discordjs/voice";
import ytdl from "ytdl-core";

const queues = new Map(); // guildId -> { player, connection, tracks: [], textChannelId }

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, { player: null, connection: null, tracks: [], textChannelId: null });
  }
  return queues.get(guildId);
}

async function ensureConnection(interaction, queue) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) {
    await interaction.reply({ content: "Tu dois être dans un salon vocal.", ephemeral: true });
    return null;
  }

  let connection = getVoiceConnection(interaction.guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voice.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });
  }

  queue.connection = connection;
  queue.textChannelId = interaction.channelId;

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    await interaction.reply({ content: "Impossible de rejoindre le vocal.", ephemeral: true });
    return null;
  }

  if (!queue.player) {
    queue.player = createAudioPlayer();
    connection.subscribe(queue.player);
    queue.player.on(AudioPlayerStatus.Idle, () => {
      queue.tracks.shift();
      if (queue.tracks.length > 0) {
        playCurrent(interaction.guild, queue).catch(console.error);
      }
    });
  }

  return connection;
}

async function playCurrent(guild, queue) {
  const current = queue.tracks[0];
  if (!current) return;

  const stream = ytdl(current.url, {
    filter: "audioonly",
    highWaterMark: 1 << 25
  });
  const resource = createAudioResource(stream);
  queue.player.play(resource);

  try {
    const textChannel = await guild.channels.fetch(queue.textChannelId);
    await textChannel.send(`🎵 Lecture: **${current.title ?? current.url}**`);
  } catch {
    // ignore
  }
}

export const musicCommand = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Contrôle de la musique.")
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Joue une musique à partir d'une URL (YouTube recommandé).")
        .addStringOption((opt) =>
          opt.setName("url").setDescription("URL YouTube ou audio directe").setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("skip").setDescription("Passe à la musique suivante."))
    .addSubcommand((sub) => sub.setName("stop").setDescription("Arrête la musique et vide la file."))
    .addSubcommand((sub) => sub.setName("leave").setDescription("Fait quitter le vocal au bot.")),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Utilise cette commande dans un serveur.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const queue = getQueue(interaction.guildId);

    if (sub === "play") {
      const url = interaction.options.getString("url", true);

      if (!ytdl.validateURL(url) && !url.startsWith("http")) {
        await interaction.reply({ content: "Donne-moi une URL valide (YouTube ou audio).", ephemeral: true });
        return;
      }

      const connection = await ensureConnection(interaction, queue);
      if (!connection) return;

      await interaction.deferReply();

      let title = null;
      if (ytdl.validateURL(url)) {
        try {
          const info = await ytdl.getInfo(url);
          title = info.videoDetails?.title ?? null;
        } catch {
          // ignore
        }
      }

      queue.tracks.push({ url, title });

      if (queue.tracks.length === 1) {
        await playCurrent(interaction.guild, queue);
        await interaction.editReply(`🎶 Lecture de **${title ?? url}**.`);
      } else {
        await interaction.editReply(`➕ Ajout à la file: **${title ?? url}** (\`${queue.tracks.length}\` en attente).`);
      }
      return;
    }

    if (sub === "skip") {
      if (!queue.player || queue.tracks.length === 0) {
        await interaction.reply({ content: "Aucune musique en cours.", ephemeral: true });
        return;
      }
      queue.player.stop(true);
      await interaction.reply("⏭️ Musique suivante.");
      return;
    }

    if (sub === "stop") {
      queue.tracks = [];
      if (queue.player) queue.player.stop(true);
      await interaction.reply("⏹️ Musique arrêtée et file vidée.");
      return;
    }

    if (sub === "leave") {
      const conn = getVoiceConnection(interaction.guildId);
      if (conn) conn.destroy();
      queue.player = null;
      queue.tracks = [];
      await interaction.reply("👋 J'ai quitté le salon vocal.");
      return;
    }
  }
};

