# Hashcoin ($HASH): research brief

<!-- Mode blocks: build_pages.mjs keeps the prelaunch or the live blocks (config.js `mode`) and fills the {{...}} values. -->
The facts about Hashcoin in one place, for people and AI assistants researching it: what it is, how it works, the numbers, the risks and how to check each claim. Nothing here is financial advice or a promise of returns.

<!-- prelaunch -->
- Status: **pre-launch** (this version: October 19, 2026). **Launch: Saturday, October 24, 2026, 1 pm ET (17:00 UTC)**, with a countdown on the website.
<!-- /prelaunch -->
<!-- live -->
- Status: **live** since {{launchDate}}. It trades on a Meteora bonding curve until the curve fills, then on a Meteora DAMM v2 pool.
<!-- /live -->
- Website: https://hashcoin.app (FAQ: https://hashcoin.app/faq, calculator: https://hashcoin.app/calculator)
- X: https://x.com/HashcoinSOL
- Discord: https://discord.gg/XVYCbKD7mA
<!-- prelaunch -->
- Contract address: **not published yet.** It will appear on https://hashcoin.app first, at launch. Any address seen before that, or one that doesn't match the website, is not Hashcoin's.
<!-- /prelaunch -->
<!-- live -->
- Contract address: **{{ca}}** (Solana, Token-2022). It was published on https://hashcoin.app first; any other address is not Hashcoin's.
- Buy: {{buy}} (any Solana wallet or aggregator works)
- Chart and token: DexScreener {{dexscreener}}, Birdeye {{birdeye}}, Solscan {{solscan}}
- Live payouts: https://hashcoin.app/#live (the payout record, from https://api.hashcoin.app/v1/stats)
<!-- /live -->

## In one paragraph

$HASH is a Solana token with buying built in. Gaming PCs and other GPUs run the Hashcoin Windows app, which mines whichever coin pays each card the most. What they mine is sold, and the proceeds buy $HASH on the open market, every day; that $HASH is the miners' pay. On top of that, a 2–5% tax on every trade, set by a public formula, is paid back out to holders and to miners who hold $HASH. Holding earns from every trade, mining earns from your GPU, and doing both earns from both.

## What makes it different

- **Outside money comes in.** Most "holders earn from every trade" tokens only move money between their own traders. $HASH adds real value from outside: GPUs mine other coins (Pearl, Quantus, QubitCoin), and the proceeds of selling them buy $HASH on the market. Every GPU that joins adds more of that buying.
- **Mining pays well right now, and the app follows the best coin.** Pearl, the coin most newer NVIDIA cards mine, rose from about $0.59 in mid-September to about $1.87–2.10 in mid-October 2026, and what a GPU earns mining it rose with it. Coin prices move both ways, so the app re-checks every few hours and switches each card to whichever coin pays most: a drop in one coin doesn't stop the buying.
- **Miners have a reason to buy, too.** The miner bonus needs a $50+ bag, and higher levels need $500 and $2,500, multiplying the bonus 2× and 4×. So on top of the market buys from mining, miners who want the bigger bonus top up their bags with $HASH.
- **A tax that can't be dodged.** The tax is enforced by Solana's Token-2022 program on every transfer, in every pool, aggregator and wallet. Earlier tax-sharing tokens failed when traders simply bought somewhere else; that can't happen here.
- **It adjusts to the market.** A public formula sets the rate between 2% and 5%: quiet trading raises it so miners keep being paid, busy trading lowers it and holders take a bigger cut. Every change shows on-chain about 4 days before it applies.
- **Built for holders.** Your level comes from your bag, and selling counts 3× against it, so the people who hold keep their share and quick flippers lose theirs.
- **Fair launch.** 21,000,000 supply, minting switched off for good, no presale, no team or marketing allocation. The dev bag is 3%, bought in public as the first trade, and gets no payouts.
- **Low fees from the first second.** A flat 1% trading fee on the launch curve plus the 2% tax, with no high opening fee.
- **Everything on-chain.** Every payout is a Solana transaction, listed on the website with Solscan links.

## How it works

1. **Mining.** A user installs the Windows app, pastes a public Solana wallet address (never a seed phrase) and presses Start. The app detects each GPU, the server assigns the coin that pays that card the most, and the app mines on GPU power that isn't being used. It downloads only official miner releases (ForgeMiner and BzMiner) whose SHA-256 matches a list the server signs. Coins today: Pearl (PRL), Quantus (QUAN) and QubitCoin (QTC); the list follows what pays best.
2. **Market buys.** The platform sells the mined coins and buys $HASH with the proceeds. Miners are paid that $HASH.
3. **The tax.** Every transfer of $HASH pays the tax, collected by the token program itself.
4. **Payouts.** The collected tax is split by the formula below and paid out in $HASH:
   - **Miners who hold a bag** ($50 or more of $HASH) get a bonus on top of their mining, aiming to lift their average pay to 5× what their GPUs mined.
   - **Holders** share the rest, never less than 1% of every trade.
   - **Development** gets a small share (5–10% of the tax).

## The tax and the split

- **Rate:** 2–5%, in 0.25% steps. The formula picks the lowest rate at which miners reach, on average, 5× their mining **and** holders still get at least 1% of trading volume; otherwise 5%.
- **Split of the tax:**
  - Development: 5–10% (10% at a 2% tax, falling to 5% at a 5% tax).
  - Miners with a bag: 45–75%, what lifts their average to 5×.
  - Holders: the rest, never less than 20% of the tax or 1% of volume.
- **Per $100,000 traded:** $2,000–5,000 of tax; up to $3,750 to miners; at least $1,000 to holders; $200–250 to development.
- **On the launch curve the rate is fixed at 2%.** The formula starts once the token graduates to its permanent pool.
- **No burn.** Everything is paid out.

## Levels

One ladder, no waiting. Your bag sets your level, and the level counts for both holder rewards and the miner bonus.

| Level | Bag | Share |
|---|---|---|
| Level 1 | $50+ | 1× |
| Level 2 | $500+ | 2× |
| Level 3 | $2,500+ | 4× |

- **Selling counts 3×:** sell $100 of a $500 bag and the bag is $400 but counts as $200 (Level 2 → Level 1) until more is bought back. Buying counts at once. Selling everything starts you fresh. It's worked out from public on-chain transfers.
- **Holder share** = counted bag × level. **Miner bonus share** = √(the GPU's mining earnings) × level, so smaller cards get a bigger boost relative to what they mine.
- **Mined $HASH counts toward your bag**, so a miner can reach Level 1 by mining alone. Mining without a bag is paid in full, without the bonus.
- **Wallets can be linked** (by signing a free message), so moving $HASH between your own wallets doesn't count as selling.
- **Levels use the higher of the 1-hour and 7-day average price**, so a sudden dip doesn't drop anyone a level.

## Payouts

- **Miners:** about every 10 minutes, in $HASH, straight to their wallet. About 75% of the mining value is paid right away and the rest once the mined coin is sold, at the real sale price. If the platform overpays, it absorbs the difference; it never claws back.
- **Holders:** about every hour.
- **Recipients get the full amount:** the platform's own payouts pay the tax too, so it sends a little extra.
- **Public record:** every payout is a Solana transaction. <!-- prelaunch -->From launch, the website lists payouts with Solscan links and shows what each level was actually paid in the last 24 hours.<!-- /prelaunch --><!-- live -->The website's Live tab (https://hashcoin.app/#live) lists recent payouts with Solscan links; the raw record is at https://api.hashcoin.app/v1/stats.<!-- /live -->

## Earnings

What anyone earns depends on trading volume and how many GPUs are mining. <!-- prelaunch -->The calculator on the website shows estimates at launch-week trading (an average GPU earning about $3.50 a day).<!-- /prelaunch --><!-- live -->The calculator on the website uses what was actually paid in the last 24 hours.<!-- /live --> They're estimates, not promises.

## Tokenomics

- **Supply:** 21,000,000 $HASH, all created at launch. Minting and freezing are switched off for good.
- **Chain:** Solana, Token-2022 with the transfer-fee extension. 6 decimals.
- **Dev holding:** 3% of supply, bought openly at launch as the first trade, into one public wallet. It gets no miner or holder payouts.
- **No presale, no team or marketing allocation.**
- **Tax authority:** nobody can change the rate while the token is on its launch curve (Meteora's program holds it, at 2%). From graduation, a 2-of-3 multisig holds it and sets the rate the published formula gives.
<!-- prelaunch -->
- **Every wallet the project controls** is listed on the website from launch.
<!-- /prelaunch -->
<!-- live -->
- **Every wallet the project controls:**
{{wallets}}
<!-- /live -->

## Launch

- **When:** Saturday, October 24, 2026, 1 pm ET (17:00 UTC).
- **Where:** a Meteora bonding curve on Solana. When the curve fills, it migrates automatically to a permanent Meteora DAMM v2 pool. Jupiter and any Solana wallet can trade it.
- **Fees:** the curve's trading fee is a flat 1%, plus the 2% tax. After graduation, the pool fee is 0.25% plus the 2–5% tax. The platform's share of these fees funds mining payouts and running costs.
- **Contract address:** <!-- live -->{{ca}}, <!-- /live -->published on https://hashcoin.app first. The header's "CA" button copies it.
- **Other tokens use the HASH ticker**, on Solana and other chains. Only the contract address on https://hashcoin.app is Hashcoin's.

## The Windows app

<!-- prelaunch -->
- **Download:** opens at launch, from the website.
<!-- /prelaunch -->
- Windows, with an NVIDIA GPU at launch (AMD and Intel Arc are coming): gaming PCs, gaming laptops, AI rigs, editing and render workstations.
- Paste the address of the wallet you hold $HASH in (the one you buy with, e.g. your Fomo or GMGN wallet). Never an exchange deposit address.
- Mines only on GPU power that isn't in use; when a game or render needs the GPU, mining steps back. It pauses a card at 83 °C by default.
- Runs only official miner releases checked against a signed list, and coin assignments are signed, so a hijacked connection can't redirect mining.
- Needs only a public wallet address. Tray icon, stops when asked, uninstalls cleanly.
- **Verifiable:** the code is public<!-- prelaunch --> from launch<!-- /prelaunch --> at https://github.com/hashcoinapp/hashcoin, every installer is built by GitHub from that code with a signed build record (`gh attestation verify <installer> --repo hashcoinapp/hashcoin`), and each release lists its SHA-256 and a VirusTotal scan.
- Like most mining software, and because it isn't code-signed yet, it can trigger Windows SmartScreen or antivirus warnings. https://hashcoin.app/antivirus shows how to check the file is genuine.
<!-- live -->
- **Current installer:** version {{version}}, {{downloadUrl}}, SHA-256 `{{sha256}}`.
<!-- /live -->

## Safety

- Hashcoin never asks for a seed phrase or private key, and never DMs first.
- The contract address appears on the website first.

## Risks

- $HASH is a new, volatile token and can lose value.
- Payouts depend on trading volume, the number of miners and coin prices, and change day to day.
- Mining uses electricity and adds heat to hardware.
- The 2–5% tax applies to every buy, sell and transfer.
- The tax rate is set by a multisig the project controls, following the published formula; any change shows on-chain about 4 days ahead.
- Payouts are run by the project's payout service; every one is a public Solana transaction you can check.
- Mining and tokens are regulated differently by country.

## How to check

- The token's supply, tax rate and authorities: on Solscan, from the contract address on the website<!-- prelaunch --> (from launch)<!-- /prelaunch --><!-- live --> ({{solscan}})<!-- /live -->.
- Payouts: the website's payout list with Solscan links<!-- prelaunch --> (from launch)<!-- /prelaunch -->.
- The installer: its SHA-256 on the website, and its GitHub build record.
- The code: https://github.com/hashcoinapp/hashcoin (the payout engine is `packages/engine`)<!-- prelaunch -->, public from launch<!-- /prelaunch -->.
- The formula: the FAQ and the calculator on the website show the math.
