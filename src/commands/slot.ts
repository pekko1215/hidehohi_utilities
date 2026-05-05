import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes } from "discord.js";
import { addPoints, getPoints } from "../utils/points";

const Symbols = ["💎", "7️⃣", "🎰", "🍉", "🔔", "🍒", "🍋"] as const;
type SymbolType = typeof Symbols[number];

const Payouts: Record<SymbolType, number> = {
	"💎": 50,
	"7️⃣": 20,
	"🎰": 10,
	"🍉": 5,
	"🔔": 3,
	"🍒": 2,
	"🍋": 0
};

const Weights: Record<SymbolType, number> = {
	"💎": 2,
	"7️⃣": 5,
	"🎰": 10,
	"🍉": 40,
	"🔔": 80,
	"🍒": 120,
	"🍋": 743
};

enum Phase {
	WAITING_BET = 0,
	WAITING_LEVER = 1,
	SPINNING = 2,
	STOPPED_1 = 3,
	STOPPED_2 = 4,
	FINISHED = 5
}

function getSymbolIndex(symbol: SymbolType): number {
	return Symbols.indexOf(symbol);
}

function getRandomSymbol(): SymbolType {
	const totalWeight = Object.values(Weights).reduce((a, b) => a + b, 0);
	let r = Math.random() * totalWeight;
	for (const symbol of Symbols) {
		r -= Weights[symbol];
		if (r < 0) return symbol;
	}
	return "🍋";
}

function createSlotMessage(userId: string, bet: number, phase: Phase, targets: number[], currentPoints: number): any {
	const spinningEmoji = "🎰";
	let reelDisplay = ["⬜", "⬜", "⬜"];

	if (phase >= Phase.SPINNING) {
		reelDisplay = [spinningEmoji, spinningEmoji, spinningEmoji];
	}
	if (phase >= Phase.STOPPED_1) {
		reelDisplay[0] = Symbols[targets[0]];
	}
	if (phase >= Phase.STOPPED_2) {
		reelDisplay[1] = Symbols[targets[1]];
	}
	if (phase >= Phase.FINISHED) {
		reelDisplay[2] = Symbols[targets[2]];
	}

	let content = `<@${userId}> のスロット台\n`;
	content += `所持ポイント: ${currentPoints} Pt\n`;
	content += `掛け金: ${bet} Pt\n\n`;
	content += `[ ${reelDisplay[0]} | ${reelDisplay[1]} | ${reelDisplay[2]} ]\n\n`;

	if (phase === Phase.FINISHED) {
		const s1 = Symbols[targets[0]];
		const s2 = Symbols[targets[1]];
		const s3 = Symbols[targets[2]];
		if (s1 === s2 && s2 === s3 && s1 !== "🍋") {
			const win = bet * Payouts[s1];
			content += `🎉 **当たり！** ${s1}${s2}${s3} で ${win} Pt 獲得！`;
		} else {
			content += `残念、ハズレです。`;
		}
	} else if (phase === Phase.SPINNING) {
		content += `リール回転中...`;
	} else if (phase === Phase.WAITING_LEVER) {
		content += `レバーを叩け！`;
	} else if (phase === Phase.WAITING_BET) {
		content += `BETボタンを押して開始。`;
	}

	const targetsStr = targets.join(",");
	const stateStr = `${userId}-${bet}-${phase}-${targetsStr}`;

	const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`slot-bet-${stateStr}`)
			.setLabel("BET")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(phase !== Phase.WAITING_BET && phase !== Phase.FINISHED),
		new ButtonBuilder()
			.setCustomId(`slot-lever-${stateStr}`)
			.setLabel("LEVER")
			.setStyle(ButtonStyle.Danger)
			.setDisabled(phase !== Phase.WAITING_LEVER)
	);

	const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`slot-stop1-${stateStr}`)
			.setLabel("STOP 1")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(phase !== Phase.SPINNING),
		new ButtonBuilder()
			.setCustomId(`slot-stop2-${stateStr}`)
			.setLabel("STOP 2")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(phase !== Phase.STOPPED_1),
		new ButtonBuilder()
			.setCustomId(`slot-stop3-${stateStr}`)
			.setLabel("STOP 3")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(phase !== Phase.STOPPED_2)
	);

	return {
		content,
		components: [row1, row2]
	};
}

export const SlotRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("パチスロを回します。")
		.addIntegerOption(option =>
			option.setName("bet")
				.setDescription("掛け金を指定します")
				.setRequired(true)
				.setMinValue(1)
		)

	await rest.post(Routes.applicationCommands(applicationId), { body: command })

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				if (!it.isChatInputCommand()) return;

				const bet = it.options.getInteger("bet") || 10;
				const userPoints = getPoints(it.user.id);

				if (userPoints < bet) {
					await it.reply({ content: `ポイントが足りません！ (現在の所持ポイント: ${userPoints} Pt)`, ephemeral: true });
					return;
				}

				await it.reply(createSlotMessage(it.user.id, bet, Phase.WAITING_BET, [0, 0, 0], userPoints));
				return;
			}

			if (it.isButton()) {
				if (!it.customId.startsWith("slot-")) return;
				const parts = it.customId.split("-");

				const action = parts[1];
				const ownerId = parts[2];
				const bet = parseInt(parts[3]);
				let phase = parseInt(parts[4]) as Phase;
				let targets = parts[5].split(",").map(s => parseInt(s));

				if (it.user.id !== ownerId) {
					await it.reply({ content: "他人のスロットは操作できません！", ephemeral: true });
					return;
				}

				let userPoints = getPoints(it.user.id);

				if (action === "bet") {
					if (userPoints < bet) {
						await it.reply({ content: `ポイントが足りません！`, ephemeral: true });
						return;
					}
					phase = Phase.WAITING_LEVER;
				} else if (action === "lever") {
					if (userPoints < bet) {
						await it.reply({ content: `ポイントが足りません！`, ephemeral: true });
						return;
					}
					addPoints(it.user.id, -bet);
					userPoints -= bet;

					const winSymbol = getRandomSymbol();
					if (winSymbol === "🍋") {
						targets = [
							Math.floor(Math.random() * Symbols.length),
							Math.floor(Math.random() * Symbols.length),
							Math.floor(Math.random() * Symbols.length)
						];
						if (targets[0] === targets[1] && targets[1] === targets[2]) {
							targets[2] = (targets[2] + 1) % Symbols.length;
						}
					} else {
						targets = [getSymbolIndex(winSymbol), getSymbolIndex(winSymbol), getSymbolIndex(winSymbol)];
					}
					phase = Phase.SPINNING;
				} else if (action === "stop1") {
					phase = Phase.STOPPED_1;
				} else if (action === "stop2") {
					phase = Phase.STOPPED_2;
				} else if (action === "stop3") {
					phase = Phase.FINISHED;
					const s1 = Symbols[targets[0]];
					const s2 = Symbols[targets[1]];
					const s3 = Symbols[targets[2]];
					if (s1 === s2 && s2 === s3 && s1 !== "🍋") {
						const win = bet * Payouts[s1];
						addPoints(it.user.id, win);
						userPoints += win;
					}
				}

				if (it.isButton()) {
					await it.update(createSlotMessage(ownerId, bet, phase, targets, userPoints));
				}
			}
		}
	}
}
