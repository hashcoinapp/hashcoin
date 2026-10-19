// Reads and checks apps/web/assets/js/config.js. Shared by build_pages.mjs and go_live.mjs.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG = join(WEB, "assets/js/config.js");
// The made-up address the live-mode preview uses (scripts/live-sample.js). Never valid for real.
export const SAMPLE_CA = "SAMPLEcaNotReaLDoNotBuyHASH11111111111111";

/** Runs config.js (plus any extra scripts, e.g. the live sample) and returns window.HASHCOIN. */
export function loadConfig(text = readFileSync(CONFIG, "utf8"), ...extra) {
  const sandbox = { window: {}, document: { documentElement: { dataset: {} } } };
  vm.runInNewContext(text, sandbox);
  for (const t of extra) vm.runInNewContext(t, sandbox);
  return { cfg: sandbox.window.HASHCOIN, sampleStats: sandbox.window.HASHCOIN_SAMPLE_STATS ?? null };
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** A Solana public key: base58 that decodes to exactly 32 bytes. */
export function isSolanaAddress(s) {
  if (typeof s !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  let bytes = 0;
  while (n > 0n) { n >>= 8n; bytes++; }
  const zeros = s.match(/^1*/)[0].length;
  return bytes + zeros === 32;
}
export const isHttps = (s) => typeof s === "string" && /^https:\/\/[^\s"'<>]+$/.test(s);
export const isSha256 = (s) => typeof s === "string" && /^[0-9a-fA-F]{64}$/.test(s);

/** Buy and chart links: config.links wins, the rest are built from the contract address. Same rule as site.js. */
export function linksFor(cfg) {
  const ca = cfg.ca;
  const made = ca ? {
    buy: `https://jup.ag/swap?sell=So11111111111111111111111111111111111111112&buy=${ca}`,
    dexscreener: `https://dexscreener.com/solana/${ca}`,
    birdeye: `https://birdeye.so/token/${ca}?chain=solana`,
    solscan: `https://solscan.io/token/${ca}`,
  } : {};
  return { ...made, ...Object.fromEntries(Object.entries(cfg.links ?? {}).filter(([, v]) => v)) };
}

/** Every problem with the settings, as a list of messages. `sample` allows the preview's made-up address. */
export function checkConfig(cfg, { sample = false } = {}) {
  const errs = [];
  const site = String(cfg.site ?? "").replace(/\/$/, "");
  const api = String(cfg.api ?? "").replace(/\/$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/.test(site)) errs.push(`site must be https://<domain> (got ${cfg.site})`);
  if (api && !/^https:\/\/[a-z0-9.-]+$/.test(api)) errs.push(`api must be https://<host> (got ${cfg.api})`);
  if (cfg.mode !== "prelaunch" && cfg.mode !== "live") errs.push(`mode must be "prelaunch" or "live" (got ${JSON.stringify(cfg.mode)})`);
  if (cfg.launchAt != null && isNaN(Date.parse(cfg.launchAt))) errs.push(`launchAt is not a date (${cfg.launchAt})`);
  if (cfg.ca != null) {
    if (cfg.ca === SAMPLE_CA && !sample) errs.push("ca is the preview's sample address, not the real one");
    else if (cfg.ca !== SAMPLE_CA && !isSolanaAddress(cfg.ca)) errs.push(`ca is not a Solana address (${cfg.ca})`);
  }
  if (cfg.download != null) {
    const d = cfg.download;
    if (!isHttps(d.url)) errs.push("download.url must be an https link");
    if (!isSha256(d.sha256)) errs.push("download.sha256 must be the installer's 64-character SHA-256");
    if (!/^\d+\.\d+\.\d+$/.test(d.version ?? "")) errs.push(`download.version must look like 0.1.3 (got ${d.version})`);
  }
  for (const k of ["x", "discord", "github"]) if (cfg[k] != null && !isHttps(cfg[k])) errs.push(`${k} must be an https link or null`);
  for (const [k, v] of Object.entries(cfg.links ?? {})) if (v != null && !isHttps(v)) errs.push(`links.${k} must be an https link or null`);
  if (!Array.isArray(cfg.wallets ?? [])) errs.push("wallets must be a list");
  for (const w of cfg.wallets ?? []) {
    if (!w || typeof w.label !== "string" || !w.label.trim()) errs.push(`wallets: every wallet needs a label (${JSON.stringify(w)})`);
    if (!isSolanaAddress(w?.address) && !(sample && /^SAMPLE/.test(w?.address ?? ""))) errs.push(`wallets: ${w?.label}: not a Solana address (${w?.address})`);
  }
  if (cfg.mode === "live") {
    // Live mode replaces the waitlist with buying, so everything a buyer needs must be set.
    if (!cfg.ca) errs.push("live mode needs ca (the contract address)");
    if (!cfg.download) errs.push("live mode needs download (url, version, sha256)");
    if (!cfg.launchAt) errs.push("live mode needs launchAt (when it launched)");
    if (!(cfg.wallets ?? []).length) errs.push("live mode needs wallets (every wallet we control)");
    if (!api) errs.push("live mode needs api (for the live numbers)");
  }
  return errs;
}
