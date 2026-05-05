import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { ApplicationCommandData, Interaction, Client } from "discord.js";

export interface CommandHandler {
    name: string;
    description: string;
    onHandler: (interaction: Interaction) => void;
    onClient?: (client: Client) => void;
}

export type CommandRegister = (rest: REST, applicationId: string) => Promise<CommandHandler>;