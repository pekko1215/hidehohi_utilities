import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { Routes } from "discord.js";
import { getPoints, addPoints } from "../utils/points";

export const SendRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("他のユーザーにポイントを送金します。")
		.addUserOption(option =>
			option.setName("user")
				.setDescription("送金先のユーザー")
				.setRequired(true)
		)
		.addIntegerOption(option =>
			option.setName("amount")
				.setDescription("送金額")
				.setRequired(true)
				.setMinValue(1)
		);

	await rest.post(Routes.applicationCommands(applicationId), { body: command });

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (!it.isCommand() || it.commandName !== command.name) return;
			if (!it.isChatInputCommand()) return;

			const targetUser = it.options.getUser("user", true);
			const amount = it.options.getInteger("amount", true);

			if (targetUser.id === it.user.id) {
				await it.reply({ content: "自分自身に送金することはできません。", ephemeral: true });
				return;
			}

			if (targetUser.bot) {
				await it.reply({ content: "Botには送金できません。", ephemeral: true });
				return;
			}

			const senderPoints = getPoints(it.user.id);
			if (senderPoints < amount) {
				await it.reply({ content: `ポイントが足りません！ (所持: ${senderPoints} Pt, 必要: ${amount} Pt)`, ephemeral: true });
				return;
			}

			addPoints(it.user.id, -amount);
			addPoints(targetUser.id, amount);

			await it.reply(`<@${it.user.id}> → <@${targetUser.id}> に **${amount} Pt** 送金しました！`);
		}
	};
};
