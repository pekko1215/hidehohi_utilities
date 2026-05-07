import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { Routes } from "discord.js";
import { loadPoints } from "../utils/points";

export const RankingRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("ポイントランキングを表示します。");

	await rest.post(Routes.applicationCommands(applicationId), { body: command });

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand() && it.commandName === command.name) {
				const pointsData = loadPoints();
				const sortedEntries = Object.entries(pointsData)
					.sort(([, a], [, b]) => b - a)
					.slice(0, 10);

				if (sortedEntries.length === 0) {
					await it.reply("ランキングデータがありません。");
					return;
				}

				await it.deferReply();

				let rankingMessage = "🏆 **ポイントランキング (TOP 10)** 🏆\n";
				for (let i = 0; i < sortedEntries.length; i++) {
					const [userId, points] = sortedEntries[i];
					let userName = "不明なユーザー";
					try {
						const user = await it.client.users.fetch(userId);
						userName = user.username;
					} catch (e) {
						console.error(`Failed to fetch user ${userId}:`, e);
					}
					rankingMessage += `${i + 1}位: **${userName}** - ${points}Pt\n`;
				}

				await it.followUp(rankingMessage);
			}
		}
	};
};
