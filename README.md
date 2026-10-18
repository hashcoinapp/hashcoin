# Hashcoin

The source code for Hashcoin ($HASH): the Windows mining app, the payout engine and payout loop, the server, and the website at [hashcoin.app](https://hashcoin.app).

$HASH is a Solana token with a 2–5% tax on every trade, paid back out to holders and to people who mine with the app. The app mines whichever coin pays a GPU the most; the platform sells it and buys $HASH on the market to pay miners. How it works, in full: [hashcoin.app/brief.md](https://hashcoin.app/brief.md).

## What's here

| Folder | What it is |
|---|---|
| `apps/desktop` | The Windows app (Tauri, Rust). Detects GPUs, asks the server which coin to mine, downloads a miner whose SHA-256 matches a signed list, and runs it. |
| `apps/web` | The website. |
| `packages/engine` | The payout rules: the tax rate and split, levels, the hold clock, payout shares. |
| `packages/switcher` | Picks the best-paying coin per GPU and signs the assignment. |
| `packages/chain` | Solana: the token launch on Meteora and its settings. |
| `services/api` | The server the app talks to. |
| `services/collector` | Reads mining results from the pools. |
| `services/payouts` | The payout loop: collects the tax, buys $HASH for miners and pays everyone. |
| `sim` | A simulation of the economics (Python, standard library only). |

## Check the installer

Each Windows installer is built by GitHub Actions from this repository (`.github/workflows/desktop-release.yml`), and each release lists its SHA-256.

- **Compare the checksum:** in PowerShell, `Get-FileHash <path to the installer>`. It must match the release and the website.
- **Check where it was built:** every release installer has a GitHub build attestation that ties it to the exact commit in this repository that produced it. With the GitHub CLI: `gh attestation verify <installer> --repo hashcoinapp/hashcoin`.

The app isn't code-signed yet, so Windows SmartScreen and some antivirus products may warn about it: [hashcoin.app/antivirus](https://hashcoin.app/antivirus).

## Run the tests

Node 22 and npm:

```
npm ci
npm test
npm run typecheck
```

The desktop app: `cd apps/desktop/src-tauri && cargo test` (Rust, stable).

## Security

Hashcoin never asks for a seed phrase or private key and never DMs first. The app needs only a public wallet address.

Not financial advice. $HASH is a new, volatile token and can lose most or all of its value.
