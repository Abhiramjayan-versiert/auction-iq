// Interactive checks of participant decision tools against the mock backend.
const { chromium } = require("playwright");
(async () => {
  const BASE = process.env.BASE || "http://localhost:3124";
  const ev = "e0000000-0000-0000-0000-000000000001";
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "0000000a-0000-0000-0000-000000000001", exp: 4102444800 })}.sig`;
  const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "0000000a-0000-0000-0000-000000000001", email: "demo.admin@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {} } };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  let fails = 0;
  const check = (ok, m) => { console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); if (!ok) fails++; };

  // Smart Bid: pick an eligible player (Indian batsman needed by team A)
  await page.goto(`${BASE}/e/${ev}/smart-bid`, { waitUntil: "networkidle" });
  const opt = await page.locator("select option", { hasText: "Indian batsman" }).first().getAttribute("value");
  await page.selectOption("select", opt);
  await page.waitForTimeout(300);
  const ceilingText = await page.locator("text=Maximum recommended bid").locator("..").innerText();
  check(/₹[\d.]+ Cr/.test(ceilingText), `Smart Bid shows a ceiling: ${ceilingText.replace(/\n/g, " ")}`);
  const reasons = await page.locator("ol li").count();
  check(reasons >= 4, `Smart Bid explains its reasoning (${reasons} steps)`);
  const bal = ceilingText.match(/₹([\d.]+)/)[1];
  await page.click("button:has-text('Aggressive')");
  await page.waitForTimeout(200);
  const agg = (await page.locator("text=Maximum recommended bid").locator("..").innerText()).match(/₹([\d.]+)/)[1];
  await page.click("button:has-text('Conservative')");
  await page.waitForTimeout(200);
  const con = (await page.locator("text=Maximum recommended bid").locator("..").innerText()).match(/₹([\d.]+)/)[1];
  check(Number(agg) >= Number(bal) && Number(bal) >= Number(con), `Strategy ordering aggressive ${agg} ≥ balanced ${bal} ≥ conservative ${con}`);

  // Simulator: add a hypothetical purchase in scenario B
  await page.goto(`${BASE}/e/${ev}/simulator`, { waitUntil: "networkidle" });
  await page.click("button:has-text('Strategy B')");
  const before = await page.locator("text=Remaining purse").first().locator("..").innerText();
  const simOpt = await page.locator("form select").first().locator("option", { hasText: "Indian batsman" }).first().getAttribute("value");
  await page.locator("form select").first().selectOption(simOpt);
  await page.locator("form input[type=number]").fill("7");
  await page.click("form button:has-text('Add')");
  await page.waitForTimeout(800);
  const after = await page.locator("text=Remaining purse").first().locator("..").innerText();
  const last = (t) => Number(t.match(/→ ₹([\d.]+)/)[1]);
  check(Math.abs(last(before) - last(after) - 7) < 1e-9, `Simulator deducts the ₹7 Cr hypothetical price (${last(before)} → ${last(after)})`);
  check((await page.locator("li", { hasText: "₹7 Cr" }).count()) > 0, "Simulated purchase listed");

  // Notes: create a private note
  await page.goto(`${BASE}/e/${ev}/notes`, { waitUntil: "networkidle" });
  await page.fill("textarea", "Watch DTJ budget after lot 40");
  await page.click("button:has-text('Save note')");
  await page.waitForTimeout(600);
  check((await page.locator("text=Watch DTJ budget after lot 40").count()) > 0, "Private note saved and listed");

  // Player explorer: search filters instantly
  await page.goto(`${BASE}/e/${ev}/players`, { waitUntil: "networkidle" });
  await page.fill("input[placeholder^='Search name']", "Player 07");
  await page.waitForTimeout(200);
  check((await page.locator("tbody tr").count()) === 1, "Player search filters instantly");

  // Tracker: data-entry view
  const trk = require("./fixtures.json").events.find((e) => e.mode === "tracker").id;
  await page.goto(`${BASE}/manage/${trk}/control-room`, { waitUntil: "networkidle" });
  check((await page.locator("text=every result appears on your crew").count()) > 0, "Tracker control room shows data-entry mode");
  await page.fill("input[placeholder^='Search player']", "Someone Brand New");
  await page.waitForTimeout(200);
  check((await page.locator("text=isn't in the list").count()) > 0, "Unknown player offers inline quick-add");
  await page.goto(`${BASE}/e/${trk}`, { waitUntil: "networkidle" });
  check((await page.locator("nav >> text=Record results").count()) > 0, "Data entry sees 'Record results' in the menu");

  // Tracker: analyst (crew member) view — read-only
  const sess2 = { ...session, access_token: `${b64({ alg: "HS256" })}.${b64({ sub: "0000000a-0000-0000-0000-000000000002", exp: 4102444800 })}.sig`, user: { ...session.user, id: "0000000a-0000-0000-0000-000000000002", email: "demo.player@example.com" } };
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess2)).toString("base64url"), domain: "localhost", path: "/" }]);
  const ap = await ctx2.newPage();
  ap.on("pageerror", (e) => errs.push("analyst: " + e.message));
  await ap.goto(`${BASE}/e/${trk}`, { waitUntil: "networkidle" });
  check((await ap.locator("text=Analyst").count()) > 0 || (await ap.locator("text=Remaining purse").count()) > 0, "Analyst sees the live dashboard on a phone-sized screen");
  check((await ap.locator("text=Record results").count()) === 0, "Analyst has no data-entry menu");
  await ap.goto(`${BASE}/manage/${trk}/control-room`, { waitUntil: "networkidle" });
  check(new URL(ap.url()).pathname === "/dashboard", `Analyst is blocked from data entry (→ ${new URL(ap.url()).pathname})`);
  await ap.goto(`${BASE}/e/${trk}/crew`, { waitUntil: "networkidle" });
  check((await ap.locator("text=Demo Admin").count()) > 0 && (await ap.locator("select").count()) === 0, "Analyst sees crew but cannot change roles");
  await ctx2.close();

  check(errs.length === 0, `No page errors${errs.length ? ": " + errs.join("; ") : ""}`);
  await browser.close();
  console.log(fails ? `${fails} failure(s)` : "All interaction checks passed");
  process.exit(fails ? 1 : 0);
})();
