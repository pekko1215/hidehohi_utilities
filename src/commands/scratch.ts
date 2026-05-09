import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { InteractionReplyOptions, ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes, Client } from "discord.js";
import { addPoints, getPoints } from "../utils/points";

type NormalScratchSymbol = "🐈" | "🍅" | "🍖" | "💎" | "🍣" | "🎰"
type AlmightyScratchSymbol = "🤡"
type ScratchSymbol = NormalScratchSymbol | AlmightyScratchSymbol;
type Scratch = [
	[ScratchSymbol, ScratchSymbol, ScratchSymbol],
	[ScratchSymbol, ScratchSymbol, ScratchSymbol],
	[ScratchSymbol, ScratchSymbol, ScratchSymbol]
]

const SymbolIdTable: ScratchSymbol[] = [
	"🐈", "🍅", "🍖", "🍣", "💎", "🎰", "🤡"
]

// 記号の重み設定 (設定1〜6)
// 設定が高いほどレア役の確率が上がる
const SettingLotTables: Record<number, { lot: number, symbol: ScratchSymbol }[]> = {
	1: [ // 機械割 約96%
		{ lot: 1 / 3, symbol: "🐈" }, { lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 6.5, symbol: "🍖" }, { lot: 1 / 6.5, symbol: "🍣" },
		{ lot: 1 / 15, symbol: "💎" }, { lot: 1 / 15, symbol: "🎰" },
		{ lot: 1 / 44, symbol: "🤡" }
	],
	2: [ // 機械割 約110%
		{ lot: 1 / 3, symbol: "🐈" }, { lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 5.5, symbol: "🍖" }, { lot: 1 / 5.5, symbol: "🍣" },
		{ lot: 1 / 13, symbol: "💎" }, { lot: 1 / 13, symbol: "🎰" },
		{ lot: 1 / 42, symbol: "🤡" }
	],
	3: [ // 機械割 約120%
		{ lot: 1 / 3, symbol: "🐈" }, { lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 5.2, symbol: "🍖" }, { lot: 1 / 5.2, symbol: "🍣" },
		{ lot: 1 / 12, symbol: "💎" }, { lot: 1 / 12, symbol: "🎰" },
		{ lot: 1 / 36, symbol: "🤡" }
	],
	4: [ // 機械割 約130%
		{ lot: 1 / 3, symbol: "🐈" }, { lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 5, symbol: "🍖" }, { lot: 1 / 5, symbol: "🍣" },
		{ lot: 1 / 11, symbol: "💎" }, { lot: 1 / 11, symbol: "🎰" },
		{ lot: 1 / 31, symbol: "🤡" }
	],
	5: [ // 機械割 約140%
		{ lot: 1 / 3, symbol: "🐈" }, { lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 4.8, symbol: "🍖" }, { lot: 1 / 4.8, symbol: "🍣" },
		{ lot: 1 / 10, symbol: "💎" }, { lot: 1 / 10, symbol: "🎰" },
		{ lot: 1 / 29, symbol: "🤡" }
	],
	6: [ // 機械割 約150% (エクストラ設定)
		{ lot: 1 / 3, symbol: "🐈" }, { lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 4.5, symbol: "🍖" }, { lot: 1 / 4.5, symbol: "🍣" },
		{ lot: 1 / 9, symbol: "💎" }, { lot: 1 / 9, symbol: "🎰" },
		{ lot: 1 / 24, symbol: "🤡" }
	]
}

const SymbolHitPointTable: { [key in ScratchSymbol]: number } = {
	"🍅": 100,
	"🐈": 150,
	"🍖": 200,
	"🍣": 300,
	"💎": 600,
	"🎰": 1000,
	"🤡": 2000
}

const ScratchLines = [
	[[1, 1, 1], [0, 0, 0], [0, 0, 0]],
	[[0, 0, 0], [1, 1, 1], [0, 0, 0]],
	[[0, 0, 0], [0, 0, 0], [1, 1, 1]],
	[[0, 0, 1], [0, 1, 0], [1, 0, 0]],
	[[1, 0, 0], [1, 0, 0], [1, 0, 0]],
	[[0, 1, 0], [0, 1, 0], [0, 1, 0]],
	[[0, 0, 1], [0, 0, 1], [0, 0, 1]],
	[[1, 0, 0], [0, 1, 0], [0, 0, 1]],
]

interface ScratchResultLine {
	line: number[][];
	lineResult: ScratchSymbol[];
	symbol: ScratchSymbol;
}

function createScratch(setting: number): Scratch {
	const scratchTable = SettingLotTables[setting];
	const sum = scratchTable.reduce((a, b) => a + b.lot, 0);
	const gen = () => {
		let r = sum * Math.random();
		return scratchTable.find(v => {
			r -= v.lot;
			return r < 0
		})!.symbol;
	}

	return [
		[gen(), gen(), gen()],
		[gen(), gen(), gen()],
		[gen(), gen(), gen()]
	]
}

function getWinnings(symbolIdList: number[], bet: number): number {
	const scratch: Scratch = [] as any;
	for (let i = 0; i < 3; i++) {
		scratch.push(symbolIdList.slice(i * 3, i * 3 + 3).map(id => SymbolIdTable[id]) as any);
	}
	const hitList = HitCheck(scratch);
	let totalScore = 0;
	hitList.forEach(hit => {
		totalScore += SymbolHitPointTable[hit.symbol];
	});
	return bet === 0 ? totalScore : Math.floor(totalScore * (bet / 100));
}

function createScratchMessage(symbolIdList: number[], openSymbolIdList: number[], bet: number, userId: string, setting: number, isRare: boolean = false): InteractionReplyOptions {
	const rows: ActionRowBuilder<ButtonBuilder>[] = []
	const scratch: [
		Partial<Scratch[0]>,
		Partial<Scratch[1]>,
		Partial<Scratch[2]>
	] = [[], [], []];
	let scratchMessage = `<@${userId}> のねこちゃんズスクラッチくじ (掛金: ${bet}Pt)`;
	for (let y = 0; y < 3; y++) {
		const row = new ActionRowBuilder<ButtonBuilder>()
		rows.push(row);
		for (let x = 0; x < 3; x++) {
			let idx = 3 * y + x
			let symbolId = symbolIdList[idx];
			let symbol = SymbolIdTable[symbolId];
			let isOpen = openSymbolIdList.includes(idx);

			scratch[y][x] = symbol;

			row.addComponents(new ButtonBuilder()
				.setCustomId(`scratch-${bet}-${symbolIdList.join("")}-${openSymbolIdList.join("")}${idx}-${setting}-${isRare ? 1 : 0}-${userId}`)
				.setStyle(isOpen ? (symbol === "🤡" ? ButtonStyle.Danger : ButtonStyle.Secondary) : (isRare ? ButtonStyle.Success : ButtonStyle.Primary))
				.setDisabled(isOpen)
				.setEmoji(isOpen ? symbol : "⬜"));
		}
	}
	scratchMessage += "\n";

	if (symbolIdList.length === openSymbolIdList.length) {
		const hitList = HitCheck(scratch as Scratch);
		scratchMessage += `結果：\n`
		if (hitList.length === 0) {
			scratchMessage += `はずれ Boo😩`
		} else {
			scratchMessage += `あたり！🎉\n`;
			let totalScore = 0;
			let mergeLine = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
			hitList.forEach(hit => {
				let score = SymbolHitPointTable[hit.symbol];
				if (bet === 0) {
					scratchMessage += `${hit.symbol}   (${hit.lineResult.join("―")})   =>   ${score}Pt\n`
				} else {
					scratchMessage += `${hit.symbol}   (${hit.lineResult.join("―")})   =>   x${score / 100}\n`
				}
				totalScore += score;
				mergeLine = mergeLine.map((a, y) => {
					return a.map((v1, x) => v1 || hit.line[y][x])
				})
			})
			mergeLine.forEach((line, y) => {
				line.forEach((f, x) => {
					rows[y].components[x].setStyle(f ? ButtonStyle.Success : ButtonStyle.Secondary)
				})
			})
			if (bet === 0) {
				scratchMessage += `\n合計: ${totalScore}Pt`
			} else {
				const resultPoint = Math.floor(totalScore * (bet / 100));
				scratchMessage += `\n合計: ${resultPoint}Pt (${bet}Pt x ${totalScore / 100}倍)`
			}
		}
		const userPoints = getPoints(userId);
		scratchMessage += `\n所持ポイント: ${userPoints}Pt`;

		const retryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`scratchretry-${bet}`)
				.setLabel("もう一回！")
				.setStyle(ButtonStyle.Primary)
				.setEmoji("🔄")
		);
		rows.push(retryRow);

		return {
			components: rows,
			content: scratchMessage,
		}
	} else {
		return {
			components: rows,
			content: scratchMessage
		}
	}
}

function HitCheck(scratch: Scratch) {
	let lineResults = ScratchLines.map((lineTable) => {
		return scratch.flatMap((line, i1) => line.filter((v, i2) => lineTable[i1][i2]))
	})
	let checkResults = lineResults.map((lineResult, i): ScratchResultLine | null => {
		if (lineResult.every(s => s === "🤡")) return {
			line: ScratchLines[i],
			lineResult,
			symbol: "🤡"
		}
		let checkSymbol = lineResult.find(v => v !== "🤡")!;
		let isHit = lineResult.every(v => v === checkSymbol || v === "🤡");
		return !isHit ? null : {
			line: ScratchLines[i],
			lineResult,
			symbol: checkSymbol
		}
	})
	return checkResults.filter(v => v !== null) as ScratchResultLine[]
}

function isHotDay() {
	const now = new Date();
	const day = now.getDate();
	const month = now.getMonth() + 1;
	// 6の日 (6, 16, 26) または ゾロ目 (11, 22, または月=日)
	return day % 10 === 6 || day % 11 === 0 || day === month;
}

let lastNotificationDate = "";

export const ScratchRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("スクラッチくじを作成します。")
		.addIntegerOption(option =>
			option.setName("bet")
				.setDescription("賭けるポイントを指定します (100ptで等倍)")
				.setRequired(false)
				.setMinValue(0)
		)

	await rest.post(Routes.applicationCommands(applicationId), { body: command })


	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				if (!it.isChatInputCommand()) return;

				const bet = it.options.getInteger("bet") || 0;
				const userPoints = getPoints(it.user.id);

				if (bet > userPoints) {
					await it.reply({ content: `ポイントが足りません！ (現在の所持ポイント: ${userPoints}Pt)`, ephemeral: true });
					return;
				}

				if (bet > 0) {
					addPoints(it.user.id, -bet);
				}

				const hot = isHotDay();
				const rand = Math.random() * 100;
				let setting = 1;

				if (hot) {
					if (rand < 60) setting = 6;
					else if (rand < 75) setting = 1;
					else if (rand < 85) setting = 2;
					else if (rand < 93) setting = 3;
					else if (rand < 98) setting = 4;
					else setting = 5;
				} else {
					if (rand < 30) setting = 1;
					else if (rand < 55) setting = 2;
					else if (rand < 70) setting = 3;
					else if (rand < 80) setting = 4;
					else if (rand < 95) setting = 5;
					else setting = 6;
				}

				await it.deferReply();
				const scratch = createScratch(setting)
				const symbolIdList = scratch.flat().map(s => SymbolIdTable.findIndex(v => v === s));
				const rawScore = getWinnings(symbolIdList, 0);
				const isRare = rawScore >= 500 && Math.random() < 1 / 3;
				await it.followUp(createScratchMessage(symbolIdList, [], bet, it.user.id, setting, isRare))
			}

			if (it.isButton()) {
				if (it.customId.startsWith("scratchretry-")) {
					if (it.user.bot) {
						await it.reply({ content: "Botは参加できません。", ephemeral: true });
						return;
					}

					const bet = parseInt(it.customId.split("-")[1]);
					const userPoints = getPoints(it.user.id);

					if (bet > userPoints) {
						await it.reply({ content: `ポイントが足りません！ (現在の所持ポイント: ${userPoints}Pt)`, ephemeral: true });
						return;
					}

					if (bet > 0) {
						addPoints(it.user.id, -bet);
					}

					const hot = isHotDay();
					const rand = Math.random() * 100;
					let setting = 1;

					if (hot) {
						if (rand < 60) setting = 6;
						else if (rand < 75) setting = 1;
						else if (rand < 85) setting = 2;
						else if (rand < 93) setting = 3;
						else if (rand < 98) setting = 4;
						else setting = 5;
					} else {
						if (rand < 30) setting = 1;
						else if (rand < 55) setting = 2;
						else if (rand < 70) setting = 3;
						else if (rand < 80) setting = 4;
						else if (rand < 95) setting = 5;
						else setting = 6;
					}

					const scratch = createScratch(setting)
					const symbolIdList = scratch.flat().map(s => SymbolIdTable.findIndex(v => v === s));
					const rawScore = getWinnings(symbolIdList, 0);
					const isRare = rawScore >= 500 && Math.random() < 1 / 3;
					await it.reply(createScratchMessage(symbolIdList, [], bet, it.user.id, setting, isRare));
					return;
				}

				if (it.customId.startsWith("scratch-")) {
					const parts = it.customId.split("-");
					const bet = parseInt(parts[1]);
					const scratchIdList = [...parts[2]].map(s => parseInt(s));
					const openIdList = [...parts[3]].map(s => parseInt(s));
					const setting = parseInt(parts[4]);
					const isRare = parts[5] === "1";
					const ownerId = parts[6];

					const lastIdx = openIdList[openIdList.length - 1];
					const previousOpenIds = openIdList.slice(0, -1);
					if (previousOpenIds.includes(lastIdx)) {
						await it.deferUpdate();
						return;
					}

					if (openIdList.length === 9 && bet > 0) {
						const winnings = getWinnings(scratchIdList, bet);
						if (winnings > 0) {
							addPoints(ownerId, winnings);
						}
					}

					const scratchMessage = createScratchMessage(scratchIdList, openIdList, bet, ownerId, setting, isRare);

					await rest.post(Routes.interactionCallback(it.id, it.token), {
						body: {
							type: 7,
							data: scratchMessage
						}
					})
				}
			}
		},
		onClient(client) {
			setInterval(async () => {
				const now = new Date();
				const dateStr = now.toLocaleDateString("ja-JP");
				if (lastNotificationDate !== dateStr) {
					lastNotificationDate = dateStr;
					try {
						const user = await client.users.fetch("325529321483534337");
						if (user) {
							const hot = isHotDay();
							const message = hot 
								? `【スクラッチ告知】本日は 6の日 or ゾロ目 のため、設定6の投入率が 60% にアップしています！`
								: `【スクラッチ告知】本日は通常営業です。設定1の確率は約30%となっています。`;
							await user.send(message);
						}
					} catch (e) {
						console.error("Failed to send daily notification:", e);
					}
				}
			}, 1000 * 60 * 60); // 1時間ごとにチェック
		}
	}
}
