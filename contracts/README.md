# Stablegram vaults

USDC escrows for pots, bill splits, ROSCA circles, tabs, and allowances. On Arc, pass the native USDC ERC-20 `0x3600000000000000000000000000000000000000`. Local tests deploy `MockUSDC`.

`rescueToken` can only move surplus above `totalEscrowed`.

```bash
npm test
npm run deploy:testnet
npm run deploy:mainnet
```
