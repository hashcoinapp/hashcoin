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
    /** Bag (USD) needed for H1 / H2 / H3. */
    usd: [number, number, number];
    /** Hold clock needed for H1 / H2 / H3 (ms of clock time, which can run faster than real time). */
    clockMs: [number, number, number];
    /**
     * Clock speed = bag USD ÷ `speedPerUsd`, between 1× and `maxSpeed`×. A bigger bag ages faster;
     * buying more speeds the clock up from then on, never with an instant jump.
     */
    speedPerUsd: number;
    maxSpeed: number;
    /** Selling a fraction s of the bag takes `sellPenalty` × s of the clock (2.5: sell 20%, lose 50%; 40%+ resets). */
    sellPenalty: number;
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
    /**
     * Keep what you earn (user, Oct 18): the bonus is scaled by the share of the last `keptDays` days'
     * payouts the wallet hasn't sold (`keptShare`), so dumping earnings shrinks the bonus.
     */
    keptDays: number;
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
    clockMs: [0, 24 * HOUR_MS, 7 * 24 * HOUR_MS],
    speedPerUsd: 2500,
    maxSpeed: 3,
    sellPenalty: 2.5,
    mult: { 1: 1, 2: 2, 3: 4 },
  },
  miner: {
    windowDays: 14,
    fullCreditAt: 0.8,
    keptDays: 14,
    mult: { 0: 0, 1: 1, 2: 2, 3: 4 },
  },
  alpha: 0.5,
  immediateShare: 0.75,
};
