#!/usr/bin/env node
// Launch day: puts the launch values in apps/web/assets/js/config.js and switches the site to live
// mode. Checks every value first and changes nothing if one is wrong. Then: build, check, commit, push.
//
//   node apps/web/scripts/go_live.mjs --ca <mint> --wallet "Payout wallet=<address>" --wallet "Dev wallet=<address>" ...
//        [--launched-at <ISO time>|now]          default: now (or launchAt already in config.js)
//        [--download-url <https .exe> --download-version 0.1.3 --sha256 <64 hex>]
//                                                default: the download already in config.js
//        [--buy <url>] [--dexscreener <url>] [--birdeye <url>] [--solscan <url>]
//                                                default: made from the contract address
//        [--dry-run]                             print the result, write nothing
//   node apps/web/scripts/go_live.mjs --prelaunch  back to pre-launch mode (keeps the values)
//
// A wallet can carry a short note: --wallet "Dev wallet=<address>=The 3% dev bag. Gets no payouts".
import { readFileSync, writeFileSync } from "node:fs";
import { CONFIG, SAMPLE_CA, checkConfig, isSolanaAddress, linksFor, loadConfig } from "./site_config.mjs";

const argv = process.argv.slice(2);
const flags = {};
const wallets = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) die(`unexpected argument: ${a}`);
  const k = a.slice(2);
  if (k === "dry-run" || k === "prelaunch" || k === "help") { flags[k] = true; continue; }
  const v = argv[++i];
  if (v === undefined || v.startsWith("--")) die(`--${k} needs a value`);
  if (k === "wallet") wallets.push(v);
  else flags[k] = v;
}
function die(msg) { console.error(`go_live: ${msg}`); process.exit(1); }
if (flags.help) { console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
const known = ["ca", "launched-at", "download-url", "download-version", "sha256", "buy", "dexscreener", "birdeye", "solscan", "dry-run", "prelaunch", "help"];
for (const k of Object.keys(flags)) if (!known.includes(k)) die(`unknown option --${k} (see --help)`);

let text = readFileSync(CONFIG, "utf8");
const { cfg: before } = loadConfig(text);

// Replaces the one-line `  key: value,` setting in config.js, keeping its comments.
function set(key, value) {
  const re = new RegExp(`^(  ${key}: ).*,$`, "m");
  if (!re.test(text)) die(`config.js has no one-line "${key}:" setting to replace`);
  text = text.replace(re, (m, head) => head + JSON.stringify(value) + ",");
}

if (flags.prelaunch) {
  set("mode", "prelaunch");
} else {
  const problems = [];
  // Contract address.
  const ca = flags.ca ?? before.ca;
  if (!ca) problems.push("--ca <contract address> is required");
  else if (ca === SAMPLE_CA) problems.push("--ca is the preview's sample address");
  else if (!isSolanaAddress(ca)) problems.push(`--ca is not a Solana address (base58, 32 bytes): ${ca}`);

  // Launch time.
  let launchAt = before.launchAt;
  if (flags["launched-at"] === "now" || (!flags["launched-at"] && !launchAt)) launchAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  else if (flags["launched-at"]) {
    const t = Date.parse(flags["launched-at"]);
    if (isNaN(t)) problems.push(`--launched-at is not a date: ${flags["launched-at"]}`);
    else if (t > Date.now() + 6 * 3600e3) problems.push(`--launched-at is in the future: ${flags["launched-at"]}`);
    else launchAt = new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
  }

  // Installer.
  let download = before.download;
  const dl = ["download-url", "download-version", "sha256"].filter((k) => flags[k]);
  if (dl.length && dl.length < 3) problems.push("give all three: --download-url, --download-version and --sha256");
  if (dl.length === 3) download = { url: flags["download-url"], version: flags["download-version"], sha256: flags.sha256.toLowerCase() };
  if (!download) problems.push("no installer: give --download-url, --download-version and --sha256 (from the release's SHA256SUMS.txt)");
  else {
    if (!/^https:\/\/github\.com\/hashcoinapp\//.test(download.url)) console.warn(`go_live: note: the installer isn't on github.com/hashcoinapp: ${download.url}`);
    if (!/\.exe$/i.test(download.url)) problems.push(`the installer link must end in .exe: ${download.url}`);
    if (!download.url.includes(download.version)) console.warn(`go_live: note: the installer link doesn't mention version ${download.version}`);
  }

  // Buy and chart links: only the ones given here; the rest are made from the address.
  const links = { ...(before.links ?? {}) };
  for (const k of ["buy", "dexscreener", "birdeye", "solscan"]) if (flags[k]) links[k] = flags[k];
  for (const [k, v] of Object.entries(links)) if (v && ca && !v.includes(ca)) console.warn(`go_live: note: the ${k} link doesn't contain the contract address: ${v}`);

  // Wallets we control.
  let list = before.wallets ?? [];
  if (wallets.length) {
    list = wallets.map((w) => {
      const [label, address, ...note] = w.split("=");
      return note.length ? { label: label.trim(), note: note.join("=").trim(), address: (address ?? "").trim() } : { label: label.trim(), address: (address ?? "").trim() };
    });
  }
  if (!list.length) problems.push('--wallet "Label=<address>" is required, once for every wallet we control');
  const seen = new Set();
  for (const w of list) {
    if (seen.has(w.address)) problems.push(`wallet listed twice: ${w.address}`);
    seen.add(w.address);
    if (w.address === ca) problems.push(`"${w.label}" is the contract address, not a wallet`);
  }

  if (problems.length) die(`nothing changed:\n- ${problems.join("\n- ")}`);
  set("mode", "live");
  set("launchAt", launchAt);
  set("ca", ca);
  set("download", download);
  set("links", Object.keys(links).length ? links : null);
  set("wallets", list);
}

// The same checks the build runs.
const { cfg } = loadConfig(text);
const errs = checkConfig(cfg);
if (errs.length) die(`nothing changed:\n- ${errs.join("\n- ")}`);

if (flags["dry-run"]) {
  console.log(text);
  console.log("go_live: dry run, config.js not written");
  process.exit(0);
}
writeFileSync(CONFIG, text);
if (flags.prelaunch) {
  console.log("go_live: config.js is back in pre-launch mode");
} else {
  const L = linksFor(cfg);
  console.log(`go_live: config.js is in live mode
  contract  ${cfg.ca}
  launched  ${cfg.launchAt}
  installer ${cfg.download.version}  ${cfg.download.url}
            sha256 ${cfg.download.sha256}
  buy       ${L.buy}
  charts    ${L.dexscreener}
            ${L.birdeye}
            ${L.solscan}
  wallets   ${cfg.wallets.map((w) => `${w.label}: ${w.address}`).join("\n            ")}
Next: open each link once, then
  node apps/web/scripts/build_pages.mjs
  python apps/web/scripts/build_standalone.py
  git add apps/web && git commit -m "Live mode: contract address" && git push`);
}
