/**
 * Miner level: the wallet's holder level while it mines (one ladder, user Oct 18). 0 = no bag: mining
 * is still paid in $HASH, but there's no bonus from the chest.
 */
export type Level = 0 | 1 | 2 | 3;
/** Holder level: 0 = below H1, then H1-H3. */
export type HolderLevel = 0 | 1 | 2 | 3;

export interface Rules {
  /**
   * The Token-2022 transfer tax: a rate between `minRate` and `maxRate` (set by `targetTaxRate` in
   * `step`s), split as shares of the tax: dev 5–10% (falls as the rate rises), miners 45–75% (what
   * reaches the 5× target), holders the rest (at least `holderShareMin`).
   */
  tax: {
    minRate: number;
    maxRate: number;
    step: number;
    devShare: { atMinRate: number; atMaxRate: number };
    minerShare: { min: number; max: number };
    holderShareMin: number;
    /** The rate is never lowered so far that holders get less than this share of trading volume. */
    holderMinOfVolume: number;
  };
  /** Miners' total pay target as a multiple of what their GPUs mined (5 = mining + 4× from the chest). */
  minerTargetMult: number;
  holder: {
    /** Qualified bag (USD) needed for Level 1 / 2 / 3. No hold clock (user, Oct 18). */
    usd: [number, number, number];
    /**
     * Selling counts this many times against the qualified bag (3: sell $100 of a $500 bag and the
     * bag is $400 but qualifies as $200). Buying adds back 1:1; selling everything wipes it.
     */
    sellMultiplier: number;
    /** Holder-pot weight multiplier per holder level. */
    mult: Record<1 | 2 | 3, number>;
  };
  miner: {
    /**
     * Hours mined are counted over the last `windowDays` and shown to the miner. They no longer set
     * the level (user, Oct 18: the miner level is the holder level). An hour counts when the wallet
     * had at least one GPU with accepted shares (clock time, not summed per GPU).
     */
    windowDays: number;
    /**
     * An hour counts in full when the GPU earns at least this share of its expected rate (catalog
     * revenue for its model on the assigned coin); below that it counts in proportion (0.8: at 40%,
     * an hour counts as half an hour).
     */
    fullCreditAt: number;
    /** Chest weight multiplier per miner level (0 = no bag: no bonus). */
    mult: Record<Level, number>;
  };
  /** Chest weight = earningsUsd ** alpha × miner multiplier. 0.5 = square-root GPU balancing. */
  alpha: number;
  /** Share of estimated mining earnings paid immediately; the rest waits for confirmation. */
  immediateShare: number;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_RULES: Rules = {
  tax: {
    minRate: 0.02,
    maxRate: 0.05,
    step: 0.0025,
    devShare: { atMinRate: 0.10, atMaxRate: 0.05 },
    minerShare: { min: 0.45, max: 0.75 },
    holderShareMin: 0.20,
    holderMinOfVolume: 0.01,
  },
  minerTargetMult: 5,
  holder: {
    usd: [50, 500, 2500],
    sellMultiplier: 3,
    mult: { 1: 1, 2: 2, 3: 4 },
  },
  miner: {
    windowDays: 14,
    fullCreditAt: 0.8,
    mult: { 0: 0, 1: 1, 2: 2, 3: 4 },
  },
  alpha: 0.5,
  immediateShare: 0.75,
};
