// The Mine / Hold card (home page hero, top of the calculator page): pick a GPU and a level, or a
// bag, and see what you'd make a day. Uses model.js: the pre-launch estimate, or in live mode the
// last 24 hours' payouts once live.js has them (it fires "hc:stats").
(function () {
  "use strict";
  const card = document.querySelector("[data-card]");
  if (!card) return;
  const $ = (s) => card.querySelector(s);
  const $$ = (s) => Array.from(card.querySelectorAll(s));
  const M = window.HashModel, F = window.hcFmt, GPUS = window.GPUS || [];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const money = (v) => (v > 0 && v < 0.01 ? "<$0.01" : F.usd(v));
  const whole = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const out = (k) => $(`[data-o="${k}"]`);

  // Popular cards first. The RTX 5090 is the default (user, Oct 19).
  const POPULAR = ["RTX 5090", "RTX 4070", "RTX 4060", "RTX 3060", "RTX 3070", "RTX 3080", "RTX 4070 Super", "RTX 4060 Laptop", "RTX 3060 Laptop",
    "RTX 5070", "RTX 4090 24GB", "RX 7900 XTX", "RX 7800 XT", "RX 6700 XT", "Arc B580"]
    .map((n) => GPUS.find((g) => g.name === n)).filter(Boolean);
  const S = { tab: "mine", gpu: (POPULAR[0] || GPUS[0] || { name: "" }).name, level: reduce ? 2 : 0, bag: 2500 };

  // The level plays No bag → 1 → 2 → 3 → around (2.5 s each) until someone picks a level or a GPU,
  // then stops for good. A thin line under the active level shows it's moving (site.css .cycling).
  const CYCLE_MS = 2500;
  let auto = !reduce, autoTimer = 0, onScreen = true;
  function stopAuto() {
    auto = false;
    clearTimeout(autoTimer);
    card.classList.remove("cycling");
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    const run = auto && onScreen && !document.hidden && S.tab === "mine";
    card.classList.toggle("cycling", run);
    if (run) autoTimer = setTimeout(() => { S.level = (S.level + 1) % 4; render(); scheduleAuto(); }, CYCLE_MS);
  }

  // ---------- Tabs ----------
  const tabs = $$('[role="tab"]');
  function openTab(name, focus) {
    S.tab = name;
    if (auto) setTimeout(scheduleAuto);
    tabs.forEach((t) => {
      const on = t.id.endsWith(name);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) t.focus();
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => openTab(t.id.endsWith("hold") ? "hold" : "mine"));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabs[(i + 1) % tabs.length];
      openTab(n.id.endsWith("hold") ? "hold" : "mine", true);
    });
  });

  // ---------- GPU picker: a combobox, type to search ----------
  const input = $("#cc-gpu"), list = $("#cc-gpu-list");
  let options = [], active = -1;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  function optionHtml(g, i) {
    return `<li role="option" id="cc-opt-${i}" data-name="${g.name}" aria-selected="${g.name === S.gpu}">${g.name}${g.est ? " (est.)" : ""}<span>${money(g.rev)} a day</span></li>`;
  }
  function fill(query) {
    const q = norm(query || "");
    let html = "";
    if (!q) {
      options = [...POPULAR, ...GPUS.filter((g) => !POPULAR.includes(g))];
      html = `<li class="group" role="presentation">Popular</li>` + POPULAR.map(optionHtml).join("") +
        `<li class="group" role="presentation">All GPUs</li>` + options.slice(POPULAR.length).map((g, i) => optionHtml(g, i + POPULAR.length)).join("");
    } else {
      // Exact names first ("3060 Ti" before "3060 Ti GDDR6X"), then names that start with what was typed.
      const rank = (g) => { const n = norm(g.name); return (n === q || n.endsWith(q) ? 0 : 2) + (n.startsWith(q) ? 0 : 1); };
      // Ties keep the list's own order (fastest first), with estimated laptop cards after measured ones.
      options = GPUS.filter((g) => norm(g.name).includes(q)).sort((a, b) => rank(a) - rank(b) || (a.est ? 1 : 0) - (b.est ? 1 : 0) || GPUS.indexOf(a) - GPUS.indexOf(b)).slice(0, 60);
      html = options.length ? options.map(optionHtml).join("") : `<li class="empty" role="presentation">No GPU matches. Try "4070" or "6700".</li>`;
    }
    list.innerHTML = html;
    active = -1;
  }
  function open(query) {
    fill(query);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    const sel = list.querySelector('[aria-selected="true"]');
    if (sel && !query) sel.scrollIntoView({ block: "nearest" });
  }
  function close(restore) {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    if (restore) input.value = S.gpu;
  }
  function choose(name) {
    stopAuto();
    S.gpu = name;
    input.value = name;
    close(false);
    render();
  }
  function move(d) {
    const items = Array.from(list.querySelectorAll('[role="option"]'));
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle("active", i === active));
    items[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", items[active].id);
  }
  input.value = S.gpu;
  input.addEventListener("focus", () => { input.select(); open(""); });
  input.addEventListener("click", () => { if (list.hidden) open(""); });
  input.addEventListener("input", () => open(input.value === S.gpu ? "" : input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) open(""); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const items = Array.from(list.querySelectorAll('[role="option"]'));
      const pick = items[active] || items[0];
      if (pick && !list.hidden) choose(pick.dataset.name);
    } else if (e.key === "Escape") { close(true); }
  });
  input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) close(true); }, 120));
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;
    e.preventDefault();
    choose(li.dataset.name);
  });

  // ---------- Level ----------
  const levelBtns = $$("[data-levels] button");
  levelBtns.forEach((b, i) => {
    b.addEventListener("click", () => { stopAuto(); S.level = +b.dataset.l; render(); });
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = levelBtns[(i + d + levelBtns.length) % levelBtns.length];
      stopAuto(); S.level = +n.dataset.l; render(); n.focus();
    });
  });

  // ---------- Bag ----------
  const bag = $("#cc-bag");
  bag.addEventListener("input", () => { const v = parseFloat(bag.value); if (!isNaN(v) && v >= 0) { S.bag = v; render(); } });
  $$("[data-bag]").forEach((b) => b.addEventListener("click", () => { S.bag = +b.dataset.bag; bag.value = S.bag; render(); }));

  // Numbers glide to their new value instead of jumping.
  function tween(el, to, fmt) {
    if (!el) return;
    const from = el._v == null ? to : el._v;
    el._v = to;
    if (reduce || Math.abs(from - to) < 0.005) { el.textContent = fmt(to); return; }
    const start = performance.now(), dur = 450;
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const f = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - f, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (f < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  function basis() {
    const L = M.live();
    if (!L) return "Estimate at launch-week trading, not a promise.";
    const span = L.hours >= 23 ? "24 hours'" : L.hours < 2 ? "hour's" : Math.floor(L.hours) + " hours'";
    return `At the last ${span} payouts, not a promise.`;
  }

  function render() {
    const g = GPUS.find((x) => x.name === S.gpu) || GPUS[0];
    levelBtns.forEach((b) => { const on = +b.dataset.l === S.level; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
    card.dataset.level = S.level;
    // The level's requirement sits in the result's label (mined $HASH counts toward the bag).
    out("with").textContent = S.level === 0
      ? "With Hashcoin, no bag: mining only, no bonus"
      : `With Hashcoin at Level ${S.level} (a ${whole(M.HOLDER.usd[S.level - 1])}+ bag)`;
    const r = M.miner({ myRev: g.rev, level: S.level });
    tween(out("total"), r.total, money);
    tween(out("mining"), r.mining, money);
    tween(out("bonus"), r.chestShare, (v) => "+" + money(v));
    const top = Math.max(r.total, 0.0001);
    out("bar-mine").style.width = (100 * r.mining) / top + "%";
    out("bar-bonus").style.width = (100 * r.chestShare) / top + "%";

    const lvl = M.holderLevelFor(S.bag);
    const h = M.holder(S.bag, lvl);
    out("hold-level").textContent = lvl ? `Holder rewards at Level ${lvl} (your bag counts ${M.MULT[lvl - 1]}×)` : "Holder rewards start at a $50 bag";
    tween(out("hold-day"), h.perDay, money);
    out("hold-yield").textContent = lvl ? `${h.yieldPct.toFixed(2)}% of your bag a day` : "Hold $50 or more to earn.";
    $$('[data-o="basis"]').forEach((el) => (el.textContent = basis()));
  }
  render();
  document.addEventListener("hc:stats", render);
  if (auto) {
    if ("IntersectionObserver" in window) new IntersectionObserver((en) => { onScreen = en[0].isIntersecting; scheduleAuto(); }).observe(card);
    document.addEventListener("visibilitychange", scheduleAuto);
    scheduleAuto();
  }
})();
