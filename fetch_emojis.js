"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds]
});
client.once('ready', async () => {
    console.log('Bot ready, fetching ALL emojis...');
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const emojis = await guild.emojis.fetch();
            console.log(`Guild: ${guild.name} (${guildId})`);
            emojis.forEach(emoji => {
                console.log(`Emoji: ${emoji.name} - ID: ${emoji.id} - Full: <:${emoji.name}:${emoji.id}>`);
            });
        }
        catch (e) {
            console.error(`Failed to fetch emojis for guild ${guild.name}:`, e);
        }
    }
    process.exit(0);
});
client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('Login failed:', err);
    process.exit(1);
});
//# sourceMappingURL=fetch_emojis.js.map