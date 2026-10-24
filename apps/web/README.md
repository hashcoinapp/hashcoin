# Hashcoin website (`apps/web`)

A static marketing site. Plain HTML, CSS and JavaScript with no framework. Sign in (live mode) reads a public wallet address only: no signatures, no transactions. The download link, its SHA-256, the launch time and the contract address come from `config.js`. The site has two versions, **pre-launch** and **live**, switched by one setting (below).

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

**Check it in a browser:** serve the folder on port 8123, then `node apps/web/scripts/check_site.mjs` (needs Playwright). Every page at 375, 768, 1280, 1366×768, 1440, 1920 and 2560 wide, dark and light: no horizontal scroll, no page error, no visible text under 13px; on the home page the headline and buttons fit the first screen, on desktop the card's result is above the fold and the card is at most 480px tall, and the card works (type a GPU, pick a level, open Hold). Screenshots go to `.shots/` (the home page full length). `SIZES`, `THEMES`, `PAGES` and `SHOTS=0` narrow it.

## Pre-launch and live mode

`mode` in `assets/js/config.js` picks the version: `"prelaunch"` (what hashcoin.app shows until launch: the countdown, Download and Sign in coming at launch, "at launch") or `"live"`. One codebase serves both: `config.js` loads in each page's `<head>` and sets `<html data-mode>`, and CSS hides `[data-mode="live"]` parts in pre-launch and `[data-mode="prelaunch"]` parts in live mode, before the page paints.

Live mode changes:
- **Header:** the CA chip (copies the address), Sign in, and "Buy $HASH" (Jupiter) instead of "Download for Windows". Before launch Sign in and Download are greyed out and only say they open at launch.
- **Hero:** Buy $HASH and Download for Windows instead of Download (coming at launch) and See what you'd make; the contract address with a copy button instead of the launch countdown (`launchAt`, shown in US Eastern time; "Launching now" at zero). The calculator card's button is Download for Windows (Mine) or Buy $HASH (Hold); before launch the card has none.
- **Get $HASH** (the closing section, instead of the waitlist): the address with Copy, Buy on Jupiter, Download, DexScreener / Birdeye / Solscan links. **Tokenomics** adds the tax now, the market (curve or DAMM v2 pool, from the API's `market.phase`), recent payouts with Solscan links and every wallet we control; each **level card** adds what that level was paid per wallet in the last 24h (`levels24h`).
- **Live numbers** (`assets/js/live.js`): `<api>/v1/stats` every minute. A 503 ("no payout rounds yet"), an error, a non-mainnet record or another mint shows a plain note and the Solscan link instead, and the numbers stay "—". The per-level 24h pay shows once the API publishes `levels24h` (`services/payouts/src/publish.ts`, from Oct 18).
- **Stats row** under the calculator card: four numbers in one quiet row: paid out so far (and in $HASH), waiting for the next round (with a countdown), market cap (and price), mining now (the GPUs' combined current hashrate on Pearl, e.g. 28.7 PH/s, and the GPU count; just the count if there's no hashrate). From `paidUsd`, `readyToPayUsd`, `schedule`, `marketCapUsd`, `miners` (`miners.hashrate.PRL`). Before launch the same row shows three facts (supply, tax, dev bag). "—" while the API isn't answering.
- **Calculators at the last 24 hours' payouts:** the calculator card (home page and top of `calculator.html`) and the calculator page's detailed results use the API's `calc` rates (`HashModel.setLive`, set by `live.js`): mining from hashrate.no as before, plus bonus = `bonusPerSqrtUsdDay` × √(GPU $/day) × level weight and holder rewards = `holderPerWeightedUsdDay` × bag × level weight, labelled "At the last 24 hours' payouts, not a promise". The detailed results can switch to "Your estimate" (the pre-launch inputs). Before there's at least an hour of rounds, or while the API isn't answering, they show the pre-launch estimate. The math on the calculator page stays on the estimate.
- **Copy:** FAQ ("When did it launch?", "Where can I buy it?", the contract address, payouts, wallets), the home FAQ's "How much will I make?", the calculator's intro, footers (the contract address). The risk text stays.
- **`brief.md` and `llms.txt`:** `<!-- prelaunch -->…<!-- /prelaunch -->` and `<!-- live -->…<!-- /live -->` blocks; `build_pages.mjs` keeps the current mode's blocks and fills `{{ca}}`, `{{buy}}`, `{{launchDate}}`, `{{wallets}}` and the rest from `config.js`. The deployed copies never contain the markers.

**Go live** (launch day, `docs/LAUNCH-RUNBOOK.md` step 16):

```sh
node apps/web/scripts/go_live.mjs --ca <mint> \
  --wallet "Payout wallet=<address>=Collects the tax, pays miners and holders" \
  --wallet "Dev wallet=<address>=The 3% dev bag. Gets no payouts" \
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
| `index.html` | Home (redesign, Oct 19: `docs/SITE-REDESIGN.md`, then the user's rounds: compact card; life and colour back): a centred hero (a mining scene: a pickaxe strikes a Pearl coin and Hashcoins burst out, SVG and CSS, paused off screen, a still frame with reduced motion; beside the headline on short desktop screens; then the headline, one sentence, two buttons, the launch countdown before launch) over the calculator card (Mine / Hold; RTX 5090 by default; the level plays No bag → Level 3 every 2.5 s until someone picks a level or a GPU), a stats row, then plain sections: how it works (three steps; step 2 has a simulated trade tape; then "The tax adjusts itself": trading per GPU sweeps quiet to busy and the rate and split follow `model.js`, until someone moves the slider), levels (in their colours: 1 mint, 2 violet, 3 gold; then "Selling counts 3×": a $500 bag, sell $100, it counts as $200 and drops to Level 1, buy back $300 for Level 2, played once in view, with Replay), the miner app (screenshots of the real app), tokenomics, FAQ (six questions), and Get $HASH (live). No waitlist on the site (the API keeps its endpoint) |
| `calculator.html` | Full calculator: GPU, power, electricity, miner level, bag and holder level, volume per GPU, average GPU and miner level mix |
| `faq.html` | FAQ and docs: getting started, mining, payouts, levels, token, safety, risks |

## Files

| Path | Purpose |
|---|---|
| `assets/css/site.css` | All styles. The brief's tokens are at the top (dark `--bg #0E0F11`, surface `#16181B`; light `#FAFAF9` / white; one accent, `--accent #EBB447`, with `--accent-text #A86F0B` for gold text on white), then the light theme. Manrope for headlines and numbers, Inter for body, nothing under 13px. On screens 2300px+ the page scales up (`zoom` 1.2) |
| `assets/img/app-dark.jpg`, `app-light.jpg` | Screenshots of the miner app (`apps/desktop/ui`) with a sample wallet, shown on the Mining tab; the one matching the site theme shows. Retake them when the app changes |
| `assets/img/coins/prl.png` | The Pearl (PRL) icon, sent by the user (Oct 19). Used unchanged as the coin being struck in the hero's mining scene, on a white face with a silver rim (Pearl is a coin the app mines; the site claims no link with Pearl) |
| `assets/js/config.js` | **Launch settings:** `mode` (`prelaunch` or `live`), `site`, `api`, `launchAt`, `ca` (contract address), `waitlist` (opens the form), `download` (`url`, `version`, `sha256`), `links` (buy and chart links; made from `ca` when left out), `wallets` (every wallet we control, live mode), `x`, `discord`, `github`. Placeholders until set |
| `scripts/go_live.mjs`, `scripts/site_config.mjs` | Launch day: fill `config.js` and switch to live mode; the shared settings checks |
| `scripts/live-sample.js` | Made-up launch values for the live-mode preview (never deployed) |
| `token/hash.json`, `token/hash.png` | Token metadata (`--uri` for the launch script) and its 512×512 logo |
| `_headers`, `robots.txt`, `sitemap.xml`, `404.html`, `wrangler.toml` | Cloudflare Pages: security headers, crawlers, unknown URLs, project settings |
| `scripts/build_pages.mjs`, `scripts/set_domain.mjs` | Build + check `dist/` for Cloudflare (`--serve` to preview it); move to another domain |
| `assets/js/site.js` | Shared behavior: header, light/dark button (dark by default; a choice is stored as `hc-theme` and applied before paint by a one-line script in each page's head), mobile menu, placeholder toasts, countdown, contract-address button, scroll reveal |
| `standalone/` | Generated single-file copies of the pages (see above) |
| `assets/js/model.js` | The pre-launch estimate for the decided design: a 2–5% tax (the lowest rate where miners reach 5× their mining and holders still get at least 1% of volume); dev 5–10% of the tax, miners 45–75%, holders the rest (at least 20%). Miner weight = √(GPU $/day) × M-level; holder weight = bag × H-level. Default $750 volume per GPU a day |
| `assets/js/card.js`, `assets/js/calculator.js` | The calculator card (Mine: a searchable GPU picker with popular cards first and a level; Hold: a bag; numbers glide when they change), used on the home page and the calculator page; the calculator page's detailed inputs and results |
| `assets/js/account.js` | Sign in (live mode): connect Phantom or Solflare (public key only: never a signature or a transaction) or paste a public address; shows the bag, the bag that counts for the level, the level and what's needed for the next one, and what was paid, from `<api>/v1/wallet/<address>`. Warns if what's pasted looks like a seed phrase. Remembers the address in this browser (`hc-wallet`). Before launch: a toast |
| `assets/js/home.js` | The simulated trade tape in How it works (only while on screen; none with reduced motion) |
| `assets/js/live.js` | Live mode: the stats row, the 24h pay on the level cards, the tax now and market line, recent payouts, and the 24h rates for the calculators (from `<api>/v1/stats`) |
| `assets/js/gpus.js` | **Generated** GPU list (145 cards: 103 from `data/hashrate-no-gpus-2026-10-14.json`, plus 42 laptop GPUs estimated from desktop siblings and marked `est`) |
| `scripts/build_standalone.py`, `scripts/artifact_page.py` | Build the single-file pages; turn them into the artifact files |
| `scripts/check_site.mjs` | Browser check: every page at five sizes, dark and light (Playwright) |
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
