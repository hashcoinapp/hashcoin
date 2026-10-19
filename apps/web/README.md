# Hashcoin website (`apps/web`)

A static marketing site. Plain HTML, CSS and JavaScript with no framework and no wallet connection. The waitlist posts to the API (`services/api`) once `config.js` opens it; the download link, its SHA-256 and the contract address come from `config.js`. The site has two versions, **pre-launch** and **live**, switched by one setting (below).

**Hosting:** Cloudflare Pages at https://hashcoin.app (root directory `apps/web`, build command `node scripts/build_pages.mjs`, output `dist`). `build_pages.mjs` copies only the public files into `dist/` and fails the build on a broken link, a wrong-domain og/canonical URL or bad token metadata. Setup and the launch checklist: `docs/HOSTING.md`.

## Run it

Either open `index.html` directly in a browser, or serve the folder:

```sh
cd apps/web
python3 -m http.server 8000
# open http://localhost:8000
```

`index.html` needs the `assets/` and `brand/` folders beside it. If you open or share the HTML file on its own (a preview pane, a download, a chat attachment), it shows up unstyled. For that, use the single-file copies in `standalone/`. They have the CSS, JS and logo built in. Rebuild them after any change:

```sh
python3 apps/web/scripts/build_standalone.py
```

Fonts (Manrope for headlines, labels and numbers, Inter for body text, IBM Plex Mono only in the math formulas) load from Google Fonts. Offline, the site falls back to system fonts and still works.

**Preview link:** https://claude.ai/artifact/6mwmqXA78PGKKqr17gNmSc (private claude.ai artifact, republished after each change). `python3 apps/web/scripts/artifact_page.py` turns `standalone/` into the artifact files in `.artifact/` (publish steps in its docstring and in `docs/HANDOFF.md`).

**Check it in a browser:** serve the folder on port 8123, then `node apps/web/scripts/check_site.mjs` (needs Playwright). It checks the hero fits the window, the flywheel caption never changes height, and there's no horizontal scroll or page error at six sizes from phone to 2560 wide, and saves screenshots to `.shots/`.

## Pre-launch and live mode

`mode` in `assets/js/config.js` picks the version: `"prelaunch"` (what hashcoin.app shows until launch: waitlist, countdown, "at launch") or `"live"`. One codebase serves both: `config.js` loads in each page's `<head>` and sets `<html data-mode>`, and CSS hides `[data-mode="live"]` parts in pre-launch and `[data-mode="prelaunch"]` parts in live mode, before the page paints.

Live mode changes:
- **Header:** "Buy $HASH" (Jupiter) instead of "Join the waitlist"; the "CA" button shows and copies the address.
- **Hero:** Buy button, the contract address with a copy button, DexScreener / Birdeye / Solscan links.
- **Launch tab becomes Live:** the address, buy and download, chart links, the launched timeline (launch curve, then graduation to a Meteora DAMM v2 pool, from the API's `market.phase`), the live payout numbers and every wallet we control.
- **Live numbers** (`assets/js/live.js`): `<api>/v1/stats` every minute: the tax now, the last round's split, traded and paid in the last 24h, wallets, recent payout rounds with Solscan links. A 503 ("no payout rounds yet"), an error, a non-mainnet record or another mint shows a plain note and the Solscan link instead. "Paid in the last 24h, per wallet" by level shows only once the API publishes `levels24h` (`{ "1": { wallets, paidUsd }, "2": ..., "3": ... }`); `services/payouts/src/publish.ts` publishes it from Oct 18: bonus and holder rewards paid today (UTC), per level; `null` until a level 1+ wallet is paid.
- **Stats strip** under the header (home page): market cap, GPUs mining now, ready to pay out (tax collected, not yet paid) and paid out so far (USD and $HASH), from `marketCapUsd`, `miners`, `readyToPayUsd`, `paidUsd`. "—" while the API isn't answering.
- **Calculators at the last 24 hours' payouts:** the home page's earnings (and level tables) and `calculator.html` use the API's `calc` rates (`HashModel.setLive`, set by `live.js`): mining from hashrate.no as before, plus bonus = `bonusPerSqrtUsdDay` × √(GPU $/day) × level weight and holder rewards = `holderPerWeightedUsdDay` × bag × level weight, labelled "Based on the last 24 hours of payouts, not a promise". The calculator page can switch to "Your estimate" (the pre-launch inputs). Before there's at least an hour of rounds, or while the API isn't answering, both show the pre-launch estimate. The math section and the hero flywheel stay on the estimate.
- **Copy:** FAQ ("When did it launch?", "Where can I buy it?", the contract address, payouts, wallets), tokenomics (contract, wallets), the tax-pot simulation's note, the calculator's intro, footers. The risk text stays.
- **`brief.md` and `llms.txt`:** `<!-- prelaunch -->…<!-- /prelaunch -->` and `<!-- live -->…<!-- /live -->` blocks; `build_pages.mjs` keeps the current mode's blocks and fills `{{ca}}`, `{{buy}}`, `{{launchDate}}`, `{{wallets}}` and the rest from `config.js`. The deployed copies never contain the markers.

**Go live** (launch day, `docs/LAUNCH-RUNBOOK.md` step 16):

```sh
node apps/web/scripts/go_live.mjs --ca <mint> \
  --wallet "Payout wallet=<address>=Collects the tax, pays miners and holders" \
  --wallet "Dev wallet=<address>=The 1% dev bag. Gets no payouts" \
  --wallet "Launch wallet=<address>"
  # add --download-url <installer .exe> --download-version 0.1.3 --sha256 <64 hex> if download isn't set yet
node apps/web/scripts/build_pages.mjs && python3 apps/web/scripts/build_standalone.py
git add apps/web && git commit -m "Live mode: contract address" && git push
```

It checks every value (a real 32-byte Solana address, not the sample one; https links; a 64-hex SHA-256; an `.exe` installer; no wallet twice) and writes nothing if one is wrong. `--launched-at` defaults to now; buy and chart links are made from the address unless given (`--buy`, `--dexscreener`, `--birdeye`, `--solscan`). `--dry-run` prints the result; `--prelaunch` switches back. `build_pages.mjs` refuses live mode without `ca`, `download`, `launchAt` and `wallets`, and refuses any deployable build that contains the sample address.

**Preview live mode without publishing it** (sample values from `scripts/live-sample.js`, an obviously fake address, and a banner saying so):

```sh
node apps/web/scripts/build_pages.mjs --live-preview --serve 8125     # dist-live/, http://localhost:8125
python3 apps/web/scripts/build_standalone.py --live-preview           # standalone-live/
python3 apps/web/scripts/artifact_page.py --live-preview              # .artifact-live/, for its own artifact
```

All three outputs are git-ignored; Cloudflare only builds `dist/` from `config.js`. Check them with `BASE=http://localhost:8125 node apps/web/scripts/check_site.mjs`. The live-mode preview is its own artifact (never the main preview link): https://claude.ai/artifact/ADBynEvLLt4CyZSio946K6

## Pages

| File | What it is |
|---|---|
| `index.html` | Home: hero ("The first token your GPU gets paid to buy.", hold it / mine it / or both) beside two animated flywheels (the coin, your bag), then a topic explorer showing one topic at a time: what you'd make, how it works, levels, tokenomics, mining (with screenshots of the real app), launch, FAQ |
| `calculator.html` | Full calculator: GPU, power, electricity, miner level, bag and holder level, volume per GPU, average GPU and miner level mix |
| `faq.html` | FAQ and docs: getting started, mining, payouts, levels, token, safety, risks |

## Files

| Path | Purpose |
|---|---|
| `assets/css/site.css` | All styles. Design tokens are at the top (`--bg #0B0C0D`, `--gold #EBB447`, 8px radius), then the light theme. Gold used as text goes through `--gold-text-mix` so it darkens in light mode |
| `assets/img/app-dark.jpg`, `app-light.jpg` | Screenshots of the miner app (`apps/desktop/ui`) with a sample wallet, shown on the Mining tab; the one matching the site theme shows. Retake them when the app changes |
| `assets/js/config.js` | **Launch settings:** `mode` (`prelaunch` or `live`), `site`, `api`, `launchAt`, `ca` (contract address), `waitlist` (opens the form), `download` (`url`, `version`, `sha256`), `links` (buy and chart links; made from `ca` when left out), `wallets` (every wallet we control, live mode), `x`, `discord`, `github`. Placeholders until set |
| `assets/js/live.js` | Live mode, home page: the live payout numbers from `<api>/v1/stats` |
| `scripts/go_live.mjs`, `scripts/site_config.mjs` | Launch day: fill `config.js` and switch to live mode; the shared settings checks |
| `scripts/live-sample.js` | Made-up launch values for the live-mode preview (never deployed) |
| `token/hash.json`, `token/hash.png` | Token metadata (`--uri` for the launch script) and its 512×512 logo |
| `_headers`, `robots.txt`, `sitemap.xml`, `404.html`, `wrangler.toml` | Cloudflare Pages: security headers, crawlers, unknown URLs, project settings |
| `scripts/build_pages.mjs`, `scripts/set_domain.mjs` | Build + check `dist/` for Cloudflare (`--serve` to preview it); move to another domain |
| `assets/js/site.js` | Shared behavior: header, light/dark button (dark by default; a choice is stored as `hc-theme` and applied before paint by a one-line script in each page's head), mobile menu, placeholder toasts, countdown, contract-address button, scroll reveal |
| `standalone/` | Generated single-file copies of the pages (see above) |
| `assets/js/model.js` | The pre-launch estimate for the decided design: a 2–5% tax (the lowest rate where miners reach 5× their mining and holders still get at least 1% of volume); dev 5–10% of the tax, miners 45–75%, holders the rest (at least 20%). Miner weight = √(GPU $/day) × M-level; holder weight = bag × H-level. Default $750 volume per GPU a day |
| `assets/js/home.js`, `assets/js/calculator.js` | Page logic. Home: topic tabs (one section shown at a time, `#hash` links open tabs), earnings with auto-cycling levels, GPU meter, tax-pot simulation; on big screens `fitExplore` scales the explorer to fill the screen |
| `assets/js/cycle.js` | Hero flywheels: two rings (the coin, your bag) built from one `makeWheel` engine, with a controller for the tabs, shared caption, step buttons and pause |
| `assets/js/gpus.js` | **Generated** GPU list (145 cards: 103 from `data/hashrate-no-gpus-2026-10-14.json`, plus 42 laptop GPUs estimated from desktop siblings and marked `est`) |
| `scripts/build_standalone.py`, `scripts/artifact_page.py` | Build the single-file pages; turn them into the artifact files |
| `scripts/check_site.mjs` | Browser check at six screen sizes (Playwright) |
| `scripts/gen_gpus.py` | Regenerates `gpus.js`: `python3 apps/web/scripts/gen_gpus.py data/<file>.json` (from the repo root) |
| `brand/` | Logo files, logo explorations and the website questionnaire |

## At launch

1. Set `launchAt` in `assets/js/config.js` when the date is decided. The countdown starts on its own.
2. The contract address only when the token is live, with `go_live.mjs` (above). Never before launch.
3. Set the `x`, `discord` and `github` links. The X link also goes in `token/hash.json` (`twitter`, top level and in `extensions`); the build checks they match.
4. `waitlist: true` once the API answers at `https://api.hashcoin.app/v1/health`; `download` when the release is published (the SHA-256 shows beside the button and on `antivirus.html#check`).
5. Live mode lists payouts and wallets from the API and `config.js`. Still missing: the wallet page (wallet linking) the FAQ mentions.
6. The "Your PC" tab says mining only uses spare GPU power and your PC works like normal. That's the user's experience mining PRL; change the copy if another coin or miner the app uses behaves differently.

## Copy rules

From `CLAUDE.md` and `docs/DESIGN-BRIEF.md`:
- Never promise returns. Avoid "pays for itself", "free" and "guaranteed". Price charts are fine (the user never ruled them out).
- Show one estimate, based on daily volume per GPU mining ($750 by default, launch-week trading), labeled "Estimate, not a promise". The math is on the home page (`#math`, inside How it works).
- Tax wording: a 2–5% tax set by a public formula; up to 3.75% to miners (what reaches 5× their mining on average); at least 1% to holders; 5–10% of the tax to development. Levels are M1–M3 and H1–H3; always explain them in plain words before using the codes. Level colors: 1 mint, 2 violet, 3 gold.
- Audience wording: "your GPU" / "any PC with a graphics card" (gaming PCs, laptops, AI rigs, editing and render workstations), not just "gaming PC". Keep copy to a line or two per block.
- Say "tax" rather than "fee" on the site; that's the word traders use.
- Keep "we will never ask for your seed phrase" and the risk disclaimer in the footer.

"Works with" uses plain-text names rather than logos. Check each brand's trademark rules before swapping in official logos.
