// Home page details: the mining scene (paused off screen), the trade tape (How it works, step 2),
// the dynamic tax simulation (How it works) and the selling-penalty explainer (Levels). Nothing
// moves by itself with reduced motion; the tax slider and the penalty's Replay still work.
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = "IntersectionObserver" in window;
  const watch = (el, fn, opts) => { if (io) new IntersectionObserver((en) => fn(en[0].isIntersecting), opts).observe(el); else fn(true); };

  // ---------- The mining scene: only animates on screen ----------
  const mine = document.querySelector(".hero-mine");
  if (mine) watch(mine, (on) => mine.classList.toggle("paused", !on));

  // ---------- The trade tape: simulated trades at a 3% tax, about every two seconds ----------
  const tape = document.querySelector("[data-tape]");
  if (tape && !reduce) {
    const RATE = 0.03, EVERY_MS = 2100, KEEP = 3;
    const dollars = (v) => "$" + Math.round(v).toLocaleString("en-US");
    let timer = 0, onScreen = false;
    const add = () => {
      const sell = Math.random() < 0.4;
      const amount = Math.random() < 0.15 ? 1500 + Math.random() * 4500 : Math.exp(Math.log(40) + Math.random() * (Math.log(1400) - Math.log(40)));
      const row = document.createElement("div");
      row.className = "row new";
      const what = document.createElement("span");
      what.textContent = `${sell ? "Sell" : "Buy"} ${dollars(amount)}`;
      const tax = document.createElement("b");
      tax.textContent = `$${(amount * RATE).toFixed(2)} tax`;
      row.append(what, tax);
      tape.prepend(row);
      const rows = tape.querySelectorAll(".row");
      if (rows.length > KEEP) setTimeout(() => rows[rows.length - 1].remove(), 600);
    };
    const run = () => {
      clearTimeout(timer);
      if (onScreen && !document.hidden) timer = setTimeout(() => { add(); run(); }, EVERY_MS);
    };
    watch(tape, (on) => { onScreen = on; run(); });
    document.addEventListener("visibilitychange", run);
  }

  // ---------- The dynamic tax: the public formula (model.js) as trading rises and falls ----------
  const ts = document.querySelector("[data-taxsim]");
  if (ts && window.HashModel) {
    const M = window.HashModel;
    const T = (k) => ts.querySelector(`[data-ts="${k}"]`);
    const range = ts.querySelector("#ts-range");
    const LO = 100, HI = 2000; // daily trading per GPU mining, log scale
    const toVol = (pos) => LO * Math.pow(HI / LO, pos / 1000);
    const toPos = (v) => (1000 * Math.log(v / LO)) / Math.log(HI / LO);
    const nice = (v) => (v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v / 10) * 10);
    const pct = (x) => (100 * x).toFixed(2).replace(/\.?0+$/, "") + "%";
    const show = (v) => {
      const mk = M.market({ volPerGpu: v });
      const s = mk.shares;
      T("vol").textContent = "$" + nice(v).toLocaleString("en-US") + " a day";
      T("rate").textContent = pct(mk.rate);
      T("m").style.width = 100 * s.miners + "%";
      T("h").style.width = 100 * s.holders + "%";
      T("d").style.width = 100 * s.dev + "%";
      T("mp").textContent = Math.round(100 * s.miners) + "%";
      T("hp").textContent = Math.round(100 * s.holders) + "%";
      T("dp").textContent = Math.round(100 * s.dev) + "%";
    };
    range.value = Math.round(toPos(M.ESTIMATE.volPerGpu));
    show(toVol(+range.value));
    let auto = !reduce, onScreen = false, raf = 0, last = 0, phase = Math.asin((2 * +range.value) / 1000 - 1);
    range.addEventListener("input", () => { auto = false; show(toVol(+range.value)); });
    // Quiet to busy and back, about every 14 seconds, until someone moves the slider.
    const frame = (now) => {
      raf = 0;
      if (!auto || !onScreen || document.hidden) { last = 0; return; }
      if (last) phase += ((now - last) / 14000) * 2 * Math.PI;
      last = now;
      const pos = 500 + 500 * Math.sin(phase);
      range.value = Math.round(pos);
      show(toVol(pos));
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (auto && onScreen && !document.hidden && !raf) raf = requestAnimationFrame(frame); };
    watch(ts, (on) => { onScreen = on; kick(); });
    document.addEventListener("visibilitychange", kick);
  }

  // ---------- The selling penalty: $500 bag, sell $100, buy back $300 ----------
  const pen = document.querySelector("[data-penalty]");
  if (pen) {
    const P = (k) => pen.querySelector(`[data-pen="${k}"]`);
    const SCALE = 800; // the bars run from $0 to $800
    const STEPS = [
      { bag: 500, q: 500, l: 2, text: "You hold $500 of $HASH: Level 2." },
      { bag: 400, q: 200, l: 1, drop: true, text: "You sell $100. Your bag is $400, but it counts as $200: Level 1." },
      { bag: 700, q: 500, l: 2, text: "You buy back $300. Your bag is $700 and counts as $500: Level 2 again." },
    ];
    let timers = [];
    const set = (s) => {
      P("bag").style.width = (100 * s.bag) / SCALE + "%";
      P("q").style.width = (100 * s.q) / SCALE + "%";
      P("bag-v").textContent = "$" + s.bag;
      P("q-v").textContent = "$" + s.q;
      P("badge").textContent = "Level " + s.l;
      P("caption").textContent = s.text;
      pen.dataset.l = s.l;
      pen.classList.toggle("dropped", !!s.drop);
    };
    const play = () => {
      timers.forEach(clearTimeout);
      timers = [];
      set(STEPS[0]);
      STEPS.slice(1).forEach((s, i) => timers.push(setTimeout(() => set(s), (i + 1) * 2600)));
    };
    set(STEPS[0]);
    let played = false;
    watch(pen, (on) => { if (on && !played) { played = true; timers.push(setTimeout(play, 500)); } }, { threshold: 0.5 });
    P("replay").addEventListener("click", play);
  }
})();
