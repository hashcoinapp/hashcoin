// Sample launch values for previewing live mode. Never deployed: build_pages.mjs --live-preview and
// build_standalone.py --live-preview add it after config.js in their own output folders only.
// Every address, hash and number here is made up.
(function () {
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const tx = (n) => "https://solscan.io/tx/SAMPLEtxNotReaL" + n;
  window.HASHCOIN = Object.assign(window.HASHCOIN || {}, {
    mode: "live",
    preview: "Live-mode preview with sample values. The address, links and numbers are made up.",
    launchAt: "2026-10-24T16:00:00Z",
    ca: "SAMPLEcaNotReaLDoNotBuyHASH11111111111111",
    download: {
      url: "https://github.com/hashcoinapp/hashcoin/releases/download/desktop-v0.1.3/HashcoinMiner-0.1.3-setup.exe",
      version: "0.1.3",
      sha256: "5a3f0c1e9b7d2a4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d",
    },
    wallets: [
      { label: "Payout wallet", note: "Collects the tax, pays miners and holders", address: "SAMPLEpayoutWa11etNotReaL1111111111111111" },
      { label: "Dev wallet", note: "The 1% dev bag. Gets no payouts", address: "SAMPLEdevWa11etNotReaL111111111111111111" },
      { label: "Multisig, 2-of-3", note: "Holds the tax rate from graduation", address: "SAMPLEmu1tisigNotReaL1111111111111111111" },
      { label: "Launch wallet", note: "Created the token", address: "SAMPLE1aunchWa11etNotReaL111111111111111" },
    ],
  });
  document.documentElement.dataset.mode = "live";
  // A launch day at the estimate's own ratio: $504K market cap, $150K traded, 200 GPUs mining
  // ($750 a GPU), on the curve's fixed 5% tax: dev 5%, miners 45% (the floor; their bag miners average
  // about 7×), holders 50%. Rounds every 10 minutes, holders paid hourly.
  const PRICE = 0.024;
  const round = (i, holders) => ({
    round: 140 - i, at: ago(4 + 10 * i), rateBps: 500, taxUsd: 52.08, minedUsd: 4.86,
    split: { devUsd: 2.6, chestUsd: 23.44, holderUsd: 26.04 },
    miners: 196 - i, holders, paidTokens: 0, transactions: [tx(i * 3 + 1), tx(i * 3 + 2)],
  });
  window.HASHCOIN_SAMPLE_STATS = {
    network: "mainnet", mint: window.HASHCOIN.ca, updatedAt: ago(4), round: 140, priceUsd: PRICE, levelPriceUsd: PRICE,
    supplyTokens: 21000000, marketCapUsd: PRICE * 21000000,
    miners: { gpus: 200, wallets: 151, hashrate: { PRL: 2.87e16 }, at: ago(3) },
    readyToPayUsd: 128.4,
    paidUsd: { miners: 4075, holders: 3624, total: 7699 },
    walletsPaid: 1214, holders: 2310,
    recent: { "6h": { paidUsd: 1925, rounds: 36 }, "24h": { paidUsd: 7699, rounds: 140 } },
    schedule: { roundMinutes: 10, holderEveryRounds: 6, nextRoundAt: new Date(Date.now() + 6 * 60000).toISOString(), nextHolderRoundAt: new Date(Date.now() + 46 * 60000).toISOString() },
    calc: {
      hours: 24, taxUsdDay: 7500, minedUsdDay: 700, minerBonusUsdDay: 3375, holderUsdDay: 3750,
      gpus: 200, minedUsdPerGpuDay: 3.5, bagShare: 0.8, avgMinerMult: 2.2,
      bonusPerSqrtUsdDay: 3375 / (Math.sqrt(3.5) * 200 * 0.8 * 2.2),
      holderPerWeightedUsdDay: 3750 / 1200000,
    },
    market: { phase: "curve", priceSol: 0.0000255, solUsd: 188, curveProgress: 0.62, floatSol: 3.1, floatUsd: 583 },
    taxRate: { bps: 500, scheduled: null, changes: [] },
    totals: { paidToMinersTokens: 4075 / PRICE, paidToHoldersTokens: 3624 / PRICE, paidToDevTokens: 375 / PRICE, taxTokens: 7500 / PRICE, rounds: 140, indexedTransactions: 18400 },
    last24h: { volumeUsd: 150000, minedUsd: 700, taxUsd: 7500, paidUsd: 7699 },
    last7d: { volumeUsd: 150000, minedUsd: 700, taxUsd: 7500, paidUsd: 7699 },
    carry: { minerBonusUsd: 0, holderPotUsd: 128.4, heldBackMiningUsd: 175 },
    levels24h: { 1: { wallets: 690, paidUsd: 760 }, 2: { wallets: 410, paidUsd: 1980 }, 3: { wallets: 140, paidUsd: 4385 } },
    rounds: [round(0, 0), round(1, 0), round(2, 1214), round(3, 0), round(4, 0), round(5, 0)]
      .map((r) => ({ ...r, paidTokens: (r.split.chestUsd + r.minedUsd * 0.75 + (r.holders ? 156 : 0)) / PRICE })),
    wallets: 2310,
  };
  // Sign in (account.js): any address shows this sample account.
  window.HASHCOIN_SAMPLE_WALLET = {
    priceUsd: PRICE, balanceTokens: 25500, balanceUsd: 25500 * PRICE, holderLevel: 2, minerLevel: 2, hoursMinedInWindow: 30,
    qualifiedUsd: 25500 * PRICE, usdToNextLevel: 2500 - 25500 * PRICE, paidTokens: { miner: 3100, holder: 410 }, pendingUsd: 1.84,
  };
})();
