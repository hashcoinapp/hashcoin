// Home page, live mode: the payout loop's public record (<api>/v1/stats, services/payouts/src/publish.ts):
// the tax now and its split, the last 24 hours, what each level was paid, recent payouts with Solscan
// links, and where trading is (launch curve or the DAMM v2 pool). Refreshes every minute while visible.
(function () {
  "use strict";
  const CFG = window.HASHCOIN || {};
  const box = document.querySelector("[data-stats]");
  if (CFG.mode !== "live" || !box) return;
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

  // No numbers: say why, keep the Solscan way to check, and leave the panel's dashes.
  function fallback(why) {
    S("updated").textContent = "Not answering";
    box.classList.add("is-down");
    note(why, "The token on Solscan");
  }

  function render(st) {
    box.classList.remove("is-down");
    const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(st.updatedAt)) / 60000));
    S("updated").textContent = ageMin < 1 ? "Updated just now" : ageMin < 120 ? `Updated ${ageMin} min ago` : `Updated ${time(st.updatedAt)}`;

    const rate = st.taxRate || {};
    S("rate").textContent = rate.bps != null ? pct(rate.bps) + (rate.scheduled ? ` → ${pct(rate.scheduled.bps)}` : "") : "—";
    S("volume").textContent = st.last24h ? F.usd(st.last24h.volumeUsd) : "—";
    S("paid").textContent = st.last24h ? F.usd(st.last24h.paidUsd) : "—";
    S("wallets").textContent = typeof st.wallets === "number" ? count(st.wallets) : "—";

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
