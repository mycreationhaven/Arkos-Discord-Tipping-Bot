import { config } from "./config.js";

async function api(params, method = "GET") {
  const body = new URLSearchParams(params);
  let res;
  if (method === "POST") {
    res = await fetch(config.nodeUrl, {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      body
    });
  } else {
    const url = `${config.nodeUrl}?${body}`;
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`Arkovia node HTTP ${res.status}`);
  const json = await res.json();
  if (json.errorDescription || json.errorMessage || json.errorCode) {
    throw new Error(json.errorDescription || json.errorMessage || `Arkovia error ${json.errorCode}`);
  }
  return json;
}

export async function getBalanceNqt(account) {
  const data = await api({requestType: "getBalance", account});
  return BigInt(data.balanceNQT || "0");
}

export async function validateAccount(account) {
  const value = String(account).trim().toUpperCase();
  if (!/^ARK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{5}$/.test(value)) {
    throw new Error("That does not look like a valid ARK account address.");
  }
  // Node-side validation without requiring the account to already have activity.
  await api({requestType: "getAccountId", account: value}).catch(() => null);
  return value;
}

export async function getAccountTransactions(account, firstIndex = 0, lastIndex = 99) {
  const data = await api({
    requestType: "getBlockchainTransactions",
    account,
    type: "0",
    subtype: "0",
    firstIndex: String(firstIndex),
    lastIndex: String(lastIndex)
  });

  return Array.isArray(data.transactions) ? data.transactions : [];
}

export async function sendMoney({recipient, amountNqt}) {
  if (!config.hotWalletSecretPhrase || !config.hotWalletAccount) {
    throw new Error("Withdrawals are not configured on this bot.");
  }
  const params = {
    requestType: "sendMoney",
    recipient,
    amountNQT: BigInt(amountNqt).toString(),
    feeNQT: config.withdrawFeeNqt.toString(),
    deadline: "1440",
    secretPhrase: config.hotWalletSecretPhrase,
    broadcast: "true"
  };
  return api(params, "POST");
}
