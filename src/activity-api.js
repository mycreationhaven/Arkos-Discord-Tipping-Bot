import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import db from "./db.js";
import { formatArkos } from "./config.js";

const host = process.env.ACTIVITY_API_HOST || "127.0.0.1";
const port = Number(process.env.ACTIVITY_API_PORT || "4880");
const apiToken = process.env.ARKOS_DISCORD_API_TOKEN || "";

function authorized(req) {
  if (!apiToken) return false;

  const auth = req.headers.authorization || "";
  const expected = `Bearer ${apiToken}`;

  const a = Buffer.from(auth);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  res.end(JSON.stringify(body));
}

function getRecentActivity(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const rows = db.prepare(`
    SELECT
      l.id,
      l.type,
      l.from_discord_id,
      l.to_discord_id,
      l.amount_nqt,
      l.metadata_json,
      l.created_at,
      fu.discord_name AS sender_name,
      tu.discord_name AS recipient_name
    FROM ledger l
    LEFT JOIN users fu ON fu.discord_id = l.from_discord_id
    LEFT JOIN users tu ON tu.discord_id = l.to_discord_id
    WHERE l.type IN ('TIP', 'START_BONUS', 'DEPOSIT')
    ORDER BY l.id DESC
    LIMIT ?
  `).all(safeLimit);

  const activity = rows.map(row => {
    let metadata = {};

    try {
      metadata = row.metadata_json
        ? JSON.parse(row.metadata_json)
        : {};
    } catch {
      metadata = {};
    }

    if (row.type === "TIP") {
      return {
        id: `ledger-${row.id}`,
        type: "TIP",
        timestamp: row.created_at,
        amountARKOS: formatArkos(row.amount_nqt),
        tipUnits: metadata.units ? Number(metadata.units) : null,
        senderDisplayName: row.sender_name || "ARKOS Member",
        recipientDisplayName: row.recipient_name || "ARKOS Member",
        network: "Discord",
        settlement: "OFF_CHAIN",
        transactionId: null
      };
    }

   if (row.type === "DEPOSIT") {
     return {
       id: `ledger-${row.id}`,
       type: "DEPOSIT",
       timestamp: row.created_at,
       amountARKOS: formatArkos(row.amount_nqt),
       senderDisplayName: null,
       recipientDisplayName: row.recipient_name || "ARKOS Member",
       senderArkAddress: metadata.senderAccount || null,
       network: "Arkovia",
       settlement: "ON_CHAIN",
       transactionId: metadata.transactionId || null,
       fullHash: metadata.fullHash || null
  };
}


    return {
      id: `ledger-${row.id}`,
      type: "NEW_MEMBER",
      timestamp: row.created_at,
      amountARKOS: formatArkos(row.amount_nqt),
      senderDisplayName: null,
      recipientDisplayName: row.recipient_name || "ARKOS Member",
      network: "Discord",
      settlement: "OFF_CHAIN",
      transactionId: null
    };
  });

  const withdrawals = db.prepare(`
    SELECT
      w.id,
      w.discord_id,
      w.account_rs,
      w.amount_nqt,
      w.network_fee_nqt,
      w.transaction_id,
      w.full_hash,
      w.status,
      w.created_at,
      u.discord_name
    FROM withdrawals w
    LEFT JOIN users u ON u.discord_id = w.discord_id
    WHERE w.status = 'BROADCAST'
    ORDER BY w.id DESC
    LIMIT ?
  `).all(safeLimit);

  for (const row of withdrawals) {
    activity.push({
      id: `withdrawal-${row.id}`,
      type: "WITHDRAWAL",
      timestamp: row.created_at,
      amountARKOS: formatArkos(row.amount_nqt),
      networkFeeARKOS: formatArkos(row.network_fee_nqt),
      senderDisplayName: row.discord_name || "ARKOS Member",
      recipientArkAddress: row.account_rs,
      network: "Arkovia",
      settlement: "ON_CHAIN",
      transactionId: row.transaction_id || null,
      fullHash: row.full_hash || null
    });
  }

  activity.sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp))
  );

  return activity.slice(0, safeLimit);
}

export function startActivityApi() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || host}`);

      if (req.method !== "GET") {
        return sendJson(res, 405, {
          success: false,
          error: "Method not allowed"
        });
      }

      if (url.pathname === "/health") {
        return sendJson(res, 200, {
          success: true,
          service: "ARKOS Discord Activity API"
        });
      }

      if (url.pathname !== "/api/public/activity") {
        return sendJson(res, 404, {
          success: false,
          error: "Not found"
        });
      }

      if (!authorized(req)) {
        return sendJson(res, 401, {
          success: false,
          error: "Unauthorized"
        });
      }

      const limit = url.searchParams.get("limit") || 50;

      return sendJson(res, 200, {
        success: true,
        generatedAt: new Date().toISOString(),
        activity: getRecentActivity(limit)
      });
    } catch (err) {
      console.error("Activity API error:", err.message);

      return sendJson(res, 500, {
        success: false,
        error: "Internal server error"
      });
    }
  });

  server.listen(port, host, () => {
    console.log(`ARKOS activity API listening on http://${host}:${port}`);
  });

  return server;
}
