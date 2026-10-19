// Live mode: the payout loop's public record (<api>/v1/stats, services/payouts/src/publish.ts), every
// minute while the page is visible. Fills the stats row under the hero card (paid out so far, waiting
// for the next round, market cap, hashrate on Pearl), the 24h pay on each level card, the tax now and
// market line in Tokenomics, and the recent payouts with Solscan links. It also gives the last 24
// hours' payout rates to the calculators (HashModel.setLive, then an "hc:stats" event).
(function () {
  "use strict";
  const CFG = window.HASHCOIN || {};
  if (CFG.mode !== "live") return;
  const F = window.hcFmt;
  const pct = (bps) => (bps / 100).toFixed(2).replace(/\.?0+$/, "") + "%";
  const count = (n) => Math.round(n).toLocaleString("en-US");
  const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const tokensShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : count(n);
  const priceFmt = (v) => (v >= 1 ? F.usd(v) : "$" + v.toPrecision(3).replace(/0+$/, ""));
  // H/s to the largest unit that keeps it at 1 or more: 2.87e16 → "28.7 PH/s".
  const hashFmt = (hs) => {
    const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
    let i = 0;
    while (hs >= 1000 && i < units.length - 1) { hs /= 1000; i++; }
    return (hs >= 100 ? hs.toFixed(0) : hs >= 10 ? hs.toFixed(1) : hs.toFixed(2)) + " " + units[i];
  };
  const until = (iso) => {
    const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
    if (s <= 0) return "a moment";
    return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const set = (k, v) => document.querySelectorAll(`[data-st="${k}"]`).forEach((el) => (el.textContent = v));
  const solscanToken = (window.hcLinks || {}).solscan;

  let LAST = null;
  // The countdown to the next round moves on its own, every second.
  setInterval(() => { if (!document.hidden && LAST && LAST.schedule) set("next", until(LAST.schedule.nextRoundAt)); }, 1000);

  function note(text) {
    document.querySelectorAll("[data-stats-note]").forEach((el) => {
      el.textContent = text;
      if (solscanToken) {
        const a = document.createElement("a");
        a.href = solscanToken; a.target = "_blank"; a.rel = "noopener"; a.textContent = "The token on Solscan";
        el.append(" ", a);
      }
    });
  }

  function render(st) {
    LAST = st;
    const t = st.totals || {};
    const paidTokens = (t.paidToMinersTokens || 0) + (t.paidToHoldersTokens || 0);
    set("paid", st.paidUsd ? F.usd(st.paidUsd.total) : st.priceUsd ? F.usd(paidTokens * st.priceUsd) : "—");
    set("paid-tokens", paidTokens ? tokensShort(paidTokens) + " $HASH" : "");
    set("ready", st.readyToPayUsd != null ? F.usd(st.readyToPayUsd) : "—");
    set("next", st.schedule ? until(st.schedule.nextRoundAt) : "—");
    set("mcap", st.marketCapUsd ? F.usd(st.marketCapUsd) : "—");
    set("price", st.priceUsd ? priceFmt(st.priceUsd) + " per $HASH" : "");
    // Mining now: the GPUs' combined hashrate on Pearl, the GPU count under it (or just the count).
    const gpus = st.miners ? `${count(st.miners.gpus)} GPU${st.miners.gpus === 1 ? "" : "s"}` : "";
    const prl = st.miners && st.miners.hashrate ? st.miners.hashrate.PRL : 0;
    set("hashrate", prl > 0 ? hashFmt(prl) : gpus || "—");
    set("miner-gpus", prl > 0 ? gpus : "");
    const rate = st.taxRate || {};
    set("rate", rate.bps != null ? pct(rate.bps) + (rate.scheduled ? `, going to ${pct(rate.scheduled.bps)}` : "") : "—");
    const m = st.market || {};
    set("pool", m.phase === "damm" ? "Trading on a Meteora DAMM v2 pool." : m.phase === "curve" || m.phase === "graduating"
      ? `On the Meteora bonding curve${m.curveProgress != null ? `, ${Math.round(100 * m.curveProgress)}% of the way to graduation` : ""}. The tax is 5% until it graduates.` : "—");

    // What each level was paid in the last 24 hours, on the level cards (once the API publishes it).
    const lv = st.levels24h;
    if (lv && [1, 2, 3].some((l) => lv[l] && lv[l].wallets > 0)) {
      for (const l of [1, 2, 3]) {
        const x = lv[l] || { wallets: 0, paidUsd: 0 };
        document.querySelectorAll(`[data-lvp="${l}"]`).forEach((el) => (el.textContent = x.wallets ? F.usd(x.paidUsd / x.wallets) : "—"));
      }
      document.querySelectorAll("[data-lv-live]").forEach((el) => (el.hidden = false));
    }

    // Recent payout rounds, each with a Solscan transaction.
    document.querySelectorAll("[data-rounds]").forEach((list) => {
      list.textContent = "";
      (st.rounds || []).slice(0, 5).forEach((r) => {
        const li = document.createElement("li");
        const when = document.createElement("span");
        when.className = "when";
        when.textContent = time(r.at);
        const what = document.createElement("span");
        what.className = "what";
        const who = [r.miners ? `${count(r.miners)} miner${r.miners === 1 ? "" : "s"}` : "", r.holders ? `${count(r.holders)} holder${r.holders === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
        what.textContent = (st.priceUsd ? F.usd(r.paidTokens * st.priceUsd) : count(r.paidTokens) + " $HASH") + (who ? " to " + who : "");
        li.append(when, what);
        const tx = (r.transactions || []).find((u) => /^https:\/\/solscan\.io\/tx\//.test(u));
        if (tx) {
          const a = document.createElement("a");
          a.href = tx; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Solscan";
          a.setAttribute("aria-label", `Round ${r.round} on Solscan`);
          li.append(a);
        }
        list.append(li);
      });
    });
    const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(st.updatedAt)) / 60000));
    note(ageMin > 30 ? `Payouts may be paused: the last round was ${ageMin} minutes ago.` : `Updated ${ageMin < 1 ? "just now" : ageMin + " min ago"}. Every payout is a Solana transaction.`);
    share(st);
  }

  // The calculators: the last 24 hours' rates, or the pre-launch estimate when there are none.
  function share(st) {
    if (window.HashModel && window.HashModel.setLive) window.HashModel.setLive(st && st.calc, st && st.updatedAt);
    document.dispatchEvent(new CustomEvent("hc:stats", { detail: st }));
  }

  // No numbers: say why and keep the Solscan way to check; the numbers stay "—".
  function fallback(why) {
    share(null);
    note(why);
  }

  let timer = 0;
  async function load() {
    clearTimeout(timer);
    if (window.HASHCOIN_SAMPLE_STATS) { render(window.HASHCOIN_SAMPLE_STATS); return; }
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(String(CFG.api).replace(/\/$/, "") + "/v1/stats", { signal: ctl.signal, cache: "no-store" });
      clearTimeout(t);
      if (r.status === 503) fallback("No payout round yet. The first one runs within 10 minutes of launch.");
      else if (!r.ok) fallback("The live numbers aren't answering right now. Payouts are still on-chain.");
      else {
        const st = await r.json();
        // Only this token's mainnet record: never test-network numbers.
        if (st.network !== "mainnet" || st.mint !== CFG.ca) fallback("The live numbers aren't ready yet. Payouts are still on-chain.");
        else render(st);
      }
    } catch (e) {
      fallback("The live numbers aren't answering right now. Payouts are still on-chain.");
    }
    if (!document.hidden) timer = setTimeout(load, 60000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  load();
})();
