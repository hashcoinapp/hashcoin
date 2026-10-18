// Market buys and tax withdraws survive a crash the way payouts do (inflight.ts). Each transaction is
// signed and recorded in the ledger before it is sent (`beginSend`), and the record is cleared only
// together with booking what it did (`landBuy`, `landHarvest`), in the same save. A record left over
// after a crash, a stop or a confirmation timeout is looked up on chain before the round buys or
// harvests anything new (`resolveSends`):
//   landed          → booked from the transaction itself: the bought $HASH waits for the next payouts
//                     (`funding.unassigned`), the withdrawn tax is split next round. Never sent again.
//   failed, or not found and expired (it can never land) → dropped; the round buys or harvests as usual
//   not found, still valid → waited for (a minute or two at most), then decided
// Without this, a buy that landed just before a crash was bought again on restart (SOL spent twice),
// and tax withdrawn just before a crash was never split (it sat in the payout wallet).
import { addBig, type Ledger, type PendingSend } from "./ledger.js";
import { type InFlightChain, outcomeOf } from "./inflight.js";

export interface SendsChain extends InFlightChain {
  /** What the payout wallet's $HASH balance gained in a confirmed transaction (null: can't be read). */
  tokenDelta(signature: string): Promise<bigint | null>;
}

/** Record a signed buy or withdraw before it is sent (save the ledger straight after). */
export function beginSend(l: Ledger, s: PendingSend): PendingSend {
  l.sends.push(s);
  return s;
}

/** A recorded send that never went out (the kill switch blocked it) or is known to have failed. */
export function dropSend(l: Ledger, s: PendingSend) {
  l.sends = l.sends.filter((x) => x !== s);
}

/** A buy landed and returned `tokens`: booked, and held for payouts until a round hands them out. */
export function landBuy(l: Ledger, s: PendingSend, tokens: bigint) {
  dropSend(l, s);
  const f = l.funding;
  f.spentLamports = addBig(f.spentLamports, BigInt(s.lamports ?? "0"));
  f.boughtTokens = addBig(f.boughtTokens, tokens);
  f.buys.push({ at: s.at, round: s.round, phase: s.phase ?? "?", lamports: s.lamports ?? "0", tokens: tokens.toString(), costBps: s.costBps ?? 0, signature: s.signature });
  f.buys = f.buys.slice(-500);
  f.unassigned = { tokens: addBig(f.unassigned.tokens, tokens), usd: f.unassigned.usd + (s.buyUsd ?? 0) };
}

/**
 * Tax reached the payout wallet (`s`: the withdraw's record, null for a dry run). Fees our own
 * transfers paid go back to the treasury; the rest waits to be split. Returns the part from trading.
 */
export function landHarvest(l: Ledger, s: PendingSend | null, harvested: bigint): bigint {
  if (s) dropSend(l, s);
  const ownBefore = BigInt(l.ownFeesUnharvested);
  const own = harvested < ownBefore ? harvested : ownBefore;
  l.ownFeesUnharvested = (ownBefore - own).toString();
  l.taxUnallocated = addBig(l.taxUnallocated, harvested - own);
  return harvested - own;
}

/**
 * $HASH already bought and not yet paid out, for `usd` of mining: all of it if that is what it was
 * bought for, a proportional part if it was bought for more, null if it doesn't cover `usd` (buy the
 * rest: `usd - funding.unassigned.usd`).
 */
export function coverBuy(l: Ledger, usd: number): bigint | null {
  const u = l.funding.unassigned;
  const have = BigInt(u.tokens);
  // Within a hundredth of a cent counts as covered: no buy that small.
  if (have <= 0n || usd <= 0 || u.usd + 1e-4 < usd) return null;
  if (usd >= u.usd - 1e-4) return have;
  return (have * BigInt(Math.round(usd * 1e8))) / BigInt(Math.round(u.usd * 1e8));
}

/** Hand `tokens` of the bought $HASH (`usd` of mining) to this round's payouts (save with the staged round). */
export function spendBought(l: Ledger, tokens: bigint, usd: number) {
  const left = BigInt(l.funding.unassigned.tokens) - tokens;
  l.funding.unassigned = left > 0n ? { tokens: left.toString(), usd: Math.max(0, l.funding.unassigned.usd - usd) } : { tokens: "0", usd: 0 };
}

export interface SendsResult { bought: bigint; harvested: bigint; dropped: number; signatures: string[] }

/** Before a round buys or harvests: settle every recorded send from earlier on chain (see the top of this file). */
export async function resolveSends(
  l: Ledger, chain: SendsChain,
  x: { waitMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<SendsResult> {
  const sleep = x.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const result: SendsResult = { bought: 0n, harvested: 0n, dropped: 0, signatures: [] };
  const deadline = Date.now() + (x.waitMs ?? 120_000);
  for (;;) {
    const open = [...l.sends];
    if (!open.length) return result;
    const [statuses, height] = await Promise.all([chain.statuses(open.map((s) => s.signature)), chain.blockHeight()]);
    let waiting = 0;
    for (const [i, s] of open.entries()) {
      const outcome = outcomeOf(statuses[i] ?? null, height, s.lastValidBlockHeight);
      if (outcome === "failed") { dropSend(l, s); result.dropped += 1; continue; }
      if (outcome === "waiting") { waiting += 1; continue; }
      // Landed: what it moved, from the transaction; if that can't be read, the least it can have moved.
      const delta = await chain.tokenDelta(s.signature).catch(() => null);
      const floor = BigInt(s.floorTokens);
      if (s.kind === "buy") {
        const tokens = delta !== null && delta > 0n ? delta : floor;
        landBuy(l, s, tokens);
        result.bought += tokens;
      } else {
        const tokens = delta !== null && delta >= 0n ? delta : floor;
        landHarvest(l, s, tokens);
        result.harvested += tokens;
      }
      result.signatures.push(s.signature);
    }
    if (!waiting) return result;
    if (Date.now() >= deadline) throw new Error(`${waiting} buy/harvest transaction(s) still unconfirmed and not expired; the round waits so nothing is bought or harvested twice`);
    await sleep(x.pollMs ?? 5_000);
  }
}
