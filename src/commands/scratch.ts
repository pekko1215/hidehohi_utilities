import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders"
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { InteractionReplyOptions, ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes } from "discord.js";

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
const SymbolLotTable: Record<string, {
	lot: number;
	symbol: ScratchSymbol
}[]> = {
	"normal": [
		{ lot: 1 / 3, symbol: "🐈" },
		{ lot: 1 / 3, symbol: "🍅" },
		{ lot: 1 / 5, symbol: "🍖" },
		{ lot: 1 / 5, symbol: "🍣" },
		{ lot: 1 / 8, symbol: "💎" },
		{ lot: 1 / 8, symbol: "🎰" },
		{ lot: 1 / 12, symbol: "🤡" }
	]
}

const SymbolHitPointTable: { [key in ScratchSymbol]: number } = {
	"🍅": 500,
	"🐈": 800,
	"🍖": 1000,
	"🍣": 1500,
	"💎": 3000,
	"🎰": 5000,
	"🤡": 10000
}

const ScratchLines = [
	[[1, 1, 1],
	[0, 0, 0],
	[0, 0, 0]],

	[[0, 0, 0],
	[1, 1, 1],
	[0, 0, 0]],

	[[0, 0, 0],
	[0, 0, 0],
	[1, 1, 1]],

	[[0, 0, 1],
	[0, 1, 0],
	[1, 0, 0]],

	[[1, 0, 0],
	[1, 0, 0],
	[1, 0, 0]],

	[[0, 1, 0],
	[0, 1, 0],
	[0, 1, 0]],

	[[0, 0, 1],
	[0, 0, 1],
	[0, 0, 1]],

	[[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1]],
]

interface ScratchResultLine {
	line: number[][];
	lineResult: ScratchSymbol[];
	symbol: ScratchSymbol;
}

function createScratch(scratchTable: { lot: number, symbol: ScratchSymbol }[]): Scratch {
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

function createScratchMessage(symbolIdList: number[], openSymbolIdList: number[]): InteractionReplyOptions {
	const rows: ActionRowBuilder<ButtonBuilder>[] = []
	const scratch: [
		Partial<Scratch[0]>,
		Partial<Scratch[1]>,
		Partial<Scratch[2]>
	] = [[], [], []];
	let scratchMessage = "ねこちゃんズスクラッチくじ";
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
				.setCustomId("scratch-" + symbolIdList.join("") + "-" + openSymbolIdList.join("") + idx)
				.setStyle(isOpen ? symbol === "🤡" ? ButtonStyle.Danger : ButtonStyle.Secondary : ButtonStyle.Primary)
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
			let resultPoint = 0;
			let mergeLine = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
			hitList.forEach(hit => {
				let pt = SymbolHitPointTable[hit.symbol];
				scratchMessage += `${hit.symbol}   (${hit.lineResult.join("―")})   =>   ${pt}Pt\n`
				resultPoint += pt;
				mergeLine = mergeLine.map((a, y) => {
					return a.map((v1, x) => v1 || hit.line[y][x])
				})
			})
			mergeLine.forEach((line, y) => {
				line.forEach((f, x) => {
					rows[y].components[x].setStyle(f ? ButtonStyle.Success : ButtonStyle.Secondary)
				})
			})
			scratchMessage += `\n合計: ${resultPoint}Pt`
		}
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


export const ScratchRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("スクラッチくじを作成します。")

	await rest.post(Routes.applicationCommands(applicationId), { body: command })


	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (it.isCommand()) {
				if (it.commandName !== command.name) return;
				await it.deferReply();
				const scratch = createScratch(SymbolLotTable.normal)
				await it.followUp(createScratchMessage(scratch.flat().map(s => SymbolIdTable.findIndex(v => v === s)), []))
			}

			if (it.isButton()) {
				const match = it.customId.match(/^scratch-(\d+)-(\d+)$/)
				if (!match) return;
				const [_, scratchIdStr, opendIdStr] = match;
				const scratchIdList = [...scratchIdStr].map(s => parseInt(s));
				const openIdList = [...opendIdStr].map(s => parseInt(s));
				const openedSymbol = SymbolIdTable[scratchIdList[openIdList[openIdList.length - 1]]];
				const scratchMessage = createScratchMessage(scratchIdList, openIdList);
				await rest.post(Routes.interactionCallback(it.id, it.token), {
					body: {
						type: 7,
						data: scratchMessage
					}
				})
				// await rest.patch(Routes.channelMessage(it.channelId!, it.message.id), {
				//     body: scratchMessage
				// })
			}
		}
	}
}