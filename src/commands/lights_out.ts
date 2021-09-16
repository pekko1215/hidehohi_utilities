import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { MessageActionRow, MessageButton, MessagePayload, WebhookEditMessageOptions } from "discord.js";

const PanelSize = 5;

type Panel = [
	[boolean, boolean, boolean, boolean, boolean],
	[boolean, boolean, boolean, boolean, boolean],
	[boolean, boolean, boolean, boolean, boolean],
	[boolean, boolean, boolean, boolean, boolean],
	[boolean, boolean, boolean, boolean, boolean],
]

function createPanel(): Panel {
	const panel = [...Array(5).keys()].map(() => [...Array(5).fill(false)]) as Panel;
	for (let i = 0; i < 10; i++) {
		flipPanel(panel, Math.floor(Math.random() * PanelSize ** 2))
	}
	return panel;
}

function encodePanelNumber(panel: Panel) {
	let bitBase = 1;
	let num = panel.reduce((v, list) => {
		return v + list.reduce((s, b) => {
			s += b ? bitBase : 0;
			bitBase <<= 1;
			return s;
		}, 0)
	}, 0)
	return num;
}

function decodePanelNumber(num: number): Panel {
	let list = [..."0".repeat(PanelSize ** 2), ...num.toString(2)].slice(-(PanelSize ** 2));
	list.reverse();
	let panelBase: Panel = [
		[false, false, false, false, false],
		[false, false, false, false, false],
		[false, false, false, false, false],
		[false, false, false, false, false],
		[false, false, false, false, false]];
	return panelBase.map((_, y) => {
		return [...list.slice(PanelSize * y, PanelSize * y + PanelSize)].map(s => s === "1");
	}) as Panel;
}

function flipPanel(panel: Panel, pos: number) {
	let [x, y] = [
		pos % PanelSize,
		Math.floor(pos / PanelSize)
	];
	[
		[x, y],
		[x - 1, y],
		[x + 1, y],
		[x, y + 1],
		[x, y - 1]
	].filter(([x, y]) => {
		return x >= 0
			&& x < PanelSize
			&& y >= 0
			&& y < PanelSize
	}).forEach(([x, y]) => {
		panel[y][x] = !panel[y][x]
	})
}

function createLightsOutMessage(panel: Panel): WebhookEditMessageOptions {
	let rows: MessageActionRow[] = [];
	let panelNumber = encodePanelNumber(panel);
	let idx = 0;
	panel.forEach((list) => {
		let row = new MessageActionRow();
		list.forEach(b => {
			row.addComponents(new MessageButton()
				.setCustomId(`lights-${panelNumber}-${idx}`)
				.setStyle(b ? "SUCCESS" : "SECONDARY")
				.setEmoji(b ? "🟩" : "⬛"))
			idx++;
		})
		rows.push(row);
	})
	return {
		content: "LightsOut",
		components: rows
	}
}

export const LightsOutRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("ライツアウトを作成します。")

	await rest.post(Routes.applicationCommands(applicationId), { body: command })

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				await it.deferReply();
				const panel = createPanel();
				await it.followUp(createLightsOutMessage(panel));
			}

			if (it.isButton()) {
				const match = it.customId.match(/^lights-(\d+)-(\d+)$/)
				if (!match) return;
				const [_, panelIdStr, openIdStr] = match;
				const panel = decodePanelNumber(parseInt(panelIdStr));
				flipPanel(panel, parseInt(openIdStr))
				await rest.post(Routes.interactionCallback(it.id, it.token), {
					body: {
						type: 7,
						data: createLightsOutMessage(panel)
					}
				})
			}
		}
	}
}