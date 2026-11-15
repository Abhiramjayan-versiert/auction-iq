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

const crypto = require("crypto");
const nk = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const nextSeq = () => Math.max(0, ...db.auction_transactions.map((t) => t.seq || 0)) + 1;
const fail = (message, code = "P0001") => ({ __error: { message, code } });
function liveEntry(a) {
  const tx0 = a.p_client_ref && db.auction_transactions.find((t) => t.client_ref === a.p_client_ref);
  if (tx0) return { transaction_id: tx0.id, player_id: tx0.player_id, created_player: false, duplicate_submission: true };
  let p = db.players.find((x) => x.event_id === a.p_event && nk(x.name) === nk(a.p_name));
  let created = false;
  if (p && p.auction_status === "sold") return fail(`${p.name} is already recorded as sold`, "23505");
  if (!p) {
    p = { id: crypto.randomUUID(), event_id: a.p_event, name: String(a.p_name).trim().replace(/\s+/g, " "), origin: a.p_origin ?? null, category: a.p_category ?? null, nationality: a.p_nationality ?? null, base_price: a.p_base_price ?? 0, special_abilities: [], auction_status: "available", sold_team_id: null, sold_price: null, lot_number: null, player_ratings: null, created_at: new Date().toISOString() };
    db.players.push(p);
    created = true;
  }
  if (a.p_rating !== null && a.p_rating !== undefined) p.player_ratings = { overall: a.p_rating, batting: null, bowling: null, fielding: null, wicketkeeping: null, consistency: null, experience: null, source: "live entry" };
  const tx = { id: crypto.randomUUID(), seq: nextSeq(), event_id: a.p_event, player_id: p.id, team_id: a.p_status === "sold" ? a.p_team : null, amount: a.p_status === "sold" ? a.p_amount : null, type: a.p_status === "sold" ? "sale" : "unsold", status: "active", note: "live entry", client_ref: a.p_client_ref ?? null, created_at: new Date().toISOString() };
  db.auction_transactions.unshift(tx);
  Object.assign(p, a.p_status === "sold" ? { auction_status: "sold", sold_team_id: a.p_team, sold_price: a.p_amount } : { auction_status: "unsold" });
  return { transaction_id: tx.id, player_id: p.id, created_player: created, duplicate_submission: false };
}
function voidTx(id) {
  const t = db.auction_transactions.find((x) => x.id === id);
  if (!t || t.status !== "active") return fail("Transaction not found or already reversed");
  t.status = "voided";
  t.voided_reason = "reversed";
  const p = db.players.find((x) => x.id === t.player_id);
  if (p) Object.assign(p, { auction_status: "available", sold_team_id: null, sold_price: null });
  return null;
}

const RPC = {
  record_live_entry: liveEntry,
  void_transaction: (a) => voidTx(a.p_tx),
  undo_last_transaction: (a) => {
    const t = db.auction_transactions.filter((x) => x.event_id === a.p_event && x.status === "active").sort((x, y) => y.seq - x.seq)[0];
    return t ? voidTx(t.id) || t.id : fail("Nothing to undo");
  },
  update_live_entry: (a) => {
    const t = db.auction_transactions.find((x) => x.id === a.p_tx);
    if (!t) return fail("Not found");
    const p = db.players.find((x) => x.id === t.player_id);
    if (a.p_name) p.name = a.p_name;
    if (a.p_rating !== undefined && a.p_rating !== null) p.player_ratings = { ...(p.player_ratings || {}), overall: a.p_rating };
    if (a.p_clear_rating) p.player_ratings = null;
    if (a.p_category !== undefined && a.p_category !== null) p.category = a.p_category || null;
    if (a.p_origin !== undefined && a.p_origin !== null) p.origin = a.p_origin || null;
    if (a.p_nationality !== undefined && a.p_nationality !== null) p.nationality = a.p_nationality || null;
    if (a.p_base_price !== undefined && a.p_base_price !== null) p.base_price = a.p_base_price;
    const team = a.p_team ?? t.team_id;
    const amount = a.p_amount ?? t.amount;
    const status = a.p_status ?? (t.type === "sale" ? "sold" : "unsold");
    if (team !== t.team_id || amount !== t.amount || status !== (t.type === "sale" ? "sold" : "unsold")) {
      voidTx(t.id);
      const r = liveEntry({ p_event: t.event_id, p_name: p.name, p_team: team, p_amount: amount, p_status: status });
      return r.transaction_id;
    }
    return t.id;
  },
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
    if (rpc) {
      const out = RPC[rpc[1]] ? RPC[rpc[1]](json || {}) : null;
      if (out && out.__error) return send(res, 400, out.__error);
      return send(res, 200, out);
    }
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
