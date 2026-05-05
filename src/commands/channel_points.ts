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

			// Voice chat tracking: 50 points every 5 minutes
			client.on("voiceStateUpdate", (oldState, newState) => {
				const userId = newState.member?.id;
				if (!userId || newState.member?.user.bot) return;

				// User joined a voice channel
				if (!oldState.channelId && newState.channelId) {
					voiceTracking.set(userId, Date.now());
				}
				// User left a voice channel
				else if (oldState.channelId && !newState.channelId) {
					const joinTime = voiceTracking.get(userId);
					if (joinTime) {
						const durationMinutes = (Date.now() - joinTime) / (1000 * 60);
						const points = Math.floor(durationMinutes / 5) * 50;
						if (points > 0) {
							addPoints(userId, points);
						}
						voiceTracking.delete(userId);
					}
				}
			});

			// Periodic check for users still in voice chat
			setInterval(() => {
				const now = Date.now();
				voiceTracking.forEach((joinTime, userId) => {
					const durationMinutes = (now - joinTime) / (1000 * 60);
					if (durationMinutes >= 5) {
						const points = Math.floor(durationMinutes / 5) * 50;
						if (points > 0) {
							addPoints(userId, points);
							// Update joinTime to the last awarded interval to avoid double awarding
							voiceTracking.set(userId, now - (durationMinutes % 5) * 60 * 1000);
						}
					}
				});
			}, 60 * 1000); // Check every minute
		}
	};
};
