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
  await page.click("button:has-text('Entered player')");
  const opt = await page.locator("select option", { hasText: "Indian batsman" }).first().getAttribute("value");
  await page.selectOption("select", opt);
  await page.waitForTimeout(300);
  const ceilingText = await page.locator("text=/^Suggested bid \\(/").locator("..").innerText();
  check(/₹[\d.]+ Cr/.test(ceilingText), `Smart Bid shows a ceiling: ${ceilingText.replace(/\n/g, " ")}`);
  const reasons = await page.locator("ol li").count();
  check(reasons >= 4, `Smart Bid explains its reasoning (${reasons} steps)`);
  const bal = ceilingText.match(/₹([\d.]+)/)[1];
  await page.click("button:has-text('Aggressive')");
  await page.waitForTimeout(200);
  const agg = (await page.locator("text=/^Suggested bid \\(/").locator("..").innerText()).match(/₹([\d.]+)/)[1];
  await page.click("button:has-text('Conservative')");
  await page.waitForTimeout(200);
  const con = (await page.locator("text=/^Suggested bid \\(/").locator("..").innerText()).match(/₹([\d.]+)/)[1];
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
  check((await page.locator("nav >> text=Live data entry").count()) > 0, "Data entry sees 'Live data entry' in the menu");

  // Tracker: analyst (crew member) view — read-only
  const sess2 = { ...session, access_token: `${b64({ alg: "HS256" })}.${b64({ sub: "0000000a-0000-0000-0000-000000000002", exp: 4102444800 })}.sig`, user: { ...session.user, id: "0000000a-0000-0000-0000-000000000002", email: "demo.player@example.com" } };
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess2)).toString("base64url"), domain: "localhost", path: "/" }]);
  const ap = await ctx2.newPage();
  ap.on("pageerror", (e) => errs.push("analyst: " + e.message));
  await ap.goto(`${BASE}/e/${trk}`, { waitUntil: "networkidle" });
  check((await ap.locator("text=Analyst").count()) > 0 || (await ap.locator("text=Remaining purse").count()) > 0, "Analyst sees the live dashboard on a phone-sized screen");
  check((await ap.locator("text=Live data entry").count()) === 0, "Analyst has no data-entry menu");
  await ap.goto(`${BASE}/manage/${trk}/control-room`, { waitUntil: "networkidle" });
  check(new URL(ap.url()).pathname === "/dashboard", `Analyst is blocked from data entry (→ ${new URL(ap.url()).pathname})`);
  await ap.goto(`${BASE}/e/${trk}/crew`, { waitUntil: "networkidle" });
  check((await ap.locator("text=Demo Admin").count()) > 0 && (await ap.locator("select").count()) === 0, "Analyst sees crew but cannot change roles");
  await ctx2.close();

  // ===== LIVE DATA ENTRY (operator) =====
  const live = "e0000000-0000-0000-0000-0000000000f8";
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/manage/${live}/entry`, { waitUntil: "networkidle" });
  const purseOf = async (short) => (await page.locator("tr", { hasText: short }).last().innerText());
  const purseBefore = await purseOf("TIG");
  const t0 = Date.now();
  await page.fill("input[aria-label='Player name']", "E2E New Star");
  await page.keyboard.press("Tab");
  await page.keyboard.type("9.1");
  await page.keyboard.press("Tab");
  await page.keyboard.type("tig");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("6");
  await page.keyboard.press("Enter");
  await page.locator("td", { hasText: "E2E New Star" }).first().waitFor({ timeout: 5000 });
  check(true, `Quick entry (name → rating → team → price → Enter) saved in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const purseAfter = await purseOf("TIG");
  check(purseBefore.includes("₹82.5 Cr") && purseAfter.includes("₹76.5 Cr"), `Winning team's purse decreased (${purseBefore.replace(/\s+/g, " ")} → ${purseAfter.replace(/\s+/g, " ")})`);
  check((await page.inputValue("input[aria-label='Player name']")) === "", "Fields cleared and ready for the next player");
  // duplicate protection
  await page.fill("input[aria-label='Player name']", "rehearsal batter 1");
  check((await page.locator("text=is already sold to").count()) > 0, "Duplicate (already sold) player is flagged while typing");
  await page.fill("input[aria-label='Player name']", "");
  // grid edit: change the new row's price 6 → 7
  const priceCell = page.locator("tr", { hasText: "E2E New Star" }).locator("td").nth(8);
  await priceCell.dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("7");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  check((await purseOf("TIG")).includes("₹75.5 Cr"), "Editing a sold price recalculates the purse");
  // paste multiple rows from Excel into the name box
  await page.focus("input[aria-label='Player name']");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text", "Paste One\t8.4\tEAG\t5\nPaste Two\t7.7\tunsold\t\nPaste Three\t99\tWOL\t3");
    document.querySelector("input[aria-label='Player name']").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.locator("text=Paste from Excel").waitFor({ timeout: 3000 });
  check((await page.locator("text=2 ready").count()) > 0, "Pasted rows validated (invalid rating flagged)");
  await page.click("button:has-text('Save 2 rows')");
  await page.locator("td", { hasText: "Paste Two" }).first().waitFor({ timeout: 5000 });
  check((await page.locator("td", { hasText: "Paste One" }).count()) > 0, "Valid pasted rows saved");
  // undo last
  await page.click("button:has-text('Undo last')");
  await page.waitForTimeout(800);
  check((await page.locator("td", { hasText: "Paste Two" }).count()) === 0, "Undo reverses the latest entry (kept in history)");
  // offline: entry is queued, never lost, and syncs on reconnect
  await page.context().setOffline(true);
  await page.fill("input[aria-label='Player name']", "Offline Hero");
  await page.keyboard.press("Tab");
  await page.keyboard.type("8");
  await page.keyboard.press("Tab");
  await page.keyboard.type("haw");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  check((await page.locator("text=waiting for connection").count()) > 0, "Offline entry is queued with a visible status");
  await page.context().setOffline(false);
  await page.locator("td", { hasText: "Offline Hero" }).first().waitFor({ timeout: 20000 }).catch(() => null);
  check((await page.locator("td", { hasText: "Offline Hero" }).count()) > 0, "Queued entry synced after reconnecting");

  // Excel import of a names-only sheet (no header, no roles) on the Players page
  await page.goto(`${BASE}/manage/${live}/players`, { waitUntil: "networkidle" });
  await page.setInputFiles("input[type=file]", require("path").join(__dirname, "files", "names-only.xlsx"));
  await page.locator("text=Import preview").waitFor({ timeout: 5000 }).catch(() => null);
  check((await page.locator("text=3 player(s) ready to import").count()) > 0, "Names-only .xlsx is read (3 players, no header, no roles)");
  await page.click("button:has-text('Import 3')");
  await page.locator("text=Import preview").waitFor({ state: "hidden", timeout: 8000 }).catch(() => null);
  await page.locator("td", { hasText: "Jasprit Bumrah" }).first().waitFor({ timeout: 5000 }).catch(() => null);
  check((await page.locator("td", { hasText: "Jasprit Bumrah" }).count()) > 0, "Imported names appear in the player list");
  await page.setInputFiles("input[type=file]", require("path").join(__dirname, "files", "names-only.xlsx"));
  await page.locator("text=Import preview").waitFor({ timeout: 5000 }).catch(() => null);
  check((await page.locator("text=already exist here and were skipped").count()) > 0, "Re-importing the same sheet skips existing names instead of failing");
  await page.keyboard.press("Escape");
  await page.setInputFiles("input[type=file]", require("path").join(__dirname, "files", "header-duplicates.xlsx"));
  await page.locator("text=Import preview").waitFor({ timeout: 5000 }).catch(() => null);
  check((await page.locator("text=duplicate name(s) in the file were skipped").count()) > 0, "'Player Names' header recognised and in-file duplicates skipped");
  await page.keyboard.press("Escape");

  // Other formats: PDF table, Word table, numbered text list, pasted list
  const fileCase = async (file, expectText, label) => {
    await page.setInputFiles("input[type=file]", require("path").join(__dirname, "files", file));
    await page.locator("text=Import preview").waitFor({ timeout: 15000 }).catch(() => null);
    check((await page.locator(`text=${expectText}`).count()) > 0, label);
    await page.keyboard.press("Escape");
  };
  await fileCase("players-table.pdf", "Pdf Player Gamma", "PDF table read (names, with S.No column dropped)");
  await fileCase("players.docx", "Docx Player Two", "Word (.docx) table read");
  await fileCase("numbered-list.txt", "Shubman Gill", "Numbered text list read");
  await page.click("button:has-text('Paste a list')");
  await page.fill("textarea", "1. Pasted Player One\n2. Pasted Player Two");
  await page.click("button:has-text('Preview')");
  check((await page.locator("text=2 player(s) ready to import").count()) > 0, "Pasted list previewed");
  await page.keyboard.press("Escape");

  // ===== PARTICIPANT (mobile) sees the operator's entries =====
  const sessP = { ...session, access_token: `${b64({ alg: "HS256" })}.${b64({ sub: "0000000a-0000-0000-0000-000000000002", exp: 4102444800 })}.sig`, user: { ...session.user, id: "0000000a-0000-0000-0000-000000000002", email: "demo.player@example.com" } };
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx3.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sessP)).toString("base64url"), domain: "localhost", path: "/" }]);
  const pp = await ctx3.newPage();
  pp.on("pageerror", (e) => errs.push("participant: " + e.message));
  await pp.goto(`${BASE}/e/${live}`, { waitUntil: "networkidle" });
  check((await pp.locator("text=Auction War Room").count()) > 0, "Participant War Room loads on a phone");
  check((await pp.locator("text=Offline Hero").count()) > 0, "Participant feed shows the operator's latest entry");
  check((await pp.locator("nav[aria-label='Primary'] >> text=Competitors").count()) > 0, "Mobile bottom navigation present");
  await pp.goto(`${BASE}/e/${live}/smart-bid`, { waitUntil: "networkidle" });
  await pp.fill("input[placeholder^='Rating']", "9");
  await pp.waitForTimeout(300);
  check((await pp.locator("text=Maximum safe bid").count()) > 0, "Smart Bid works for a player typed in from the block");
  await pp.goto(`${BASE}/e/${live}/copilot`, { waitUntil: "networkidle" });
  await pp.click("button:has-text('Which team is currently strongest?')");
  await pp.waitForTimeout(300);
  check((await pp.locator("text=leads the official ranking").count()) > 0, "Co-Pilot answers from live data");
  await pp.goto(`${BASE}/e/${live}/competitors`, { waitUntil: "networkidle" });
  check((await pp.locator("tr", { hasText: "PAN" }).count()) > 0, "Team without a purse is listed (purse shown as unknown)");
  await pp.goto(`${BASE}/e/${live}/lab`, { waitUntil: "networkidle" });
  await pp.click("button:has-text('Run')");
  await pp.locator("text=Your chance of 1st").waitFor({ timeout: 15000 }).catch(() => null);
  check((await pp.locator("text=Your chance of 1st").count()) > 0, "Monte Carlo simulation runs in the browser");
  await ctx3.close();

  check(errs.length === 0, `No page errors${errs.length ? ": " + errs.join("; ") : ""}`);
  await browser.close();
  console.log(fails ? `${fails} failure(s)` : "All interaction checks passed");
  process.exit(fails ? 1 : 0);
})();
