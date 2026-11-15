// Renders every signed-in page against the mock Supabase server and reports runtime errors.
// Usage: BASE=http://localhost:3124 MOCK=http://localhost:54399 node scripts/e2e/walk-pages.cjs [screenshotDir]
const { chromium } = require("playwright");
(async () => {
  const BASE = process.env.BASE || "http://localhost:3124";
  const out = process.argv[2];
  const ev = "e0000000-0000-0000-0000-000000000001";
  const fixtures = require("./fixtures.json");
  const trk = fixtures.events.find((e) => e.mode === "tracker").id;
  const live = "e0000000-0000-0000-0000-0000000000f8";
  const payload = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${payload({ alg: "HS256", typ: "JWT" })}.${payload({ sub: "0000000a-0000-0000-0000-000000000001", role: "authenticated", exp: 4102444800 })}.sig`;
  const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "0000000a-0000-0000-0000-000000000001", email: "demo.admin@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {} } };
  const browser = await chromium.launch();
  let failures = 0;
  for (const vp of [{ name: "desktop", width: 1440, height: 950 }, { name: "mobile", width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => m.type() === "error" && !/websocket|realtime|WebSocket|ERR_CONNECTION|Failed to load resource/i.test(m.text()) && errors.push("console: " + m.text().slice(0, 200)));
    const pages = [
      "/dashboard", "/profile", "/join", "/manage",
      `/e/${ev}`, `/e/${ev}/live`, `/e/${ev}/team`, `/e/${ev}/competitors`, `/e/${ev}/compare`, `/e/${ev}/leaderboard`, `/e/${ev}/players`,
      `/e/${ev}/smart-bid`, `/e/${ev}/purse-planner`, `/e/${ev}/purse-planner?tab=competitors`, `/e/${ev}/simulator`, `/e/${ev}/shortlist`, `/e/${ev}/notes`, `/e/${ev}/alerts`, `/e/${ev}/reports`, `/e/${ev}/select-team`,
      `/manage/${ev}`, `/manage/${ev}/control-room`, `/manage/${ev}/teams`, `/manage/${ev}/players`, `/manage/${ev}/rules`, `/manage/${ev}/members`, `/manage/${ev}/transactions`, `/manage/${ev}/reports`,
      "/admin", "/admin/users", "/admin/events", "/admin/players", "/admin/templates", "/admin/settings", "/admin/audit",
      `/e/${ev}/insights`, `/e/${ev}/copilot`, `/e/${ev}/shadow`, `/e/${ev}/lab`, `/e/${ev}/analytics`,
      `/manage/${live}/entry`, `/e/${live}`, `/e/${live}/competitors`, `/e/${live}/smart-bid`, `/e/${live}/insights`, `/e/${live}/lab`, `/e/${live}/analytics`, `/e/${live}/team`,
      "/trackers/new", `/e/${trk}`, `/e/${trk}/crew?new=1`, `/e/${trk}/live`, `/e/${trk}/reports`, `/manage/${trk}/control-room`, `/manage/${trk}/players`, `/manage/${trk}/rules`,
    ];
    for (const p of pages) {
      errors.length = 0;
      const res = await page.goto(BASE + p, { waitUntil: "networkidle" }).catch((e) => ({ status: () => "ERR " + e.message }));
      await page.waitForTimeout(400);
      const crashed = await page.locator("text=Application error").count();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const ok = res.status() === 200 && !crashed && !errors.length && new URL(page.url()).pathname === p.split("?")[0];
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"} [${vp.name}] ${p} ${res.status()}${overflow ? " (h-overflow)" : ""}${crashed ? " CRASH" : ""} ${page.url() !== BASE + p ? "→ " + page.url() : ""} ${errors.join(" | ")}`);
      if (out && vp.name === "desktop") await page.screenshot({ path: `${out}/${p.replace(/^\//, "").replace(/[/?=]/g, "_").replace(ev, "ev").replace(trk, "trk").replace(live, "live") || "root"}.png`, fullPage: false });
      if (out && vp.name === "mobile" && /live$|\/e\/[^/]+$|control-room|crew|entry|insights|copilot/.test(p)) await page.screenshot({ path: `${out}/m_${p.replace(/^\//, "").replace(/[/?=]/g, "_").replace(ev, "ev").replace(trk, "trk").replace(live, "live")}.png` });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `${failures} failure(s)` : "All signed-in pages rendered without errors");
  process.exit(failures ? 1 : 0);
})();
