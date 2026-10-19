// Live mode: the payout loop's public record (<api>/v1/stats, services/payouts/src/publish.ts), every
// minute while the page is visible. Fills the home page's stats row (paid out so far, waiting for the
// next round, market cap, hashrate on Pearl) and Live tab (the tax now and its split, the last 24 hours, what each level
// was paid, recent payouts with Solscan links, launch curve or DAMM v2 pool), and gives the last 24
// hours' payout rates to the earnings calculators (HashModel.setLive, then an "hc:stats" event).
(function () {
  "use strict";
  const CFG = window.HASHCOIN || {};
  if (CFG.mode !== "live") return;
  const box = document.querySelector("[data-stats]");
  const $ = (s) => box.querySelector(s);
  const F = window.hcFmt;
  const S = (k) => $(`[data-s="${k}"]`);
  const solscanToken = (window.hcLinks || {}).solscan;
  const pct = (bps) => (bps / 100).toFixed(2).replace(/\.?0+$/, "") + "%";
  const count = (n) => Math.round(n).toLocaleString("en-US");
  const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  function note(text, linkText) {
    const el = S("note");
    el.textContent = text;
    if (linkText && solscanToken) {
      const a = document.createElement("a");
      a.href = solscanToken; a.target = "_blank"; a.rel = "noopener"; a.textContent = linkText;
      el.append(" ", a);
    }
  }

  // The stats row (home page: paid out so far, waiting for the next round, market cap, mining now)
  // and the Live tab's few numbers. "—" until there's a value.
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
  let LAST = null;
  // The countdown to the next round moves on its own, every second.
  setInterval(() => { if (!document.hidden && LAST && LAST.schedule) set("next", until(LAST.schedule.nextRoundAt)); }, 1000);
  function band(st) {
    LAST = st;
    if (!st) return;
    const t = st.totals || {};
    const paidTokens = (t.paidToMinersTokens || 0) + (t.paidToHoldersTokens || 0);
    set("paid", st.paidUsd ? F.usd(st.paidUsd.total) : st.priceUsd ? F.usd(paidTokens * st.priceUsd) : "—");
    set("paid-tokens", paidTokens ? tokensShort(paidTokens) + " $HASH" : "");
    set("ready", st.readyToPayUsd != null ? F.usd(st.readyToPayUsd) : "—");
    set("next", st.schedule ? until(st.schedule.nextRoundAt) : "—");
    set("mcap", st.marketCapUsd ? F.usd(st.marketCapUsd) : "—");
    set("price", st.priceUsd ? priceFmt(st.priceUsd) + " per $HASH" : "");
    // Mining now: the GPUs' combined hashrate on Pearl, with the GPU count under it (just the count
    // if the loop doesn't publish a hashrate).
    const gpus = st.miners ? `${count(st.miners.gpus)} GPU${st.miners.gpus === 1 ? "" : "s"}` : "";
    const prl = st.miners && st.miners.hashrate ? st.miners.hashrate.PRL : 0;
    set("hashrate", prl > 0 ? hashFmt(prl) : gpus || "—");
    set("miner-gpus", prl > 0 ? gpus : "");
    const rate = st.taxRate || {};
    set("rate", rate.bps != null ? pct(rate.bps) + (rate.scheduled ? ` → ${pct(rate.scheduled.bps)}` : "") : "—");
    set("volume", st.last24h ? F.usd(st.last24h.volumeUsd) : "—");
    set("holders", st.holders != null ? count(st.holders) : "—");
  }

  // The calculators: the last 24 hours' rates, or the pre-launch estimate when there are none.
  function share(st) {
    if (window.HashModel && window.HashModel.setLive) window.HashModel.setLive(st && st.calc, st && st.updatedAt);
    document.dispatchEvent(new CustomEvent("hc:stats", { detail: st }));
  }

  // No numbers: say why, keep the Solscan way to check, and leave the panel's dashes.
  function fallback(why) {
    share(null);
    if (!box) return;
    S("updated").textContent = "Not answering";
    box.classList.add("is-down");
    note(why, "The token on Solscan");
  }

  function render(st) {
    band(st);
    share(st);
    if (!box) return;
    box.classList.remove("is-down");
    const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(st.updatedAt)) / 60000));
    S("updated").textContent = ageMin < 1 ? "Updated just now" : ageMin < 120 ? `Updated ${ageMin} min ago` : `Updated ${time(st.updatedAt)}`;


    // The split of the latest round's tax.
    const r0 = (st.rounds || [])[0];
    const sp = r0 && r0.split, tot = sp ? sp.devUsd + sp.chestUsd + sp.holderUsd : 0;
    if (tot > 0) {
      const p = { d: sp.devUsd / tot, m: sp.chestUsd / tot, h: sp.holderUsd / tot };
      const bar = S("split");
      for (const k of ["d", "m", "h"]) {
        const el = bar.querySelector("." + k);
        el.style.width = (100 * p[k]).toFixed(1) + "%";
        el.style.flex = "none";
        el.textContent = p[k] >= 0.12 ? Math.round(100 * p[k]) + "%" : "";
      }
      bar.setAttribute("aria-label", `Last round's tax: ${Math.round(100 * p.m)}% to miners, ${Math.round(100 * p.h)}% to holders, ${Math.round(100 * p.d)}% to development`);
      S("split-legend").textContent = `Last round's tax: miners ${Math.round(100 * p.m)}%, holders ${Math.round(100 * p.h)}%, development ${Math.round(100 * p.d)}%`;
      S("split-wrap").hidden = false;
    }

    // What each level was paid in the last 24 hours (shown once the API publishes it).
    const lv = st.levels24h;
    if (lv && [1, 2, 3].some((l) => lv[l] && lv[l].wallets > 0)) {
      for (const l of [1, 2, 3]) {
        const x = lv[l] || { wallets: 0, paidUsd: 0 };
        $(`[data-lvw="${l}"]`).textContent = `${count(x.wallets)} wallet${x.wallets === 1 ? "" : "s"}`;
        $(`[data-lvp="${l}"]`).textContent = x.wallets ? F.usd(x.paidUsd / x.wallets) : "—";
      }
      S("levels").hidden = false;
    }

    // Recent payout rounds, each with its Solscan transactions.
    const list = S("rounds");
    list.textContent = "";
    (st.rounds || []).slice(0, 5).forEach((r) => {
      const li = document.createElement("li");
      const when = document.createElement("span");
      when.className = "r-when";
      when.textContent = time(r.at);
      const what = document.createElement("span");
      what.className = "r-what";
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
    S("rounds-wrap").hidden = !list.children.length;

    // Where trading is: the launch curve, or the DAMM v2 pool after graduation.
    const phase = st.market && st.market.phase;
    const curve = document.querySelector('[data-phase="curve"]'), damm = document.querySelector('[data-phase="damm"]');
    if (curve && damm && (phase === "curve" || phase === "graduating" || phase === "damm")) {
      const graduated = phase === "damm";
      curve.className = graduated ? "done" : "now";
      curve.querySelector("span").textContent = graduated ? "Done" : "Now";
      damm.className = graduated ? "now" : "";
      damm.querySelector("span").textContent = graduated ? "Now" : "Then";
      if (!graduated && st.market.curveProgress != null) {
        curve.querySelector("div").lastChild.textContent = `, ${Math.round(100 * st.market.curveProgress)}% full. The tax is 5% until graduation.`;
      }
    }

    note(ageMin > 30 ? "Payouts may be paused: the last round was over 30 minutes ago. Every payout is a Solana transaction." : "Every payout is a Solana transaction.", "The token on Solscan");
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
