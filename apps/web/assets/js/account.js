// Sign in: see your own bag, level and payouts. Live mode only. It needs a public address and nothing
// else: connect Phantom or Solflare (connect only: never a signature or a transaction) or paste the
// address. The numbers come from the payout loop's public record (<api>/v1/wallet/<address>,
// services/api). The address is remembered in this browser. Before launch the buttons say so.
(function () {
  "use strict";
  const CFG = window.HASHCOIN || {};
  const btns = Array.from(document.querySelectorAll("[data-signin]"));
  if (!btns.length) return;
  const toast = window.hcToast || (() => {});
  if (CFG.mode !== "live") {
    btns.forEach((b) => {
      b.setAttribute("aria-disabled", "true");
      b.title = "Opens at launch, Oct 24";
      b.addEventListener("click", () => toast("Sign in opens at launch, Oct 24: your bag, level and payouts, from just your public address."));
    });
    return;
  }

  const F = window.hcFmt;
  const KEY = "hc-wallet";
  const LEVEL_USD = [50, 500, 2500];
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const short = (a) => a.slice(0, 4) + "…" + a.slice(-4);
  const count = (n) => Math.round(n).toLocaleString("en-US");
  const store = {
    get() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } },
    set(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* private window: just not remembered */ } },
  };

  const dlg = document.createElement("dialog");
  dlg.className = "account";
  dlg.setAttribute("aria-labelledby", "acct-title");
  dlg.innerHTML = `
    <div class="acct-head">
      <h2 id="acct-title">Your account</h2>
      <button class="icon-btn" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div data-view="pick">
      <p class="acct-lede">See your bag, your level and what you've been paid. It only needs your public address: never your seed phrase, and no signature.</p>
      <div class="acct-wallets" data-wallets-found></div>
      <form class="acct-paste" data-paste novalidate>
        <label for="acct-addr">Or paste your public wallet address</label>
        <div class="acct-row">
          <input class="input" id="acct-addr" type="text" autocomplete="off" spellcheck="false" placeholder="Your Solana address">
          <button class="btn btn-gold" type="submit">Show</button>
        </div>
        <p class="hint" data-paste-msg></p>
      </form>
    </div>
    <div data-view="me" hidden>
      <div class="acct-who">
        <span class="lv-badge" data-a="badge">–</span>
        <div><b data-a="addr"></b><a data-a="solscan" target="_blank" rel="noopener">View on Solscan</a></div>
        <button class="btn btn-line btn-sm" type="button" data-change>Change</button>
      </div>
      <p class="hint" data-a="msg" hidden></p>
      <div data-a="data">
        <dl class="acct-grid">
          <div><dt>Your bag</dt><dd data-a="bag">—</dd><p data-a="bag-tokens"></p></div>
          <div><dt>Counts for your level</dt><dd data-a="qualified">—</dd><p>Selling counts 3× against it</p></div>
        </dl>
        <div class="acct-next">
          <p data-a="next"></p>
          <div class="acct-bar"><i data-a="bar"></i></div>
        </div>
        <dl class="acct-grid">
          <div><dt>Paid to you for mining</dt><dd data-a="paid-miner">—</dd><p data-a="paid-miner-usd"></p></div>
          <div><dt>Paid to you for holding</dt><dd data-a="paid-holder">—</dd><p data-a="paid-holder-usd"></p></div>
        </dl>
        <p class="hint" data-a="extra"></p>
      </div>
    </div>`;
  document.body.append(dlg);
  const $ = (s) => dlg.querySelector(s);
  const A = (k) => $(`[data-a="${k}"]`);

  function label() {
    const addr = store.get();
    btns.forEach((b) => { b.textContent = addr ? short(addr) : "Sign in"; b.setAttribute("aria-label", addr ? `Your account (${addr})` : "Sign in"); });
  }
  function view(name) {
    $('[data-view="pick"]').hidden = name !== "pick";
    $('[data-view="me"]').hidden = name !== "me";
  }
  function open() {
    if (store.get()) { view("me"); lookup(store.get()); } else { view("pick"); wallets(); }
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function close() { if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); }
  btns.forEach((b) => b.addEventListener("click", open));
  $("[data-close]").addEventListener("click", close);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  $("[data-change]").addEventListener("click", () => { store.set(""); label(); view("pick"); wallets(); $("#acct-addr").value = ""; $("#acct-addr").focus(); });

  // Wallet extensions in this browser: connect asks for the public key only.
  function wallets() {
    const box = $("[data-wallets-found]");
    box.textContent = "";
    const found = [];
    const phantom = window.phantom && window.phantom.solana && window.phantom.solana.isPhantom ? window.phantom.solana : window.solana && window.solana.isPhantom ? window.solana : null;
    if (phantom) found.push(["Phantom", phantom]);
    if (window.solflare && window.solflare.isSolflare) found.push(["Solflare", window.solflare]);
    for (const [name, provider] of found) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-line btn-block";
      b.textContent = `Connect ${name}`;
      b.addEventListener("click", async () => {
        try {
          const r = await provider.connect();
          const pk = String((r && r.publicKey) || provider.publicKey || "");
          if (!B58.test(pk)) throw new Error("no public key");
          use(pk);
        } catch (e) {
          $("[data-paste-msg]").textContent = `${name} didn't connect. You can paste your address instead.`;
        }
      });
      box.append(b);
    }
    box.hidden = !found.length;
  }

  $("[data-paste]").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#acct-addr"), msg = $("[data-paste-msg]");
    const v = input.value.trim();
    if (v.split(/\s+/).length >= 11) {
      input.value = "";
      msg.textContent = "That looks like a seed phrase. Never paste it anywhere, including here. Use your public address.";
      return;
    }
    if (!B58.test(v)) { msg.textContent = "That isn't a Solana address. It's 32 to 44 letters and numbers, from your wallet's Receive screen."; return; }
    msg.textContent = "";
    use(v);
  });

  function use(addr) {
    store.set(addr);
    label();
    view("me");
    lookup(addr);
  }

  async function lookup(addr) {
    A("addr").textContent = short(addr);
    A("solscan").href = "https://solscan.io/account/" + encodeURIComponent(addr);
    A("msg").hidden = false;
    A("msg").textContent = "Looking it up…";
    A("data").hidden = true;
    let w = null, why = "";
    if (window.HASHCOIN_SAMPLE_WALLET) w = { address: addr, ...window.HASHCOIN_SAMPLE_WALLET };
    else {
      try {
        const r = await fetch(String(CFG.api).replace(/\/$/, "") + "/v1/wallet/" + encodeURIComponent(addr), { cache: "no-store" });
        if (r.ok) w = await r.json();
        else if (r.status === 404) why = "No $HASH activity for this wallet yet. It shows here after the first payout round that includes it.";
        else if (r.status === 400) why = "That isn't a Solana address.";
        else why = "The account lookup isn't answering right now. Try again in a minute.";
      } catch (e) {
        why = "The account lookup isn't answering right now. Try again in a minute.";
      }
    }
    if (!w) { A("msg").textContent = why; A("badge").textContent = "–"; dlg.dataset.level = "0"; return; }
    render(w);
  }

  function render(w) {
    A("msg").hidden = true;
    A("data").hidden = false;
    const level = Number(w.holderLevel) || 0;
    dlg.dataset.level = String(level);
    A("badge").textContent = level ? `Level ${level}` : "No level";
    A("bag").textContent = F.usd(w.balanceUsd || 0);
    A("bag-tokens").textContent = `${count(w.balanceTokens || 0)} $HASH`;
    A("qualified").textContent = F.usd(Math.max(0, w.qualifiedUsd || 0));
    const q = Math.max(0, w.qualifiedUsd || 0);
    if (level < 3) {
      const need = w.usdToNextLevel != null ? w.usdToNextLevel : LEVEL_USD[level] - q;
      A("next").textContent = `${F.usd(Math.max(0, need))} more to reach Level ${level + 1} (a ${F.usd(LEVEL_USD[level])}+ bag).`;
      A("bar").style.width = Math.min(100, (100 * q) / LEVEL_USD[level]) + "%";
    } else {
      A("next").textContent = "Level 3, the top level. Keep the bag at $2,500 or more to stay here.";
      A("bar").style.width = "100%";
    }
    const price = w.priceUsd || 0, paid = w.paidTokens || { miner: 0, holder: 0 };
    A("paid-miner").textContent = `${count(paid.miner)} $HASH`;
    A("paid-holder").textContent = `${count(paid.holder)} $HASH`;
    A("paid-miner-usd").textContent = price ? `About ${F.usd(paid.miner * price)} now` : "";
    A("paid-holder-usd").textContent = price ? `About ${F.usd(paid.holder * price)} now` : "";
    const extra = [];
    if (w.pendingUsd > 0) extra.push(`Still coming: ${F.usd(w.pendingUsd)} of mining, paid once the mined coin sells.`);
    if (w.hoursMinedInWindow > 0) extra.push(`Mined ${count(w.hoursMinedInWindow)} hours in the last 14 days.`);
    A("extra").textContent = extra.join(" ");
  }

  label();
})();
