import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { addPoints, getPoints } from "../utils/points";
import fs from "fs";

interface BetData {
	id: string;
	creatorId: string;
	channelId: string;
	messageId: string;
	title: string;
	optionA: string;
	optionB: string;
	bets: { [userId: string]: { amount: number; side: "a" | "b" } };
	locked: boolean;
}

interface BetEntry {
	id: string;
	creatorId: string;
	channelId: string;
	messageId: string;
	title: string;
	optionA: string;
	optionB: string;
	bets: Map<string, { amount: number; side: "a" | "b" }>;
	locked: boolean;
}

const BETS_FILE = path.join(process.cwd(), "bets.json");

function loadBets(): Map<string, BetEntry> {
	const map = new Map<string, BetEntry>();
	if (!fs.existsSync(BETS_FILE)) return map;
	try {
		const content = fs.readFileSync(BETS_FILE, "utf-8");
		if (!content.trim()) return map;
		const data: BetData[] = JSON.parse(content);
		for (const d of data) {
			map.set(d.id, { ...d, bets: new Map(Object.entries(d.bets)) });
		}
	} catch (e) {
		console.error("Failed to load bets:", e);
	}
	return map;
}

function saveBets(bets: Map<string, BetEntry>) {
	const data: BetData[] = [];
	for (const [, b] of bets) {
		data.push({ ...b, bets: Object.fromEntries(b.bets) });
	}
	try {
		const tmp = `${BETS_FILE}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
		fs.renameSync(tmp, BETS_FILE);
	} catch (e) {
		console.error("Failed to save bets:", e);
	}
}

const activeBets = loadBets();

function generateBetId(): string {
	return Math.random().toString(36).substring(2, 10);
}

function getTotalBets(bet: BetEntry, side: "a" | "b"): number {
	let total = 0;
	for (const b of bet.bets.values()) {
		if (b.side === side) total += b.amount;
	}
	return total;
}

function getBettorCount(bet: BetEntry, side: "a" | "b"): number {
	let count = 0;
	for (const b of bet.bets.values()) {
		if (b.side === side) count++;
	}
	return count;
}

function createBetMessage(bet: BetEntry): { content: string; components: any[] } {
	const totalA = getTotalBets(bet, "a");
	const totalB = getTotalBets(bet, "b");
	const countA = getBettorCount(bet, "a");
	const countB = getBettorCount(bet, "b");
	const totalPool = totalA + totalB;
	const fee = Math.floor(totalPool * 0.05);

	let content = `🎰 **${bet.title}** (主催: <@${bet.creatorId}>)\n\n`;
	const distributable = totalPool - fee;
	const oddsA = totalA > 0 ? (distributable / totalA).toFixed(2) : "—";
	const oddsB = totalB > 0 ? (distributable / totalB).toFixed(2) : "—";
	content += `🅰️ **${bet.optionA}**: ${totalA} Pt (${countA}人) 倍率: x${oddsA}\n`;
	content += `🅱️ **${bet.optionB}**: ${totalB} Pt (${countB}人) 倍率: x${oddsB}\n\n`;
	content += `プール合計: ${totalPool} Pt | 手数料: ${fee} Pt (主催者へ)\n`;

	if (bet.locked) {
		content += `🔒 **受付終了** - 主催者が結果を選択してください。`;
	} else {
		content += `参加者は選択肢をクリックして賭けてください！`;
	}

	const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`bet-a-${bet.id}`)
			.setLabel(`${bet.optionA} に賭ける`)
			.setStyle(ButtonStyle.Primary)
			.setDisabled(bet.locked),
		new ButtonBuilder()
			.setCustomId(`bet-b-${bet.id}`)
			.setLabel(`${bet.optionB} に賭ける`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(bet.locked),
		new ButtonBuilder()
			.setCustomId(`bet-add-${bet.id}`)
			.setLabel("増額")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(bet.locked)
	);

	const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`bet-lock-${bet.id}`)
			.setStyle(ButtonStyle.Danger)
			.setDisabled(bet.locked)
			.setEmoji("🔒"),
		new ButtonBuilder()
			.setCustomId(`bet-wina-${bet.id}`)
			.setLabel(`${bet.optionA} の勝利`)
			.setStyle(ButtonStyle.Success)
			.setDisabled(!bet.locked),
		new ButtonBuilder()
			.setCustomId(`bet-winb-${bet.id}`)
			.setLabel(`${bet.optionB} の勝利`)
			.setStyle(ButtonStyle.Success)
			.setDisabled(!bet.locked)
	);

	return { content, components: [row1, row2] };
}

export const BetRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("2択のかけを作成します。他の人が賭けに参加できます。")
		.addStringOption(option =>
			option.setName("title")
				.setDescription("かけのタイトル")
				.setRequired(true)
		)
		.addStringOption(option =>
			option.setName("option_a")
				.setDescription("選択肢Aの名前")
				.setRequired(true)
		)
		.addStringOption(option =>
			option.setName("option_b")
				.setDescription("選択肢Bの名前")
				.setRequired(true)
		);

	await rest.post(Routes.applicationCommands(applicationId), { body: command });

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand() && it.commandName === command.name && it.isChatInputCommand()) {
				const title = it.options.getString("title", true);
				const optionA = it.options.getString("option_a", true);
				const optionB = it.options.getString("option_b", true);

				const betId = generateBetId();
				const bet: BetEntry = {
					id: betId,
					creatorId: it.user.id,
					channelId: it.channelId!,
					messageId: "",
					title,
					optionA,
					optionB,
					bets: new Map(),
					locked: false,
				};

				activeBets.set(betId, bet);
				saveBets(activeBets);
				await it.reply(createBetMessage(bet));

				const reply = await it.fetchReply();
				bet.messageId = reply.id;
				saveBets(activeBets);
				return;
			}

			if (it.isButton()) {
				if (!it.customId.startsWith("bet-")) return;
				const [, action, betId] = it.customId.split("-");
				const bet = activeBets.get(betId);
				if (!bet) {
					await it.reply({ content: "このかけは既に終了しています。", ephemeral: true });
					return;
				}

				if (action === "a" || action === "b") {
					if (bet.locked) {
						await it.reply({ content: "受付は終了しています。", ephemeral: true });
						return;
					}
					if (it.user.bot) {
						await it.reply({ content: "Botは参加できません。", ephemeral: true });
						return;
					}
					if (bet.bets.has(it.user.id)) {
						await it.reply({ content: "既に賭けています。「増額」ボタンで掛け金を増やせます。", ephemeral: true });
						return;
					}

					const side = action as "a" | "b";
					const label = side === "a" ? bet.optionA : bet.optionB;

					const modal = new ModalBuilder()
						.setCustomId(`bet-modal-${side}-${betId}`)
						.setTitle(`${label} に賭ける`);

					const amountInput = new TextInputBuilder()
						.setCustomId("bet-amount")
						.setLabel("賭けるポイント数")
						.setStyle(TextInputStyle.Short)
						.setPlaceholder("数値を入力してください")
						.setRequired(true);

					modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
					await it.showModal(modal);
					return;
				}

				if (action === "add") {
					if (bet.locked) {
						await it.reply({ content: "受付は終了しています。", ephemeral: true });
						return;
					}
					if (!bet.bets.has(it.user.id)) {
						await it.reply({ content: "まだ賭けていません。先に選択肢をクリックして賭けてください。", ephemeral: true });
						return;
					}

					const modal = new ModalBuilder()
						.setCustomId(`bet-modaladd-${betId}`)
						.setTitle("掛け金を増額する");

					const amountInput = new TextInputBuilder()
						.setCustomId("bet-addamount")
						.setLabel("増額するポイント数")
						.setStyle(TextInputStyle.Short)
						.setPlaceholder("数値を入力してください")
						.setRequired(true);

					modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
					await it.showModal(modal);
					return;
				}

				if (action === "lock") {
					if (it.user.id !== bet.creatorId) {
						await it.reply({ content: "主催者のみが受付を終了できます。", ephemeral: true });
						return;
					}
					bet.locked = true;
					saveBets(activeBets);
					await it.update(createBetMessage(bet));
					return;
				}

				if (action === "wina" || action === "winb") {
					if (it.user.id !== bet.creatorId) {
						await it.reply({ content: "主催者のみが結果を確定できます。", ephemeral: true });
						return;
					}
					if (!bet.locked) {
						await it.reply({ content: "先に受付を終了してください。", ephemeral: true });
						return;
					}

					const winningSide = action === "wina" ? "a" as const : "b" as const;
					const winningLabel = winningSide === "a" ? bet.optionA : bet.optionB;

					const totalPool = getTotalBets(bet, "a") + getTotalBets(bet, "b");
					const winningPool = getTotalBets(bet, winningSide);
					const losingPool = totalPool - winningPool;
					const fee = Math.floor(totalPool * 0.05);
					const distributable = totalPool - fee;

					addPoints(bet.creatorId, fee);

					if (winningPool === 0) {
						for (const [userId, b] of bet.bets) {
							addPoints(userId, b.amount);
						}

						let content = `🎰 **${bet.title}** - 結果発表\n\n`;
						content += `🏆 **${winningLabel}** の勝利！\n`;
						content += `当選者がいなかったため、全員の賭け金が返金されます。\n\n`;
						content += `🅰️ **${bet.optionA}**: ${getTotalBets(bet, "a")} Pt (${getBettorCount(bet, "a")}人)\n`;
						content += `🅱️ **${bet.optionB}**: ${getTotalBets(bet, "b")} Pt (${getBettorCount(bet, "b")}人)\n\n`;
						content += `手数料: ${fee} Pt (主催者へ)`;

						activeBets.delete(bet.id);
						saveBets(activeBets);
						await it.update({ content, components: [] });
						return;
					}

					const resultLines: string[] = [];
					let totalPaid = 0;
					for (const [userId, b] of bet.bets) {
						if (b.side === winningSide) {
							const payout = Math.floor(b.amount * distributable / winningPool);
							addPoints(userId, payout);
							totalPaid += payout;
							const profit = payout - b.amount;
							resultLines.push(`<@${userId}> 賭け: ${b.amount} Pt → 利益: +${profit} Pt`);
						} else {
							resultLines.push(`<@${userId}> 賭け: ${b.amount} Pt → -${b.amount} Pt`);
						}
					}

					const remainder = distributable - totalPaid;
					if (remainder > 0) {
						addPoints(bet.creatorId, remainder);
					}
					const totalFee = fee + remainder;

					let content = `🎰 **${bet.title}** - 結果発表\n\n`;
					content += `🏆 **${winningLabel}** の勝利！\n\n`;
					content += `🅰️ **${bet.optionA}**: ${getTotalBets(bet, "a")} Pt (${getBettorCount(bet, "a")}人)\n`;
					content += `🅱️ **${bet.optionB}**: ${getTotalBets(bet, "b")} Pt (${getBettorCount(bet, "b")}人)\n\n`;
					content += `プール合計: ${totalPool} Pt | 手数料: ${totalFee} Pt (主催者へ)\n\n`;
					content += resultLines.join("\n");

					activeBets.delete(bet.id);
					saveBets(activeBets);
					await it.update({ content, components: [] });
					return;
				}
			}

			if (it.isModalSubmit()) {
				if (it.customId.startsWith("bet-modaladd-")) {
					const betId = it.customId.split("-")[2];
					const bet = activeBets.get(betId);
					if (!bet) {
						await it.reply({ content: "このかけは既に終了しています。", ephemeral: true });
						return;
					}

					const addAmountStr = it.fields.getTextInputValue("bet-addamount");
					const addAmount = parseInt(addAmountStr);

					if (isNaN(addAmount) || addAmount <= 0) {
						await it.reply({ content: "正しい数値を入力してください。", ephemeral: true });
						return;
					}

					const userPoints = getPoints(it.user.id);
					if (userPoints < addAmount) {
						await it.reply({ content: `ポイントが足りません！ (所持: ${userPoints} Pt)`, ephemeral: true });
						return;
					}

					addPoints(it.user.id, -addAmount);
					const existing = bet.bets.get(it.user.id)!;
					existing.amount += addAmount;
					saveBets(activeBets);

					try {
						const channel = await it.client.channels.fetch(bet.channelId);
						if (channel && channel.isTextBased()) {
							const message = await channel.messages.fetch(bet.messageId);
							await message.edit(createBetMessage(bet));
						}
					} catch (e) {
						console.error("Failed to update bet message:", e);
					}

					const sideLabel = existing.side === "a" ? bet.optionA : bet.optionB;
					await it.reply({ content: `${sideLabel} の掛け金を ${addAmount} Pt 増額しました！(合計: ${existing.amount} Pt)`, ephemeral: true });
					return;
				}

				if (!it.customId.startsWith("bet-modal-")) return;
				const parts = it.customId.split("-");
				const side = parts[2] as "a" | "b";
				const betId = parts[3];

				const bet = activeBets.get(betId);
				if (!bet) {
					await it.reply({ content: "このかけは既に終了しています。", ephemeral: true });
					return;
				}

				const amountStr = it.fields.getTextInputValue("bet-amount");
				const amount = parseInt(amountStr);

				if (isNaN(amount) || amount <= 0) {
					await it.reply({ content: "正しい数値を入力してください。", ephemeral: true });
					return;
				}

				const userPoints = getPoints(it.user.id);
				if (userPoints < amount) {
					await it.reply({ content: `ポイントが足りません！ (所持: ${userPoints} Pt)`, ephemeral: true });
					return;
				}

				addPoints(it.user.id, -amount);
				bet.bets.set(it.user.id, { amount, side });
				saveBets(activeBets);

				try {
					const channel = await it.client.channels.fetch(bet.channelId);
					if (channel && channel.isTextBased()) {
						const message = await channel.messages.fetch(bet.messageId);
						await message.edit(createBetMessage(bet));
					}
				} catch (e) {
					console.error("Failed to update bet message:", e);
				}

				const sideLabel = side === "a" ? bet.optionA : bet.optionB;
				await it.reply({ content: `${sideLabel} に ${amount} Pt 賭けました！`, ephemeral: true });
			}
		}
	};
};
