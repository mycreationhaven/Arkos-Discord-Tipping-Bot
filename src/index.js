import { Client, GatewayIntentBits } from "discord.js";
import { config, formatArkos, decimalToNqt } from "./config.js";
import {
  getOrCreateUser, getUser, setWithdrawalAccount, transferTip, tippedTodayNqt,
  createWithdrawal, debitForWithdrawal, refundWithdrawal, completeWithdrawal,
  getOrCreateDepositCode
} from "./db.js";
import { validateAccount, sendMoney } from "./arkovia.js";
import { startActivityApi } from "./activity-api.js";
import { startDepositScanner } from "./deposit-scanner.js";


const client = new Client({intents: [GatewayIntentBits.Guilds]});

client.once("ready", () => {
  console.log(`ARKOS tip bot logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const memberName = interaction.user.globalName || interaction.user.username;

    if (interaction.commandName === "arkos-start") {
      const before = getUser(interaction.user.id);
      const user = getOrCreateUser(interaction.user.id, memberName);
      const created = !before;
      return interaction.reply({
        ephemeral: true,
        content: created
          ? `🌐 Your ARKOS tipping account is ready. Starting balance: **${formatArkos(user.balance_nqt)} ARKOS**.`
          : `Your ARKOS tipping account already exists. Balance: **${formatArkos(user.balance_nqt)} ARKOS**.`
      });
    }

    if (interaction.commandName === "arkos-balance") {
      const user = getOrCreateUser(interaction.user.id, memberName);
      return interaction.reply({
        ephemeral: true,
        content: `💠 Discord balance: **${formatArkos(user.balance_nqt)} ARKOS**`
      });
    }

    if (interaction.commandName === "arkos-tip") {
      const recipientDiscord = interaction.options.getUser("user", true);
      const units = BigInt(interaction.options.getInteger("units", true));
      if (recipientDiscord.bot) throw new Error("Bots cannot receive ARKOS tips.");
      if (units > config.maxSingleTipUnits) throw new Error("Tip exceeds the per-tip unit limit.");

      getOrCreateUser(interaction.user.id, memberName);
      getOrCreateUser(recipientDiscord.id, recipientDiscord.globalName || recipientDiscord.username);

      const amountNqt = units * config.tipUnitNqt;
      const today = tippedTodayNqt(interaction.user.id);
      if (today + amountNqt > config.dailyTipLimitNqt) {
        throw new Error(`Daily tipping limit is ${formatArkos(config.dailyTipLimitNqt)} ARKOS.`);
      }

      transferTip(interaction.user.id, recipientDiscord.id, amountNqt, {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        units: units.toString()
      });

      return interaction.reply(
        `✨ <@${interaction.user.id}> tipped <@${recipientDiscord.id}> **${units} tip unit${units === 1n ? "" : "s"}** ` +
        `(**${formatArkos(amountNqt)} ARKOS**).`
      );
    }

    if (interaction.commandName === "arkos-link") {
      getOrCreateUser(interaction.user.id, memberName);
      const account = await validateAccount(interaction.options.getString("account", true));
      setWithdrawalAccount(interaction.user.id, account);
      return interaction.reply({ephemeral: true, content: `🔗 Withdrawal account set to **${account}**.`});
    }


if (interaction.commandName === "arkos-deposit") {
  getOrCreateUser(interaction.user.id, memberName);

  const deposit = getOrCreateDepositCode(interaction.user.id);

  return interaction.reply({
    ephemeral: true,
    content:
      `💠 **ARKOS Deposit Instructions**\n\n` +
      `Send ARKOS to:\n` +
      `**${config.hotWalletAccount}**\n\n` +
      `📝 **Required Deposit Code:**\n` +
      `**${deposit.deposit_code}**\n\n` +
      `⚠️ **IMPORTANT — SEND THE DEPOSIT CODE AS A PUBLIC/PLAIN-TEXT MESSAGE.**\n` +
      `**DO NOT encrypt the message.** The ARKOS Tip Bot must be able to read the deposit code from the blockchain to identify and automatically credit your Discord account.\n\n` +
      `Minimum deposit: **${formatArkos(config.depositMinNqt)} ARKOS**\n` +
      `Required confirmations: **${config.depositRequiredConfirmations}**\n\n` +
      `After the required confirmations, your ARKOS Discord balance will be credited automatically.\n\n` +
      `❗ Deposits with a missing, incorrect, or encrypted deposit code cannot be automatically credited.`
  });
}


    if (interaction.commandName === "arkos-withdraw") {
      await interaction.deferReply({ephemeral: true});
      const user = getOrCreateUser(interaction.user.id, memberName);
      if (!user.withdrawal_account) throw new Error("Use /arkos-link before withdrawing.");

      const gross = decimalToNqt(interaction.options.getString("amount", true));
      if (gross < config.withdrawMinNqt) {
        throw new Error(`Minimum withdrawal is ${formatArkos(config.withdrawMinNqt)} ARKOS.`);
      }
      if (gross <= config.withdrawFeeNqt) {
        throw new Error("Withdrawal must be greater than the network fee.");
      }

      // User requests a gross debit. The network fee is paid from that gross amount:
      // gross 5 ARKOS -> 4 ARKOS sent + 1 ARKOS network fee.
      const sendAmount = gross - config.withdrawFeeNqt;
      debitForWithdrawal(interaction.user.id, gross);
      const wid = createWithdrawal(interaction.user.id, user.withdrawal_account, sendAmount, config.withdrawFeeNqt);

      try {
        const tx = await sendMoney({recipient: user.withdrawal_account, amountNqt: sendAmount});
        completeWithdrawal(wid, tx.transaction, tx.fullHash);
        return interaction.editReply(
          `✅ Withdrawal broadcast. **${formatArkos(sendAmount)} ARKOS** sent to **${user.withdrawal_account}** ` +
          `with **${formatArkos(config.withdrawFeeNqt)} ARKOS** network fee.` +
          (tx.transaction ? ` Transaction: \`${tx.transaction}\`` : "")
        );
      } catch (err) {
        refundWithdrawal(interaction.user.id, gross, wid, err.message);
        throw err;
      }
    }

    if (interaction.commandName === "arkos-info") {
      return interaction.reply({
        ephemeral: true,
        content:
          `**ARKOS Discord Tipping**\n` +
          `• New users start with **${formatArkos(config.startingBalanceNqt)} ARKOS** of backed Discord balance.\n` +
          `• **1 tip unit = ${formatArkos(config.tipUnitNqt)} ARKOS** (${config.tipUnitNqt.toString()} NQT).\n` +
          `• Tips are internal ledger transfers, so micro-tips do not pay an on-chain fee each time.\n` +
          `• On-chain withdrawals currently use a **${formatArkos(config.withdrawFeeNqt)} ARKOS** network fee.\n` +
          `• 1 ARKOS = 100,000,000 NQT; the smallest representable amount is 0.00000001 ARKOS.`
      });
    }
  } catch (err) {
    const message = `⚠️ ${err.message || "Something went wrong."}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ephemeral: true, content: message}).catch(() => {});
    }
  }
});

startActivityApi();
startDepositScanner();

client.login(config.discordToken);
