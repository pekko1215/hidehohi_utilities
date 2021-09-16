import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { ApplicationCommandData, Message, MessageType, } from "discord.js";
import { CommandRegister, CommandHandler } from "../typeings/command";
import path from "path";
import { RawMessageData } from "discord.js/typings/rawDataTypes";

export const TweetLinkRegister: CommandRegister = async (rest: REST, applicationId: string): Promise<CommandHandler> => {
	const commandData: ApplicationCommandData = {
		name: path.basename(__filename).split(".")[0],
		type: 3,
	}
	let resp = await rest.post(Routes.applicationCommands(applicationId), { body: commandData })

	return {
		description: "Twitterへのリンクを生成します。",
		name: commandData.name,
		async onHandler(it) {
			if (!it.isContextMenu()) return;
			if (it.commandName !== commandData.name) return;
			const message = await rest.get(Routes.channelMessage(it.channelId, it.targetId)) as RawMessageData;

			const messageUrl = `https://discord.com/channels/${it.guildId}/${it.channelId}/${it.targetId}`
			const { content, author } = message;
			const { username } = author;
			const slicedContent = content.length + username.length > 120 ? content.slice(0, 120 - username.length) + "..." : content;
			const tweetText = `${username}「` + slicedContent + "」\n" + messageUrl;
			const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`
			it.reply(tweetUrl)
		}
	}
}