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
  // A launch day: $100K market cap, $30K traded, 412 GPUs mining, the 5% curve tax (dev 5%, miners
  // 75%: the cap, as miners are below 5×; holders 20%). Rounds every 10 minutes, holders paid hourly.
  const PRICE = 0.0048;
  const round = (i, holders) => ({
    round: 140 - i, at: ago(4 + 10 * i), rateBps: 500, taxUsd: 10.42, minedUsd: 9.86,
    split: { devUsd: 0.52, chestUsd: 7.81, holderUsd: 2.08 },
    miners: 412 - 3 * i, holders, paidTokens: 0, transactions: [tx(i * 3 + 1), tx(i * 3 + 2)],
  });
  window.HASHCOIN_SAMPLE_STATS = {
    network: "mainnet", mint: window.HASHCOIN.ca, updatedAt: ago(4), round: 140, priceUsd: PRICE, levelPriceUsd: PRICE,
    supplyTokens: 21000000, marketCapUsd: PRICE * 21000000,
    miners: { gpus: 412, wallets: 288, at: ago(3) },
    readyToPayUsd: 9.7,
    paidUsd: { miners: 2545, holders: 300, total: 2845 },
    calc: {
      hours: 24, taxUsdDay: 1500, minedUsdDay: 1420, minerBonusUsdDay: 1125, holderUsdDay: 300,
      gpus: 412, minedUsdPerGpuDay: 3.45, bagShare: 0.8, avgMinerMult: 2.2,
      bonusPerSqrtUsdDay: 1125 / (Math.sqrt(3.45) * 412 * 0.8 * 2.2),
      holderPerWeightedUsdDay: 300 / 300000,
    },
    market: { phase: "curve", priceSol: 0.0000255, solUsd: 188, curveProgress: 0.62, floatSol: 3.1, floatUsd: 583 },
    taxRate: { bps: 500, scheduled: null, changes: [] },
    totals: { paidToMinersTokens: 2545 / PRICE, paidToHoldersTokens: 300 / PRICE, paidToDevTokens: 75 / PRICE, taxTokens: 1500 / PRICE, rounds: 140, indexedTransactions: 18400 },
    last24h: { volumeUsd: 30000, minedUsd: 1420, taxUsd: 1500, paidUsd: 2845 },
    last7d: { volumeUsd: 30000, minedUsd: 1420, taxUsd: 1500, paidUsd: 2845 },
    carry: { minerBonusUsd: 0, holderPotUsd: 9.7, heldBackMiningUsd: 355 },
    levels24h: { 1: { wallets: 690, paidUsd: 172 }, 2: { wallets: 410, paidUsd: 328 }, 3: { wallets: 140, paidUsd: 925 } },
    rounds: [round(0, 0), round(1, 0), round(2, 1214), round(3, 0), round(4, 0), round(5, 0)]
      .map((r) => ({ ...r, paidTokens: (r.split.chestUsd + r.minedUsd * 0.75 + (r.holders ? 12.5 : 0)) / PRICE })),
    wallets: 2310,
  };
})();
