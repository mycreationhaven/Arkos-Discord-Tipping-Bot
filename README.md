# ARKOS Discord Tip Bot

A Discord tipping bot for the Arkovia blockchain and ARKOS digital economy.

## Important economic design

The Arkovia source defines:

- `COIN_SYMBOL = "ARKOS"`
- `ACCOUNT_PREFIX = "ARK"`
- `ONE_NXT = 100000000`

Therefore:

- 1 ARKOS = 100,000,000 NQT
- 0.001 ARKOS = 100,000 NQT
- smallest representable amount = 0.00000001 ARKOS = 1 NQT

However, the ordinary transaction default fee in the current chain source is 1 ARKOS. Sending every 0.001 ARKOS Discord tip as a blockchain transaction would therefore be wasteful.

This bot uses an internal, auditable SQLite ledger for Discord micro-tips. Blockchain settlement happens only on withdrawal.

## Recommended treasury model

**Do not put the secret phrase for `ARK-73PZ-GB9A-5BP7-22UZU` on the Discord bot server.**

Treat that account as the funding/faucet source. Create a separate dedicated ARKOS bot hot wallet, fund it from the faucet with a limited operating balance, and put only the bot hot-wallet secret phrase in the protected environment configuration.

That limits loss if the Discord bot host is compromised.

## Defaults

- New-user starting balance: 10 ARKOS
- 1 Discord tip unit: 0.001 ARKOS
- Maximum single tip: 100 units = 0.1 ARKOS
- Daily outgoing tipping limit: 2 ARKOS
- Minimum withdrawal: 2 ARKOS
- Network withdrawal fee: 1 ARKOS

All values are configurable in `.env`.

## Commands

- `/arkos-start`
- `/arkos-balance`
- `/arkos-tip @user units`
- `/arkos-link ARK-...`
- `/arkos-withdraw amount`
- `/arkos-info`

Example:

`/arkos-tip @Alex 1`

transfers 1 tip unit, equal to **0.001 ARKOS**, internally.

## Install

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
```

Create a Discord application/bot in the Discord Developer Portal, add its token/client ID to `.env`, and configure the Arkovia node URL.

If hosted on the same trusted server as the Arkovia node:

```env
ARKOVIA_NODE_URL=http://127.0.0.1:7876/nxt
```

Register commands:

```bash
npm run register
```

Start:

```bash
npm start
```

## Production deployment

Run under a dedicated unprivileged Linux user. Do not run the bot as root.

Recommended:
- systemd service
- environment file readable only by the bot user
- local node API bound to localhost
- firewall blocks public access to privileged API functions
- separate bot hot wallet
- capped hot-wallet balance
- regular encrypted SQLite backups
- Discord bot token rotation procedure
- monitoring for low hot-wallet balance and ledger liabilities

## Funding and backing

The 10 ARKOS signup bonus is an internal balance liability. Before opening the bot publicly, fund the dedicated hot wallet with enough ARKOS to back expected user balances and withdrawals.

For example, 500 registered users × 10 ARKOS = 5,000 ARKOS of starting liabilities before accounting for tips (tips redistribute existing balances and do not increase total liabilities).

A future version should add an automated solvency check comparing:
- hot-wallet on-chain balance
- total Discord ledger liabilities
- reserved network fees

and pause new signup bonuses if backing falls below a configured safety threshold.

## Security note

Never paste a treasury or hot-wallet secret phrase into Discord, source code, GitHub, Base44, logs, screenshots, or chat. Load it from protected server environment configuration only.
