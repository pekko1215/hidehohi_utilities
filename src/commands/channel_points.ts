import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { Client, Routes } from "discord.js";
import { addPoints, getPoints } from "../utils/points";

const voiceTracking = new Map<string, number>();

export const ChannelPointsRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("現在のポイントを確認します。");

	await rest.post(Routes.applicationCommands(applicationId), { body: command });

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand() && it.commandName === command.name) {
				const points = getPoints(it.user.id);
				await it.reply(`あなたの現在のポイントは ${points}Pt です。`);
			}
		},
		onClient(client: Client) {
			// Chat message tracking: 15 points per message
			client.on("messageCreate", (message) => {
				if (message.author.bot) return;
				addPoints(message.author.id, 15);
			});

			// Periodic check for users in voice chat: 50 points every 5 minutes
			setInterval(async () => {
				try {
					const guilds = await client.guilds.fetch();
					for (const [, guild] of guilds) {
						const g = await client.guilds.fetch(guild.id);
						const channels = await g.channels.fetch();
						for (const [, channel] of channels) {
							if (channel && channel.isVoiceBased()) {
								const vc = channel as import("discord.js").VoiceChannel;
								for (const [, member] of vc.members) {
									if (!member.user.bot) {
										addPoints(member.id, 50);
									}
								}
							}
						}
					}
				} catch (e) {
					console.error("Failed to check voice channels:", e);
				}
			}, 5 * 60 * 1000);
		}
	};
};
