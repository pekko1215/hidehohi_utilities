import { REST } from "@discordjs/rest";
import { APIMessage, Routes } from "discord-api-types/v9";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { MessageActionRow, MessageButton, MessagePayload, WebhookEditMessageOptions } from "discord.js";


function createSoloSessionIntializeMessage(): WebhookEditMessageOptions {
	return {
		content: `
ボタンが赤く光ったタイミングで押そう。
[START]をPUSHで開始だ！`,
		components: [
			new MessageActionRow().addComponents(new MessageButton().setCustomId(`iaigiri-start`).setStyle("SUCCESS").setLabel("START"))
		]
	}
}

function parseButtonCustomId(customId: string) {
	if (!/^iaigiri-/.test(customId)) return null;

	if (/^iaigiri-start/.test(customId)) return {
		type: "START"
	} as const;

	if (/^iaigiri-fast/.test(customId)) return {
		type: "FAST"
	} as const;

	if (/^iaigiri-ok/.test(customId)) {
		const startDate = new Date(parseInt(customId.split("|")[1]))
		return {
			type: "OK",
			startDate
		} as const;
	}

	throw new Error(`Cannot parse "${customId}"`)
}

export const IaigiriRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("イアイギリを開始します。")

	await rest.post(Routes.applicationCommands(applicationId), { body: command })

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				await it.deferReply();
				await it.followUp(createSoloSessionIntializeMessage());
			}

			if (it.isButton()) {
				const buttonCommand = parseButtonCustomId(it.customId);
				if (!buttonCommand) return;
				switch (buttonCommand.type) {
					case "START":
						const targetMiliSecond = Math.floor(5000 + 15000 * Math.random())

						await it.deferReply();

						const message = await it.editReply({
							content: `ボタンが赤く光ったタイミングで押そう。\n`,
							components: [new MessageActionRow().addComponents(
								new MessageButton()
									.setCustomId(`iaigiri-dummy`)
									.setStyle("SECONDARY")
									.setLabel("見切った!")
									.setDisabled(false)
							)]
						})
						const date = new Date;

						setTimeout(() => {
							it.editReply({
								content: "今だ!",
								components: [
									new MessageActionRow().addComponents(
										new MessageButton()
											.setCustomId(`iaigiri-ok|${new Date(
												date.valueOf() + targetMiliSecond
											).valueOf()}`)
											.setLabel("見切った!")
											.setStyle("DANGER")
									)
								]
							})
						}, targetMiliSecond);
						break
					case "FAST":
						const responseMesasges = [
							"早すぎる!",
							"まだだ!",
							"ビビリすぎｗ",
						]
						const fastMessage = responseMesasges[Math.floor(Math.random() * responseMesasges.length)]
						await it.deferReply();
						await it.editReply({
							content: `${it.user.toString()} ${fastMessage}`
						})
						break

					case "OK":
						await it.deferReply();
						const dateDiff = it.createdAt.valueOf() - buttonCommand.startDate.valueOf()
						await it.editReply({
							content: `${it.user.toString()} ${dateDiff / 1000}秒!`
						})

						break
				}
			}
		}
	}
}