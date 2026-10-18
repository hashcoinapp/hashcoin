# Hashcoin ($HASH): research brief

A plain fact sheet about Hashcoin for people and AI assistants researching it: what it is, how it works, the numbers, the weak points, and how to check each claim. It's written by the project, so check the claims rather than taking them on trust; the last section says how. Nothing here is financial advice or a promise of returns.

- Status: **pre-launch** (this version: October 18, 2026). Launch is planned for late October 2026; the date is announced on the website.
- Website: https://hashcoin.app (FAQ: https://hashcoin.app/faq, calculator: https://hashcoin.app/calculator)
- X: https://x.com/HashcoinSOL
- Discord: https://discord.gg/XVYCbKD7mA
- Contract address: **not published yet.** It will appear on https://hashcoin.app first, at launch. Any address seen before that, or one that doesn't match the website, is not Hashcoin's.

## In one paragraph

$HASH is a Solana token (Token-2022) with a 2–5% tax on every transfer, buy and sell. The tax is paid back out to two groups: people who hold $HASH, and people who mine with the Hashcoin Windows app. The app mines whichever coin pays a user's GPU the most; the platform sells what was mined and uses it to buy $HASH on the open market, which is how miners are paid. So mining creates steady buying of $HASH, and trading creates the tax that rewards holders and gives miners who also hold $HASH a bonus. A public formula sets the tax rate and the split.

## How it works

1. **Mining.** A user installs the Windows app, pastes a public Solana wallet address (never a seed phrase) and presses Start. The app detects each GPU, the server assigns the coin that pays that card the most, and the app runs a miner on spare GPU power. The miners are third-party programs (ForgeMiner, which is closed-source, and BzMiner); the app downloads only the official release whose SHA-256 matches a list the server signs. Coins today: Pearl (PRL), Quantus (QUAN) and QubitCoin (QTC); the list can change.
2. **Market buys.** The platform sells the mined coins and buys $HASH with the proceeds. Miners are paid that $HASH.
3. **The tax.** Every transfer of $HASH, in any pool, aggregator or wallet, pays the tax. It is enforced by Solana's Token-2022 transfer-fee extension, so it can't be avoided by trading somewhere else.
4. **Payouts.** The collected tax is split by the formula below and paid out in $HASH:
   - **Miners who hold a bag** ($50 or more of $HASH) get a bonus on top of their mining, aiming to lift their average pay to 5× what their GPUs mined. Miners with no bag are paid for their mining only.
   - **Holders** share the rest, never less than 1% of every trade.
   - **Development** gets a small share (5–10% of the tax).

## Where the money comes from

- **Mining adds buying of 1× its value, no more.** A GPU that mines $3.50 a day leads to $3.50 a day of $HASH bought on the market.
- **The bonus is not new buying.** It is $HASH collected as tax from traders and handed to miners with a bag. So miners are paid by trading volume.
- **If miners sell what they're paid, mining adds more selling than buying.** That's why the bonus only goes to miners who hold at least $50 of $HASH, grows with the bag (levels), and is scaled by how much of their recent pay they've kept (below). Selling also resets the hold clock. Whether miners hold is still up to them.
- **Holder rewards are trading volume × the tax.** When trading slows, rewards shrink and the tax rises to 5%.

How it works out per mining GPU, if every miner holds a bag (average GPU, $3.50 a day; the engine's own formula):

| Daily trading volume per mining GPU | Tax | A miner's pay | New buying from mining | Holders' cut of volume |
|---|---|---|---|---|
| $50 | 5% | 1.5× ($5.38) | $3.50 | 1% |
| $100 | 5% | 2.1× ($7.25) | $3.50 | 1% |
| $200 | 5% | 3.1× ($11.00) | $3.50 | 1% |
| $370 | 5% | 5× ($17.38) | $3.50 | 1% |
| $750 | 3.25% | 5× ($17.50) | $3.50 | 1.13% |
| $1,500 | 2.25% | 5.3× ($18.69) | $3.50 | 1.02% |

The 5× target needs about $370 of daily trading per mining GPU. With 1,000 GPUs mining, that's about $370,000 of trading a day. Below it, miners get less than 5× and the tax stays at 5%.

## The tax and the split

- **Rate:** 2–5%, in 0.25% steps. The formula picks the lowest rate at which miners reach, on average, 5× their mining **and** holders still get at least 1% of trading volume. If no rate in the range does both, the rate is 5%. In practice the lowest reachable rate is 2.25%.
- **Busy trading lowers the tax; quiet trading raises it** (and more of it then goes to miners).
- **Split of the tax:**
  - Development: 5–10% of the tax (10% at a 2% tax, falling to 5% at a 5% tax).
  - Miners with a bag: 45–75% (what lifts their average to 5×, capped so holders keep at least 20% of the tax).
  - Holders: the rest, and always at least 1% of volume.
- **Example, per $100,000 traded:** $2,000–5,000 of tax; up to $3,750 to miners; at least $1,000 to holders; $200–250 to development.
- **Rate changes are public in advance.** Token-2022 applies a new rate only two epochs after it's set (about 4 days), so every change is visible on-chain before it takes effect.
- **On the launch curve the rate is fixed at 5%.** The formula starts after the token graduates to its permanent pool (see Launch).
- **No burn.** All of the holder side is paid out.

## Levels

One ladder. The bag sets the level, and the level counts for both holder rewards and the miner bonus.

| Level | Requirement | Weight |
|---|---|---|
| No bag | Under $50 | Mining is paid; no holder rewards, no bonus |
| Level 1 | Hold at least $50 of $HASH | 1× |
| Level 2 | Hold at least $500, with 24 hours on the hold clock | 2× |
| Level 3 | Hold at least $2,500, with 7 days on the hold clock | 4× |

- **Holder share** = bag × weight.
- **Miner bonus share** = √(the GPU's mining earnings in USD) × weight. The square root gives smaller cards a bigger boost relative to what they mine.
- Mined $HASH counts toward the bag, so a miner can reach Level 1 by mining alone.
- **Keep what you earn:** the miner bonus is also scaled by how much of the last 14 days' payouts the wallet hasn't sold: kept = 1 − (sent out − bought in) ÷ paid, between 0 and 1. Kept it all, full bonus; sold half, half the bonus; sold it all, none. The bonus given up stays with holders. It's computed from public on-chain transfers.
- **Hold clock:** starts when a bag first reaches $50 and keeps running through price dips. Bigger bags age faster (1× up to $2,500, 2× at $5,000, 3× at $7,500+). **Selling or sending $HASH out resets it.** Wallets can be linked (by signing a message) so moving between your own wallets doesn't count.
- **Prices for levels** use the higher of the 1-hour and 7-day average prices, so a sudden dip doesn't drop a level; a level lost in a long dip returns as soon as the bag is back above the line.
- Splitting a bag across wallets earns nothing extra: holder rewards follow bag size.

## Payouts

- **Miners:** about every 10 minutes, in $HASH, straight to their wallet. Mined coins can take hours to confirm and sell, so about 75% of the estimated mining value is paid right away and the rest once the coin is sold, trued up to the actual sale price. Overpayments are absorbed by the platform, never clawed back.
- **Holders:** hourly or daily (still being decided before launch).
- **Mined $HASH counts as a bag**, so miners also earn holder rewards and can reach higher levels.
- **Our own payouts pay the tax too** (Token-2022 has no exemptions). The platform sends a little extra so recipients get the full amount.
- **Public record:** every payout is a Solana transaction. After launch the website lists payouts with Solscan links and shows what each level was actually paid in the last 24 hours.

## Earnings estimates

Earnings depend on one ratio: daily trading volume divided by the number of GPUs mining. The website's calculator shows estimates at an assumed launch-week level of trading ($750 of daily volume per mining GPU, an average GPU earning $3.50/day). These are illustrations, not forecasts. Real payouts depend on volume, the number of miners and coin prices, and can fall to near zero.

## Tokenomics

- **Supply:** 21,000,000 $HASH, all created at launch. Minting and freezing are switched off for good.
- **Chain:** Solana, Token-2022 with the transfer-fee extension. 6 decimals.
- **Dev holding:** 1% of supply, bought openly at launch as the first trade, into one public wallet. Not locked. The dev wallet gets no miner or holder payouts.
- **No presale, no team or marketing allocation.**
- **Tax authority:** nobody can change the rate while the token is on its launch curve (Meteora's program holds it, at 5%). At graduation it passes to the platform's payout wallet, which hands it straight to a 2-of-3 multisig. It is used only to set the rate the published formula gives.
- **Every wallet the project controls** will be listed on the website at launch.

## Launch

- **Venue:** a Meteora Dynamic Bonding Curve on Solana. The token trades on the curve until it reaches its graduation target, then migrates automatically to a Meteora DAMM v2 pool (25% of supply goes into that pool; the rest is sold on the curve). Any Solana wallet or aggregator, such as Jupiter, can trade it.
- **Anti-sniper fee:** the curve's trading fee starts at 20% and falls to 1% over the first 5 minutes.
- **Platform fees:** the curve's trading fee (1% after the first minutes; Meteora keeps 20% of it) and a 0.25% pool fee after graduation go to the platform in SOL. They fund the immediate share of mining payouts and running costs.
- **Trading costs:** on the curve, each buy or sell pays the 5% tax plus the 1% fee, so a round trip costs about 12% (more in the first 5 minutes). After graduation it's the 2–5% tax plus the 0.25% pool fee each way. Some aggregator routes handle transfer-tax tokens less well, so check the quote before you swap.
- **Contract address:** published on https://hashcoin.app first. The header's "CA" button copies it.
- **Other tokens use the HASH ticker**, on Solana and other chains. Only the contract address on https://hashcoin.app is Hashcoin's.

## The Windows app

- Windows, with an NVIDIA, AMD or Intel Arc GPU: gaming PCs, gaming laptops, AI rigs, editing and render workstations.
- Mines only on GPU power that isn't in use; when a game or render needs the GPU, mining steps back.
- Downloads only miners whose hash matches a signed list. Coin assignments are signed, so a hijacked connection can't redirect mining.
- Tray icon, stops when asked, uninstalls cleanly. Starting with Windows is off unless the user turns it on.
- **Not code-signed at launch, from a team that doesn't publish its names.** Windows SmartScreen may warn ("Windows protected your PC"), and antivirus products, including Microsoft Defender, may flag it, as they do many crypto miners. The website explains how to check it and, if the user chooses, allow it: https://hashcoin.app/antivirus. Hashcoin never asks anyone to turn off their antivirus.
- **How to check the installer:**
  - **Source code:** public at https://github.com/hashcoinapp/hashcoin.
  - **Built by GitHub, not on someone's PC:** every installer comes with a GitHub build attestation tying it to the exact public commit that built it (`gh attestation verify <installer> --repo hashcoinapp/hashcoin`).
  - **SHA-256 and VirusTotal:** each release lists its SHA-256 and a VirusTotal link.
- **If you're cautious:** the app needs no wallet keys, so you can run it on a PC or Windows account that holds no wallets.

## Safety

- Hashcoin never asks for a seed phrase or private key, and never DMs first.
- The app needs only a public wallet address.
- The contract address appears on the website first.

## Risks

- $HASH is new and volatile and can lose most or all of its value.
- Payouts depend on trading volume, the number of miners, coin prices and pool results, and can fall to near zero.
- Mining costs electricity and adds heat and wear to hardware; those costs are the user's.
- The 2–5% tax applies to every buy, sell and transfer, and selling resets the hold clock.
- New software can have bugs. The backend runs on a single server at launch; if it is offline, payouts pause until it is back.
- The tax authority is held by the project (a 2-of-3 multisig from graduation on). The 2–5% range is the project's published formula, not an on-chain limit; any change is visible on-chain about 4 days before it applies.
- Payouts are calculated by the project's server. The engine's code is public and every payout is on-chain, but you are trusting the project to run it as published.
- Miners who sell their pay add selling pressure (see "Where the money comes from").
- No independent audit or outside coverage yet.
- Mining and tokens are regulated differently by country.

## How to check

- The token's supply, tax rate and authorities: on Solscan, from the contract address on the website (after launch).
- Payouts: the website's public payout list with Solscan links (after launch).
- The installer: compare its SHA-256 with the one on the website, and check its GitHub build attestation.
- The code: https://github.com/hashcoinapp/hashcoin (the payout engine is `packages/engine`).
- The formula: the FAQ and the calculator on the website show the math.
