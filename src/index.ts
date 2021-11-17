import { REST } from "@discordjs/rest";
import DotEnv from "dotenv";
import { CommandHandler } from "./typeings/command";

import { TweetLinkRegister } from "./commands/tweet_link"
import { Client, Intents } from "discord.js";
import { ShindanMakerRegister } from "./commands/shindan_maker";
import { ScratchRegister } from "./commands/scratch";
import { LightsOutRegister } from "./commands/lights_out";

DotEnv.config()
const token = process.env.BOT_TOKEN;
const applicationId = process.env.APPLICATION_ID;

if (!token) throw new Error("Unset enviroment 'BOT_TOKEN'")
if (!applicationId) throw new Error("Unset enviroment 'APPLICATION_ID'")

const rest = new REST({
	version: "9"
}).setToken(token)

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

const CommandRegisters = [
	TweetLinkRegister,
	// ShindanMakerRegister,
	ScratchRegister,
	LightsOutRegister
];

const Handlers: CommandHandler[] = [];


const botListen = () => {
	client.on("interactionCreate", async it => {
		Handlers.map(hd => hd.onHandler(it))
	})
	client.once('ready', () => {
		console.log('Ready!');
	});
	// Login to Discord with your client's token
	client.login(token);
}

(async () => {
	await Promise.all(CommandRegisters.map(async (register) => {
		Handlers.push(await register(rest, applicationId))
	}))
	botListen();
})()
