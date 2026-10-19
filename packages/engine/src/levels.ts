import type { HolderLevel, Level, Rules } from "./rules.js";

/** The level price: the higher of the ~1h and ~7-day average prices. */
export function levelPriceUsd(avg1hUsd: number, avg7dUsd: number): number {
  return Math.max(avg1hUsd, avg7dUsd);
}

/**
 * What the platform tracks per wallet. Token amounts are in base units.
 *
 * Levels (user, Oct 18: "no hold clock, level qualification is measured in unsold bag. selling is
 * multiplied by 3x"): selling X takes X off the bag and adds 2X to `penalty`, so the qualified bag
 * (bag − penalty) drops by 3X. Buying adds to the bag, so it earns the qualified bag back. The
 * penalty never fades; selling everything wipes it (a returning buyer starts fresh).
 */
export interface WalletState {
  address: string;
  /** Current $HASH balance (base units), read from chain. */
  balance: bigint;
  /** Tokens (base units) taken off the qualified bag by past sales: (sell multiplier − 1) × sold. */
  penalty: bigint;
}

export interface PriceContext {
  /**
   * USD per whole token for level thresholds: the higher of the ~1h and ~7-day averages,
   * so a crash takes about a week to drop anyone's level while a rise counts within the hour.
   */
  priceUsd: number;
  decimals: number;
}

export function positionUsd(balance: bigint, p: PriceContext): number {
  return (Number(balance) / 10 ** p.decimals) * p.priceUsd;
}

/** The qualified bag in tokens (base units): the bag minus the selling penalty, never below 0. */
export function qualifiedTokens(w: WalletState): bigint {
  return w.balance > w.penalty ? w.balance - w.penalty : 0n;
}

/** The qualified bag in USD at the level price: what sets the level and the holder-reward share. */
export function qualifiedUsd(w: WalletState, p: PriceContext): number {
  return positionUsd(qualifiedTokens(w), p);
}

/**
 * Holder level: the highest of Level 1-3 whose bag the qualified bag reaches ($50 / $500 / $2,500).
 * A dip below a threshold drops the level; recovering restores it at once.
 */
export function computeHolderLevel(w: WalletState, p: PriceContext, rules: Rules): HolderLevel {
  const usd = qualifiedUsd(w, p);
  const [u1, u2, u3] = rules.holder.usd;
  if (usd >= u3) return 3;
  if (usd >= u2) return 2;
  if (usd >= u1) return 1;
  return 0;
}

/**
 * Miner level: one ladder with the holder level (user, Oct 18). A miner at Level 1/2/3 earns the
 * bonus at 1×/2×/4×; a miner with no qualified bag (0) is paid for its mining in $HASH but gets no
 * bonus. Selling pay costs 3× in qualified bag, so dumping it loses the level, and with it the bonus.
 */
export function computeMinerLevel(holderLevel: HolderLevel): Level {
  return holderLevel;
}

/**
 * How much of a mining hour counts (hours are shown to miners) for one GPU: all of it at
 * `fullCreditAt` (80%) or more of the GPU's expected rate, less in proportion below. Measure over a
 * full hour so share luck evens out. `expectedUsd` should be the catalog rate for the reported model;
 * a rig's own benchmark could be sandbagged, so use it only for cards the catalog doesn't know.
 */
export function hourCredit(actualUsd: number, expectedUsd: number, rules: Rules): number {
  if (actualUsd <= 0) return 0;
  if (expectedUsd <= 0) return 1;
  return Math.min(1, actualUsd / expectedUsd / rules.miner.fullCreditAt);
}

/**
 * Hours credited to a wallet for one period. Hours count while at least one GPU mines, so the
 * wallet gets its best GPU's credit (an idle second card doesn't cost anything).
 */
export function creditedHours(hours: number, gpus: { actualUsd: number; expectedUsd: number }[], rules: Rules): number {
  return hours * gpus.reduce((best, g) => Math.max(best, hourCredit(g.actualUsd, g.expectedUsd, rules)), 0);
}

/**
 * Apply an observed on-chain balance change to the wallet state.
 * - An inflow (buying, being paid) adds to the bag, and so to the qualified bag.
 * - Any outflow counts as selling, including wallet-to-wallet transfers, LP and exchange deposits
 *   (linked wallets excepted, see links.ts): it takes the amount off the bag and adds
 *   (`sellMultiplier` − 1) × the amount to the penalty, so the qualified bag drops by 3× the sale.
 * - Selling everything wipes the penalty: a returning buyer starts fresh.
 */
export function applyBalanceChange(w: WalletState, delta: bigint, rules: Rules): WalletState {
  if (delta >= 0n) return { ...w, balance: w.balance + delta };
  const sold = -delta > w.balance ? w.balance : -delta;
  const balance = w.balance - sold;
  if (balance === 0n) return { ...w, balance, penalty: 0n };
  return { ...w, balance, penalty: w.penalty + sold * BigInt(rules.holder.sellMultiplier - 1) };
}

export interface LevelProgress {
  holderLevel: HolderLevel;
  /** The qualified bag (USD at the level price). */
  qualifiedUsd: number;
  /** The full bag (USD at the level price). */
  bagUsd: number;
  /** USD of $HASH to buy (or receive) to reach the next level (0 at Level 3). */
  usdToNextHolder: number;
}

export function holderProgress(w: WalletState, p: PriceContext, rules: Rules): LevelProgress {
  const holderLevel = computeHolderLevel(w, p, rules);
  const q = qualifiedUsd(w, p);
  // Buying adds to the bag, but the qualified bag only rises once it's above the penalty.
  const gap = holderLevel === 3 ? 0 : Math.max(0, rules.holder.usd[holderLevel]! - q);
  const penaltyLeftUsd = Math.max(0, positionUsd(w.penalty, p) - positionUsd(w.balance, p));
  return { holderLevel, qualifiedUsd: q, bagUsd: positionUsd(w.balance, p), usdToNextHolder: gap > 0 ? gap + penaltyLeftUsd : 0 };
}
