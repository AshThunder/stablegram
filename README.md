# Stablegram

Pay a friend in Telegram by @name. The amount is in dollars, and you confirm before anything moves.

We built Stablegram because sending money to a friend had turned into a crypto chore: bridges, a separate gas token, and pasting addresses into chat. The payment stays inside the Telegram conversation. You sign in with Google or a passkey, so there is no seed phrase. You pay an @name, so you do not paste an address to send. The fee is the same USDC as the balance, so there is no second coin to buy and no chain to choose. The app still says the money is USDC on Arc. Adding funds shows your wallet address. Claiming a name mentions Arc. Those words are on screen. Operating a wallet is not the job.

**Bot:** [@stablegram_bot](https://t.me/stablegram_bot)  **Live:** https://stablegram-umber.vercel.app · 

## What a person actually does

Sign in, claim an @name, and pay people by that name. Send, tip, request, and split a bill. Collect toward a shared goal. Run a circle with a payout date. Lend with a due date and get a repay link. Activity is the USDC that has actually moved.

The confirm screen is the only place money can leave. Requesting and splitting do not send USDC; they ask the other person to pay. Starting a circle does not move USDC. Paying that round does. Counting your own contribution to a pot does not send a transfer to yourself. A friend paying the pot does. Lending and repaying send USDC. A spend limit blocks a payment that would go over the cap you set for that friend.

Under that, the app is still USDC on Arc. Names, balances, and transfers are on-chain. Paying a friend is the @name and the confirm button.

## What is on Arc

Settlement is [Arc](https://www.arc.network) mainnet (chain id 5042). USDC at `0x3600000000000000000000000000000000000000` is both the balance and the gas. The app reads the 6-decimal token balance and only uses the 18-decimal native view for fee estimates.

| Vault | Job |
| --- | --- |
| StablegramPot | Group collections |
| StablegramBillEscrow | Bill splits |
| StablegramRosca | Savings circles |
| StablegramTab | Lend / borrow |
| StablegramAllowance | Spend limits |
| StablegramNames | One @name per wallet |

Rescue can only move tokens above escrowed balances. Tests live in `contracts/` and run against a local mock. Deploy to Arc uses the real USDC address above.

```bash
cd contracts && npm test
cd contracts && npm run deploy:testnet
```

Mainnet (`npm run deploy:mainnet`) spends real USDC. Do that only after testnet flows work.

## App

```bash
npm install
cp .env.example .env
npm run dev
```

Set `CIRCLE_API_KEY` and `VITE_CIRCLE_APP_ID` from the Circle developer console (Wallets → User Controlled). For Google, paste the OAuth client id into Social Logins and into `VITE_GOOGLE_CLIENT_ID`. The redirect URI is the app origin. For a passkey, create a client key (API & Client Keys → Client Key) whose allowed domain is the site hostname, set the passkey domain to that same hostname, and put the key in `VITE_CIRCLE_CLIENT_KEY`. A key allowed only for `localhost` cannot sign in on the live site.

```bash
npm run bot
```

## Arc mainnet

Deployed from `0xE6d602411c151EC463f143239b406F7B6Eb123e4`. Chain id `5042`. USDC `0x3600000000000000000000000000000000000000`.

| Vault | Address |
| --- | --- |
| StablegramPot | `0xD0a0C703b8b9d422660dFc8Ff1c8c636Cb5e60bF` |
| StablegramBillEscrow | `0x8A58036e94bE3677e35C2E420B20460115c01f0a` |
| StablegramRosca | `0x358552861E57811F45c9b6fbe95f53bd886fc0C6` |
| StablegramTab | `0x2796bce3c02e6c8fE3BF6A2424c00052d05216C8` |
| StablegramAllowance | `0xd6C365e0DD991D51662AdFF006C1b4c384ff09cF` |
| StablegramNames | `0x33c602542f0e9d26BcbB1eee1AF8d6B4519B737E` |

Explorer: https://explorer.arc.io

In Circle, set the Google redirect URI to exactly `https://stablegram-umber.vercel.app`. The client key allowed domain and the passkey domain must both be `stablegram-umber.vercel.app` (hostname only). Add `TELEGRAM_BOT_TOKEN` from BotFather, then register the webhook at `https://stablegram-umber.vercel.app/api/telegram` and set the bot menu button to that same app URL.

Earlier Dollargram vaults remain on Arc and are unused. This deploy is mainnet only.
