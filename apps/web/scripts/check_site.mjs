// Browser check for the website (Playwright + Chromium), every page at common sizes, dark and light.
//
//   cd apps/web && python3 -m http.server 8123      # in one terminal (or build_pages.mjs --serve)
//   node apps/web/scripts/check_site.mjs             # in another (from the repo root)
//
// Needs Playwright: `npm i -g playwright && npx playwright install chromium` (or set PLAYWRIGHT_PATH
// to a folder that has it). For each page, size and theme it checks that:
//   - there's no horizontal scroll and no page error
//   - no visible text is smaller than 13px (docs/SITE-REDESIGN.md: readable everywhere)
//   - home page: the headline, sentence and buttons fit the first screen; on desktop the card's
//     result is above the fold too and the card is at most 480px tall; and the card works
//     (pick a GPU by typing, switch level and tab: the numbers change)
// and saves screenshots to apps/web/.shots/ (the home page full length). Sizes: 375, 768, 1280, 1366x768,
// 1440, 1920 and 2560 wide.
// Options: BASE=http://localhost:8123  SIZES=375x812,1920x1080  THEMES=dark  PAGES=index  SHOTS=0
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
let globalPw;
try { globalPw = path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright"); } catch { /* npm not on PATH */ }
let pw;
for (const where of [process.env.PLAYWRIGHT_PATH, "playwright", globalPw, "/opt/node-tools/node_modules/playwright"]) {
  if (!where) continue;
  try { pw = require(where); break; } catch { /* try the next one */ }
}
if (!pw) { console.error("Playwright not found. Install it: npm i -g playwright && npx playwright install chromium"); process.exit(1); }

const BASE = process.env.BASE || "http://localhost:8123";
const SIZES = (process.env.SIZES || "375x812,768x1024,1280x800,1366x768,1440x900,1920x1080,2560x1300").split(",").map((s) => s.split("x").map(Number));
const THEMES = (process.env.THEMES || "dark,light").split(",");
const PAGES = (process.env.PAGES || "index,calculator,faq,antivirus").split(",");
const SHOTS = process.env.SHOTS !== "0";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".shots");
if (SHOTS) mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "<-loopback>,localhost,127.0.0.1" } : undefined;
const browser = await pw.chromium.launch({ proxy });
let failed = 0;

for (const theme of THEMES) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true, reducedMotion: "reduce" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("hc-theme", t); } catch (e) { /* ignore */ } }, theme);
    for (const name of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${BASE}/${name}.html`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const tag = `${name}-${w}x${h}-${theme}`;
      const notes = [];
      const fail = (msg) => { failed++; notes.push("FAIL " + msg); };

      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw > cw) fail(`horizontal scroll (${sw} > ${cw})`);
      // Visible text under 13px (screen-reader-only text and hidden parts don't count).
      const tiny = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("body *")) {
          if (!el.offsetParent || el.closest(".sr-only, [hidden], .skip")) continue;
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!own) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 12.5) out.push(`${el.tagName.toLowerCase()}.${el.className || ""} ${fs}px "${el.textContent.trim().slice(0, 30)}"`);
        }
        return out.slice(0, 5);
      });
      if (tiny.length) fail(`text under 13px: ${tiny.join(" | ")}`);

      if (name === "index") {
        // The pitch fits the first screen: headline, sentence, buttons.
        const ctaBottom = await page.evaluate(() => document.querySelector(".hero-ctas").getBoundingClientRect().bottom);
        if (ctaBottom > h) fail(`hero buttons end at ${Math.round(ctaBottom)}px, below the ${h}px window`);
        if (w >= 1024) {
          const [resultBottom, cardHeight] = await page.evaluate(() => [document.querySelector('[data-o="total"]').getBoundingClientRect().bottom, document.querySelector(".calc-card").getBoundingClientRect().height / (parseFloat(getComputedStyle(document.documentElement).zoom) || 1)]);
          if (resultBottom > h) fail(`the card's result ends at ${Math.round(resultBottom)}px, below the ${h}px window`);
          if (cardHeight > 480) fail(`the card is ${Math.round(cardHeight)}px tall (480 max)`);
        }
        if (SHOTS) await page.screenshot({ path: path.join(OUT, `${tag}-full.png`), fullPage: true });
        // The card works: type a GPU, pick a level, switch to Hold.
        const before = await page.textContent('[data-o="total"]');
        await page.click("#cc-gpu");
        await page.keyboard.type("3060 Ti");
        await page.keyboard.press("Enter");
        await page.click('[data-levels] [data-l="3"]');
        await page.waitForTimeout(100);
        const after = await page.textContent('[data-o="total"]');
        const gpu = await page.inputValue("#cc-gpu");
        if (gpu !== "RTX 3060 Ti" || before === after) fail(`card: GPU "${gpu}", total ${before} → ${after}`);
        await page.click("#cc-tab-hold");
        const hold = await page.isVisible("#cc-hold");
        const holdDay = await page.textContent('[data-o="hold-day"]');
        if (!hold || !/\$/.test(holdDay)) fail(`card: Hold tab didn't open (${holdDay})`);
      } else if (SHOTS) {
        await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
      }
      if (errors.length) fail("page errors: " + errors.join(" | "));
      console.log(`${tag}: ${notes.length ? notes.join("; ") : "ok"}`);
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
if (SHOTS) console.log("screenshots in apps/web/.shots/");
process.exit(failed ? 1 : 0);
