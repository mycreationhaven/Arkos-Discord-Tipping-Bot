import { config, formatArkos } from "./config.js";
import { getAccountTransactions } from "./arkovia.js";
import {
  getDepositByTransaction,
  getDepositCodeOwner,
  recordDetectedDeposit,
  updateDepositConfirmations,
  creditDeposit
} from "./db.js";

let scanning = false;

function getPlainTextDepositCode(tx) {
  const attachment = tx?.attachment || {};

  // Ignore encrypted messages entirely.
  if (attachment.encryptedMessage) {
    return null;
  }

  const message = attachment.message;

  if (typeof message !== "string") {
    return null;
  }

  // Nxt/Arkovia may expose this as messageIsText.
  if (attachment.messageIsText === false) {
    return null;
  }

  const code = message.trim().toUpperCase();

  if (!/^ARK-\d{6}-\d{4}$/.test(code)) {
    return null;
  }

  return code;
}

async function processTransaction(tx) {
  try {
    if (!tx?.transaction) {
      return;
    }

    // Only ordinary payment transactions.
    if (Number(tx.type) !== 0 || Number(tx.subtype) !== 0) {
      return;
    }

    const recipient = String(tx.recipientRS || "").toUpperCase();
    const hotWallet = String(config.hotWalletAccount || "").toUpperCase();

    // Ignore withdrawals and every transaction not coming INTO the bot wallet.
    if (recipient !== hotWallet) {
      return;
    }

    const amountNqt = BigInt(tx.amountNQT || "0");

    // Ignore zero-value or below-minimum deposits.
    if (amountNqt < config.depositMinNqt) {
      return;
    }

    const depositCode = getPlainTextDepositCode(tx);

    // Missing, invalid, or encrypted deposit message.
    if (!depositCode) {
      return;
    }

    const owner = getDepositCodeOwner(depositCode);

    // Never credit an unknown deposit code.
    if (!owner?.discord_id) {
      return;
    }

    const confirmations = Number(tx.confirmations || 0);
    const blockHeight =
      tx.height !== undefined && tx.height !== null
        ? Number(tx.height)
        : null;

    const existing = getDepositByTransaction(tx.transaction);

    if (!existing) {
      recordDetectedDeposit({
        transactionId: tx.transaction,
        fullHash: tx.fullHash || null,
        senderAccount: tx.senderRS || null,
        recipientAccount: tx.recipientRS,
        discordId: owner.discord_id,
        depositCode,
        amountNqt: amountNqt.toString(),
        confirmations,
        blockHeight
      });
    } else if (existing.status !== "CREDITED") {
      updateDepositConfirmations(
        tx.transaction,
        confirmations,
        blockHeight
      );
    }

    if (confirmations < config.depositRequiredConfirmations) {
      return;
    }

    const result = creditDeposit(tx.transaction);

    if (result?.credited) {
      console.log(
        `ARKOS deposit credited: ${formatArkos(amountNqt)} ARKOS ` +
        `(tx ${tx.transaction}, confirmations ${confirmations})`
      );
    }
  } catch (error) {
    console.error(
      `Deposit scanner transaction error ${tx?.transaction || "unknown"}:`,
      error
    );
  }
}

export async function scanDeposits() {
  if (scanning) {
    return;
  }

  scanning = true;

  try {
    const transactions = await getAccountTransactions(
      config.hotWalletAccount,
      0,
      99
    );

    for (const tx of transactions) {
      await processTransaction(tx);
    }
  } catch (error) {
    console.error("ARKOS deposit scan failed:", error);
  } finally {
    scanning = false;
  }
}

export function startDepositScanner() {
  console.log(
    `ARKOS deposit scanner started: every ${config.depositScanIntervalSeconds}s, ` +
    `${config.depositRequiredConfirmations} confirmations required`
  );

  // Run immediately at startup.
  scanDeposits().catch(error => {
    console.error("Initial ARKOS deposit scan failed:", error);
  });

  setInterval(() => {
    scanDeposits().catch(error => {
      console.error("ARKOS deposit scan failed:", error);
    });
  }, config.depositScanIntervalSeconds * 1000);
}
