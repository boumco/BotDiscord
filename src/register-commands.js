import "dotenv/config";
import { REST, Routes } from "discord.js";

import { configCommand } from "./slash/config.js";
import { helpCommand } from "./slash/help.js";
import { musicCommand } from "./slash/music.js";
import { whitelistCommand } from "./slash/whitelist.js";
import { statstaffCommand } from "./slash/statstaff.js";
import { tachefiniCommand } from "./slash/tachefini.js";
import { addtaskCommand } from "./slash/addtask.js";
import { tasklistCommand } from "./slash/tasklist.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Missing env. Required: DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID");
  process.exit(1);
}

const taskCommands = [
  tachefiniCommand.data.toJSON(),
  addtaskCommand.data.toJSON(),
  tasklistCommand.data.toJSON()
];

const guildOnlyCommands = [
  configCommand.data.toJSON(),
  helpCommand.data.toJSON(),
  musicCommand.data.toJSON(),
  whitelistCommand.data.toJSON(),
  statstaffCommand.data.toJSON()
];

const rest = new REST({ version: "10" }).setToken(token);

try {
  console.log("Registering global commands (tâches, utilisables en DM)...");
  await rest.put(Routes.applicationCommands(clientId), { body: taskCommands });
  console.log("Registering guild-only commands...");
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: guildOnlyCommands });
  console.log("Done.");
} catch (err) {
  console.error(err);
  process.exit(1);
}

