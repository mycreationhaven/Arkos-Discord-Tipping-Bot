import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands.js";

const rest = new REST({version: "10"}).setToken(config.discordToken);

if (config.guildId) {
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {body: commands});
  console.log(`Registered ${commands.length} guild commands.`);
} else {
  await rest.put(Routes.applicationCommands(config.clientId), {body: commands});
  console.log(`Registered ${commands.length} global commands.`);
}
