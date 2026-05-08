import { REST } from "@discordjs/rest";
import DotEnv from "dotenv";
import { CommandHandler } from "./typeings/command";

import { TweetLinkRegister } from "./commands/tweet_link"
import { Client, Events, GatewayIntentBits } from "discord.js";
import { ScratchRegister } from "./commands/scratch";
import { SlotRegister } from "./commands/pachislot";
import { LightsOutRegister } from "./commands/lights_out";
import { IaigiriRegister } from "./commands/iaigiri";
import { ChannelPointsRegister } from "./commands/channel_points";
import { RankingRegister } from "./commands/ranking";
import { SendRegister } from "./commands/send";
import { BetRegister } from "./commands/bet";
import { PointInfoRegister } from "./commands/point_info";

DotEnv.config()
const token = process.env.BOT_TOKEN;
const applicationId = process.env.APPLICATION_ID;

if (!token) throw new Error("Unset enviroment 'BOT_TOKEN'")
if (!applicationId) throw new Error("Unset enviroment 'APPLICATION_ID'")

const rest = new REST({
	version: "9"
}).setToken(token)

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildVoiceStates
	]
});

const CommandRegisters = [
	TweetLinkRegister,
	// ShindanMakerRegister,
	ScratchRegister,
	SlotRegister,
	LightsOutRegister,
	IaigiriRegister,
	ChannelPointsRegister,
	RankingRegister,
	SendRegister,
	BetRegister,
	PointInfoRegister,
];

const Handlers: CommandHandler[] = [];


const botListen = () => {
	client.on(Events.InteractionCreate, async it => {
		Handlers.map(hd => hd.onHandler(it))
	})
	client.once(Events.ClientReady, () => {
		console.log('Ready!');
		Handlers.forEach(hd => hd.onClient?.(client));
	});
	// Login to Discord with your client's token
	client.login(token);
}

(async () => {
	await Promise.all(CommandRegisters.map(async (register) => {
		Handlers.push(await register(rest, applicationId))
		console.log(`Registered command: ${Handlers[Handlers.length - 1].name} - ${Handlers[Handlers.length - 1].description}`)
	}))
	botListen();
})()
