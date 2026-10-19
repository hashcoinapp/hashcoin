// The public record: totals, the tax rate, recent rounds with their transactions, and each
// wallet's levels and what it has been paid. Served by services/api (/v1/stats, /v1/wallet/:address).
import { computeHolderLevel, computeMinerLevel, holderProgress, positionUsd, type PriceContext, type Rules } from "@hashcoin/engine";
import { DAY_MS } from "@hashcoin/engine";
import { dayKey, type Ledger, walletState } from "./ledger.js";

export interface RoundSummary {
  round: number;
  at: string;
  rateBps: number;
  taxUsd: number;
  minedUsd: number;
  split: { devUsd: number; chestUsd: number; holderUsd: number };
  miners: number;
  holders: number;
  paidTokens: number;
  transactions: string[];
}

/** Where trading happens and how the miners' buys are funded, for the site and the app. */
export interface MarketStatus {
  phase: "curve" | "graduating" | "damm" | "none";
  priceSol?: number;
  solUsd?: number;
  curveProgress?: number;
  /** SOL in the payout wallet above its reserve, available to buy miners' $HASH. */
  floatSol: number;
  floatUsd: number;
}

/**
 * Per holder level (1-3): wallets paid a bonus or holder reward today (UTC, like `last24h`) and the
 * USD they received (as planned when paid). Null when the ledger has no tally yet (older ledgers).
 */
export function levels24h(l: Ledger, now: number): Record<"1" | "2" | "3", { wallets: number; paidUsd: number }> | null {
  if (!l.levelPaid) return null;
  const today = l.levelPaid.day === dayKey(now) ? l.levelPaid.levels : {};
  const level = (n: number) => {
    const paid = Object.values(today[n] ?? {});
    return { wallets: paid.length, paidUsd: paid.reduce((a, u) => a + u, 0) };
  };
  return { "1": level(1), "2": level(2), "3": level(3) };
}

/** All of $HASH: minted once at launch, minting then switched off (packages/chain LAUNCH.supply). */
export const SUPPLY_TOKENS = 21_000_000;
/** The miner count goes stale when the collector hasn't run for this long. */
const MINING_FRESH_MS = 2 * 60 * 60 * 1000;

/**
 * The last 24 hours' payout rates, for the website's live calculator: per day, what the bonus paid
 * per unit of miner weight (√ of a GPU's $/day × level weight) and what holder rewards paid per $1 of
 * qualified bag × level weight. Sized from the rounds of the last 24 hours (rolling), the GPUs mining
 * now and today's bags. Each GPU's weight uses the average GPU's mining (√a), as the site's estimate
 * does. A rate is null when there's nothing to divide by; the whole thing is null before two rounds.
 */
export function liveRates(x: {
  now: number; rounds: RoundSummary[]; rules: Rules;
  /** GPUs mining now per wallet, or null if the collector hasn't run lately. */
  gpus: Record<string, number> | null;
  /** Holder level and qualified bag (USD) of every wallet that can be paid (excluded ones left out). */
  wallets: Record<string, { holderLevel: 0 | 1 | 2 | 3; qualifiedUsd: number }>;
}) {
  const recent = x.rounds.filter((r) => Date.parse(r.at) > x.now - DAY_MS);
  if (recent.length < 2) return null;
  const times = recent.map((r) => Date.parse(r.at));
  const span = Math.max(...times) - Math.min(...times);
  // n rounds cover n intervals (each round pays for the time since the one before).
  const hours = Math.min(24, (span / (recent.length - 1)) * recent.length / 3_600_000);
  if (!(hours > 0)) return null;
  const perDay = 24 / hours;
  const sum = (f: (r: RoundSummary) => number) => recent.reduce((a, r) => a + f(r), 0) * perDay;
  const taxUsdDay = sum((r) => r.taxUsd), minedUsdDay = sum((r) => r.minedUsd);
  const minerBonusUsdDay = sum((r) => r.split.chestUsd), holderUsdDay = sum((r) => r.split.holderUsd);

  let gpus = 0, bagGpus = 0, bagWeight = 0;
  for (const [address, n] of Object.entries(x.gpus ?? {})) {
    gpus += n;
    const level = x.wallets[address]?.holderLevel ?? 0;
    if (level > 0) { bagGpus += n; bagWeight += n * x.rules.miner.mult[level]; }
  }
  let holderWeight = 0;
  for (const w of Object.values(x.wallets)) if (w.holderLevel > 0) holderWeight += w.qualifiedUsd * x.rules.holder.mult[w.holderLevel as 1 | 2 | 3];
  const a = x.gpus && gpus > 0 ? minedUsdDay / gpus : null;
  return {
    hours, taxUsdDay, minedUsdDay, minerBonusUsdDay, holderUsdDay,
    gpus: x.gpus ? gpus : null,
    minedUsdPerGpuDay: a,
    /** Share of mining GPUs whose wallet has a bag (only they earn the bonus), and their average level weight. */
    bagShare: gpus > 0 ? bagGpus / gpus : null,
    avgMinerMult: bagGpus > 0 ? bagWeight / bagGpus : null,
    /** Your bonus a day = this × √(your GPU's $/day) × your level weight (1/2/4). */
    bonusPerSqrtUsdDay: a && a > 0 && bagWeight > 0 ? minerBonusUsdDay / (Math.sqrt(a) * bagWeight) : null,
    /** Your holder rewards a day = this × your qualified bag in USD × your level weight (1/2/4). */
    holderPerWeightedUsdDay: holderWeight > 0 ? holderUsdDay / holderWeight : null,
  };
}

export function publicRecord(l: Ledger, x: {
  now: number; price: PriceContext; levelPrice?: PriceContext; rules: Rules; excluded: ReadonlySet<string>; explorer: (sig: string) => string;
  rate: { bps: number; scheduled?: { bps: number; epoch: number } }; rounds: RoundSummary[]; market?: MarketStatus;
  /** Total supply in whole tokens (default 21,000,000). */
  supplyTokens?: number;
  /** Round timing, for the site's "next round" countdown: a round every `roundMinutes`, holders every `holderEveryRounds`. */
  schedule?: { roundMinutes: number; holderEveryRounds: number };
}) {
  const levelPrice = x.levelPrice ?? x.price;
  const tokens = (s: string) => Number(BigInt(s)) / 10 ** x.price.decimals;
  const last = (n: number) => {
    let volume = 0, mined = 0, tax = 0, paid = 0;
    for (let i = 0; i < n; i++) {
      const d = l.days[dayKey(x.now - i * DAY_MS)];
      if (d) { volume += d.volumeTokens; mined += d.minedUsd; tax += d.taxTokens; paid += d.paidTokens; }
    }
    return { volumeUsd: volume * x.price.priceUsd, minedUsd: mined, taxUsd: tax * x.price.priceUsd, paidUsd: paid * x.price.priceUsd };
  };
  // Every wallet the loop knows: traders and holders (indexed), and miners, who may have mining
  // credited, held back or paid before the indexer has seen a transfer of theirs.
  const known = new Set([
    ...Object.keys(l.wallets), ...Object.keys(l.paid), ...Object.keys(l.hoursInWindow), ...Object.keys(l.minedSinceRound),
    ...l.pending.map((p) => p.address), ...l.owed.map((o) => o.address),
  ]);
  const wallets = Object.fromEntries([...known].filter((a) => !x.excluded.has(a)).map((a) => {
    const s = l.wallets[a];
    const w = walletState(a, s);
    const holderLevel = computeHolderLevel(w, levelPrice, x.rules);
    const progress = holderProgress(w, levelPrice, x.rules);
    const hours = l.hoursInWindow[a] ?? 0;
    const paid = l.paid[a] ?? { miner: "0", holder: "0" };
    return [a, {
      balanceTokens: tokens(s?.balance ?? "0"), balanceUsd: positionUsd(w.balance, x.price),
      holderLevel, minerLevel: hours > 0 ? computeMinerLevel(holderLevel) : null,
      hoursMinedInWindow: hours,
      // The qualified bag (bag minus 2× what was sold) sets the level and the holder-reward share.
      qualifiedUsd: progress.qualifiedUsd, usdToNextLevel: progress.usdToNextHolder,
      paidTokens: { miner: tokens(paid.miner), holder: tokens(paid.holder) },
      // Held-back mining (paid once the mined coin sells) plus payouts that failed and will be retried.
      pendingUsd: l.pending.filter((p) => p.address === a).reduce((s, p) => s + p.estimatedUsd, 0) + l.owed.filter((o) => o.address === a).reduce((s, o) => s + o.usd, 0),
    }];
  }));
  const supplyTokens = x.supplyTokens ?? SUPPLY_TOKENS;
  const fresh = l.miningNow && x.now - l.miningNow.at < MINING_FRESH_MS ? l.miningNow.gpus : null;
  const miningWallets = fresh ? Object.entries(fresh).filter(([a, n]) => n > 0 && !x.excluded.has(a)) : [];
  return {
    network: l.network, mint: l.mint, updatedAt: new Date(x.now).toISOString(), round: l.round, priceUsd: x.price.priceUsd, levelPriceUsd: levelPrice.priceUsd,
    // Price × all 21M tokens (unsold curve tokens included), the way charts show a fixed-supply token.
    supplyTokens, marketCapUsd: x.price.priceUsd * supplyTokens,
    /**
     * GPUs and wallets hashing at the last collector run, and their current hashrate per coin (H/s,
     * e.g. { PRL: 2.5e16 }); null if the collector hasn't run in the last 2 hours.
     */
    miners: fresh ? {
      gpus: miningWallets.reduce((s, [, n]) => s + n, 0), wallets: miningWallets.length,
      hashrate: l.miningNow!.hashrate ?? {}, at: new Date(l.miningNow!.at).toISOString(),
    } : null,
    /** Tax collected and not yet paid out: harvested but not yet split, plus the bonus and holder pots carried to the next round. */
    readyToPayUsd: tokens(l.taxUnallocated) * x.price.priceUsd + l.chestCarryUsd + l.holderCarryUsd,
    /** Miner and holder payouts, all time, in USD when planned (null on ledgers from before this was kept). */
    paidUsd: l.totals.minerUsd != null || l.totals.holderUsd != null
      ? { miners: l.totals.minerUsd ?? 0, holders: l.totals.holderUsd ?? 0, total: (l.totals.minerUsd ?? 0) + (l.totals.holderUsd ?? 0) } : null,
    calc: liveRates({ now: x.now, rounds: x.rounds, rules: x.rules, gpus: fresh, wallets }),
    /** Payouts in the last 6 and 24 hours (rolling, from the rounds kept), at the current price, and how many rounds. */
    recent: Object.fromEntries(([["6h", 6], ["24h", 24]] as const).map(([k, hrs]) => {
      const rs = x.rounds.filter((r) => Date.parse(r.at) > x.now - hrs * 3_600_000);
      return [k, { paidUsd: rs.reduce((s, r) => s + r.paidTokens, 0) * x.price.priceUsd, rounds: rs.length }];
    })) as Record<"6h" | "24h", { paidUsd: number; rounds: number }>,
    /** Wallets ever paid a miner or holder payout, and wallets holding $HASH now (ours and pools left out). */
    walletsPaid: Object.keys(l.paid).filter((a) => !x.excluded.has(a)).length,
    holders: Object.entries(l.wallets).filter(([a, s]) => !x.excluded.has(a) && BigInt(s.balance) > 0n).length,
    /** When the next round and the next holder payout are due (rounds run on a timer; this is written at the end of one). */
    schedule: x.schedule ? (() => {
      const every = Math.max(1, x.schedule.holderEveryRounds), ms = x.schedule.roundMinutes * 60_000;
      return {
        roundMinutes: x.schedule.roundMinutes, holderEveryRounds: every,
        nextRoundAt: new Date(x.now + ms).toISOString(),
        nextHolderRoundAt: new Date(x.now + (every - (l.round % every)) * ms).toISOString(),
      };
    })() : null,
    market: x.market ?? null,
    funding: {
      partnerFeesClaimedSol: Number(BigInt(l.funding.partnerFeesLamports)) / 1e9,
      poolFeesClaimedSol: Number(BigInt(l.funding.poolFeesLamports)) / 1e9,
      spentOnBuysSol: Number(BigInt(l.funding.spentLamports)) / 1e9,
      boughtForMinersTokens: tokens(l.funding.boughtTokens),
      saleProceedsWaitingUsd: l.funding.saleBudgetUsd,
      buys: l.funding.buys.slice(-20).reverse().map((b) => ({ ...b, at: new Date(b.at).toISOString(), tx: x.explorer(b.signature) })),
    },
    taxRate: { bps: x.rate.bps, scheduled: x.rate.scheduled ?? null, changes: l.rateChanges.map((c) => ({ ...c, at: new Date(c.at).toISOString(), tx: c.signature ? x.explorer(c.signature) : undefined })) },
    totals: {
      paidToMinersTokens: tokens(l.totals.minerTokens), paidToHoldersTokens: tokens(l.totals.holderTokens), paidToDevTokens: tokens(l.totals.devTokens),
      taxTokens: tokens(l.totals.taxTokens), rounds: l.round, indexedTransactions: l.indexedTx,
    },
    last24h: last(1), last7d: last(7),
    levels24h: levels24h(l, x.now),
    carry: { minerBonusUsd: l.chestCarryUsd, holderPotUsd: l.holderCarryUsd, heldBackMiningUsd: l.pending.reduce((a, p) => a + p.estimatedUsd, 0) },
    rounds: x.rounds.slice(-50).reverse().map((r) => ({ ...r, transactions: r.transactions.map(x.explorer) })),
    wallets,
  };
}
