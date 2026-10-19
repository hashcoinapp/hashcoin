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
  const round = (i, holders) => ({
    round: 140 - i, at: ago(4 + 10 * i), rateBps: 500, taxUsd: 143.2 - 9 * i, minedUsd: 9.9,
    split: { devUsd: 7.16, chestUsd: 96.1 - 6 * i, holderUsd: 39.9 - 3 * i },
    miners: 412 - 3 * i, holders, paidTokens: 0, transactions: [tx(i * 3 + 1), tx(i * 3 + 2)],
  });
  window.HASHCOIN_SAMPLE_STATS = {
    network: "mainnet", mint: window.HASHCOIN.ca, updatedAt: ago(4), round: 140, priceUsd: 0.0021, levelPriceUsd: 0.0021,
    market: { phase: "curve", priceSol: 0.0000112, solUsd: 188, curveProgress: 0.62, floatSol: 3.1, floatUsd: 583 },
    taxRate: { bps: 500, scheduled: null, changes: [] },
    totals: { paidToMinersTokens: 3410000, paidToHoldersTokens: 1520000, paidToDevTokens: 360000, taxTokens: 5400000, rounds: 140, indexedTransactions: 18400 },
    last24h: { volumeUsd: 412000, minedUsd: 1420, taxUsd: 20600, paidUsd: 18900 },
    last7d: { volumeUsd: 412000, minedUsd: 1420, taxUsd: 20600, paidUsd: 18900 },
    carry: { minerBonusUsd: 0, holderPotUsd: 0, heldBackMiningUsd: 355 },
    // Not in the API yet: what each level was paid in the last 24 hours (see apps/web/README.md).
    levels24h: { 1: { wallets: 690, paidUsd: 1730 }, 2: { wallets: 410, paidUsd: 4920 }, 3: { wallets: 140, paidUsd: 6650 } },
    rounds: [round(0, 0), round(1, 0), round(2, 1214), round(3, 0), round(4, 0), round(5, 0)].map((r) => ({ ...r, paidTokens: (r.split.chestUsd + (r.holders ? 240 : 0) + 9.9) / 0.0021 })),
    wallets: 2310,
  };
})();
