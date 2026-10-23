import { SOURCE_BALANCE } from './data/source-balance.mjs';

// Imported numbers stay unchanged. New fantasy rules live in this named section.
export const WEB_RULES = Object.freeze({
  startingCoins: 80,
  helperCap: 3,
  stationDwell: 0.4,
  transferInterval: 0.22,
  moneyPickupRadius: 0.9,
  saleCoinScale: 10,
  saleCoinMultipliers: [10, 25, 80, 240, 750, 1500],
  archerUnlockSales: 8,
  mageUnlockSales: 20,
  alchemyUnlockSales: 8,
  innUnlockSales: 16,
  raidCoinRewards: [3000, 8000, 24000, 72000, 216000],
});

export const BALANCE = Object.freeze({
  ...SOURCE_BALANCE,
  magic: Object.freeze({
    teleportAtLevel: 21,
    range: 3.5,
    cooldown: 4,
  }),
  web: WEB_RULES,
});
