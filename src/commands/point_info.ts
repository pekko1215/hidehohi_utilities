import { REST } from "@discordjs/rest";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { Routes } from "discord.js";

const descriptions: { name: string; description: string }[] = [
	{
		name: "/channel_points",
		description: "現在の所持ポイントを確認します。チャット送信で15Pt、ボイスチャット参加で5分ごとに50Pt獲得できます。"
	},
	{
		name: "/ranking",
		description: "ポイントランキング(TOP 10)を表示します。"
	},
	{
		name: "/send",
		description: "他のユーザーにポイントを送金します。`user`で送金先、`amount`で金額を指定します。"
	},
	{
		name: "/scratch",
		description: "スクラッチくじを引きます。`bet`で賭け金を指定(100Ptで等倍)。6の日・ゾロ目は高設定率アップ。\n配当倍率: 🍅x1.0 🐈x1.5 🍖x2.0 🍣x3.0 💎x6.0 🎰x10.0 🤡x20.0\n3×3マスの8ライン(横3・縦3・斜め2)が揃うと配当を獲得。🤡は全役との互換役。"
	},
	{
		name: "/pachislot",
		description: "パチスロを回します。`bet`で掛け金を指定(3枚掛けで消費)。ボーナス成立時は花が点灯。\n小役配当(bet倍): リプレイ x3 / ベル x6 / スイカ x12 / チェリー x4\nボーナス配当(bet倍): ピンク7揃い x720 / 白7揃い x360 / 7+BAR x120"
	},
	{
		name: "/bet",
		description: "2択のかけを作成します。`title`・`option_a`・`option_b`を指定。他のユーザーが賭けに参加でき、主催者は受付終了後に結果を確定。手数料5%がプールから差し引かれ主催者へ付与され、残りが勝者に配当されます。"
	},
	{
		name: "/video_slot",
		description: "ビデオスロットを回します。`bet`で掛け金を指定。3リール・5ライン(横3・斜め2)。\n絵柄配当(bet倍): GOD x50 / TheKuru x30 / LEDX x15 / ascendant1 x10 / twitter x7 / ornament x4 / MarshmaoYummy x2\n5ラインのいずれかに3揃いで配当獲得。\nペッシ図柄: 左1/16→中1/4→右1/2。3揃いでペッシボーナス(8G)突入。\nボーナス中は各リールSTOPボタンで停止。レインボーペッシ(1/12)でバフ発生。"
	}
];

export const PointInfoRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const command = new SlashCommandBuilder()
		.setName(path.basename(__filename).split(".")[0])
		.setDescription("ポイント関連コマンドの説明を表示します。");

	await rest.post(Routes.applicationCommands(applicationId), { body: command });

	return {
		description: command.description,
		name: command.name,
		async onHandler(it) {
			if (!it.isCommand() || it.commandName !== command.name) return;

			let content = "💰 **ポイント関連コマンド一覧** 💰\n\n";
			for (const d of descriptions) {
				content += `**${d.name}**\n${d.description}\n\n`;
			}

			await it.reply(content);
		}
	};
};
