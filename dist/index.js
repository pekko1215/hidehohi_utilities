"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rest_1 = require("@discordjs/rest");
const dotenv_1 = __importDefault(require("dotenv"));
const tweet_link_1 = require("./commands/tweet_link");
const discord_js_1 = require("discord.js");
const scratch_1 = require("./commands/scratch");
const pachislot_1 = require("./commands/pachislot");
const lights_out_1 = require("./commands/lights_out");
const iaigiri_1 = require("./commands/iaigiri");
const channel_points_1 = require("./commands/channel_points");
const ranking_1 = require("./commands/ranking");
dotenv_1.default.config();
const token = process.env.BOT_TOKEN;
const applicationId = process.env.APPLICATION_ID;
if (!token)
    throw new Error("Unset enviroment 'BOT_TOKEN'");
if (!applicationId)
    throw new Error("Unset enviroment 'APPLICATION_ID'");
const rest = new rest_1.REST({
    version: "9"
}).setToken(token);
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildVoiceStates
    ]
});
const CommandRegisters = [
    tweet_link_1.TweetLinkRegister,
    // ShindanMakerRegister,
    scratch_1.ScratchRegister,
    pachislot_1.SlotRegister,
    lights_out_1.LightsOutRegister,
    iaigiri_1.IaigiriRegister,
    channel_points_1.ChannelPointsRegister,
    ranking_1.RankingRegister,
];
const Handlers = [];
const botListen = () => {
    client.on("interactionCreate", async (it) => {
        Handlers.map(hd => hd.onHandler(it));
    });
    client.once('ready', () => {
        console.log('Ready!');
        Handlers.forEach(hd => hd.onClient?.(client));
    });
    // Login to Discord with your client's token
    client.login(token);
};
(async () => {
    await Promise.all(CommandRegisters.map(async (register) => {
        Handlers.push(await register(rest, applicationId));
        console.log(`Registered command: ${Handlers[Handlers.length - 1].name} - ${Handlers[Handlers.length - 1].description}`);
    }));
    botListen();
})();
//# sourceMappingURL=index.js.map