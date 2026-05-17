import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, MessageFlags, Routes } from "discord.js";
import { addPoints, getPoints } from "../utils/points";

const Symbols = ["GOD", "TheKuru", "LEDX", "ascendant1", "twitter", "ornament", "MarshmaoYummy"] as const;
type SymbolType = typeof Symbols[number];

const PayoutTable: Record<SymbolType, number> = {
	GOD: 50,
	TheKuru: 15,
	LEDX: 10,
	ascendant1: 7,
	twitter: 5,
	ornament: 3,
	MarshmaoYummy: 2,
};

const EmojiMappings: { [key in SymbolType]: string } = {
	GOD: "<:GOD:1505029157447405608>",
	TheKuru: "<a:TheKuru:1505054780039368895>",
	LEDX: "<:LEDX:1505054724276359269>",
	ascendant1: "<:ascendant1:1505030238558621716>",
	twitter: "<:twitter:1505033918116790354>",
	ornament: "<:ornament:1470759391337644043>",
	MarshmaoYummy: "<:MarshmaoYummy:1505038301378379877>",
};

const PessiEmoji = "<:pessi:1494900888387453018>";
const RainbowEmoji = "<a:rainbow:1505048258672722034>";
const PessiLongEmojis = [
	"<:long_pessi_1:1494902832191508520>",
	"<:long_pessi_2:1494902788839444510>",
	"<:long_pessi_3:1494902890400186499>"
];

const ReelStrips: SymbolType[][] = [
	[
		"MarshmaoYummy", "ornament", "twitter", "MarshmaoYummy", "ascendant1",
		"ornament", "MarshmaoYummy", "twitter", "LEDX", "ornament",
		"MarshmaoYummy", "TheKuru", "ornament", "MarshmaoYummy", "twitter",
		"ascendant1", "MarshmaoYummy", "ornament", "MarshmaoYummy", "GOD", "MarshmaoYummy"
	],
	[
		"MarshmaoYummy", "twitter", "ornament", "ascendant1", "MarshmaoYummy",
		"ornament", "twitter", "MarshmaoYummy", "LEDX", "ascendant1",
		"ornament", "MarshmaoYummy", "TheKuru", "twitter", "MarshmaoYummy",
		"ascendant1", "ornament", "MarshmaoYummy", "twitter", "ornament", "GOD"
	],
	[
		"ornament", "MarshmaoYummy", "twitter", "ascendant1", "MarshmaoYummy",
		"ornament", "LEDX", "twitter", "MarshmaoYummy", "TheKuru",
		"ascendant1", "MarshmaoYummy", "twitter", "ornament", "GOD",
		"MarshmaoYummy", "ascendant1", "ornament", "MarshmaoYummy", "twitter", "MarshmaoYummy"
	]
];

const Lines = [
	[[0, 0], [0, 1], [0, 2]],
	[[1, 0], [1, 1], [1, 2]],
	[[2, 0], [2, 1], [2, 2]],
	[[0, 0], [1, 1], [2, 2]],
	[[2, 0], [1, 1], [0, 2]],
];

const LineLabels = [
	"上段(横)", "中段(横)", "下段(横)",
	"斜め↘", "斜め↗"
];

const LineOffsets = [
	[-1, -1, -1],
	[0, 0, 0],
	[1, 1, 1],
	[-1, 0, 1],
	[1, 0, -1],
];

const YakuProbabilities: { yaku: SymbolType; prob: number }[] = [
	{ yaku: "GOD", prob: 1 / 8192 },
	{ yaku: "TheKuru", prob: 1 / 690 },
	{ yaku: "LEDX", prob: 1 / 499 },
	{ yaku: "ascendant1", prob: 1 / 320 },
	{ yaku: "twitter", prob: 1 / 220 },
	{ yaku: "ornament", prob: 1 / 99 },
	{ yaku: "MarshmaoYummy", prob: 1 / 14 },
];

enum Phase {
	IDLE = 0,
	SPINNING = 1,
	LEFT_STOPPED = 2,
	MID_STOPPED = 3,
	PESSI_REACH = 4,
	FINISHED = 5,
	BONUS_IDLE = 10,
	BONUS_SPINNING = 11,
	BONUS_STOPPING = 12,
	BONUS_GAME_RESULT = 14,
	BONUS_FINISHED = 15,
}

function getChainMultiplier(chain: number): number {
	if (chain <= 1) return 1;
	if (chain === 2) return 2;
	return (chain - 2) * 2 + 2;
}

function calculateBonusMultiplier(confirmedRowBits: boolean[][]): number {
	let total = 0;
	for (const reel of confirmedRowBits) {
		let chain = 0;
		for (const cell of reel) {
			if (cell) {
				chain++;
			} else {
				if (chain > 0) total += getChainMultiplier(chain);
				chain = 0;
			}
		}
		if (chain > 0) total += getChainMultiplier(chain);
	}
	return total;
}

function countSetBits(bits: number): number {
	let count = 0;
	let b = bits;
	while (b) {
		count += b & 1;
		b >>= 1;
	}
	return count;
}

function countPessiReels(confirmedPessi: boolean[]): number {
	return confirmedPessi.filter(Boolean).length;
}

interface BonusData {
	bet: number;
	gamesLeft: number;
	confirmedPessi: boolean[];
	positions: number[];
	pessiRowBits: boolean[][];
	rainbowRowBits: boolean[][];
	confirmedRowBits: boolean[][];
	extraReels: number;
	extraRows: number;
	stoppedReels: number;
}

const bonusStates = new Map<string, BonusData>();
const gridMessageIds = new Map<string, string>();

async function sendSlotMessages(
	method: "reply" | "update" | "edit",
	it: any,
	userId: string,
	bet: number,
	phase: Phase,
	positions: number[],
	currentPoints: number,
	pessiBits: number,
	allPessi: boolean = false,
	bonus?: BonusData,
	lastBuffMsg?: string
) {
	const contentMsg = createMessage(userId, bet, phase, positions, currentPoints, pessiBits, allPessi, bonus, lastBuffMsg);
	const gridContent = createGrid(phase, positions, pessiBits, bonus);

	const gridId = gridMessageIds.get(userId);
	let sentGridId: string | undefined;

	if (method === "reply") {
		const channel = it.channel;
		if (channel && channel.isSendable()) {
			const gridMsg = await channel.send(gridContent);
			sentGridId = gridMsg.id;
		}
		await it.reply(contentMsg);
	} else if (method === "update") {
		await it.update(contentMsg);
		const channel = it.channel;
		if (channel && channel.isSendable() && gridId) {
			try {
				const gridMsg = await channel.messages.fetch(gridId);
				await gridMsg.edit(gridContent);
				sentGridId = gridId;
			} catch {
				const gridMsg = await channel.send(gridContent);
				sentGridId = gridMsg.id;
			}
		} else if (channel && channel.isSendable()) {
			const gridMsg = await channel.send(gridContent);
			sentGridId = gridMsg.id;
		}
	} else if (method === "edit") {
		const message: Message = it;
		const channel = message.channel;
		if (channel && channel.isSendable() && gridId) {
			try {
				const gridMsg = await channel.messages.fetch(gridId);
				await gridMsg.edit(gridContent);
				sentGridId = gridId;
			} catch {
				const gridMsg = await channel.send(gridContent);
				sentGridId = gridMsg.id;
			}
		} else if (channel && channel.isSendable()) {
			const gridMsg = await channel.send(gridContent);
			sentGridId = gridMsg.id;
		}
		await message.edit(contentMsg);
	}

	if (sentGridId) gridMessageIds.set(userId, sentGridId);
}

function getSymbol(reel: number, position: number, offset: number): SymbolType {
	const strip = ReelStrips[reel];
	const len = strip.length;
	return strip[(position + offset + len) % len];
}

function getRandomYaku(): { yaku: SymbolType; lineIndex: number } | null {
	const r = Math.random();
	let cumulative = 0;
	for (const item of YakuProbabilities) {
		cumulative += item.prob;
		if (r < cumulative) {
			const lineIndex = Math.floor(Math.random() * Lines.length);
			return { yaku: item.yaku, lineIndex };
		}
	}
	return null;
}

function findStopPositions(yaku: SymbolType | null, targetLineIndex: number, pessiBits: number): number[] {
	if (pessiBits > 0) {
		return [
			Math.floor(Math.random() * ReelStrips[0].length),
			Math.floor(Math.random() * ReelStrips[1].length),
			Math.floor(Math.random() * ReelStrips[2].length)
		];
	}

	if (yaku === null) {
		for (let attempt = 0; attempt < 1000; attempt++) {
			const positions = [
				Math.floor(Math.random() * ReelStrips[0].length),
				Math.floor(Math.random() * ReelStrips[1].length),
				Math.floor(Math.random() * ReelStrips[2].length)
			];
			if (checkLines(positions, 0).length === 0) return positions;
		}
		return [
			Math.floor(Math.random() * ReelStrips[0].length),
			Math.floor(Math.random() * ReelStrips[1].length),
			Math.floor(Math.random() * ReelStrips[2].length)
		];
	}

	const offsets = LineOffsets[targetLineIndex];
	const positions: number[] = [];

	for (let reel = 0; reel < 3; reel++) {
		const offset = offsets[reel];
		const validPositions: number[] = [];
		for (let idx = 0; idx < ReelStrips[reel].length; idx++) {
			if (ReelStrips[reel][idx] === yaku) {
				const pos = (idx - offset + ReelStrips[reel].length) % ReelStrips[reel].length;
				validPositions.push(pos);
			}
		}
		if (validPositions.length > 0) {
			positions.push(validPositions[Math.floor(Math.random() * validPositions.length)]);
		} else {
			positions.push(Math.floor(Math.random() * ReelStrips[reel].length));
		}
	}

	return positions;
}

function checkLines(positions: number[], pessiBits: number): { symbol: SymbolType; lineIndex: number; multiplier: number }[] {
	const grid: SymbolType[][] = [[], [], []];
	const pessiGrid: boolean[][] = [[], [], []];

	for (let col = 0; col < 3; col++) {
		const isPessi = !!(pessiBits & (1 << col));
		for (let row = 0; row < 3; row++) {
			pessiGrid[row][col] = isPessi;
			grid[row][col] = getSymbol(col, positions[col], row - 1);
		}
	}

	const hits: { symbol: SymbolType; lineIndex: number; multiplier: number }[] = [];
	for (let i = 0; i < Lines.length; i++) {
		const line = Lines[i];
		if (line.some(([row, col]) => pessiGrid[row][col])) continue;

		const symbols = line.map(([row, col]) => grid[row][col]);
		if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
			hits.push({
				symbol: symbols[0],
				lineIndex: i,
				multiplier: PayoutTable[symbols[0]]
			});
		}
	}
	return hits;
}

function applyRainbowBuff(bonus: BonusData): string {
	const totalReels = 3 + bonus.extraReels;
	const totalRows = 3 + bonus.extraRows;
	const buffs: string[] = [];
	if (totalReels < 7) buffs.push("reel");
	if (totalRows < 7) buffs.push("frame");
	buffs.push("game");
	const buff = buffs[Math.floor(Math.random() * buffs.length)];
	let msg = "";

	switch (buff) {
		case "reel":
			bonus.extraReels++;
			const newTotalReels = 3 + bonus.extraReels;
			const newRows = 3 + bonus.extraRows;
			while (bonus.confirmedRowBits.length < newTotalReels) bonus.confirmedRowBits.push(new Array(newRows).fill(false));
			while (bonus.pessiRowBits.length < newTotalReels) bonus.pessiRowBits.push(new Array(newRows).fill(false));
			while (bonus.rainbowRowBits.length < newTotalReels) bonus.rainbowRowBits.push(new Array(newRows).fill(false));
			if (bonus.confirmedPessi.length < newTotalReels) bonus.confirmedPessi.push(false);
			msg = ":arrow_right: リール数+1！";
			break;
		case "frame":
			bonus.extraRows++;
			const newRowLen = 3 + bonus.extraRows;
			for (let i = 0; i < bonus.confirmedRowBits.length; i++) while (bonus.confirmedRowBits[i].length < newRowLen) bonus.confirmedRowBits[i].push(false);
			for (let i = 0; i < bonus.pessiRowBits.length; i++) while (bonus.pessiRowBits[i].length < newRowLen) bonus.pessiRowBits[i].push(false);
			for (let i = 0; i < bonus.rainbowRowBits.length; i++) while (bonus.rainbowRowBits[i].length < newRowLen) bonus.rainbowRowBits[i].push(false);
			msg = ":arrow_down: 行数+1！";
			break;
		case "game":
			bonus.gamesLeft++;
			msg = ":up: ゲーム数+1！";
			break;
	}

	return msg;
}

function finalizeReels(bonus: BonusData, totalReels: number, totalRows: number): { newConfirmed: boolean[]; buffMsg: string } {
	const newConfirmed = [...bonus.confirmedPessi];
	for (let col = 0; col < totalReels; col++) {
		const hasPessi = bonus.pessiRowBits[col].some(Boolean) || bonus.rainbowRowBits[col].some(Boolean);
		if (hasPessi) {
			newConfirmed[col] = true;
			for (let row = 0; row < totalRows; row++) {
				if (bonus.pessiRowBits[col][row] || bonus.rainbowRowBits[col][row]) {
					bonus.confirmedRowBits[col][row] = true;
				}
			}
		}
	}

	let hasRainbow = false;
	let rainbowCount = 0;
	for (let col = 0; col < totalReels; col++) {
		if (bonus.rainbowRowBits[col].some(Boolean)) hasRainbow = true;
		rainbowCount += bonus.rainbowRowBits[col].filter(Boolean).length;
	}

	let buffMsg = "";
	if (rainbowCount > 0) {
		if (bonus.gamesLeft <= 0) {
			bonus.gamesLeft++;
			buffMsg += "🎮 ゲーム数+1！";
		} else {
			buffMsg += applyRainbowBuff(bonus);
		}
		for (let i = 1; i < rainbowCount; i++) {
			buffMsg += "\n" + applyRainbowBuff(bonus);
		}
	}

	return { newConfirmed, buffMsg };
}

function buildPessiDisplay(confirmedPessi: boolean[]): string[] {
	const pessiCount = countPessiReels(confirmedPessi);

	if (pessiCount === 0) return [];
	if (pessiCount === 1) return [PessiEmoji];
	if (pessiCount === 2) return [PessiLongEmojis[0], PessiLongEmojis[2]];

	const result = [PessiLongEmojis[0]];
	for (let i = 0; i < pessiCount - 2; i++) {
		result.push(PessiLongEmojis[1]);
	}
	result.push(PessiLongEmojis[2]);
	return result;
}

function buildPessiChainLines(confirmedRowBits: boolean[][]): string[] {
	const chainCounts = new Map<number, number>();

	for (const reel of confirmedRowBits) {
		let chainStart = -1;
		for (let row = 0; row <= reel.length; row++) {
			const isPessi = row < reel.length && reel[row];
			if (isPessi) {
				if (chainStart === -1) chainStart = row;
			} else {
				if (chainStart !== -1) {
					const chainLen = row - chainStart;
					chainCounts.set(chainLen, (chainCounts.get(chainLen) || 0) + 1);
					chainStart = -1;
				}
			}
		}
	}

	const lines: string[] = [];
	const sorted = [...chainCounts.entries()].sort((a, b) => a[0] - b[0]);
	let totalMultiplier = 0;

	for (const [chainLen, count] of sorted) {
		const mul = getChainMultiplier(chainLen);
		const subTotal = mul * count;
		totalMultiplier += subTotal;
		const emojis = chainLen === 1 ? PessiEmoji : getPessiRowEmojis(chainLen).join("");
		const countStr = count > 1 ? ` ×${count}` : "";
		lines.push(`${emojis} ${chainLen}連${countStr} → x${subTotal}`);
	}

	return lines;
}

function getPessiRowEmojis(totalRows: number): string[] {
	if (totalRows === 1) return [PessiEmoji];
	if (totalRows === 2) return [PessiLongEmojis[0], PessiLongEmojis[2]];
	const result = [PessiLongEmojis[0]];
	for (let i = 0; i < totalRows - 2; i++) result.push(PessiLongEmojis[1]);
	result.push(PessiLongEmojis[2]);
	return result;
}

function createGrid(phase: Phase, positions: number[], pessiBits: number, bonus?: BonusData): string {
	const spinEmoji = "⬛";
	const blankEmoji = "<:mu:1505085852446097418>";
	const totalReels = bonus ? 3 + bonus.extraReels : 3;
	const totalRows = bonus ? 3 + bonus.extraRows : 3;
	const stoppedReels = bonus ? bonus.stoppedReels : 0;

	const grid: string[][] = [];
	for (let row = 0; row < totalRows; row++) {
		grid[row] = [];
		for (let col = 0; col < totalReels; col++) {
			grid[row][col] = spinEmoji;
		}
	}

	for (let col = 0; col < totalReels; col++) {
		let isPessiCol = !!(pessiBits & (1 << col));

		if (phase >= Phase.BONUS_IDLE) {
			const pessiRows = bonus ? bonus.pessiRowBits[col] : [];
			const rainbowRows = bonus ? bonus.rainbowRowBits[col] : [];
			const confirmedRows = bonus ? bonus.confirmedRowBits[col] : [];

			let colRevealed = false;
			if (phase === Phase.BONUS_SPINNING) {
				for (let row = 0; row < totalRows; row++) {
					if (confirmedRows[row]) {
						grid[row][col] = PessiEmoji;
					} else {
						grid[row][col] = spinEmoji;
					}
				}
				continue;
			} else if (phase === Phase.BONUS_STOPPING && col < stoppedReels) {
				colRevealed = true;
			} else if (phase >= Phase.BONUS_GAME_RESULT) {
				colRevealed = true;
			}

			if (colRevealed) {
				const isFinalResult = bonus && bonus.gamesLeft <= 0 && phase === Phase.BONUS_GAME_RESULT;
				if (isFinalResult) {
					let chainStart = -1;
					for (let row = 0; row <= totalRows; row++) {
						const isPessi = row < totalRows && (rainbowRows[row] || confirmedRows[row] || pessiRows[row]);
						if (isPessi) {
							if (chainStart === -1) chainStart = row;
						} else {
							if (chainStart !== -1) {
								const chainLen = row - chainStart;
								const isSingleRainbow = chainLen === 1 && rainbowRows[chainStart];
								if (chainLen === 1) {
									grid[chainStart][col] = isSingleRainbow ? RainbowEmoji : PessiEmoji;
								} else {
									const emojis = getPessiRowEmojis(chainLen);
									for (let i = 0; i < chainLen; i++) {
										grid[chainStart + i][col] = emojis[i];
									}
								}
								chainStart = -1;
							}
							if (row < totalRows) grid[row][col] = blankEmoji;
						}
					}
				} else {
					for (let row = 0; row < totalRows; row++) {
						if (rainbowRows[row]) {
							grid[row][col] = RainbowEmoji;
						} else if (confirmedRows[row] || pessiRows[row]) {
							grid[row][col] = PessiEmoji;
						} else {
							grid[row][col] = blankEmoji;
						}
					}
				}
			} else if (phase >= Phase.BONUS_IDLE) {
				for (let row = 0; row < totalRows; row++) {
					if (confirmedRows[row]) {
						grid[row][col] = PessiEmoji;
					} else {
						grid[row][col] = spinEmoji;
					}
				}
			}
			continue;
		}

		if (phase === Phase.IDLE || phase === Phase.SPINNING) {
			for (let row = 0; row < totalRows; row++) grid[row][col] = spinEmoji;
		} else {
			const revealed = (phase >= Phase.LEFT_STOPPED && col === 0)
				|| (phase >= Phase.MID_STOPPED && col <= 1)
				|| (phase >= Phase.FINISHED);
			if (revealed) {
				if (isPessiCol) {
					const rowEmojis = getPessiRowEmojis(totalRows);
					for (let row = 0; row < totalRows; row++) grid[row][col] = rowEmojis[row];
				} else {
					for (let row = 0; row < totalRows; row++) {
						grid[row][col] = EmojiMappings[getSymbol(col, positions[col], row - 1)];
					}
				}
			} else {
				for (let row = 0; row < totalRows; row++) grid[row][col] = spinEmoji;
			}
		}
	}

	let content = "";
	for (let row = 0; row < totalRows; row++) {
		content += grid[row].join(" ") + "\n";
	}

	if (bonus && (phase === Phase.BONUS_SPINNING || phase === Phase.BONUS_STOPPING)) {
		const indicators: string[] = [];
		for (let col = 0; col < totalReels; col++) {
			indicators.push(col === stoppedReels ? ":small_red_triangle:" : "<:mu:1505085852446097418>");
		}
		content += indicators.join(" ") + "\n";
	}

	return content;
}

function createMessage(userId: string, bet: number, phase: Phase, positions: number[], currentPoints: number, pessiBits: number, allPessi: boolean = false, bonus?: BonusData, lastBuffMsg?: string): any {
	const totalReels = bonus ? 3 + bonus.extraReels : 3;

	let content = `<@${userId}> のビデオスロット\n`;

	if (bonus && phase >= Phase.BONUS_IDLE) {
		content += `所持ポイント: ${currentPoints} Pt | 掛け金: ${bet} Pt \n ${PessiEmoji}**ペッシボーナス** 残り${bonus.gamesLeft}G\n`;
	} else {
		content += `所持ポイント: ${currentPoints} Pt | 掛け金: ${bet} Pt\n`;
	}

	if (bonus && phase >= Phase.BONUS_IDLE) {
		if (phase === Phase.BONUS_IDLE) {
			content += `\n${RainbowEmoji} オレにマンモーニなんて言えるヤツはもう誰ひとりいねーからな！！`;
		} else if (phase === Phase.BONUS_SPINNING || phase === Phase.BONUS_STOPPING) {
			content += `\nSTOPを押せ！`;
		} else if (phase === Phase.BONUS_GAME_RESULT) {
			let hasRainbow = false;
			let pessiCellCount = 0;
			for (let col = 0; col < totalReels; col++) {
				if (bonus.rainbowRowBits[col].some(Boolean)) hasRainbow = true;
				pessiCellCount += bonus.pessiRowBits[col].filter(Boolean).length;
			}
			if (hasRainbow) {
				content += `\n${RainbowEmoji} **レインボーペッシ！！**`;
			}
			if (lastBuffMsg && lastBuffMsg.length > 0) {
				content += `\n✨ ${lastBuffMsg}`;
			}
			if (bonus.gamesLeft > 0) {
				content += `\nSPINを押して次のゲームへ！`;
			} else {
				const multiplier = calculateBonusMultiplier(bonus.confirmedRowBits);
				const payout = bet * multiplier;
				const chainLines = buildPessiChainLines(bonus.confirmedRowBits);
				content += `\n\n ${PessiEmoji} **心の中で思ったならッ！その時スデに行動は終わっているんだッ！**`;
				content += `\n${chainLines.join("\n")}`;
				content += `\n**# 合計 x${multiplier} → ${payout} Pt**`;
				addPoints(userId, payout);
			}
		}
	} else if (allPessi) {
		content += `\n🎉**ペッシボーナス確定！！**🎉\n ${PessiEmoji}  兄貴の覚悟が!「言葉」でなく「心」で理解できた！！**`;
	} else if (phase === Phase.FINISHED) {
		const hits = checkLines(positions, pessiBits);
		const pessiCount = countSetBits(pessiBits);
		let normalWin = 0;
		for (const hit of hits) normalWin += bet * hit.multiplier;
		const pessiWin = bet * pessiCount;
		const totalWin = normalWin + pessiWin;

		if (totalWin > 0) {
			const hitLines: string[] = [];
			for (const hit of hits) {
				hitLines.push(`${LineLabels[hit.lineIndex]}: ${EmojiMappings[hit.symbol]}×3 x${hit.multiplier} → ${bet * hit.multiplier} Pt`);
			}
			if (pessiCount > 0) {
				hitLines.push(`${PessiEmoji} ペッシ ${pessiCount}列 → ${pessiWin} Pt`);
			}
			content += `\n🎉 **当たり！**\n`;
			content += hitLines.join("\n");
			content += `\n**合計: ${totalWin} Pt 獲得！**`;
		} else if (pessiCount > 0) {
			if (pessiCount === 1) {
				content += `\n${PessiEmoji} 兄貴ィ・・・`;
			} else {
				content += `\n${PessiEmoji} 兄貴ィ・・・`;
			}
		} else {
			content += `\n残念、ハズレです。`;
		}
	} else if (phase === Phase.IDLE) {
		content += `\nSPINボタンを押して開始！`;
	} else if (phase === Phase.SPINNING) {
		content += `\nリール回転中...`;
	} else if (phase === Phase.LEFT_STOPPED) {
		if (pessiBits & 1) {
			content += `\n${PessiEmoji} ペッシ！！`;
		} else {
			content += `\nリール回転中...`;
		}
	} else if (phase === Phase.MID_STOPPED) {
		content += `\nリール回転中...`;
	} else if (phase === Phase.PESSI_REACH) {
		content += `\n${PessiEmoji} **ペッシ！！ペッシ！！**`;
	}

	const stateStr = `${userId}-${bet}-${phase}-${positions.join(",")}-${pessiBits}`;
	const bonusStr = bonus ? `-${bonus.gamesLeft}-${bonus.confirmedPessi.map(b => b ? "1" : "0").join("")}-${bonus.extraReels}-${bonus.extraRows}` : "";
	const fullState = bonus ? `${stateStr}${bonusStr}` : stateStr;

	const buttons: ActionRowBuilder<ButtonBuilder>[] = [];

	if (phase === Phase.PESSI_REACH) {
		buttons.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`vs-spin-${fullState}`)
				.setLabel("SPIN")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId(`vs-stop-${stateStr}`)
				.setLabel("STOP")
				.setStyle(ButtonStyle.Danger)
		));
	} else if (phase === Phase.BONUS_GAME_RESULT) {
		const isFinished = bonus && bonus.gamesLeft <= 0;
		buttons.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`vs-spin-${fullState}`)
				.setLabel(isFinished ? "結果確認" : "SPIN")
				.setStyle(isFinished ? ButtonStyle.Secondary : ButtonStyle.Primary)
		));
		if (!isFinished) {
			buttons.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`vs-bstop-${fullState}`)
					.setLabel("STOP")
					.setStyle(ButtonStyle.Danger)
					.setDisabled(true)
			));
		}
	} else if (phase >= Phase.BONUS_IDLE) {
		buttons.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`vs-spin-${fullState}`)
				.setLabel("SPIN")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(phase !== Phase.BONUS_IDLE)
		));
		buttons.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`vs-bstop-${fullState}`)
				.setLabel("STOP")
				.setStyle(ButtonStyle.Danger)
				.setDisabled(phase !== Phase.BONUS_SPINNING && phase !== Phase.BONUS_STOPPING)
		));
	} else {
		buttons.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`vs-spin-${stateStr}`)
				.setLabel("SPIN")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(phase !== Phase.IDLE && phase !== Phase.FINISHED || allPessi)
		));
	}

	return { content, components: buttons };
}

export const VideoSlotRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("ビデオスロットを回します。3リール・5ライン")
		.addIntegerOption(option =>
			option.setName("bet")
				.setDescription("掛け金を指定します")
				.setRequired(true)
				.setMinValue(1)
		);

	await rest.post(Routes.applicationCommands(applicationId), { body: command });

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				if (!it.isChatInputCommand()) return;

				const bet = it.options.getInteger("bet")!;
				const userPoints = getPoints(it.user.id);

				if (userPoints < bet) {
					await it.reply({ content: `ポイントが足りません！ (所持: ${userPoints} Pt, 必要: ${bet} Pt)`, flags: [MessageFlags.Ephemeral] });
					return;
				}

				await sendSlotMessages("reply", it, it.user.id, bet, Phase.IDLE, [0, 0, 0], userPoints, 0);
				return;
			}

			if (it.isButton()) {
				if (!it.customId.startsWith("vs-")) return;

				const parts = it.customId.split("-");
				const action = parts[1];
				const ownerId = parts[2];
				const bet = parseInt(parts[3]);
				let phase = parseInt(parts[4]) as Phase;
				let positions = parts[5].split(",").map(Number);
				let pessiBits = parseInt(parts[6]);

				let bonus: BonusData | undefined;
				if (parts.length > 7) {
					const saved = bonusStates.get(ownerId);
					if (saved) {
						bonus = {
							...saved,
							positions,
						};
					} else {
						bonus = {
							bet,
							gamesLeft: parseInt(parts[7]),
							confirmedPessi: parts[8].split("").map(c => c === "1"),
							positions,
							pessiRowBits: [],
							rainbowRowBits: [],
							confirmedRowBits: [],
							extraReels: parseInt(parts[9] || "0"),
							extraRows: parseInt(parts[10] || "0"),
							stoppedReels: 0,
						};
					}
				} else {
					const saved = bonusStates.get(ownerId);
					if (saved) bonus = { ...saved, positions };
				}

				if (it.user.id !== ownerId) {
					await it.reply({ content: "他人のスロットは操作できません！", flags: [MessageFlags.Ephemeral] });
					return;
				}

				let userPoints = getPoints(it.user.id);

				// ========== BONUS MODE HANDLER ==========
				if (phase >= Phase.BONUS_IDLE) {
					if (action === "spin") {
						if (phase === Phase.BONUS_GAME_RESULT && bonus && bonus.gamesLeft <= 0) {
							bonusStates.delete(ownerId);
							await sendSlotMessages("update", it, ownerId, bet, Phase.FINISHED, positions, userPoints, 0);
							return;
						}

						if (phase !== Phase.BONUS_IDLE && phase !== Phase.BONUS_GAME_RESULT) {
							await it.deferUpdate();
							return;
						}

						if (!bonus) {
							await it.deferUpdate();
							return;
						}

						bonus.gamesLeft--;
						bonus.stoppedReels = 0;
						const totalReels = 3 + bonus.extraReels;
						const totalRows = 3 + bonus.extraRows;
						bonus.pessiRowBits = Array.from({ length: totalReels }, () => new Array(totalRows).fill(false));
						bonus.rainbowRowBits = Array.from({ length: totalReels }, () => new Array(totalRows).fill(false));
						while (bonus.confirmedRowBits.length < totalReels) bonus.confirmedRowBits.push(new Array(totalRows).fill(false));
						bonus.positions = [];
						for (let i = 0; i < totalReels; i++) {
							bonus.positions.push(Math.floor(Math.random() * ReelStrips[i % 3].length));
						}
						bonusStates.set(ownerId, bonus);

						const allConfirmed = bonus.confirmedRowBits.every(reel => reel.every(Boolean));
						if (allConfirmed) {
							const multiplier = calculateBonusMultiplier(bonus.confirmedRowBits);
							const payout = bet * multiplier;
							addPoints(ownerId, payout);
							const newPoints = userPoints + payout;
							bonusStates.delete(ownerId);
							await sendSlotMessages("update", it, ownerId, bet, Phase.FINISHED, bonus.positions, newPoints, 0, true);
							return;
						}

						await sendSlotMessages("update", it, ownerId, bet, Phase.BONUS_SPINNING, bonus.positions, userPoints, pessiBits, false, bonus);

					} else if (action === "bstop") {
						if ((!bonus) || (phase !== Phase.BONUS_SPINNING && phase !== Phase.BONUS_STOPPING)) { await it.deferUpdate(); return; }

						const totalReels = 3 + bonus.extraReels;
						const totalRows = 3 + bonus.extraRows;

						while (bonus.stoppedReels < totalReels && bonus.confirmedRowBits.length > bonus.stoppedReels && bonus.confirmedRowBits[bonus.stoppedReels].every(Boolean)) {
							bonus.stoppedReels++;
						}

						if (bonus.stoppedReels >= totalReels) {
							const { newConfirmed, buffMsg } = finalizeReels(bonus, totalReels, totalRows);
							bonus.confirmedPessi = newConfirmed;
							bonusStates.set(ownerId, bonus);

							await sendSlotMessages("update", it, ownerId, bet, Phase.BONUS_GAME_RESULT, bonus.positions, userPoints, pessiBits, false, bonus, buffMsg);
						} else {
							const reelIndex = bonus.stoppedReels;

							while (bonus.confirmedRowBits.length <= reelIndex) bonus.confirmedRowBits.push(new Array(totalRows).fill(false));
							while (bonus.pessiRowBits.length <= reelIndex) bonus.pessiRowBits.push(new Array(totalRows).fill(false));
							while (bonus.rainbowRowBits.length <= reelIndex) bonus.rainbowRowBits.push(new Array(totalRows).fill(false));

							for (let row = 0; row < totalRows; row++) {
								if (bonus.confirmedRowBits[reelIndex][row]) continue;
								const r = Math.random();
								if (r < 1 / 12) {
									bonus.rainbowRowBits[reelIndex][row] = true;
									bonus.pessiRowBits[reelIndex][row] = true;
								} else if (r < 1 / 14 + 1 / 8) {
									bonus.pessiRowBits[reelIndex][row] = true;
								}
							}

							bonus.stoppedReels = reelIndex + 1;
							bonusStates.set(ownerId, bonus);

while (bonus.stoppedReels < totalReels && bonus.confirmedRowBits.length > bonus.stoppedReels && bonus.confirmedRowBits[bonus.stoppedReels].every(Boolean)) {
								bonus.stoppedReels++;
							}

							if (bonus.stoppedReels >= totalReels) {
								const { newConfirmed, buffMsg } = finalizeReels(bonus, totalReels, totalRows);
								bonus.confirmedPessi = newConfirmed;
								bonusStates.set(ownerId, bonus);

								await sendSlotMessages("update", it, ownerId, bet, Phase.BONUS_GAME_RESULT, bonus.positions, userPoints, pessiBits, false, bonus, buffMsg);
							} else {
								await sendSlotMessages("update", it, ownerId, bet, Phase.BONUS_STOPPING, bonus.positions, userPoints, pessiBits, false, bonus);
							}
						}
					} else {
						await it.deferUpdate();
					}
					return;
				}

				// ========== NORMAL MODE HANDLER ==========
				if (action === "spin") {
					if (phase !== Phase.IDLE && phase !== Phase.FINISHED) {
						await it.deferUpdate();
						return;
					}

					if (userPoints < bet) {
						await it.reply({ content: `ポイントが足りません！ (所持: ${userPoints} Pt, 必要: ${bet} Pt)`, flags: [MessageFlags.Ephemeral] });
						return;
					}

					addPoints(it.user.id, -bet);
					userPoints -= bet;

					pessiBits = 0;
					if (Math.random() < 1 / 16) {
						pessiBits |= 1;
						if (Math.random() < 1 / 4) {
							pessiBits |= 2;
							if (Math.random() < 1 / 2) {
								pessiBits |= 4;
							}
						}
					}

					const yakuResult = getRandomYaku();
					const yaku = yakuResult ? yakuResult.yaku : null;
					const lineIdx = yakuResult ? yakuResult.lineIndex : 0;
					positions = findStopPositions(yaku, lineIdx, pessiBits);

					await sendSlotMessages("update", it, ownerId, bet, Phase.SPINNING, positions, userPoints, pessiBits);

					const channelId = it.channelId;
					const messageId = it.message.id;
					const client = it.client;
					const userId = it.user.id;

					const pessiLeft = !!(pessiBits & 1);
					const pessiMid = !!(pessiBits & 2);
					const isPessiReach = pessiLeft && pessiMid;

					if (!isPessiReach) {
						setTimeout(async () => {
							try {
								const channel = await client.channels.fetch(channelId);
								if (!channel || !channel.isTextBased()) return;
								const message = await channel.messages.fetch(messageId);
								await sendSlotMessages("edit", message, userId, bet, Phase.LEFT_STOPPED, positions, userPoints, pessiBits);

								setTimeout(async () => {
									try {
										await sendSlotMessages("edit", message, userId, bet, Phase.MID_STOPPED, positions, userPoints, pessiBits);

										setTimeout(async () => {
											try {
												const hits = checkLines(positions, pessiBits);
												const pessiCount = countSetBits(pessiBits);
												let totalWin = bet * pessiCount;
												for (const hit of hits) totalWin += bet * hit.multiplier;
												if (totalWin > 0) addPoints(userId, totalWin);
												const newPoints = userPoints + totalWin;
												await sendSlotMessages("edit", message, userId, bet, Phase.FINISHED, positions, newPoints, pessiBits);
											} catch (e) { console.error(e); }
										}, 400);
									} catch (e) { console.error(e); }
								}, 400);
							} catch (e) { console.error(e); }
						}, 400);
					} else {
						setTimeout(async () => {
							try {
								const channel = await client.channels.fetch(channelId);
								if (!channel || !channel.isTextBased()) return;
								const message = await channel.messages.fetch(messageId);
								await sendSlotMessages("edit", message, userId, bet, Phase.LEFT_STOPPED, positions, userPoints, pessiBits);

								setTimeout(async () => {
									try {
										await sendSlotMessages("edit", message, userId, bet, Phase.PESSI_REACH, positions, userPoints, pessiBits);
									} catch (e) { console.error(e); }
								}, 400);
							} catch (e) { console.error(e); }
						}, 400);
					}

				} else if (action === "stop") {
					if (phase !== Phase.PESSI_REACH) { await it.deferUpdate(); return; }

					if (Math.random() < 1 / 2) {
						pessiBits |= 4;
					}

					const hits = checkLines(positions, pessiBits);
					const pessiCount = countSetBits(pessiBits);

					pessiBits |= 4;
					let totalWin = bet * pessiCount;
					for (const hit of hits) totalWin += bet * hit.multiplier;
					if (totalWin > 0) addPoints(it.user.id, totalWin);
					userPoints += totalWin;

					const allPessi = pessiBits === 7;

					await sendSlotMessages("update", it, ownerId, bet, Phase.FINISHED, positions, userPoints, pessiBits, allPessi);

					if (allPessi) {
						const bonusData: BonusData = {
							bet,
							gamesLeft: 5,
							confirmedPessi: [false, false, false],
							positions,
							pessiRowBits: [[false, false, false], [false, false, false], [false, false, false]],
							rainbowRowBits: [[false, false, false], [false, false, false], [false, false, false]],
							confirmedRowBits: [[false, false, false], [false, false, false], [false, false, false]],
							extraReels: 0,
							extraRows: 0,
							stoppedReels: 0,
						};
						bonusStates.set(it.user.id, bonusData);

						const channelId = it.channelId;
						const messageId = it.message.id;
						const client = it.client;

						setTimeout(async () => {
							try {
								const channel = await client.channels.fetch(channelId);
								if (!channel || !channel.isTextBased()) return;
								const message = await channel.messages.fetch(messageId);
								await sendSlotMessages("edit", message, ownerId, bet, Phase.BONUS_IDLE, positions, userPoints, 0, false, bonusData);
							} catch (e) { console.error(e); }
						}, 2000);
					}
				} else {
					await it.deferUpdate();
				}
			}
		}
	};
};