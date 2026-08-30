# ARKOS Discord Tip Bot

The official Discord tipping bot for the Arkovia Network and the ARKOS digital economy.

ARKOS Discord Tip Bot allows Discord community members to receive an initial ARKOS balance, send micro-tips to other members, deposit ARKOS from the Arkovia blockchain, and withdraw ARKOS back to an ARK account.

> **ARKOS — You created the world; now give it an economy.**

## Architecture

The bot uses a hybrid ledger model designed specifically for inexpensive Discord micro-transactions.

The Arkovia blockchain defines:

- `COIN_SYMBOL = "ARKOS"`
- `ACCOUNT_PREFIX = "ARK"`
- `ONE_NXT = 100000000`

Therefore:

- 1 ARKOS = 100,000,000 NQT
- 0.001 ARKOS = 100,000 NQT
- 1 NQT = 0.00000001 ARKOS

The ordinary Arkovia payment fee is currently approximately 1 ARKOS.

Because an individual Discord tip may be as small as 0.001 ARKOS, broadcasting every Discord tip directly to the blockchain would be inefficient.

The bot therefore uses:

- **Off-chain Discord ledger** for micro-tips and starting balances
- **On-chain Arkovia transactions** for deposits
- **On-chain Arkovia transactions** for withdrawals

This allows extremely small Discord tips while preserving the ability to move ARKOS into and out of the Discord ecosystem.

## Current Features

- 10 ARKOS starting balance for new members
- 0.001 ARKOS minimum Discord tip unit
- Internal SQLite ledger for Discord micro-tips
- Member-to-member tipping
- ARK account linking
- ARKOS deposits
- Unique deposit routing codes
- Automatic blockchain deposit scanner
- Configurable deposit confirmation requirement
- Automatic Discord balance crediting
- Idempotent deposit processing
- On-chain withdrawals
- Configurable withdrawal minimum
- Daily tipping limits
- Maximum single-tip limits
- Public read-only Discord Activity API
- Website activity integration support
- On-chain/off-chain activity classification

## Discord Commands

### `/arkos-start`

Creates or activates the member's ARKOS Discord account and grants the configured starting balance if eligible.

Default starting balance:

**10 ARKOS**

### `/arkos-balance`

Displays the member's current Discord ARKOS balance.

### `/arkos-tip @user units`

Transfers ARKOS internally to another Discord member.

One unit equals:

**0.001 ARKOS**

Example:

`/arkos-tip @Alex 5`

transfers:

**0.005 ARKOS**

No Arkovia blockchain transaction is created for an internal Discord tip.

### `/arkos-deposit`

Provides the member with:

- ARKOS Tip Bot deposit address
- personal deposit routing code
- minimum deposit amount
- required confirmation count
- deposit instructions

The deposit code MUST be included as a **public/plain-text blockchain message**.

**Do not encrypt the deposit code.**

The deposit scanner must be able to read the code from the blockchain in order to associate the transaction with the correct Discord member.

Deposits with a missing, incorrect, unknown, or encrypted deposit code cannot be automatically credited.

### `/arkos-link ARK-...`

Links an ARK account address for withdrawals.

### `/arkos-withdraw amount`

Withdraws ARKOS from the member's Discord balance to the linked ARK account.

Withdrawals are real Arkovia blockchain transactions.

### `/arkos-info`

Displays information about the ARKOS Discord tipping system.

## Default Economic Settings

Current defaults:

- Starting balance: 10 ARKOS
- Discord tip unit: 0.001 ARKOS
- Maximum single tip: 100 units / 0.1 ARKOS
- Daily outgoing tipping limit: 2 ARKOS
- Minimum deposit: 5 ARKOS
- Deposit confirmations required: 3
- Deposit scan interval: 30 seconds
- Minimum withdrawal: 2 ARKOS
- Network withdrawal fee: 1 ARKOS

These values are configurable through environment variables.

## Deposit System

Each Discord member receives a persistent deposit routing code.

Example format:

`ARK-123456-7890`

The member sends ARKOS to the configured Tip Bot hot wallet and includes the routing code in the transaction's **public/plain-text message**.

The deposit scanner periodically reads recent incoming ordinary-payment transactions from the Arkovia node.

A deposit is credited only when:

1. The transaction is an ordinary payment.
2. The recipient is the configured ARKOS Tip Bot hot wallet.
3. The amount meets the configured minimum deposit.
4. A valid public/plain-text deposit code is present.
5. The deposit code belongs to a known Discord member.
6. The transaction has reached the configured confirmation requirement.
7. The transaction has not already been credited.

Each blockchain transaction ID is stored uniquely to prevent the same deposit from being credited more than once.

Encrypted transaction messages are deliberately ignored by the automatic scanner.

## Discord Activity API

The bot includes a read-only HTTP Activity API for integration with the public ARKOS Network Portal.

Default local listener:

`127.0.0.1:4880`

Endpoints:

- `GET /health`
- `GET /api/public/activity`

The activity endpoint requires bearer-token authentication.

The API can expose safe public activity types including:

### `TIP`

Discord member-to-member transfer.

Settlement:

`OFF_CHAIN`

### `NEW_MEMBER`

Initial Discord ARKOS allocation.

Settlement:

`OFF_CHAIN`

### `DEPOSIT`

Confirmed ARKOS deposit credited to a Discord member.

Settlement:

`ON_CHAIN`

### `WITHDRAWAL`

ARKOS withdrawal broadcast to the Arkovia blockchain.

Settlement:

`ON_CHAIN`

On-chain activity may include safe public blockchain information such as:

- ARK account address
- amount
- transaction ID
- full transaction hash
- timestamp

The API must never expose secret phrases, private keys, API tokens, Discord user IDs, or member deposit routing codes.

## Installation

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env


Configure the required environment variables.

When running the bot on the same trusted server as the Arkovia node, use the local Arkovia API:

```env
ARKOVIA_NODE_URL=http://127.0.0.1:4876/nxt
```

Register the Discord slash commands:

```bash
npm run register
```

Start the bot:

```bash
npm start
```
