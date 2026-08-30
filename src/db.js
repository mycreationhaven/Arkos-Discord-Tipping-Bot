import Database from "better-sqlite3";
import { config } from "./config.js";

const db = new Database("arkos-tipbot.sqlite");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`

CREATE TABLE IF NOT EXISTS deposit_codes (
  discord_id TEXT PRIMARY KEY,
  deposit_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  full_hash TEXT,
  sender_account TEXT,
  recipient_account TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  deposit_code TEXT NOT NULL,
  amount_nqt TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DETECTED',
  block_height INTEGER,
  credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_discord_id
ON deposits(discord_id);

CREATE INDEX IF NOT EXISTS idx_deposits_status
ON deposits(status);


CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  discord_name TEXT NOT NULL,
  balance_nqt TEXT NOT NULL,
  withdrawal_account TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  from_discord_id TEXT,
  to_discord_id TEXT,
  amount_nqt TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  account_rs TEXT NOT NULL,
  amount_nqt TEXT NOT NULL,
  network_fee_nqt TEXT NOT NULL,
  transaction_id TEXT,
  full_hash TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_from_created ON ledger(from_discord_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_to_created ON ledger(to_discord_id, created_at);
`);

const getUserStmt = db.prepare("SELECT * FROM users WHERE discord_id = ?");
const createUserStmt = db.prepare(`
  INSERT INTO users(discord_id, discord_name, balance_nqt)
  VALUES (?, ?, ?)
`);
const updateNameStmt = db.prepare(`
  UPDATE users SET discord_name=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?
`);

export function getOrCreateUser(discordId, discordName) {
  let user = getUserStmt.get(discordId);
  if (!user) {
    createUserStmt.run(discordId, discordName, config.startingBalanceNqt.toString());
    db.prepare(`
      INSERT INTO ledger(type, to_discord_id, amount_nqt, metadata_json)
      VALUES('START_BONUS', ?, ?, ?)
    `).run(discordId, config.startingBalanceNqt.toString(), JSON.stringify({source: config.faucetAccount}));
    user = getUserStmt.get(discordId);
  } else if (user.discord_name !== discordName) {
    updateNameStmt.run(discordName, discordId);
    user = getUserStmt.get(discordId);
  }
  return user;
}

export function getUser(discordId) {
  return getUserStmt.get(discordId);
}

export function setWithdrawalAccount(discordId, accountRs) {
  db.prepare(`
    UPDATE users SET withdrawal_account=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?
  `).run(accountRs, discordId);
}

export const transferTip = db.transaction((fromId, toId, amountNqt, metadata = {}) => {
  if (fromId === toId) throw new Error("You cannot tip yourself.");
  const from = getUserStmt.get(fromId);
  const to = getUserStmt.get(toId);
  if (!from || !to) throw new Error("Both users must be registered.");
  const amount = BigInt(amountNqt);
  const fromBalance = BigInt(from.balance_nqt);
  if (amount <= 0n) throw new Error("Tip must be positive.");
  if (fromBalance < amount) throw new Error("Insufficient ARKOS balance.");

  db.prepare("UPDATE users SET balance_nqt=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?")
    .run((fromBalance - amount).toString(), fromId);
  db.prepare("UPDATE users SET balance_nqt=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?")
    .run((BigInt(to.balance_nqt) + amount).toString(), toId);
  db.prepare(`
    INSERT INTO ledger(type, from_discord_id, to_discord_id, amount_nqt, metadata_json)
    VALUES('TIP', ?, ?, ?, ?)
  `).run(fromId, toId, amount.toString(), JSON.stringify(metadata));
});

export function tippedTodayNqt(discordId) {
  const rows = db.prepare(`
    SELECT amount_nqt FROM ledger
    WHERE type='TIP'
      AND from_discord_id=?
      AND created_at >= datetime('now','start of day')
  `).all(discordId);
  return rows.reduce((sum, r) => sum + BigInt(r.amount_nqt), 0n);
}

export function totalLiabilitiesNqt() {
  const rows = db.prepare("SELECT balance_nqt FROM users").all();
  return rows.reduce((sum, r) => sum + BigInt(r.balance_nqt), 0n);
}

export function createWithdrawal(discordId, accountRs, amountNqt, networkFeeNqt) {
  const info = db.prepare(`
    INSERT INTO withdrawals(discord_id, account_rs, amount_nqt, network_fee_nqt, status)
    VALUES(?, ?, ?, ?, 'PROCESSING')
  `).run(discordId, accountRs, amountNqt.toString(), networkFeeNqt.toString());
  return Number(info.lastInsertRowid);
}

export const debitForWithdrawal = db.transaction((discordId, amountNqt) => {
  const user = getUserStmt.get(discordId);
  if (!user) throw new Error("User not registered.");
  const balance = BigInt(user.balance_nqt);
  const amount = BigInt(amountNqt);
  if (balance < amount) throw new Error("Insufficient balance.");
  db.prepare("UPDATE users SET balance_nqt=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?")
    .run((balance - amount).toString(), discordId);
});

export const refundWithdrawal = db.transaction((discordId, amountNqt, withdrawalId, error) => {
  const user = getUserStmt.get(discordId);
  db.prepare("UPDATE users SET balance_nqt=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?")
    .run((BigInt(user.balance_nqt) + BigInt(amountNqt)).toString(), discordId);
  db.prepare(`
    UPDATE withdrawals SET status='FAILED', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(String(error).slice(0, 500), withdrawalId);
});

export function completeWithdrawal(withdrawalId, txId, fullHash) {
  db.prepare(`
    UPDATE withdrawals
    SET status='BROADCAST', transaction_id=?, full_hash=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(txId || null, fullHash || null, withdrawalId);
}


function makeDepositCode(discordId) {
  const cleaned = String(discordId).replace(/\D/g, "");
  const tail = cleaned.slice(-6).padStart(6, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ARK-${tail}-${random}`;
}

export function getOrCreateDepositCode(discordId) {
  const existing = db.prepare(`
    SELECT * FROM deposit_codes WHERE discord_id=?
  `).get(discordId);

  if (existing) return existing;

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeDepositCode(discordId);

    try {
      db.prepare(`
        INSERT INTO deposit_codes(discord_id, deposit_code)
        VALUES(?, ?)
      `).run(discordId, code);

      return db.prepare(`
        SELECT * FROM deposit_codes WHERE discord_id=?
      `).get(discordId);
    } catch (err) {
      if (!String(err.message).includes("UNIQUE")) throw err;
    }
  }

  throw new Error("Could not generate a unique deposit code.");
}

export function getDepositCode(discordId) {
  return db.prepare(`
    SELECT * FROM deposit_codes WHERE discord_id=?
  `).get(discordId);
}

export function getDepositCodeOwner(depositCode) {
  return db.prepare(`
    SELECT * FROM deposit_codes WHERE deposit_code=?
  `).get(depositCode);
}

export function getDepositByTransaction(transactionId) {
  return db.prepare(`
    SELECT * FROM deposits WHERE transaction_id=?
  `).get(transactionId);
}

export function recordDetectedDeposit({
  transactionId,
  fullHash = null,
  senderAccount = null,
  recipientAccount,
  discordId,
  depositCode,
  amountNqt,
  confirmations = 0,
  blockHeight = null
}) {
  db.prepare(`
    INSERT OR IGNORE INTO deposits(
      transaction_id,
      full_hash,
      sender_account,
      recipient_account,
      discord_id,
      deposit_code,
      amount_nqt,
      confirmations,
      status,
      block_height
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'DETECTED', ?)
  `).run(
    transactionId,
    fullHash,
    senderAccount,
    recipientAccount,
    discordId,
    depositCode,
    amountNqt.toString(),
    confirmations,
    blockHeight
  );

  return getDepositByTransaction(transactionId);
}

export function updateDepositConfirmations(
  transactionId,
  confirmations,
  blockHeight = null
) {
  db.prepare(`
    UPDATE deposits
    SET confirmations=?,
        block_height=COALESCE(?, block_height),
        updated_at=CURRENT_TIMESTAMP
    WHERE transaction_id=?
  `).run(confirmations, blockHeight, transactionId);
}

export const creditDeposit = db.transaction((transactionId) => {
  const deposit = db.prepare(`
    SELECT * FROM deposits WHERE transaction_id=?
  `).get(transactionId);

  if (!deposit) {
    throw new Error("Deposit not found.");
  }

  if (deposit.status === "CREDITED") {
    return {
      credited: false,
      deposit
    };
  }

  const user = getUserStmt.get(deposit.discord_id);

  if (!user) {
    throw new Error("Deposit Discord user is not registered.");
  }

  const amount = BigInt(deposit.amount_nqt);
  const currentBalance = BigInt(user.balance_nqt);

  db.prepare(`
    UPDATE users
    SET balance_nqt=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE discord_id=?
  `).run(
    (currentBalance + amount).toString(),
    deposit.discord_id
  );

  db.prepare(`
    INSERT INTO ledger(
      type,
      to_discord_id,
      amount_nqt,
      metadata_json
    )
    VALUES('DEPOSIT', ?, ?, ?)
  `).run(
    deposit.discord_id,
    deposit.amount_nqt,
    JSON.stringify({
      transactionId: deposit.transaction_id,
      fullHash: deposit.full_hash,
      senderAccount: deposit.sender_account,
      depositCode: deposit.deposit_code
    })
  );

  db.prepare(`
    UPDATE deposits
    SET status='CREDITED',
        credited_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    WHERE transaction_id=?
  `).run(transactionId);

  return {
    credited: true,
    deposit: db.prepare(`
      SELECT * FROM deposits WHERE transaction_id=?
    `).get(transactionId)
  };
});

export function listPendingDeposits() {
  return db.prepare(`
    SELECT *
    FROM deposits
    WHERE status='DETECTED'
    ORDER BY id ASC
  `).all();
}

export default db;
