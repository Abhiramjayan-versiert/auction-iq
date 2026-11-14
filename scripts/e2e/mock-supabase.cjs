// Minimal in-memory stand-in for the Supabase HTTP APIs (auth user + PostgREST subset),
// serving fixtures exported from a real database by make-fixtures.sql.
// DEV/TEST TOOL ONLY — lets the UI be exercised in a browser without a Supabase project.
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = Number(process.env.MOCK_PORT || 54399);
const db = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
for (const k of Object.keys(db)) if (db[k] === null) db[k] = [];
// The signed-in user is taken from the bearer token's `sub` claim (falls back to MOCK_USER / demo admin).
let USER_ID = process.env.MOCK_USER || "0000000a-0000-0000-0000-000000000001";
const subFrom = (req) => {
  try {
    const tok = (req.headers.authorization || "").replace(/^Bearer /, "").split(".")[1];
    return JSON.parse(Buffer.from(tok, "base64url").toString()).sub || null;
  } catch {
    return null;
  }
};
const profile = () => db.profiles.find((p) => p.id === USER_ID);
const user = () => ({ id: USER_ID, aud: "authenticated", role: "authenticated", email: profile()?.email, app_metadata: {}, user_metadata: {}, created_at: profile()?.created_at });
const crewRole = (eventId) => (db.crew || []).find((c) => c.event_id === eventId && c.user_id === USER_ID)?.role;
const isTracker = (eventId) => db.events.find((e) => e.id === eventId)?.mode === "tracker";

function applyFilters(rows, params) {
  for (const [col, raw] of params) {
    if (["select", "order", "limit", "offset", "or", "on_conflict", "columns"].includes(col)) continue;
    const [op, ...rest] = raw.split(".");
    const val = rest.join(".");
    rows = rows.filter((r) => {
      const v = r[col];
      if (op === "eq") return String(v) === val;
      if (op === "neq") return String(v) !== val;
      if (op === "is") return val === "null" ? v === null || v === undefined : String(v) === val;
      if (op === "in") return val.replace(/[()]/g, "").split(",").includes(String(v));
      if (op === "ilike") return String(v ?? "").toLowerCase().includes(val.replace(/[%*]/g, "").toLowerCase());
      return true;
    });
  }
  const order = params.find(([k]) => k === "order");
  if (order) {
    const [col, dir] = order[1].split(",")[0].split(".");
    rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.find(([k]) => k === "limit");
  if (limit) rows = rows.slice(0, Number(limit[1]));
  return rows;
}

const RPC = {
  can_manage_event: (a) => (isTracker(a.p_event) ? crewRole(a.p_event) === "data_entry" : profile()?.platform_role !== "participant"),
  is_event_member: () => true,
  can_edit_rules: (a) => (isTracker(a.p_event) ? crewRole(a.p_event) === "data_entry" : profile()?.platform_role !== "participant"),
  admin_platform_stats: () => db.admin_platform_stats,
  get_crew: (a) => (db.crew || []).filter((c) => c.event_id === a.p_event),
  preview_event_by_code: (a) => db.events.filter((e) => e.invite_code === String(a.p_code).toUpperCase()).map((e) => ({ ...e, organization: e.organizations?.name, teams_count: db.teams.filter((t) => t.event_id === e.id).length, membership_status: null })),
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = body ? JSON.parse(body) : null;
    const anonKey = "mock";
    const sub = subFrom(req);
    if (sub && sub !== anonKey) USER_ID = sub;
    if (url.pathname === "/auth/v1/user") return send(res, 200, user());
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/);
    if (rpc) return send(res, 200, RPC[rpc[1]] ? RPC[rpc[1]](json || {}) : null);
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)/);
    if (!m) return send(res, 404, { message: "not found" });
    const table = m[1];
    db[table] = db[table] || [];
    const params = [...url.searchParams.entries()];
    const wantsObject = (req.headers.accept || "").includes("vnd.pgrst.object");
    if (req.method === "GET") {
      const rows = applyFilters(db[table], params);
      return wantsObject ? send(res, rows.length ? 200 : 406, rows[0] ?? { code: "PGRST116", message: "no rows" }) : send(res, 200, rows);
    }
    if (req.method === "POST") {
      const items = (Array.isArray(json) ? json : [json]).map((r) => ({ id: require("crypto").randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
      db[table].push(...items);
      return send(res, 201, wantsObject ? items[0] : items);
    }
    if (req.method === "PATCH") {
      const hits = applyFilters(db[table], params);
      hits.forEach((r) => Object.assign(r, json));
      return send(res, 200, wantsObject ? hits[0] : hits);
    }
    if (req.method === "DELETE") {
      const hits = new Set(applyFilters(db[table], params));
      db[table] = db[table].filter((r) => !hits.has(r));
      return send(res, 200, []);
    }
    send(res, 405, {});
  });
}).listen(PORT, () => console.log(`mock supabase on :${PORT} as ${profile()?.email}`));
