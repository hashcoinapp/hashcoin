import { computeHolderLevel, computeMinerLevel, type PriceContext, type WalletState } from "./levels.js";
import type { HolderLevel, Level, Rules } from "./rules.js";
import { chestShares } from "./weights.js";

export interface EpochInput {
  epochId: string;
  now: number;
  /** Estimated mining earnings per wallet this epoch (USD), from accepted shares. */
  earnings: Map<string, number>;
  wallets: Map<string, WalletState>;
  price: PriceContext;
  /** Share of recent payouts each wallet has kept (`keptShare`); missing = 1. Scales the bonus. */
  kept?: Map<string, number>;
  /** Chest for this epoch (USD, from splitTax), plus anything carried from earlier epochs. */
  chestUsd: number;
  /** USD value the float can pay out right now. Immediate payouts are scaled down to fit. */
  floatAvailableUsd: number;
  rules: Rules;
  /** Dev, treasury and payout wallets: never get chest payouts. */
  excluded?: ReadonlySet<string>;
}

export interface PayoutLine {
  address: string;
  /** Miner level 0-3: the holder level (0 = no bag, no bonus). */
  level: Level;
  /** Share of recent payouts kept (0 to 1), which scales the bonus. */
  kept: number;
  holderLevel: HolderLevel;
  miningUsd: number;
  /** Mining paid now, from the float. */
  immediateUsd: number;
  /** Mining held until the mined coin confirms and sells. */
  pendingUsd: number;
  chestShare: number;
  chestUsd: number;
  /**
   * USD paid in this epoch's batch (immediate mining + chest). Only the mining part is bought
   * on the market; the chest is paid from the harvested tax, which is already $HASH.
   */
  payNowUsd: number;
}

export interface PendingRecord {
  epochId: string;
  address: string;
  /** Estimated USD owed once the epoch's mined coin settles. */
  estimatedUsd: number;
  /** Full estimated mining USD for this wallet this epoch (used for true-up). */
  miningUsd: number;
  immediateUsd: number;
}

export interface EpochResult {
  epochId: string;
  lines: PayoutLine[];
  pending: PendingRecord[];
  /** Chest not distributed (wallet caps, no eligible miners); add it to the next epoch. */
  carryUsd: number;
  totals: {
    miningUsd: number; immediateUsd: number; pendingUsd: number; chestUsd: number; payNowUsd: number;
    /** USD of $HASH the treasury buys on the market this epoch: the immediate mining share only. */
    buyUsd: number;
  };
}

const EMPTY_WALLET = (address: string): WalletState => ({ address, balance: 0n, clockMs: null, clockAt: 0 });

/**
 * Mining (USD) that earns the bonus: by miners with a bag (holder level 1+), not excluded, each
 * scaled by the share of recent payouts it kept. The chest is sized on this, so miners who keep
 * their earnings average the 5× target; mining without a bag, or by miners who sell their pay,
 * doesn't raise the chest (or the tax), and what it would have taken stays with holders. The
 * chest's 45% floor still applies; with no eligible miner it carries to the next round.
 */
export function bonusMiningUsd(x: {
  earnings: Map<string, number>; wallets: Map<string, WalletState>; price: PriceContext; now: number; rules: Rules;
  excluded?: ReadonlySet<string>; kept?: Map<string, number>;
}): number {
  let usd = 0;
  for (const [address, earningsUsd] of x.earnings) {
    if (earningsUsd <= 0 || x.excluded?.has(address)) continue;
    const w = x.wallets.get(address) ?? EMPTY_WALLET(address);
    if (computeMinerLevel(computeHolderLevel(w, x.price, x.now, x.rules)) > 0) usd += earningsUsd * (x.kept?.get(address) ?? 1);
  }
  return usd;
}

export function runEpoch(input: EpochInput): EpochResult {
  const { rules, price, now } = input;
  const entries = [...input.earnings]
    .filter(([address, usd]) => usd > 0 && !input.excluded?.has(address))
    .map(([address, earningsUsd]) => {
      const w = input.wallets.get(address) ?? EMPTY_WALLET(address);
      const holderLevel = computeHolderLevel(w, price, now, rules);
      const level = computeMinerLevel(holderLevel);
      const kept = Math.min(1, Math.max(0, input.kept?.get(address) ?? 1));
      return { address, earningsUsd, level, holderLevel, kept };
    });

  const shares = chestShares(entries, rules);
  const miningTotal = entries.reduce((a, e) => a + e.earningsUsd, 0);
  const wantImmediate = miningTotal * rules.immediateShare;
  // Never promise more than the float holds: scale the immediate share down if needed.
  const scale = wantImmediate > 0 ? Math.min(1, Math.max(0, input.floatAvailableUsd) / wantImmediate) : 1;
  const immediateShare = rules.immediateShare * scale;

  const lines: PayoutLine[] = [];
  const pending: PendingRecord[] = [];
  let chestPaid = 0;
  for (const e of entries) {
    const share = shares.get(e.address) ?? 0;
    const chestUsd = input.chestUsd * share;
    const immediateUsd = e.earningsUsd * immediateShare;
    const pendingUsd = e.earningsUsd - immediateUsd;
    chestPaid += chestUsd;
    lines.push({
      address: e.address, level: e.level, holderLevel: e.holderLevel, kept: e.kept, miningUsd: e.earningsUsd, immediateUsd, pendingUsd,
      chestShare: share, chestUsd, payNowUsd: immediateUsd + chestUsd,
    });
    if (pendingUsd > 0) {
      pending.push({ epochId: input.epochId, address: e.address, estimatedUsd: pendingUsd, miningUsd: e.earningsUsd, immediateUsd });
    }
  }
  lines.sort((a, b) => b.payNowUsd - a.payNowUsd);

  const sum = (k: keyof PayoutLine) => lines.reduce((a, l) => a + (l[k] as number), 0);
  return {
    epochId: input.epochId,
    lines,
    pending,
    carryUsd: Math.max(0, input.chestUsd - chestPaid),
    totals: {
      miningUsd: miningTotal, immediateUsd: sum("immediateUsd"), pendingUsd: sum("pendingUsd"),
      chestUsd: chestPaid, payNowUsd: sum("payNowUsd"), buyUsd: sum("immediateUsd"),
    },
  };
}
