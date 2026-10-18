// Market buys and tax withdraws across a crash: the process dies after the transaction was sent (and
// landed) but before the ledger booked it. The restart must not buy or harvest a second time.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { guardSends, SendBlockedError, sendRecorded, type SignedTx } from "@hashcoin/chain";
import { emptyLedger, type Ledger, loadLedger, type PendingSend, saveLedger } from "../src/ledger.js";
import { beginSend, coverBuy, dropSend, landBuy, landHarvest, resolveSends, spendBought } from "../src/sends.js";

const T = (n: number) => BigInt(Math.round(n * 1e6)); // whole tokens → base units
const SOL_USD = 100;
const TOKENS_PER_USD = 20; // $0.05 a token
const t0 = Date.UTC(2026, 9, 24, 12);

class Crash extends Error {}

/** A pretend chain: transactions land (or don't), and the RPC answers like getSignatureStatuses / getTransaction. */
class FakeChain {
  height = 1_000;
  sol = 10n * 1_000_000_000n;
  wallet = 0n; // the payout wallet's $HASH
  mintWithheld = 0n;
  buys = 0;
  withdraws = 0;
  readable = true;
  private landed = new Map<string, bigint>(); // signature → what it moved to the payout wallet
  private n = 0;

  /** Sign, record (`onSigned`), send. `land: false`: the transaction is lost on the way and never lands. */
  async buy(lamports: bigint, onSigned: (tx: SignedTx) => void, land = true): Promise<string> {
    const signature = `buy${++this.n}`;
    onSigned({ signature, lastValidBlockHeight: this.height + 150 });
    if (!land) return signature;
    const tokens = BigInt(Math.round((Number(lamports) / 1e9) * SOL_USD * TOKENS_PER_USD * 1e6));
    this.buys += 1;
    this.sol -= lamports;
    this.wallet += tokens;
    this.landed.set(signature, tokens);
    return signature;
  }

  /** harvestFees' withdraw step: nothing in the mint, no transaction. */
  async withdraw(onSigned: (tx: SignedTx & { expected: bigint }) => void): Promise<bigint> {
    if (this.mintWithheld === 0n) return 0n;
    const signature = `withdraw${++this.n}`;
    onSigned({ signature, lastValidBlockHeight: this.height + 150, expected: this.mintWithheld });
    this.withdraws += 1;
    const moved = this.mintWithheld;
    this.wallet += moved;
    this.mintWithheld = 0n;
    this.landed.set(signature, moved);
    return moved;
  }

  statuses = async (sigs: string[]) => sigs.map((s) => (this.landed.has(s) ? { err: null, confirmationStatus: "confirmed" } : null));
  blockHeight = async () => this.height;
  tokenDelta = async (sig: string) => (this.readable ? this.landed.get(sig) ?? null : null);
}

/** One process's view: the ledger in memory, saved to disk the way main.ts saves it. */
function proc(file: string) {
  const l: Ledger = loadLedger(file) ?? { ...emptyLedger("devnet", "mint"), startedAt: 0 };
  return { l, save: () => saveLedger(file, l) };
}

const lamportsFor = (usd: number) => BigInt(Math.round((usd / SOL_USD) * 1e9));

/** main.ts step 5 in miniature: tokens for `usd` of mining, buying only what isn't in hand. */
async function buyStep(p: ReturnType<typeof proc>, chain: FakeChain, usd: number, o: { crash?: boolean; land?: boolean } = {}): Promise<bigint | null> {
  const { l, save } = p;
  const inHand = coverBuy(l, usd);
  if (inHand !== null) return inHand;
  const buyUsd = usd - l.funding.unassigned.usd;
  const lamports = lamportsFor(buyUsd);
  let rec: PendingSend | null = null;
  const sig = await chain.buy(lamports, (tx) => {
    rec = beginSend(l, { kind: "buy", at: t0, round: l.round + 1, ...tx, floorTokens: "1", lamports: lamports.toString(), buyUsd, phase: "curve", costBps: 50 });
    save();
  }, o.land ?? true);
  if (o.crash) throw new Crash("killed after the buy was sent, before it was booked");
  landBuy(l, rec!, (await chain.tokenDelta(sig))!);
  save();
  return coverBuy(l, usd);
}

/** main.ts step 2 in miniature. */
async function harvestStep(p: ReturnType<typeof proc>, chain: FakeChain, o: { crash?: boolean } = {}) {
  const { l, save } = p;
  let rec: PendingSend | null = null;
  const harvested = await chain.withdraw((tx) => {
    rec = beginSend(l, { kind: "harvest", at: t0, round: l.round + 1, signature: tx.signature, lastValidBlockHeight: tx.lastValidBlockHeight, floorTokens: tx.expected.toString() });
    save();
  });
  if (o.crash) throw new Crash("killed after the withdraw was sent, before it was booked");
  landHarvest(l, rec, harvested);
  save();
}

/** What a restart does first. */
async function restart(file: string, chain: FakeChain) {
  const p = proc(file);
  const r = await resolveSends(p.l, chain, { sleep: async () => {} });
  p.save();
  return { ...p, r };
}

const ledgerFile = () => join(mkdtempSync(join(tmpdir(), "hash-sends-")), "ledger.json");

describe("a market buy across a crash", () => {
  it("a buy that landed before the crash is booked on restart and not bought again", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true })).rejects.toBeInstanceOf(Crash);
    expect(chain.buys).toBe(1);
    expect(proc(file).l.sends).toHaveLength(1); // the record survived the crash

    const p = await restart(file, chain);
    expect(p.r).toMatchObject({ bought: T(40), dropped: 0 });
    expect(p.l.sends).toHaveLength(0);
    expect(p.l.funding.unassigned).toEqual({ tokens: T(40).toString(), usd: 2 });
    expect(p.l.funding.spentLamports).toBe(lamportsFor(2).toString());
    expect(p.l.funding.buys).toHaveLength(1);

    // The restarted round wants the same $2 of mining: it uses what the first buy returned.
    const bought = await buyStep(p, chain, 2);
    expect(bought).toBe(T(40));
    expect(chain.buys).toBe(1);
    expect(chain.sol).toBe(10n * 1_000_000_000n - lamportsFor(2)); // SOL spent once
    spendBought(p.l, bought!, 2);
    expect(p.l.funding.unassigned).toEqual({ tokens: "0", usd: 0 });
  });

  it("a second restart after booking still doesn't buy again", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true })).rejects.toBeInstanceOf(Crash);
    await restart(file, chain); // booked and saved, then killed again before the round paid out
    const p = await restart(file, chain);
    expect(p.r.signatures).toEqual([]);
    expect(await buyStep(p, chain, 2)).toBe(T(40));
    expect(chain.buys).toBe(1);
    expect(p.l.funding.buys).toHaveLength(1);
  });

  it("more mining credited by the restart: only the difference is bought", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true })).rejects.toBeInstanceOf(Crash);
    const p = await restart(file, chain);
    expect(await buyStep(p, chain, 3)).toBe(T(60));
    expect(chain.buys).toBe(2);
    expect(chain.sol).toBe(10n * 1_000_000_000n - lamportsFor(2) - lamportsFor(1));
  });

  it("less mining to buy for: a proportional part is used, the rest waits for the next round", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true })).rejects.toBeInstanceOf(Crash);
    const p = await restart(file, chain);
    const part = await buyStep(p, chain, 1.5);
    expect(part).toBe(T(30));
    spendBought(p.l, part!, 1.5);
    expect(p.l.funding.unassigned).toEqual({ tokens: T(10).toString(), usd: 0.5 });
    expect(chain.buys).toBe(1);
  });

  it("a buy that never landed and has expired is dropped; the restart buys once", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true, land: false })).rejects.toBeInstanceOf(Crash);
    chain.height += 151; // past its last valid block height: it can never land
    const p = await restart(file, chain);
    expect(p.r).toMatchObject({ bought: 0n, dropped: 1 });
    expect(p.l.funding.spentLamports).toBe("0");
    expect(await buyStep(p, chain, 2)).toBe(T(40));
    expect(chain.buys).toBe(1);
  });

  it("a buy that may still land is waited for; past the wait the round stops instead of buying", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true, land: false })).rejects.toBeInstanceOf(Crash);
    const p = proc(file);
    await expect(resolveSends(p.l, chain, { waitMs: 0, sleep: async () => {} })).rejects.toThrow("still unconfirmed");
    expect(p.l.sends).toHaveLength(1);
    expect(chain.buys).toBe(0);
  });

  it("if the landed buy can't be read, it's booked at the swap's guaranteed minimum", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    await expect(buyStep(proc(file), chain, 2, { crash: true })).rejects.toBeInstanceOf(Crash);
    chain.readable = false;
    const p = await restart(file, chain);
    expect(p.l.funding.unassigned.tokens).toBe("1"); // the floor recorded with the buy
    expect(await buyStep(p, chain, 2)).toBe(1n);
    expect(chain.buys).toBe(1);
  });
});

describe("a tax harvest across a crash", () => {
  it("a withdraw that landed before the crash is booked on restart: the tax is split once, not lost or doubled", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    chain.mintWithheld = T(50);
    const first = proc(file);
    first.l.ownFeesUnharvested = T(5).toString(); // fees our own payouts paid: back to the treasury
    first.save();
    await expect(harvestStep(first, chain, { crash: true })).rejects.toBeInstanceOf(Crash);
    expect(proc(file).l.taxUnallocated).toBe("0"); // before the fix this tax was never split

    const p = await restart(file, chain);
    expect(p.r).toMatchObject({ harvested: T(50), dropped: 0 });
    expect(p.l.taxUnallocated).toBe(T(45).toString());
    expect(p.l.ownFeesUnharvested).toBe("0");

    // The restarted round harvests as usual: nothing left in the mint, no second withdraw.
    await harvestStep(p, chain);
    expect(chain.withdraws).toBe(1);
    expect(p.l.taxUnallocated).toBe(T(45).toString());
    expect(chain.wallet).toBe(T(50));
  });

  it("new tax after the crash is added on top of the recovered withdraw", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    chain.mintWithheld = T(50);
    await expect(harvestStep(proc(file), chain, { crash: true })).rejects.toBeInstanceOf(Crash);
    chain.mintWithheld = T(7); // trading went on while the loop was down
    const p = await restart(file, chain);
    await harvestStep(p, chain);
    expect(chain.withdraws).toBe(2);
    expect(p.l.taxUnallocated).toBe(T(57).toString());
  });

  it("buy and harvest records left by the same crash are both settled before anything new", async () => {
    const file = ledgerFile();
    const chain = new FakeChain();
    chain.mintWithheld = T(50);
    const first = proc(file);
    await harvestStep(first, chain);
    await expect(buyStep(first, chain, 2, { crash: true })).rejects.toBeInstanceOf(Crash);
    // A second crash right after the next harvest's withdraw.
    chain.mintWithheld = T(10);
    const second = proc(file);
    await expect(harvestStep(second, chain, { crash: true })).rejects.toBeInstanceOf(Crash);
    expect(second.l.sends.map((s) => s.kind)).toEqual(["buy", "harvest"]);
    const p = await restart(file, chain);
    expect(p.r).toMatchObject({ bought: T(40), harvested: T(10) });
    expect(p.l.taxUnallocated).toBe(T(60).toString());
    expect(await buyStep(p, chain, 2)).toBe(T(40));
    expect([chain.buys, chain.withdraws]).toEqual([1, 2]);
  });
});

describe("recorded sends", () => {
  const blockhash = "GfVcyD4kkTrj4bKc7WA9sZCin9JDbdT4Zkd3EittNR1W";
  const transferTx = (kp: Keypair) => new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }));

  it("the signature is recorded before the transaction goes out", async () => {
    const calls: string[] = [];
    const conn = new Connection("http://127.0.0.1:1");
    conn.getLatestBlockhash = async () => ({ blockhash, lastValidBlockHeight: 4242 });
    conn.sendRawTransaction = async () => { calls.push("send"); return "x"; };
    conn.confirmTransaction = (async () => ({ context: { slot: 1 }, value: { err: null } })) as unknown as Connection["confirmTransaction"];
    const kp = Keypair.generate();
    let recorded: SignedTx | null = null;
    const sig = await sendRecorded(conn, transferTx(kp), [kp], (tx) => { recorded = tx; calls.push("record"); });
    expect(calls).toEqual(["record", "send"]);
    expect(recorded).toEqual({ signature: sig, lastValidBlockHeight: 4242 });
  });

  it("blocked by the kill switch: recorded, never sent, and the caller drops the record", async () => {
    const conn = new Connection("http://127.0.0.1:1");
    conn.getLatestBlockhash = async () => ({ blockhash, lastValidBlockHeight: 1 });
    let sent = 0;
    conn.sendRawTransaction = async () => { sent += 1; return "x"; };
    guardSends(conn, () => "kill switch engaged");
    const l = emptyLedger("devnet", "mint");
    const kp = Keypair.generate();
    let rec: PendingSend | null = null;
    await expect(sendRecorded(conn, transferTx(kp), [kp], (tx) => { rec = beginSend(l, { kind: "buy", at: t0, round: 1, ...tx, floorTokens: "0" }); })).rejects.toBeInstanceOf(SendBlockedError);
    expect(sent).toBe(0);
    expect(l.sends).toHaveLength(1);
    dropSend(l, rec!);
    expect(l.sends).toHaveLength(0);
  });
});
