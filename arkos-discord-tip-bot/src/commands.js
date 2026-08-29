import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("arkos-start")
    .setDescription("Open your ARKOS Discord tipping account and receive the starting balance."),

  new SlashCommandBuilder()
    .setName("arkos-balance")
    .setDescription("Show your ARKOS Discord balance."),

  new SlashCommandBuilder()
    .setName("arkos-tip")
    .setDescription("Tip another Discord member using tiny ARKOS tip units.")
    .addUserOption(o => o.setName("user").setDescription("Member to tip").setRequired(true))
    .addIntegerOption(o => o.setName("units").setDescription("Tip units; 1 unit = 0.001 ARKOS by default").setRequired(true).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName("arkos-link")
    .setDescription("Set the ARK account that should receive your withdrawals.")
    .addStringOption(o => o.setName("account").setDescription("ARK-.... account address").setRequired(true)),

  new SlashCommandBuilder()
    .setName("arkos-withdraw")
    .setDescription("Withdraw ARKOS from your Discord balance to your linked ARK account.")
    .addStringOption(o => o.setName("amount").setDescription("ARKOS amount, e.g. 5 or 5.25").setRequired(true)),

  new SlashCommandBuilder()
    .setName("arkos-info")
    .setDescription("Explain ARKOS Discord tipping units and fees.")
].map(c => c.toJSON());
