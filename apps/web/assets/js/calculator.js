// Full calculator page: mining and holding, one estimate based on daily volume per GPU mining.
// Live mode: the last 24 hours' payouts (live.js gives HashModel the API's rates), with the
// estimate as the other view and as the fallback before there are enough payout rounds.
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const M = window.HashModel, F = window.hcFmt, GPUS = window.GPUS || [], E = M.ESTIMATE;

  // Log-mapped slider for volume per GPU ($25 to $10,000).
  const RANGE = [25, 10000];
  const toPos = (v) => Math.round((1000 * Math.log(v / RANGE[0])) / Math.log(RANGE[1] / RANGE[0]));
  const fromPos = (p) => RANGE[0] * Math.pow(RANGE[1] / RANGE[0], p / 1000);
  const nice = (v) => { const m = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / m) * m; };

  const g0 = hcTopGpu();
  const DEFAULTS = {
    gpu: g0.name, myRev: g0.rev, watts: g0.w, elec: 0.15, bag: 500, hlevel: 2,
    volPerGpu: E.volPerGpu, avgRev: E.avgRev, p0: E.mMix[0], p2: E.mMix[2], p3: E.mMix[3],
  };
  let S = { ...DEFAULTS, basis: "live" };
  const LIVE_MODE = (window.HASHCOIN || {}).mode === "live";

  const sel = $("#fc-gpu");
  hcFillGpuSelect(sel, S.gpu);
  const custom = document.createElement("option");
  custom.value = "custom"; custom.textContent = "Custom (your own numbers)";
  sel.append(custom);

  sel.addEventListener("change", () => {
    S.gpu = sel.value;
    const g = GPUS.find((x) => x.name === sel.value);
    if (g) { S.myRev = g.rev; S.watts = g.w; }
    sync();
  });
  [["#fc-rev", "myRev"], ["#fc-watts", "watts"]].forEach(([id, k]) => $(id).addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= 0) { S[k] = v; S.gpu = "custom"; sync(false); }
  }));
  $("#fc-bag").addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= 0) { S.bag = v; sync(false); }
  });
  $("#fc-elec").addEventListener("input", (e) => { S.elec = +e.target.value; sync(); });
  $("#fc-ratio").addEventListener("input", (e) => { S.volPerGpu = nice(fromPos(+e.target.value)); sync(); });
  $("#fc-avg").addEventListener("input", (e) => { S.avgRev = +e.target.value; sync(); });
  // The three shares can't add up to more than 100%: moving one trims the others.
  const fit = (k) => { const o = ["p0", "p2", "p3"].filter((x) => x !== k); let over = S.p0 + S.p2 + S.p3 - 100; for (const x of o) { const t = Math.min(over, S[x]); if (t > 0) { S[x] -= t; over -= t; } } };
  ["p0", "p2", "p3"].forEach((k) => $(`#fc-${k}`).addEventListener("input", (e) => { S[k] = +e.target.value; fit(k); sync(); }));
  $$("#fc-hlevel button").forEach((b) => b.addEventListener("click", () => { S.hlevel = +b.dataset.h; sync(); }));
  $("#fc-reset").addEventListener("click", () => { S = { ...DEFAULTS, basis: S.basis }; sync(); });
  $$("#fc-basis button").forEach((b) => b.addEventListener("click", () => { S.basis = b.dataset.b; sync(); }));
  document.addEventListener("hc:stats", () => sync(false));

  const money = (v) => (v > 0 && v < 0.01 ? "<$0.01" : F.usd(v));
  const whole = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const set = (k, v) => { const e = $(`[data-o="${k}"]`); if (e) e.textContent = v; };
  const mix = () => [S.p0, Math.max(0, 100 - S.p0 - S.p2 - S.p3), S.p2, S.p3];
  // The last 24 hours' payouts, when live mode has them and that view is picked.
  const useLive = () => LIVE_MODE && !!M.live() && S.basis === "live";
  const mkInputs = () => ({ volPerGpu: S.volPerGpu, avgRev: S.avgRev, mMix: mix(), estimate: !useLive() });
  const est = (level) => M.miner({ myRev: S.myRev, level, watts: S.watts, elec: S.elec, ...mkInputs() });

  function sync(syncNumbers = true) {
    sel.value = GPUS.some((g) => g.name === S.gpu) ? S.gpu : "custom";
    if (syncNumbers) { $("#fc-rev").value = S.myRev; $("#fc-watts").value = S.watts; $("#fc-bag").value = S.bag; }
    $("#fc-elec").value = S.elec; $("#fc-elec-o").textContent = "$" + S.elec.toFixed(2) + "/kWh";
    $("#fc-ratio").value = toPos(S.volPerGpu); $("#fc-ratio-o").textContent = F.usd(S.volPerGpu);
    $("#fc-avg").value = S.avgRev; $("#fc-avg-o").textContent = "$" + S.avgRev.toFixed(2);
    $("#fc-p0").value = S.p0; $("#fc-p0-o").textContent = S.p0 + "%";
    $("#fc-p2").value = S.p2; $("#fc-p2-o").textContent = S.p2 + "%";
    $("#fc-p3").value = S.p3; $("#fc-p3-o").textContent = S.p3 + "%";
    $$("#fc-hlevel button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.h === S.hlevel)));
    const LV = useLive() ? M.live() : null;
    if (LIVE_MODE) {
      const have = !!M.live();
      $$("#fc-basis button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.b === (LV ? "live" : "estimate")));
        if (b.dataset.b === "live") b.disabled = !have;
      });
      $("#fc-basis-hint").textContent = !have
        ? "Not enough payout rounds yet, so this shows the launch-week estimate."
        : LV ? `From the last ${LV.hours >= 23 ? "24 hours" : Math.floor(LV.hours) + " hours"}: ${F.usd(LV.minerBonusUsdDay)} a day of miner bonus and ${F.usd(LV.holderUsdDay)} of holder rewards, ${LV.gpus} GPUs mining.`
        : "Your own numbers, with the inputs on the left.";
      $("#fc-est").hidden = !!LV;
      $("#fc-title").textContent = LV ? "At the last 24 hours' payouts" : "Your estimate";
      $("#fc-label").textContent = LV ? "Not a promise" : "Estimate, not a promise";
    }
    // One ladder: the level your bag reaches is your level for holder rewards and the miner bonus.
    const maxH = M.holderLevelFor(S.bag);
    const hl = Math.min(S.hlevel, maxH);
    const r = est(hl);
    const mk = r.mk;
    const hold = M.holder(S.bag, hl, mkInputs());
    $("#fc-hlevel-hint").textContent = hl > 0
      ? `Level ${hl}: ${hold.yieldPct.toFixed(2)}% of your bag a day ${LV ? "at the last 24 hours' payouts" : "at this volume"}, and a ${M.MULT[hl - 1]}× miner bonus.`
      : "Below $50 a bag earns no holder rewards, and mining gets no bonus.";
    $("#fc-ratio-hint").textContent =
      `Miners reach 5× above ${whole(mk.targetVolPerGpu)} per GPU. ` +
      (S.volPerGpu === E.volPerGpu ? "Default: launch-week trading." : `For example ${F.usd(S.volPerGpu * 400)} of daily volume with 400 GPUs mining.`);

    const rows = { m: r.mining, c: r.chestShare, h: hold.perDay, p: -r.power, n: r.net + hold.perDay };
    Object.entries(rows).forEach(([k, d]) => {
      const f = k === "p" ? (v) => (v === 0 ? "$0.00" : "−" + money(-v)) : k === "n" ? (v) => (v < 0 ? "−" + money(-v) : money(v)) : money;
      set(k + "-h", f(d / 24)); set(k + "-d", f(d)); set(k + "-w", f(d * 7));
    });
    $("#fc-chest").textContent = LV && LV.taxUsdDay > 0
      ? `${F.pct((100 * LV.minerBonusUsdDay) / LV.taxUsdDay)} / ${F.pct((100 * LV.holderUsdDay) / LV.taxUsdDay)} of tax`
      : `${F.pct(100 * mk.chestRate)} / ${F.pct(100 * mk.holderRate)}`;
    $("#fc-share").textContent = F.mult(r.rel) + " avg";
    $("#fc-mult").textContent = F.mult(r.mult);

    const flags = [];
    if (S.hlevel > maxH) flags.push(maxH ? `Level ${S.hlevel} needs ${whole(M.HOLDER.usd[S.hlevel - 1])}; this bag counts as Level ${maxH}.` : "This bag is below $50, so it earns no holder rewards and mining gets no bonus.");
    if (!LV && !mk.targetMet) flags.push(`At ${F.usd(S.volPerGpu)} per GPU even the 5% maximum tax can't lift miners to 5×, so miners average ${F.mult(1 + mk.chestPerGpu / S.avgRev)} and holders get their 1% minimum.`);
    if (r.net + hold.perDay < 0) flags.push(`At this electricity price, power costs more than you earn ${LV ? "at the last 24 hours' payouts" : "in this estimate"}.`);
    $("#fc-flags").innerHTML = flags.map((f) => `<p class="flag">${f}</p>`).join("");

    const lv = [0, 1, 2, 3].map(est);
    const max = Math.max(...lv.map((x) => x.total)) || 1;
    $("#fc-bars").innerHTML = lv.map((x, i) => {
      const mw = (x.mining / max) * 100, cw = (x.chestShare / max) * 100;
      return `<div class="bar-row${i === hl ? " on" : ""}"><span>${i ? "Level " + i : "No bag"}</span>
        <span class="track"><i style="width:${mw}%"></i><i class="chest" style="left:${mw}%;width:${cw}%"></i></span>
        <b>${money(x.total)}</b></div>`;
    }).join("");
  }
  sync();
})();
