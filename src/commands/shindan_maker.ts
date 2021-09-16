import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import puppeteer from "puppeteer";
import { MessageActionRow, MessageButton } from "discord.js";

interface ShindanResult {
	title: string;
	result: string;
}

export const ShindanMakerRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("診断メーカーボタンを作成します。")
		.addStringOption(option =>
			option.setName("url")
				.setDescription("診断メーカーのURL")
				.setRequired(true))
		.addBooleanOption(option =>
			option.setName("random")
				.setDescription("診断名をランダムにする")
				.setRequired(false))


	const ShindanGetter = async (id: string, name?: string): Promise<ShindanResult> => {
		name = name || Math.floor(Math.random() * 0xffffff).toString();
		const page = await browser.newPage();
		await page.goto(`https://shindanmaker.com/${id}`);
		await page.$eval("#shindanInput", element => {
			element.value = ""
		});
		await page.type("#shindanInput", name);
		await page.click("#shindanButtonSubmit", {});
		await page.waitForNavigation({ timeout: 60000, waitUntil: "domcontentloaded" });
		const title = await page.title()
		const $result = await page.$("#shindanResult");
		const result = await (await $result?.getProperty("innerText"))?.jsonValue() as string;
		await page.close();
		return {
			title,
			result
		}
	}

	await rest.post(Routes.applicationCommands(applicationId), { body: command })
	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				const isRandom = it.options.getBoolean("random")
				const url = it.options.getString("url")!;
				const shindanId = url.match(/^https:\/\/shindanmaker.com\/(\d+)/)?.[1];
				if (!shindanId) return;
				await it.reply("処理中です...");
				const { title, result } = await (await ShindanGetter(shindanId));
				const row = new MessageActionRow()
					.addComponents(
						new MessageButton()
							.setCustomId("shindan-" + shindanId + "-" + !!isRandom)
							.setStyle("SUCCESS")
							.setLabel("診断する！")
							.setEmoji("📋")
					)
				await it.editReply({
					content: `${title} ボタン`,
					components: [row]
				});
			}

			if (it.isButton()) {
				const match = it.customId.match(/^shindan-(\d+)-(true|false)$/)
				if (!match) return;
				const shindanId = match[1];
				const isRandom = match[2] === "true";
				const name = isRandom ? it.user.toString() + Math.floor(Math.random() * 0xffffff) : it.user.toString();
				await it.reply("診断中です...")
				const { title, result } = await (await ShindanGetter(shindanId, name));
				it.editReply({
					content: result
				})
			}
		}
	}
}