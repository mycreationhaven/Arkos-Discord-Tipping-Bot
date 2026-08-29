import Database from "better-sqlite3";
import { config } from "./config.js";

const db = new Database("arkos-tipbot.sqlite");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
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

export default db;
