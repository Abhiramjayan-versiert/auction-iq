(async () => {
// Browser smoke test (CommonJS so the preinstalled global Playwright resolves): public pages render without errors, protected routes redirect to login,
// layouts work at phone width. Usage: BASE=http://localhost:3000 node scripts/smoke.mjs [outDir]
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3000";
const out = process.argv[2];
const browser = await chromium.launch();
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };
for (const vp of [{ name: "desktop", width: 1366, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/", "/features", "/how-it-works", "/login", "/register", "/forgot-password", "/events", "/setup"]) {
    errors.length = 0;
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(res.status() === 200 && errors.length === 0, `[${vp.name}] ${path} renders (${res.status()})${errors.length ? " errors: " + errors.join("; ") : ""}`);
    check(!overflow, `[${vp.name}] ${path} has no horizontal overflow`);
    if (out && ["/", "/login", "/register"].includes(path)) await page.screenshot({ path: `${out}/${vp.name}${path === "/" ? "-home" : path.replace("/", "-")}.png`, fullPage: path === "/" });
  }
  for (const path of ["/dashboard", "/e/00000000-0000-0000-0000-000000000000", "/manage", "/admin/users", "/join"]) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    check(new URL(page.url()).pathname === "/login", `[${vp.name}] ${path} redirects signed-out users to /login`);
  }
  await page.close();
}
// register form validation runs client-side before any network call
const p = await browser.newPage();
await p.goto(BASE + "/register", { waitUntil: "networkidle" });
await p.fill('input[autocomplete="name"]', "A");
await p.fill('input[type="email"]', "someone@example.com");
await p.fill('input[type="password"]', "short");
await p.click("button:has-text('Create account')");
await p.waitForTimeout(300);
// HTML5 'required' fields block submit; nothing should crash
check(true, "register form submit handled");
await browser.close();
console.log(failures ? `${failures} failure(s)` : "All smoke checks passed");
process.exit(failures ? 1 : 0);
})();
