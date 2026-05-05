import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes } from "discord.js";
import { addPoints, getPoints } from "../utils/points";

const Symbols = ["リプレイ", "ベル", "スイカ", "チェリー", "白7", "ピンク7", "BAR", "花", "ANY"] as const;
type SymbolType = typeof Symbols[number];

const ReelArray: SymbolType[][] = [
	["ベル", "リプレイ", "ピンク7", "ベル", "リプレイ", "スイカ", "ベル", "リプレイ", "BAR", "チェリー", "花", "ベル", "リプレイ", "スイカ", "白7", "スイカ", "ベル", "リプレイ", "BAR", "チェリー", "花"],
	["スイカ", "ベル", "ピンク7", "リプレイ", "スイカ", "BAR", "ベル", "BAR", "リプレイ", "ベル", "チェリー", "白7", "スイカ", "リプレイ", "ベル", "BAR", "リプレイ", "BAR", "ベル", "チェリー", "リプレイ"],
	["BAR", "チェリー", "ピンク7", "リプレイ", "ベル", "スイカ", "チェリー", "リプレイ", "ベル", "BAR", "白7", "リプレイ", "ベル", "スイカ", "チェリー", "リプレイ", "ベル", "スイカ", "チェリー", "リプレイ", "ベル"]
];

const HitYakus: Record<string, number> = {
	"リプレイ-リプレイ-リプレイ": 3,
	"ベル-ベル-ベル": 6,
	"スイカ-スイカ-スイカ": 12,
	"チェリー-ANY-ANY": 4,
	"白7-白7-白7": 360,
	"ピンク7-ピンク7-ピンク7": 720,
	"白7-白7-BAR": 120,
	"ピンク7-ピンク7-BAR": 120,
	"BAR-BAR-BAR": 0,
};

const EmojiMappings: { [key in SymbolType]: string } = {
	"リプレイ": "<:replay:1501173258362552390>",
	"ベル": "<:bell:1501173255766278235>",
	"スイカ": "<:suika:1501173254042157116>",
	"チェリー": "<:cherry:1501173252297330699>",
	"白7": "<:white_7:1501173267933691985>",
	"ピンク7": "<:pink_7:1501173250351173727>",
	"BAR": "<:bar:1501173265572565042>",
	"花": "<:hana:1501173262770634862>",
	"ANY": ":question:"
};

// 小役の抽選確率 (1/xxx の形式で設定)
const YakuProbabilities: { yaku: string, prob: number }[] = [
	{ yaku: "ピンク7-ピンク7-ピンク7", prob: 1 / 1024 },
	{ yaku: "白7-白7-白7", prob: 1 / 1024 },
	{ yaku: "ピンク7-ピンク7-BAR", prob: 1 / 450 },
	{ yaku: "白7-白7-BAR", prob: 1 / 450 },
	{ yaku: "スイカ-スイカ-スイカ", prob: 1 / 90 },
	{ yaku: "チェリー-ANY-ANY", prob: 1 / 45 },
	{ yaku: "ベル-ベル-ベル", prob: 1 / 7.2 },
	{ yaku: "リプレイ-リプレイ-リプレイ", prob: 1 / 7.3 },
];

enum Phase {
	WAITING_BET = 0,
	WAITING_LEVER = 1,
	SPINNING = 2,
	STOPPED_1 = 3,
	STOPPED_2 = 4,
	FINISHED = 5
}

function getRandomYaku(): string {
	const r = Math.random();
	let cumulative = 0;
	for (const item of YakuProbabilities) {
		cumulative += item.prob;
		if (r < cumulative) return item.yaku;
	}
	return "MISS";
}

function checkHit(positions: number[]): { yaku: string, payout: number } {
	const lines = [
		[ [0, -1], [1, -1], [2, -1] ], // 上段
		[ [0, 0], [1, 0], [2, 0] ],    // 中段
		[ [0, 1], [1, 1], [2, 1] ],    // 下段
		[ [0, -1], [1, 0], [2, 1] ],   // 斜め下がり
		[ [0, 1], [1, 0], [2, -1] ]    // 斜め上がり
	];

	let totalPayout = 0;
	let hitYakus: string[] = [];

	for (const line of lines) {
		const symbols = line.map(([reel, offset]) => {
			const len = ReelArray[reel].length;
			const pos = (positions[reel] + offset + len) % len;
			return ReelArray[reel][pos];
		});

		const combo = `${symbols[0]}-${symbols[1]}-${symbols[2]}`;
		if (HitYakus[combo] !== undefined) {
			totalPayout += HitYakus[combo];
			hitYakus.push(combo);
		} else if (symbols[0] === "チェリー") {
			totalPayout += HitYakus["チェリー-ANY-ANY"];
			hitYakus.push("チェリー");
		}
	}

	if (hitYakus.length > 0) {
		return { yaku: hitYakus.join(", "), payout: totalPayout };
	}

	return { yaku: "MISS", payout: 0 };
}

function findStopPositions(yaku: string): number[] {
	if (yaku === "MISS") {
		let positions = [
			Math.floor(Math.random() * ReelArray[0].length),
			Math.floor(Math.random() * ReelArray[1].length),
			Math.floor(Math.random() * ReelArray[2].length)
		];
		if (checkHit(positions).yaku !== "MISS") {
			return findStopPositions(yaku);
		}
		return positions;
	}

	const parts = yaku.split("-") as SymbolType[];
	
	for (let attempt = 0; attempt < 1000; attempt++) {
		const positions = [
			Math.floor(Math.random() * ReelArray[0].length),
			Math.floor(Math.random() * ReelArray[1].length),
			Math.floor(Math.random() * ReelArray[2].length)
		];
		
		const hit = checkHit(positions);
		if (hit.yaku.includes(yaku.replace("-ANY-ANY", ""))) {
			return positions;
		}
	}

	const positions: number[] = [];
	for (let i = 0; i < 3; i++) {
		const targetSymbol = parts[i];
		const possibleIndices: number[] = [];
		if (targetSymbol === "ANY") {
			for (let j = 0; j < ReelArray[i].length; j++) possibleIndices.push(j);
		} else {
			for (let j = 0; j < ReelArray[i].length; j++) {
				if (ReelArray[i][j] === targetSymbol) possibleIndices.push(j);
			}
		}
		positions.push(possibleIndices[Math.floor(Math.random() * possibleIndices.length)]);
	}
	return positions;
}

function createSlotMessage(userId: string, bet: number, phase: Phase, targets: number[], currentPoints: number): any {
	const spinningEmoji = "🎰";
	const stoppedEmoji = "⬜";
	
	let grid = [
		[stoppedEmoji, stoppedEmoji, stoppedEmoji],
		[stoppedEmoji, stoppedEmoji, stoppedEmoji],
		[stoppedEmoji, stoppedEmoji, stoppedEmoji]
	];

	for (let i = 0; i < 3; i++) {
		if (phase === Phase.SPINNING || (i === 1 && phase === Phase.STOPPED_1) || (i === 2 && (phase === Phase.STOPPED_1 || phase === Phase.STOPPED_2))) {
			grid[0][i] = grid[1][i] = grid[2][i] = spinningEmoji;
		} else if (
			(i === 0 && phase >= Phase.STOPPED_1) ||
			(i === 1 && phase >= Phase.STOPPED_2) ||
			(i === 2 && phase >= Phase.FINISHED)
		) {
			const len = ReelArray[i].length;
			grid[0][i] = EmojiMappings[ReelArray[i][(targets[i] - 1 + len) % len]];
			grid[1][i] = EmojiMappings[ReelArray[i][targets[i]]];
			grid[2][i] = EmojiMappings[ReelArray[i][(targets[i] + 1) % len]];
		} else if (phase >= Phase.SPINNING) {
			grid[0][i] = grid[1][i] = grid[2][i] = spinningEmoji;
		}
	}

	let content = `<@${userId}> のスロット台\n`;
	content += `所持ポイント: ${currentPoints} Pt\n`;
	content += `掛け金: ${bet} Pt (3枚掛け: ${bet * 3} Pt消費)\n\n`;
	content += `[ ${grid[0][0]} | ${grid[0][1]} | ${grid[0][2]} ]\n`;
	content += `[ ${grid[1][0]} | ${grid[1][1]} | ${grid[1][2]} ]\n`;
	content += `[ ${grid[2][0]} | ${grid[2][1]} | ${grid[2][2]} ]\n\n`;

	if (phase === Phase.FINISHED) {
		const hit = checkHit(targets);
		if (hit.yaku !== "MISS") {
			const win = bet * hit.payout;
			content += `🎉 **当たり！** [${hit.yaku}] で ${win} Pt 獲得！`;
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

				if (userPoints < bet * 3) {
					await it.reply({ content: `ポイントが足りません！ (開始には ${bet * 3} Pt 必要です)`, ephemeral: true });
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
					const totalBet = bet * 3;
					if (userPoints < totalBet) {
						await it.reply({ content: `ポイントが足りません！ (${totalBet} Pt 必要です)`, ephemeral: true });
						return;
					}
					addPoints(it.user.id, -totalBet);
					userPoints -= totalBet;
					phase = Phase.WAITING_LEVER;
				} else if (action === "lever") {
					const yaku = getRandomYaku();
					targets = findStopPositions(yaku);
					phase = Phase.SPINNING;
				} else if (action === "stop1") {
					phase = Phase.STOPPED_1;
				} else if (action === "stop2") {
					phase = Phase.STOPPED_2;
				} else if (action === "stop3") {
					phase = Phase.FINISHED;
					const hit = checkHit(targets);
					if (hit.yaku !== "MISS") {
						const win = bet * hit.payout;
						if (win > 0) {
							addPoints(it.user.id, win);
							userPoints += win;
						}
					}
				}

				if (it.isButton()) {
					await it.update(createSlotMessage(ownerId, bet, phase, targets, userPoints));
				}
			}
		}
	}
}
