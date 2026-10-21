import { chromium } from "playwright";
import fs from "fs";
const email = process.env.SANDBOX_BUYER_EMAIL, pw = process.env.SANDBOX_BUYER_PASSWORD;
if (!email || !pw) throw new Error("set SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD");
const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 1000 } });
const p = await ctx.newPage(); fs.mkdirSync("e2e/shots", { recursive: true });
let n = 0; const shot = async (pg, tag) => pg.screenshot({ path: `e2e/shots/${String(++n).padStart(2,"0")}-${tag}.png` }).catch(() => {});
const logText = () => p.textContent("#log");
await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(4000);

async function approve(buttonId, doneRe, tag) {
  const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 20000 }), p.click(`#${buttonId}`)]);
  await pop.waitForLoadState("domcontentloaded"); await pop.waitForTimeout(4000).catch(() => {}); await shot(pop, tag + "-open");
  if (await pop.locator("#email").isVisible().catch(() => false)) {
    await pop.fill("#email", email);
    if (await pop.locator("#btnNext").isVisible().catch(() => false)) { await pop.click("#btnNext"); await pop.waitForTimeout(3000).catch(() => {}); }
    await pop.fill("#password", pw); await shot(pop, tag + "-pw"); await pop.click("#btnLogin").catch(() => {}); await pop.waitForTimeout(7000).catch(() => {});
  }
  for (let i = 0; i < 6 && !pop.isClosed(); i++) {
    await shot(pop, `${tag}-step${i}`);
    const btn = pop.locator('#payment-submit-btn, button:has-text("Complete Purchase"), button:has-text("Agree & Continue"), button:has-text("Continue to Review"), button:has-text("Agree and Continue"), button:has-text("Continue"), button:has-text("Pay"), button:has-text("Save")').first();
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); }
    await pop.waitForTimeout(5000).catch(() => {});
  }
  for (let i = 0; i < 20 && !doneRe.test(await logText()); i++) await p.waitForTimeout(1000);
  await shot(p, tag + "-done");
  console.log(`== ${tag}:`, doneRe.test(await logText()) ? "OK" : "NOT DONE");
}
await approve("pay-once", /captured/, "payonce");
await approve("save-wallet", /wallet saved/, "vault");
if (/wallet saved/.test(await logText())) {
  await p.click("#charge-saved"); for (let i = 0; i < 20 && !/charged saved wallet/.test(await logText()); i++) await p.waitForTimeout(1000);
  await p.click("#refund-last"); for (let i = 0; i < 20 && !/refunded/.test(await logText()); i++) await p.waitForTimeout(1000);
}
await shot(p, "final"); fs.writeFileSync("e2e/shots/log.txt", await logText());
console.log((await logText()).slice(-3000)); await b.close();
