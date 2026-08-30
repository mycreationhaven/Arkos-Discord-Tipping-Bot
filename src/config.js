import "dotenv/config";

export const NQT_PER_ARKOS = 100_000_000n;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function decimalToNqt(value) {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error(`Invalid ARKOS amount: ${value}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * NQT_PER_ARKOS + BigInt((frac + "00000000").slice(0, 8));
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  guildId: process.env.DISCORD_GUILD_ID || null,
  nodeUrl: process.env.ARKOVIA_NODE_URL || "http://127.0.0.1:7876/nxt",

  hotWalletAccount: process.env.ARKOS_HOT_WALLET_ACCOUNT || "",
  hotWalletSecretPhrase: process.env.ARKOS_HOT_WALLET_SECRET_PHRASE || "",
  faucetAccount: process.env.ARKOS_FAUCET_ACCOUNT || "ARK-73PZ-GB9A-5BP7-22UZU",

  startingBalanceNqt: decimalToNqt(process.env.STARTING_BALANCE_ARKOS || "10"),
  tipUnitNqt: BigInt(process.env.TIP_UNIT_NQT || "100000"), // 0.001 ARKOS
  withdrawMinNqt: decimalToNqt(process.env.WITHDRAW_MIN_ARKOS || "2"),
  withdrawFeeNqt: decimalToNqt(process.env.WITHDRAW_FEE_ARKOS || "1"),
  depositMinNqt: decimalToNqt(process.env.DEPOSIT_MIN_ARKOS || "5"),
  depositRequiredConfirmations: Number(process.env.DEPOSIT_REQUIRED_CONFIRMATIONS || "3"),
  depositScanIntervalSeconds: Number(process.env.DEPOSIT_SCAN_INTERVAL_SECONDS || "30"),
  dailyTipLimitNqt: decimalToNqt(process.env.DAILY_TIP_LIMIT_ARKOS || "2"),
  maxSingleTipUnits: BigInt(process.env.MAX_SINGLE_TIP_UNITS || "100"),
  admins: new Set((process.env.ADMIN_DISCORD_IDS || "").split(",").map(s => s.trim()).filter(Boolean))
};

export function formatArkos(nqt) {
  nqt = BigInt(nqt);
  const sign = nqt < 0n ? "-" : "";
  if (nqt < 0n) nqt = -nqt;
  const whole = nqt / NQT_PER_ARKOS;
  const frac = (nqt % NQT_PER_ARKOS).toString().padStart(8, "0").replace(/0+$/, "");
  return sign + whole.toString() + (frac ? "." + frac : "");
}

export { decimalToNqt };
