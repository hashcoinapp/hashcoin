// The kill switch: one file (or HASH_KILL) stops every transaction the loop would send: payouts,
// market buys, harvests, fee claims, rate changes. It is checked at each send (see
// packages/chain guardSends), so it also stops a round that is already running.
//   npx tsx services/payouts/src/ctl.ts kill "why"     engage
//   npx tsx services/payouts/src/ctl.ts resume         release
// PAUSE (older, softer) only makes rounds skip; KILL blocks sends outright.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

export const killFile = (dataDir: string) => resolve(dataDir, "KILL");
export const pauseFile = (dataDir: string) => resolve(dataDir, "PAUSE");

/** Why sends are blocked, or null. Read fresh every time (another process may flip it). */
export function killReason(dataDir: string, envKill: string | null): string | null {
  if (envKill) return `kill switch (${envKill})`;
  const f = killFile(dataDir);
  if (!existsSync(f)) return null;
  let note = "";
  try { note = readFileSync(f, "utf8").trim(); } catch { /* unreadable still counts */ }
  return `kill switch engaged${note ? `: ${note}` : ""}`;
}

export function engageKill(dataDir: string, reason: string, now = new Date()) {
  writeFileSync(killFile(dataDir), `${now.toISOString()} ${reason || "no reason given"}\n`);
}

export function releaseKill(dataDir: string): boolean {
  const f = killFile(dataDir);
  if (!existsSync(f)) return false;
  rmSync(f);
  return true;
}

/**
 * One payout loop per data folder: two would plan rounds from the same ledger and could pay twice
 * (the startup task and a `payouts.ps1` window, say). The running loop listens on a named pipe
 * (Windows) or an abstract socket (Linux) named after the folder; the OS frees it when the process
 * ends, crash included, so a stale lock can't keep the loop from starting. Resolves to a release.
 */
export function holdLoopLock(dataDir: string): Promise<() => void> {
  if (process.platform !== "win32" && process.platform !== "linux") return Promise.resolve(() => {});
  const id = createHash("sha256").update(resolve(dataDir).toLowerCase()).digest("hex").slice(0, 16);
  const name = process.platform === "win32" ? `\\\\.\\pipe\\hashcoin-payouts-${id}` : `\0hashcoin-payouts-${id}`;
  return new Promise((ok, fail) => {
    const server = createServer((s) => s.end());
    server.once("error", (e: NodeJS.ErrnoException) => fail(e.code === "EADDRINUSE"
      ? new Error(`another payout loop is already running on ${resolve(dataDir)}: stop it first (two loops could pay twice)`)
      : e));
    server.listen(name, () => { server.unref(); ok(() => server.close()); });
  });
}
