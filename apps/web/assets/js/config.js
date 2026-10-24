// Site settings. Anything left null shows a clearly labeled placeholder.
// After a change: commit and push; Cloudflare Pages redeploys the site by itself (docs/HOSTING.md).
// Launch day: `node apps/web/scripts/go_live.mjs --ca <mint> ...` fills the launch values below and
// switches `mode` to "live" (see apps/web/README.md). Loaded in each page's <head>.
window.HASHCOIN = Object.assign({
  // "prelaunch" (waitlist, countdown, "at launch") or "live" (contract address, buy and chart
  // links, live payout numbers). Pages show [data-mode="prelaunch"] or [data-mode="live"] parts.
  mode: "prelaunch",
  // The site's own address, no trailing slash. The same domain is in the pages' <head>, robots.txt,
  // sitemap.xml and token/hash.json; change it everywhere with `node apps/web/scripts/set_domain.mjs <domain>`.
  site: "https://hashcoin.app",
  // The API (services/api on the backend PC, reached through the Cloudflare Tunnel).
  api: "https://api.hashcoin.app",
  // ISO 8601 launch time. The pre-launch hero counts down to it. Saturday Oct 24, 2026, 1:00 pm US
  // Eastern (EDT, so 17:00 UTC; user, Oct 19: "1pm est 10/24 i think"). null hides the countdown.
  launchAt: "2026-10-24T17:00:00Z",
  // Token contract address. Published on this site first, at launch. Never before.
  ca: null,
  // The waitlist form (it posts to <api>/v1/waitlist). The redesign (Oct 19) has no waitlist on the
  // site; the setting only matters if a page has a [data-waitlist] form.
  waitlist: true,
  // The Windows installer, from the GitHub release. null shows "coming soon".
  // { url: "https://github.com/<owner>/<repo>/releases/download/desktop-v0.1.0/HashcoinMiner-0.1.0-setup.exe",
  //   version: "0.1.0", sha256: "<64 hex characters from the release's SHA256SUMS.txt>" }
  download: null,
  // Live mode: buy and chart links. Any left out are made from `ca`: Jupiter, DexScreener, Birdeye, Solscan.
  links: null,
  // Live mode: every wallet we control, listed on the home page. [{ label: "Payout wallet", address: "..." }]
  wallets: [],
  // Social links. null shows "coming soon".
  x: "https://x.com/HashcoinSOL",
  discord: "https://discord.gg/XVYCbKD7mA",
  // The public code repo (public since launch day, Oct 24).
  github: "https://github.com/hashcoinapp/hashcoin",
}, window.HASHCOIN || {});
document.documentElement.dataset.mode = window.HASHCOIN.mode === "live" ? "live" : "prelaunch";
