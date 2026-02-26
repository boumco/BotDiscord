import "dotenv/config";
import { REST, Routes } from "discord.js";

import { configCommand } from "./slash/config.js";
import { helpCommand } from "./slash/help.js";
import { musicCommand } from "./slash/music.js";
import { whitelistCommand } from "./slash/whitelist.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Missing env. Required: DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID");
  process.exit(1);
}

const commands = [
  configCommand.data.toJSON(),
  helpCommand.data.toJSON(),
  musicCommand.data.toJSON(),
  whitelistCommand.data.toJSON()
];

const rest = new REST({ version: "10" }).setToken(token);

try {
  console.log("Registering guild slash commands...");
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log("Done.");
} catch (err) {
  console.error(err);
  process.exit(1);
}

