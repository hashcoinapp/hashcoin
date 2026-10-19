import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES, applyBalanceChange, bonusMiningUsd, chestShares,
  computeHolderLevel, computeMinerLevel, creditedHours, hourCredit, isInternalTransfer, linkWallet, unlinkWallet, holderProgress, levelPriceUsd, runEpoch,
  qualifiedUsd, runHolderPayout, settle, splitTax, splitTokens, devShareAt, minerMaxShareAt, targetTaxRate, type WalletState, type WeightInput,
} from "../src/index.js";

const price = { priceUsd: 0.001, decimals: 6 }; // $0.001 per token
const tokensFor = (usd: number) => BigInt(Math.round((usd / price.priceUsd) * 1e6));
const T0 = Date.UTC(2026, 9, 1);
const R = DEFAULT_RULES;

/** A wallet holding `usd`, with `penaltyUsd` taken off its qualified bag by past sales. */
function wallet(usd: number, penaltyUsd = 0, address = "w"): WalletState {
  return { address, balance: tokensFor(usd), penalty: tokensFor(penaltyUsd) };
}
const buy = (w: WalletState, usd: number) => applyBalanceChange(w, tokensFor(usd), R);
const sell = (w: WalletState, usd: number) => applyBalanceChange(w, -tokensFor(usd), R);

describe("levels (Oct 18: no hold clock; selling counts 3x against the qualified bag)", () => {
  it("Level 1 at $50, Level 2 at $500, Level 3 at $2,500 of qualified bag, with no waiting", () => {
    expect(computeHolderLevel(wallet(49), price, R)).toBe(0);
    expect(computeHolderLevel(wallet(50), price, R)).toBe(1);
    expect(computeHolderLevel(wallet(499), price, R)).toBe(1);
    expect(computeHolderLevel(wallet(500), price, R)).toBe(2);
    expect(computeHolderLevel(wallet(2499), price, R)).toBe(2);
    expect(computeHolderLevel(wallet(2500), price, R)).toBe(3);
    expect(R.holder.sellMultiplier).toBe(3);
  });

  it("the user's example: $500, sell $100 -> bag $400, qualifies as $200, Level 2 -> 1 until bought back", () => {
    let w = sell(wallet(500), 100);
    expect(Number(w.balance) / 1e6 * price.priceUsd).toBeCloseTo(400);
    expect(qualifiedUsd(w, price)).toBeCloseTo(200);
    expect(computeHolderLevel(w, price, R)).toBe(1);
    w = buy(w, 300);
    expect(qualifiedUsd(w, price)).toBeCloseTo(500);
    expect(computeHolderLevel(w, price, R)).toBe(2);
  });

  it("sales add up, and the qualified bag never goes below zero", () => {
    let w = sell(sell(wallet(1000), 100), 100); // bag $800, penalty $400
    expect(qualifiedUsd(w, price)).toBeCloseTo(400);
    w = sell(w, 300); // bag $500, penalty $1,000
    expect(qualifiedUsd(w, price)).toBe(0);
    expect(computeHolderLevel(w, price, R)).toBe(0);
  });

  it("selling everything wipes the penalty: a returning buyer starts fresh", () => {
    const w = sell(sell(wallet(1000), 100), 900);
    expect(w.balance).toBe(0n);
    expect(w.penalty).toBe(0n);
    expect(computeHolderLevel(buy(w, 50), price, R)).toBe(1);
  });

  it("selling more than the bag only sells the bag", () => {
    const w = applyBalanceChange(wallet(100), -tokensFor(500), R);
    expect(w.balance).toBe(0n);
    expect(w.penalty).toBe(0n);
  });

  it("levels use the higher of the 1h and 7-day prices, so a crash doesn't drop levels at once", () => {
    expect(levelPriceUsd(0.0005, 0.001)).toBe(0.001);
    expect(levelPriceUsd(0.002, 0.001)).toBe(0.002);
  });

  it("reports what to buy for the next level, including any penalty above the bag", () => {
    const a = holderProgress(sell(wallet(500), 100), price, R); // qualifies $200
    expect(a.holderLevel).toBe(1);
    expect(a.qualifiedUsd).toBeCloseTo(200);
    expect(a.bagUsd).toBeCloseTo(400);
    expect(a.usdToNextHolder).toBeCloseTo(300);
    const b = holderProgress(wallet(100, 300), price, R); // penalty $200 above the bag
    expect(b.holderLevel).toBe(0);
    expect(b.usdToNextHolder).toBeCloseTo(250); // $200 to clear the penalty, then $50
    expect(holderProgress(wallet(3000), price, R).usdToNextHolder).toBe(0);
  });
});

describe("wallet linking", () => {
  it("adds up bags and penalties", () => {
    const g = linkWallet(wallet(400, 100, "g"), wallet(300, 50, "x"));
    expect(g.address).toBe("g");
    expect(qualifiedUsd(g, price)).toBeCloseTo(550);
  });

  it("transfers inside a group aren't sales", () => {
    const groups: Record<string, string> = { a: "g", b: "g", c: "h" };
    const groupOf = (x: string) => groups[x];
    expect(isInternalTransfer("a", "b", groupOf)).toBe(true);
    expect(isInternalTransfer("a", "c", groupOf)).toBe(false);
    expect(isInternalTransfer("a", "z", groupOf)).toBe(false);
  });

  it("unlinking counts as the group selling that wallet's share, and the wallet starts fresh", () => {
    const { group, wallet: w } = unlinkWallet(wallet(1000, 0, "g"), { address: "x", balance: tokensFor(200) }, R);
    expect(qualifiedUsd(group, price)).toBeCloseTo(400); // $800 bag, $400 penalty
    expect(qualifiedUsd(w, price)).toBeCloseTo(200);
  });
});

describe("mining hours", () => {
  it("an hour counts in full at 80%+ of the GPU's expected rate, less in proportion below", () => {
    expect(hourCredit(0.12, 0.12, R)).toBe(1);
    expect(hourCredit(0.096, 0.12, R)).toBeCloseTo(1); // exactly 80%
    expect(hourCredit(0.072, 0.12, R)).toBeCloseTo(0.75); // 60% → 45 minutes
    expect(hourCredit(0.048, 0.12, R)).toBeCloseTo(0.5); // 40% → half an hour
    expect(hourCredit(0, 0.12, R)).toBe(0);
  });

  it("a wallet gets its best GPU's credit, since hours count while at least one GPU mines", () => {
    const gpus = [{ actualUsd: 0.03, expectedUsd: 0.12 }, { actualUsd: 0.1, expectedUsd: 0.11 }];
    expect(creditedHours(1, gpus, R)).toBe(1);
    expect(creditedHours(1, [gpus[0]!], R)).toBeCloseTo(0.3125); // 25% of expected
    expect(creditedHours(1, [], R)).toBe(0);
  });
});

describe("miner levels", () => {
  it("one ladder: the miner level is the holder level; no bag, no bonus (Oct 18)", () => {
    expect(computeMinerLevel(0)).toBe(0);
    expect(computeMinerLevel(1)).toBe(1);
    expect(computeMinerLevel(2)).toBe(2);
    expect(computeMinerLevel(3)).toBe(3);
    expect(R.miner.mult).toEqual({ 0: 0, 1: 1, 2: 2, 3: 4 });
    expect(chestShares([{ address: "nobag", earningsUsd: 5, level: 0 }], R).size).toBe(0);
  });
});


describe("tax split", () => {
  it("dev 10% at a 2% tax, 5% at a 5% tax, so dev's cut of volume stays ~0.2-0.25%", () => {
    expect(devShareAt(0.02, R)).toBeCloseTo(0.10);
    expect(devShareAt(0.05, R)).toBeCloseTo(0.05);
    expect(devShareAt(0.035, R)).toBeCloseTo(0.075);
    expect(minerMaxShareAt(0.05, R)).toBeCloseTo(0.75);
    expect(minerMaxShareAt(0.02, R)).toBeCloseTo(0.70); // holders keep their 20%
  });

  it("miners get what reaches 5x (between 45% and their max), holders the rest", () => {
    // $10,000 traded at 5% -> $500 tax. Miners mined $75, so they need $300 (60%) to reach 5x.
    const s = splitTax({ taxUsd: 500, rate: 0.05, minedUsd: 75 }, R);
    expect(s.shares.dev).toBeCloseTo(0.05);
    expect(s.shares.miners).toBeCloseTo(0.60);
    expect(s.shares.holders).toBeCloseTo(0.35);
    expect(s.devUsd + s.chestUsd + s.holderUsd).toBeCloseTo(500);
    expect(s.targetMet).toBe(true);
  });

  it("never gives miners under 45% or holders under 20%", () => {
    const busy = splitTax({ taxUsd: 500, rate: 0.02, minedUsd: 1 }, R);
    expect(busy.shares.miners).toBeCloseTo(0.45);
    expect(busy.shares.holders).toBeCloseTo(0.45);
    const quiet = splitTax({ taxUsd: 500, rate: 0.05, minedUsd: 10_000 }, R);
    expect(quiet.shares.miners).toBeCloseTo(0.75);
    expect(quiet.shares.holders).toBeCloseTo(0.20);
    expect(quiet.targetMet).toBe(false);
  });

  it("counts chest carried from earlier epochs toward the target", () => {
    const s = splitTax({ taxUsd: 500, rate: 0.05, minedUsd: 75, chestCarryUsd: 100 }, R);
    expect(s.chestUsd).toBeCloseTo(225); // needs 300 - 100 = 200 (40%), floored at 45%
  });

  it("sets the lowest rate where miners reach 5x and holders still get 1% of volume", () => {
    // 1,000 GPUs mining $2.50/day need $10,000/day of bonus.
    // Quiet: even 5% can't lift miners to 5x -> stay at 5%.
    expect(targetTaxRate({ volumeUsd: 100_000, minedUsd: 2_500 }, R)).toBeCloseTo(0.05, 6);
    // $750 of volume per GPU (the site's launch-week estimate): 2.75% is the first rate where
    // holders get >= 1% of volume (2.5% gives them 0.94%).
    expect(targetTaxRate({ volumeUsd: 750_000, minedUsd: 2_500 }, R)).toBeCloseTo(0.0275, 6);
    // Very heavy trading: the floor is 2.25%, since at 2% holders' max share (45%) is only 0.9%.
    expect(targetTaxRate({ volumeUsd: 5_000_000, minedUsd: 2_500 }, R)).toBeCloseTo(0.0225, 6);
    const at = splitTax({ taxUsd: 0.0275 * 750_000, rate: 0.0275, minedUsd: 2_500 }, R);
    expect(at.holderUsd / 750_000).toBeGreaterThanOrEqual(0.01);
  });

  it("matches the site's estimate at $3.50 per GPU (Oct 14: PRL ~$1.87)", () => {
    // 1,000 GPUs mining $3.50/day need $14,000/day of bonus. With $750/GPU of trading plus the
    // platform's own buys, 3.25% is the first rate where holders keep >= 1% of volume once miners
    // reach 5x (3% leaves holders 0.89%).
    const volumeUsd = 753_500;
    expect(targetTaxRate({ volumeUsd, minedUsd: 3_500 }, R)).toBeCloseTo(0.0325, 6);
    const at = splitTax({ taxUsd: 0.0325 * volumeUsd, rate: 0.0325, minedUsd: 3_500 }, R);
    expect(at.targetMet).toBe(true);
    expect(at.shares.miners).toBeCloseTo(0.572, 3);
    expect(at.shares.holders).toBeCloseTo(0.349, 3);
    // Below ~$370/GPU even 5% can't lift miners to 5x.
    expect(targetTaxRate({ volumeUsd: 360_000 + 3_500, minedUsd: 3_500 }, R)).toBeCloseTo(0.05, 6);
  });
});

describe("holder payout", () => {
  it("splits by bag x holder level, skips H0 and excluded wallets", () => {
    const wallets = [
      wallet(100, 0, "h1"),       // Level 1, weight 100
      wallet(600, 0, "h2"),       // Level 2, weight 1,200
      wallet(1000, 800, "sold"),  // qualifies $200: Level 1, weight 200
      wallet(10, 0, "dust"),      // below Level 1
      wallet(1_000_000, 0, "pool"),
    ];
    const r = runHolderPayout({ now: T0, potUsd: 300, wallets, price, rules: R, excluded: new Set(["pool"]) });
    const by = Object.fromEntries(r.lines.map((l) => [l.address, l]));
    expect(by.h1!.usd).toBeCloseTo(20);
    expect(by.h2!.usd).toBeCloseTo(240);
    expect(by.sold!.usd).toBeCloseTo(40); // paid on the qualified bag, not the full $1,000
    expect(by.dust).toBeUndefined();
    expect(by.pool).toBeUndefined();
    expect(r.carryUsd).toBeCloseTo(0);
  });

  it("has no per-wallet cap: a big bag takes its full share and nothing carries", () => {
    const wallets = [wallet(100_000, 0, "whale")]; // $100K at Level 3: weight 400,000
    for (let i = 0; i < 40; i++) wallets.push(wallet(100, 0, "s" + i)); // $100 at Level 1: weight 100 each
    const r = runHolderPayout({ now: T0, potUsd: 1000, wallets, price, rules: R });
    expect(r.lines.find((l) => l.address === "whale")!.usd).toBeCloseTo((1000 * 400_000) / 404_000);
    expect(r.paidUsd).toBeCloseTo(1000);
    expect(r.carryUsd).toBeCloseTo(0);
  });
});

describe("chest shares", () => {
  it("weights by sqrt(earnings) × level multiplier", () => {
    const s = chestShares([
      { address: "a", earningsUsd: 1, level: 1 },
      { address: "b", earningsUsd: 4, level: 1 },
      { address: "c", earningsUsd: 1, level: 3 },
    ], R);
    // weights 1, 2, 4 -> shares 1/7, 2/7, 4/7
    expect(s.get("a")).toBeCloseTo(1 / 7);
    expect(s.get("b")).toBeCloseTo(2 / 7);
    expect(s.get("c")).toBeCloseTo(4 / 7);
  });

  it("a single miner gets the whole chest (no per-wallet cap)", () => {
    const s = chestShares([{ address: "solo", earningsUsd: 3, level: 1 }], R);
    expect(s.get("solo")).toBeCloseTo(1);
  });

});

describe("epoch", () => {
  const wallets = new Map<string, WalletState>([
    ["a", wallet(0, 0, "a")],          // no bag
    ["b", wallet(100, 0, "b")],        // Level 1
    ["c", wallet(800, 0, "c")],        // Level 2
  ]);
  const earnings = new Map([["a", 0.05], ["b", 0.05], ["c", 0.05]]);
  const base = { epochId: "e1", now: T0, earnings, wallets, price, chestUsd: 70, floatAvailableUsd: 1000, rules: R };

  it("pays 75% of mining now, holds 25%, and splits the chest by level; no bag, no bonus", () => {
    const r = runEpoch(base);
    const byAddr = Object.fromEntries(r.lines.map((l) => [l.address, l]));
    expect(byAddr.a!.level).toBe(0); // mines but holds nothing
    expect(byAddr.b!.level).toBe(1);
    expect(byAddr.c!.level).toBe(2);
    expect(byAddr.c!.holderLevel).toBe(2);
    expect(byAddr.a!.immediateUsd).toBeCloseTo(0.0375); // its mining is still paid
    expect(byAddr.a!.pendingUsd).toBeCloseTo(0.0125);
    expect(byAddr.a!.chestUsd).toBe(0);
    expect(byAddr.b!.chestUsd).toBeCloseTo(70 / 3);
    expect(byAddr.c!.chestUsd).toBeCloseTo(140 / 3);
    expect(r.pending).toHaveLength(3);
    expect(r.carryUsd).toBeCloseTo(0);
    expect(r.totals.buyUsd).toBeCloseTo(0.1125); // only mining is bought; the chest is already $HASH
  });

  it("never pays the chest to excluded wallets", () => {
    const r = runEpoch({ ...base, excluded: new Set(["c"]) });
    expect(r.lines.map((l) => l.address).sort()).toEqual(["a", "b"]);
    expect(r.totals.chestUsd).toBeCloseTo(70);
  });

  it("scales immediate payouts down to what the float holds", () => {
    const r = runEpoch({ ...base, floatAvailableUsd: 0.05625 }); // half of 0.1125
    expect(r.totals.immediateUsd).toBeCloseTo(0.05625);
    expect(r.totals.pendingUsd).toBeCloseTo(0.15 - 0.05625);
  });

  it("carries chest only when no miner is eligible", () => {
    expect(runEpoch(base).carryUsd).toBeCloseTo(0);
    expect(runEpoch({ ...base, excluded: new Set(["a", "b", "c"]) }).carryUsd).toBeCloseTo(70);
    expect(runEpoch({ ...base, excluded: new Set(["b", "c"]) }).carryUsd).toBeCloseTo(70); // only a miner with no bag left
  });

  it("sizes the chest on bag-holding miners' mining only", () => {
    const x = { earnings, wallets, price, rules: R };
    expect(bonusMiningUsd(x)).toBeCloseTo(0.1); // b and c; a has no bag
    expect(bonusMiningUsd({ ...x, excluded: new Set(["c"]) })).toBeCloseTo(0.05);
    const sold = new Map(wallets); sold.set("b", wallet(100, 80, "b")); // b sold: qualifies $20, no level
    expect(bonusMiningUsd({ ...x, wallets: sold })).toBeCloseTo(0.05);
  });
});

describe("settlement", () => {
  const records = [
    { epochId: "e", address: "a", estimatedUsd: 0.25, miningUsd: 1, immediateUsd: 0.75 },
    { epochId: "e", address: "b", estimatedUsd: 0.75, miningUsd: 3, immediateUsd: 2.25 },
  ];

  it("pays the remainder when proceeds match the estimate", () => {
    const s = settle(records, 4);
    expect(s.lines[0]!.payUsd).toBeCloseTo(0.25);
    expect(s.lines[1]!.payUsd).toBeCloseTo(0.75);
  });

  it("trues up to actual proceeds and absorbs overpayment", () => {
    const s = settle(records, 2); // coin sold for half the estimate
    expect(s.ratio).toBeCloseTo(0.5);
    expect(s.totalPayUsd).toBeCloseTo(0);
    expect(s.totalOverpaidUsd).toBeCloseTo(1);
  });
});

describe("token split", () => {
  it("sums exactly to tokens bought and is proportional", () => {
    const { transfers } = splitTokens([{ address: "a", usd: 1 }, { address: "b", usd: 2 }], 1000n);
    expect(transfers.reduce((a, t) => a + t.amount, 0n)).toBe(1000n);
    expect(transfers.find((t) => t.address === "b")!.amount).toBeGreaterThanOrEqual(666n);
  });

  it("defers transfers below the minimum", () => {
    const { transfers, deferred } = splitTokens([{ address: "a", usd: 1000 }, { address: "b", usd: 0.001 }], 1_000_000n, 10n);
    expect(transfers.map((t) => t.address)).toEqual(["a"]);
    expect(deferred.map((d) => d.address)).toEqual(["b"]);
  });
});
