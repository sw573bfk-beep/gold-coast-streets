// Gold Coast Streets — the online world server (Cloudflare Worker + Durable Objects + a D1 database).
// Each world is a room code with up to 16 players. The server relays where everyone is, hits between players and
// preset quick messages; every player's game still runs its own traffic, pedestrians and police.
// Accounts are a name and a password (stored only as a PBKDF2 hash, no email). Multiplayer progress is saved to the
// account, and records set in public worlds go on the leaderboards.
//   GET  /worlds                       the public worlds and how many are in each
//   GET  /match  ·  GET /newcode            a public world with room (or a new code)  ·  a free 4-digit code
//   GET  /ws?world=CODE&token=T&public=1&title=T   join (or start) a world over a WebSocket (needs an account)
//   POST /signup {name, password}  ·  POST /login {name, password}  ->  { token, name }
//   GET  /save  ·  POST /save {data, world}      your multiplayer progress
//   POST /record {board, value, detail, world}   a new best (public worlds only)
//   GET  /leaders?board=B                        the top 20 (and where you are)
//   GET  /crew  ·  POST /crew/create {name, tag}  ·  POST /crew/join {tag}  ·  POST /crew/leave   your crew
//   GET  /crews                                  the biggest crews (members, and their richest players' worth)
//   GET  /online                                 how many are playing online right now (all worlds)
//   POST /ping  ·  GET /gifts                    time played (once a minute)  ·  money the admin sent you
//   GET  /chat?after=ID  ·  POST /chat {text}    the global chat (filtered on the way in: filter.js)
//   GET  /houses                                 every owned house (yours with its safe; others: robbable or not)
//   POST /house/buy {id, kind, name, x, z, price}  ·  POST /house/sell {id}  ·  POST /house/claim {props}
//   POST /house/safe {id, amount}                put cash in (or, negative, take it out of) your safe
//   POST /house/rob {id}                         crack an offline player's safe: up to half of it, once a day
// The quick-join world is the one shared Gold Coast (GC01, then GC02 when that's full, and so on); progress lives on
// the account, and the server checks every save: a wallet can't grow faster than play could fill it.
//   /admin/...                                   the admin panel (only the accounts named in ADMINS)
import { DurableObject } from 'cloudflare:workers';
import { check as chatCheck, cleanName } from './filter.js';

const SHOWN_MAX = 16, MAX_PLAYERS = 20; // public worlds fill to 16; friends with the code can still get in up to 20
// the shared world's rules
const OFFLINE_MS = 150000;            // no ping for this long: offline (the game pings once a minute)
const ROB_EVERY = 24 * 3600000;       // a house can be robbed once a day
const ROB_MIN = 0.3, ROB_MAX = 0.5;   // a robbery takes 30-50% of the safe
const NEW_PLAYER_MS = 2 * 3600000;    // players with less than two hours played can't be robbed yet
const MAX_HOUSES = 12;
const EARN_PER_MIN = 8000, BUDGET_CAP = 150000; // what play can earn: up to $8,000 a minute, $150,000 saved up at most
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const BAD = /fuck|shit|cunt|bitch|nigg|fag|slut|whore|rape|nazi|porn|dick|cock|pussy|wank/i;
// names and world titles: letters, numbers and spaces only, nothing rude
function clean(s, max, fallback) {
  const t = String(s || '').replace(/’/g, "'").replace(/[^A-Za-z0-9 _'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t && !BAD.test(t.replace(/[\s_'-]/g, '')) && cleanName(t.replace(/[_-]/g, ' ')) ? t : fallback; // the chat filter's word lists too (filter.js)
}
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
// the boards: which way is better, and the most (or least) anyone could honestly get
const TRIALS = { // fastest a route can be driven, in seconds (a little under the straight line at 300 km/h)
  'cavill-pacificfair': 40, 'southport-burleigh': 170, 'robina-surfers': 100, 'star-southport': 75,
};
function boardRule(board) {
  if (board === 'money') return { better: 'high', ok: (v) => v >= 0 && v <= 1e8 };
  if (board === 'fish') return { better: 'high', ok: (v) => v > 0 && v <= 400 };
  if (board === 'wave') return { better: 'high', ok: (v) => v > 0 && v <= 100000 };
  if (board.startsWith('trial:') && TRIALS[board.slice(6)]) return { better: 'low', ok: (v) => v >= TRIALS[board.slice(6)] && v < 3600 };
  return null;
}
// ---------------------------------------------------------------- passwords and sessions
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}
function sameText(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function tooMany(env, ip, kind, max, windowMs) { // a few tries per IP address in a window, then wait
  const since = Date.now() - windowMs;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts WHERE ip = ? AND kind = ? AND at > ?').bind(ip, kind, since).first();
  await env.DB.prepare('INSERT INTO attempts (ip, kind, at) VALUES (?, ?, ?)').bind(ip, kind, Date.now()).run();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM attempts WHERE at < ?').bind(Date.now() - 86400000).run();
  return r.n >= max;
}
async function newSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').bind(token, userId, Date.now() + 30 * 86400000).run();
  return token;
}
async function userFor(env, req, url) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '') || (url && url.searchParams.get('token')) || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires > ? AND users.banned = 0').bind(token, Date.now()).first();
}
const isAdmin = (env, u) => !!u && String(env.ADMINS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(u.name.toLowerCase());
const lobby = (env, path, body) => env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby' + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
const world = (env, code, path, body) => env.WORLD.get(env.WORLD.idFromName(code)).fetch('https://world' + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
async function liveWorlds(env) { return (await (await lobby(env, '/all')).json()).worlds || []; }
async function toWorlds(env, path, body) { // tell every live world something (a gift nudge, a kick, an announcement); how many players it reached
  let n = 0; for (const w of await liveWorlds(env)) { try { n += (await (await world(env, w.code, path, body)).json()).n || 0; } catch (e) { /* that world just closed */ } } return n;
}
async function claimGifts(env, userId) { // money the admin sent: handed over once, then gone from the table
  const r = await env.DB.prepare('DELETE FROM gifts WHERE user_id = ? RETURNING amount, note').bind(userId).all();
  const sum = (r.results || []).reduce((a, g) => a + (Number(g.amount) || 0), 0);
  if (sum) await addCredit(env, userId, sum); // the next save may show it
  return r.results || [];
}
const addCredit = (env, userId, n) => env.DB.prepare('UPDATE users SET credit = credit + ? WHERE id = ?').bind(Math.round(n), userId).run();
// ---------------------------------------------------------------- the shared world: houses, safes and robberies
const worthOf = (d) => (Number(d && d.money) || 0) + (Number(d && d.bank) || 0);
async function houseList(env, u) {
  const now = Date.now();
  const r = await env.DB.prepare('SELECT houses.*, users.name AS owner_name, users.last_seen, users.play_ms FROM houses JOIN users ON users.id = houses.owner').all();
  return (r.results || []).map((h) => {
    const mine = h.owner === u.id, online = h.last_seen && now - h.last_seen < OFFLINE_MS;
    const robbable = !mine && !online && now - h.robbed_at > ROB_EVERY && h.safe >= 100 && h.play_ms >= NEW_PLAYER_MS;
    return { id: h.prop_id, kind: h.kind, name: h.name, x: h.x, z: h.z, price: h.price, owner: h.owner_name, mine, online: !!online, robbable, ...(mine ? { safe: h.safe } : { hasSafe: h.safe >= 100 }) };
  });
}
function propIn(b) { // a property as the game describes it, checked
  const id = String(b.id || '').slice(0, 40), kind = b.kind === 'apt' ? 'apt' : 'house', x = Number(b.x), z = Number(b.z), price = Math.round(Number(b.price));
  if (!/^(apt:)?-?\d+[,:]-?\d+(:\d+)?$/.test(id) || !Number.isFinite(x) || !Number.isFinite(z) || !(price >= 1000 && price <= 50000000)) return null;
  return { id, kind, name: clean(b.name, 60, kind === 'apt' ? 'An apartment' : 'A house'), x, z, price };
}
async function housesRoute(req, env, url, u) {
  const now = Date.now();
  if (url.pathname === '/houses') return json({ houses: await houseList(env, u) });
  const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
  if (url.pathname === '/house/buy') {
    const p = propIn(b); if (!p) return json({ error: 'bad property' }, 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM houses WHERE owner = ?').bind(u.id).first();
    if (n.n >= MAX_HOUSES) return json({ error: `You can own ${MAX_HOUSES} places at most` }, 400);
    const r = await env.DB.prepare('INSERT INTO houses (prop_id, owner, kind, name, x, z, price, bought) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(prop_id) DO NOTHING').bind(p.id, u.id, p.kind, p.name, p.x, p.z, p.price, now).run();
    if (!r.meta.changes) return json({ error: 'Someone already owns this place' }, 409);
    await addCredit(env, u.id, -p.price); // the save that follows has to show the money gone
    return json({ ok: true });
  }
  if (url.pathname === '/house/claim') { // places bought before the shared world: the first owner keeps it, anyone else gets their money back
    const mine = [], refunded = [];
    for (const raw of (Array.isArray(b.props) ? b.props : []).slice(0, MAX_HOUSES)) {
      const p = propIn(raw || {}); if (!p) continue;
      await env.DB.prepare('INSERT INTO houses (prop_id, owner, kind, name, x, z, price, bought) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(prop_id) DO NOTHING').bind(p.id, u.id, p.kind, p.name, p.x, p.z, p.price, now).run();
      const h = await env.DB.prepare('SELECT owner FROM houses WHERE prop_id = ?').bind(p.id).first();
      if (h && h.owner === u.id) mine.push(p.id); else { refunded.push({ id: p.id, price: p.price }); await addCredit(env, u.id, p.price); }
    }
    return json({ mine, refunded });
  }
  const h = await env.DB.prepare('SELECT * FROM houses WHERE prop_id = ?').bind(String(b.id || '')).first();
  if (!h) return json({ error: 'No one owns that place' }, 404);
  if (url.pathname === '/house/sell') {
    if (h.owner !== u.id) return json({ error: 'Not your place' }, 403);
    const back = Math.round(h.price * 0.8 / 100) * 100;
    await env.DB.prepare('DELETE FROM houses WHERE prop_id = ?').bind(h.prop_id).run();
    await addCredit(env, u.id, back + h.safe);
    return json({ ok: true, back, safe: h.safe });
  }
  if (url.pathname === '/house/safe') {
    if (h.owner !== u.id) return json({ error: 'Not your safe' }, 403);
    const amount = Math.round(Number(b.amount) || 0);
    if (!amount || amount > 50000000 || -amount > h.safe) return json({ error: amount < 0 ? 'There isn’t that much in the safe' : 'bad amount' }, 400);
    await env.DB.prepare('UPDATE houses SET safe = safe + ? WHERE prop_id = ?').bind(amount, h.prop_id).run();
    await addCredit(env, u.id, -amount);
    return json({ safe: h.safe + amount });
  }
  if (url.pathname === '/house/rob') {
    if (h.owner === u.id) return json({ error: 'That’s your own safe' }, 400);
    const o = await env.DB.prepare('SELECT name, last_seen, play_ms FROM users WHERE id = ?').bind(h.owner).first();
    if (o.last_seen && now - o.last_seen < OFFLINE_MS) return json({ error: `${o.name} is online — you can only rob them while they’re offline` }, 403);
    if (o.play_ms < NEW_PLAYER_MS) return json({ error: `${o.name} is new here — new players can’t be robbed yet` }, 403);
    if (now - h.robbed_at < ROB_EVERY) return json({ error: 'Someone already cleaned this safe out today' }, 403);
    if (h.safe < 100) return json({ error: 'The safe is empty' }, 403);
    const amount = Math.floor(h.safe * (ROB_MIN + Math.random() * (ROB_MAX - ROB_MIN)));
    const r = await env.DB.prepare('UPDATE houses SET safe = safe - ?, robbed_at = ? WHERE prop_id = ? AND robbed_at = ? AND safe >= ?').bind(amount, now, h.prop_id, h.robbed_at, amount).run();
    if (!r.meta.changes) return json({ error: 'Someone beat you to it' }, 409);
    await env.DB.prepare('INSERT INTO robberies (prop_id, owner, robber, amount, at) VALUES (?, ?, ?, ?, ?)').bind(h.prop_id, h.owner, u.id, amount, now).run();
    await addCredit(env, u.id, amount);
    return json({ amount, owner: o.name });
  }
  return json({ error: 'not found' }, 404);
}
async function adminLog(env, action, target, detail) { await env.DB.prepare('INSERT INTO admin_log (at, action, target, detail) VALUES (?, ?, ?, ?)').bind(Date.now(), action, String(target || ''), String(detail || '').slice(0, 200)).run(); }
function saveSummary(raw) { // the bits of a player's save the admin panel shows
  let d = {}; try { d = JSON.parse(raw || '{}') || {}; } catch (e) { /* a bad save */ }
  return { money: Math.round(Number(d.money) || 0), bank: Math.round(Number(d.bank) || 0), cars: (d.garage || []).length, houses: (d.props || []).length, biz: (d.biz || []).length, pet: d.pet ? `${d.pet.name} the ${d.pet.breed}` : '', health: d.health };
}
// ---------------------------------------------------------------- the admin panel's routes
async function admin(req, env, url, me) {
  const b = req.method === 'POST' ? (await readJson(req)) || {} : {}, path = url.pathname.slice(7);
  const target = async (id) => env.DB.prepare('SELECT id, name, name_lc FROM users WHERE id = ?').bind(Number(id) || 0).first();
  if (path === 'overview') {
    const worlds = await liveWorlds(env), who = [];
    for (const w of worlds) { try { const r = await (await world(env, w.code, '/who')).json(); who.push({ ...w, people: r.people || [] }); } catch (e) { who.push({ ...w, people: [] }); } }
    const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
    const week = Date.now() - 7 * 86400000, day = Date.now() - 86400000;
    return json({
      accounts: (await q('SELECT COUNT(*) AS n FROM users')).n, newWeek: (await q('SELECT COUNT(*) AS n FROM users WHERE created > ?', week)).n,
      activeDay: (await q('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', day)).n, banned: (await q('SELECT COUNT(*) AS n FROM users WHERE banned = 1')).n,
      playHours: Math.round(((await q('SELECT COALESCE(SUM(play_ms), 0) AS n FROM users')).n) / 360000) / 10, crews: (await q('SELECT COUNT(*) AS n FROM crews')).n,
      online: who.reduce((a, w) => a + w.players, 0), worlds: who,
    });
  }
  if (path === 'users') {
    const sort = { name: 'users.name_lc ASC', new: 'users.created DESC', seen: 'users.last_seen DESC', time: 'users.play_ms DESC' }[url.searchParams.get('sort')] || 'users.last_seen DESC';
    const r = await env.DB.prepare(`SELECT users.id, users.name, users.created, users.last_seen, users.play_ms, users.banned, users.muted, saves.data, crews.tag,
      (SELECT COUNT(*) FROM records WHERE records.user_id = users.id) AS records, (SELECT COALESCE(SUM(amount), 0) FROM gifts WHERE gifts.user_id = users.id) AS pending
      FROM users LEFT JOIN saves ON saves.user_id = users.id LEFT JOIN crew_members ON crew_members.user_id = users.id LEFT JOIN crews ON crews.id = crew_members.crew_id
      ORDER BY ${sort} LIMIT 500`).all();
    return json({ users: r.results.map(({ data, ...x }) => ({ ...x, ...saveSummary(data), admin: isAdmin(env, x) })) });
  }
  if (path === 'user') {
    const u = await env.DB.prepare('SELECT users.id, users.name, users.created, users.last_seen, users.play_ms, users.banned, users.muted, saves.data, saves.updated FROM users LEFT JOIN saves ON saves.user_id = users.id WHERE users.id = ?').bind(Number(url.searchParams.get('id')) || 0).first();
    if (!u) return json({ error: 'no such account' }, 404);
    const recs = await env.DB.prepare('SELECT board, value, detail, at FROM records WHERE user_id = ? ORDER BY board').bind(u.id).all();
    const gifts = await env.DB.prepare('SELECT amount, note, at FROM gifts WHERE user_id = ? ORDER BY at').bind(u.id).all();
    const { data, ...rest } = u;
    return json({ user: { ...rest, ...saveSummary(data), crew: await crewOf(env, u.id), admin: isAdmin(env, u) }, records: recs.results, pending: gifts.results });
  }
  if (path === 'money' && req.method === 'POST') { // give (or take, with a minus) game money: it reaches them the next time their game checks in
    const t = await target(b.id); if (!t) return json({ error: 'no such account' }, 404);
    const amount = Math.round(Number(b.amount) || 0); if (!amount || Math.abs(amount) > 10000000) return json({ error: 'Pick an amount up to $10,000,000' }, 400);
    const note = String(b.note || '').replace(/[<>]/g, '').slice(0, 80);
    await env.DB.prepare('INSERT INTO gifts (user_id, amount, note, at) VALUES (?, ?, ?, ?)').bind(t.id, amount, note, Date.now()).run();
    const live = await toWorlds(env, '/nudge', { uid: t.id });
    await adminLog(env, amount > 0 ? 'give money' : 'take money', t.name, `$${Math.abs(amount).toLocaleString()}${note ? ' · ' + note : ''}`);
    return json({ ok: true, live: live > 0 });
  }
  if (path === 'ban' && req.method === 'POST') {
    const t = await target(b.id); if (!t) return json({ error: 'no such account' }, 404); if (isAdmin(env, t)) return json({ error: 'You can’t ban an admin' }, 400);
    const on = b.banned === true; await env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(on ? 1 : 0, t.id).run();
    if (on) { await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id).run(); await toWorlds(env, '/kick', { uid: t.id, why: 'banned' }); }
    await adminLog(env, on ? 'ban' : 'unban', t.name, ''); return json({ ok: true });
  }
  if (path === 'kick' && req.method === 'POST') {
    const t = await target(b.id); if (!t) return json({ error: 'no such account' }, 404);
    const n = await toWorlds(env, '/kick', { uid: t.id, why: 'kicked' }); await adminLog(env, 'kick', t.name, ''); return json({ ok: true, n });
  }
  if (path === 'record-delete' && req.method === 'POST') {
    const t = await target(b.id); if (!t) return json({ error: 'no such account' }, 404);
    const r = await env.DB.prepare('DELETE FROM records WHERE user_id = ? AND board = ?').bind(t.id, String(b.board || '')).run();
    await adminLog(env, 'delete record', t.name, String(b.board || '')); return json({ ok: true, removed: r.meta.changes });
  }
  if (path === 'boards') { // every board with its top 20, for the Records tab
    const r = await env.DB.prepare('SELECT records.board, records.value, records.detail, users.id, users.name FROM records JOIN users ON users.id = records.user_id ORDER BY records.board, records.value DESC').all();
    return json({ records: r.results });
  }
  if (path === 'crews') {
    const r = await env.DB.prepare('SELECT crews.id, crews.name, crews.tag, crews.created, owner.name AS boss, COUNT(crew_members.user_id) AS members FROM crews JOIN users AS owner ON owner.id = crews.owner LEFT JOIN crew_members ON crew_members.crew_id = crews.id GROUP BY crews.id ORDER BY members DESC').all();
    return json({ crews: r.results });
  }
  if (path === 'crew-delete' && req.method === 'POST') {
    const c = await env.DB.prepare('SELECT id, tag, name FROM crews WHERE id = ?').bind(Number(b.id) || 0).first(); if (!c) return json({ error: 'no such crew' }, 404);
    await env.DB.prepare('DELETE FROM crew_members WHERE crew_id = ?').bind(c.id).run(); await env.DB.prepare('DELETE FROM crews WHERE id = ?').bind(c.id).run();
    await adminLog(env, 'delete crew', `[${c.tag}] ${c.name}`, ''); return json({ ok: true });
  }
  if (path === 'announce' && req.method === 'POST') { // a message on everyone's screen in every world
    const text = String(b.text || '').replace(/[<>]/g, '').trim().slice(0, 140); if (!text) return json({ error: 'Type a message first' }, 400);
    const n = await toWorlds(env, '/announce', { text }); await adminLog(env, 'announce', '', `${text} (reached ${n})`); return json({ ok: true, n });
  }
  if (path === 'chat') { const r = await env.DB.prepare('SELECT chat.id, chat.user_id, chat.name, chat.crew, chat.text, chat.at, chat.deleted, users.muted FROM chat JOIN users ON users.id = chat.user_id ORDER BY chat.id DESC LIMIT 150').all(); return json({ chat: r.results }); }
  if (path === 'chat-delete' && req.method === 'POST') {
    const m = await env.DB.prepare('SELECT id, name, text FROM chat WHERE id = ?').bind(Number(b.id) || 0).first(); if (!m) return json({ error: 'no such message' }, 404);
    await env.DB.prepare('UPDATE chat SET deleted = 1 WHERE id = ?').bind(m.id).run(); await adminLog(env, 'delete chat message', m.name, m.text); return json({ ok: true });
  }
  if (path === 'mute' && req.method === 'POST') {
    const t = await target(b.id); if (!t) return json({ error: 'no such account' }, 404); if (isAdmin(env, t)) return json({ error: 'You can’t mute an admin' }, 400);
    await env.DB.prepare('UPDATE users SET muted = ? WHERE id = ?').bind(b.muted ? 1 : 0, t.id).run(); await adminLog(env, b.muted ? 'mute in chat' : 'unmute in chat', t.name, ''); return json({ ok: true });
  }
  if (path === 'log') { const r = await env.DB.prepare('SELECT at, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 100').all(); return json({ log: r.results }); }
  return json({ error: 'not found' }, 404);
}
async function crewOf(env, userId) { return env.DB.prepare('SELECT crews.id, crews.name, crews.tag, crews.owner FROM crew_members JOIN crews ON crews.id = crew_members.crew_id WHERE crew_members.user_id = ?').bind(userId).first(); }
async function readJson(req) { try { const t = await req.text(); return t.length > 70000 ? null : JSON.parse(t); } catch (e) { return null; } }
async function publicWorld(env, code) { // records only count in public worlds that have players in them
  if (typeof code !== 'string') return false;
  const r = await env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby/has?code=' + encodeURIComponent(code));
  return (await r.json()).public === true;
}
async function putRecord(env, board, userId, value, detail) {
  const rule = boardRule(board); if (!rule || !Number.isFinite(value) || !rule.ok(value)) return false;
  const cmp = rule.better === 'high' ? 'excluded.value > records.value' : 'excluded.value < records.value';
  const r = await env.DB.prepare(`INSERT INTO records (board, user_id, value, detail, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(board, user_id) DO UPDATE SET value = excluded.value, detail = excluded.detail, at = excluded.at WHERE ${cmp}`)
    .bind(board, userId, value, String(detail || '').slice(0, 60), Date.now()).run();
  return r.meta.changes > 0;
}
// ---------------------------------------------------------------- the routes
async function api(req, env, url) {
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  if (url.pathname === '/signup' && req.method === 'POST') {
    const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
    const name = clean(b.name, 16, ''), password = String(b.password || '');
    if (name.length < 3 || name !== String(b.name || '').trim()) return json({ error: 'Names are 3–16 letters or numbers (nothing rude)' }, 400);
    if (password.length < 6 || password.length > 64) return json({ error: 'Passwords need 6–64 characters' }, 400);
    if (await tooMany(env, ip, 'signup', 5, 3600000)) return json({ error: 'Too many new accounts from here — try again in an hour' }, 429);
    if (await env.DB.prepare('SELECT id FROM users WHERE name_lc = ?').bind(name.toLowerCase()).first()) return json({ error: 'That name is taken' }, 409);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const r = await env.DB.prepare('INSERT INTO users (name, name_lc, pass_hash, salt, created) VALUES (?, ?, ?, ?, ?)').bind(name, name.toLowerCase(), await hashPassword(password, salt), salt, Date.now()).run();
    return json({ token: await newSession(env, r.meta.last_row_id), name });
  }
  if (url.pathname === '/login' && req.method === 'POST') {
    const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
    if (await tooMany(env, ip, 'login', 10, 600000)) return json({ error: 'Too many tries — wait 10 minutes' }, 429);
    const u = await env.DB.prepare('SELECT id, name, pass_hash, salt, banned FROM users WHERE name_lc = ?').bind(String(b.name || '').trim().toLowerCase()).first();
    if (!u || !sameText(await hashPassword(String(b.password || ''), u.salt), u.pass_hash)) return json({ error: 'Wrong name or password' }, 401);
    if (u.banned) return json({ error: 'This account has been banned' }, 403);
    return json({ token: await newSession(env, u.id), name: u.name });
  }
  if (url.pathname === '/leaders') {
    const board = String(url.searchParams.get('board') || ''), rule = boardRule(board); if (!rule) return json({ error: 'no such board' }, 404);
    const order = rule.better === 'high' ? 'DESC' : 'ASC';
    const top = await env.DB.prepare(`SELECT users.name, records.value, records.detail FROM records JOIN users ON users.id = records.user_id WHERE board = ? ORDER BY value ${order}, at ASC LIMIT 20`).bind(board).all();
    const u = await userFor(env, req, url); let me = null;
    if (u) {
      const mine = await env.DB.prepare('SELECT value, detail FROM records WHERE board = ? AND user_id = ?').bind(board, u.id).first();
      if (mine) { const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM records WHERE board = ? AND value ${rule.better === 'high' ? '>' : '<'} ?`).bind(board, mine.value).first(); me = { rank: r.n + 1, value: mine.value, detail: mine.detail }; }
    }
    return json({ board, leaders: top.results, me });
  }
  if (url.pathname === '/online') { const r = await lobby(env, '/count'); return json(await r.json()); }
  if (url.pathname === '/crews') {
    const r = await env.DB.prepare(`SELECT crews.name, crews.tag, COUNT(crew_members.user_id) AS members, COALESCE(SUM(records.value), 0) AS worth FROM crews
      JOIN crew_members ON crew_members.crew_id = crews.id LEFT JOIN records ON records.user_id = crew_members.user_id AND records.board = 'money'
      GROUP BY crews.id ORDER BY worth DESC, members DESC LIMIT 20`).all();
    return json({ crews: r.results });
  }
  const u = await userFor(env, req, url); if (!u) return json({ error: 'log in first' }, 401);
  if (url.pathname === '/me') return json({ name: u.name, crew: await crewOf(env, u.id), admin: isAdmin(env, u) });
  if (url.pathname === '/ping' && req.method === 'POST') { // once a minute while the game runs: adds the time since the last ping (gaps over 90 s don't count)
    const now = Date.now();
    await env.DB.prepare('UPDATE users SET play_ms = play_ms + CASE WHEN last_seen IS NOT NULL AND ? - last_seen < 90000 THEN ? - last_seen ELSE 0 END, last_seen = ? WHERE id = ?').bind(now, now, now, u.id).run();
    const b = await readJson(req); return json({ ok: true, gifts: b && b.claim === true ? await claimGifts(env, u.id) : [] }); // only the multiplayer game takes gifts (they're for the online save)
  }
  if (url.pathname === '/gifts') return json({ gifts: await claimGifts(env, u.id) });
  if (url.pathname === '/chat' && req.method === 'GET') { // the newest messages (after the one you last saw)
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const r = after ? await env.DB.prepare('SELECT id, name, crew, text, at FROM chat WHERE id > ? AND deleted = 0 ORDER BY id LIMIT 60').bind(after).all()
      : await env.DB.prepare('SELECT id, name, crew, text, at FROM (SELECT * FROM chat WHERE deleted = 0 ORDER BY id DESC LIMIT 60) ORDER BY id').all();
    const gone = after ? (await env.DB.prepare('SELECT id FROM chat WHERE deleted = 1 AND id > ? - 300').bind(after).all()).results.map((x) => x.id) : [];
    return json({ messages: r.results, removed: gone });
  }
  if (url.pathname === '/chat' && req.method === 'POST') {
    const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
    const me = await env.DB.prepare('SELECT muted FROM users WHERE id = ?').bind(u.id).first();
    if (me && me.muted) return json({ error: 'You’ve been muted in chat' }, 403);
    const now = Date.now(), recent = await env.DB.prepare('SELECT text, at FROM chat WHERE user_id = ? AND at > ? ORDER BY at DESC').bind(u.id, now - 60000).all();
    if (recent.results.length && now - recent.results[0].at < 2500) return json({ error: 'Slow down a little' }, 429);
    if (recent.results.length >= 12) return json({ error: 'That’s a lot of messages — wait a minute' }, 429);
    const r = chatCheck(b.text); if (!r.ok) return json({ error: r.reason }, 400);
    if (recent.results.some((m) => m.text === r.text)) return json({ error: 'You just said that' }, 429);
    const c = await crewOf(env, u.id);
    const ins = await env.DB.prepare('INSERT INTO chat (user_id, name, crew, text, at) VALUES (?, ?, ?, ?, ?)').bind(u.id, u.name, c ? c.tag : null, r.text, now).run();
    if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM chat WHERE at < ?').bind(now - 7 * 86400000).run(); // a week of chat is kept
    return json({ ok: true, id: ins.meta.last_row_id, text: r.text, starred: r.starred });
  }
  if (url.pathname.startsWith('/admin/')) { if (!isAdmin(env, u)) return json({ error: 'not allowed' }, 403); return admin(req, env, url, u); }
  if (url.pathname === '/crew' && req.method === 'GET') {
    const c = await crewOf(env, u.id); if (!c) return json({ crew: null });
    const m = await env.DB.prepare('SELECT users.name FROM crew_members JOIN users ON users.id = crew_members.user_id WHERE crew_id = ? ORDER BY joined').bind(c.id).all();
    return json({ crew: { name: c.name, tag: c.tag, boss: c.owner === u.id, members: m.results.map((x) => x.name) } });
  }
  if (url.pathname === '/crew/create' && req.method === 'POST') {
    const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
    if (await crewOf(env, u.id)) return json({ error: 'Leave your crew first' }, 409);
    const name = clean(b.name, 24, ''), tag = clean(b.tag, 4, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (name.length < 3) return json({ error: 'Crew names are 3–24 letters or numbers (nothing rude)' }, 400);
    if (tag.length < 2) return json({ error: 'Tags are 2–4 letters or numbers' }, 400);
    if (await env.DB.prepare('SELECT id FROM crews WHERE tag_lc = ?').bind(tag.toLowerCase()).first()) return json({ error: 'That tag is taken' }, 409);
    const r = await env.DB.prepare('INSERT INTO crews (name, tag, tag_lc, owner, created) VALUES (?, ?, ?, ?, ?)').bind(name, tag, tag.toLowerCase(), u.id, Date.now()).run();
    await env.DB.prepare('INSERT INTO crew_members (user_id, crew_id, joined) VALUES (?, ?, ?)').bind(u.id, r.meta.last_row_id, Date.now()).run();
    return json({ ok: true, crew: { name, tag } });
  }
  if (url.pathname === '/crew/join' && req.method === 'POST') {
    const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
    if (await crewOf(env, u.id)) return json({ error: 'Leave your crew first' }, 409);
    const c = await env.DB.prepare('SELECT id, name, tag FROM crews WHERE tag_lc = ?').bind(String(b.tag || '').trim().toLowerCase()).first(); if (!c) return json({ error: 'No crew has that tag' }, 404);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ?').bind(c.id).first(); if (n.n >= 30) return json({ error: 'That crew is full (30)' }, 409);
    await env.DB.prepare('INSERT INTO crew_members (user_id, crew_id, joined) VALUES (?, ?, ?)').bind(u.id, c.id, Date.now()).run();
    return json({ ok: true, crew: { name: c.name, tag: c.tag } });
  }
  if (url.pathname === '/crew/leave' && req.method === 'POST') {
    const c = await crewOf(env, u.id); if (!c) return json({ ok: true });
    await env.DB.prepare('DELETE FROM crew_members WHERE user_id = ?').bind(u.id).run();
    const left = await env.DB.prepare('SELECT user_id FROM crew_members WHERE crew_id = ? ORDER BY joined LIMIT 1').bind(c.id).first();
    if (!left) await env.DB.prepare('DELETE FROM crews WHERE id = ?').bind(c.id).run(); // the last one out closes it
    else if (c.owner === u.id) await env.DB.prepare('UPDATE crews SET owner = ? WHERE id = ?').bind(left.user_id, c.id).run(); // the longest-serving member takes over
    return json({ ok: true });
  }
  if (url.pathname === '/logout' && req.method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind((req.headers.get('Authorization') || '').replace(/^Bearer /, '')).run(); return json({ ok: true }); }
  if (url.pathname === '/save' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT data FROM saves WHERE user_id = ?').bind(u.id).first();
    const robbed = (await env.DB.prepare('UPDATE robberies SET seen = 1 WHERE owner = ? AND seen = 0 RETURNING prop_id, robber, amount, at').bind(u.id).all()).results || [];
    for (const x of robbed) { const w = await env.DB.prepare('SELECT users.name AS robber, houses.name AS house FROM users LEFT JOIN houses ON houses.prop_id = ? WHERE users.id = ?').bind(x.prop_id, x.robber).first(); Object.assign(x, w || {}); }
    return json({ data: r ? JSON.parse(r.data) : null, gifts: await claimGifts(env, u.id), houses: await houseList(env, u), robbed });
  }
  if (url.pathname === '/houses' || url.pathname.startsWith('/house/')) return housesRoute(req, env, url, u);
  if (url.pathname === '/save' && req.method === 'POST') {
    const b = await readJson(req); if (!b || !b.data || typeof b.data !== 'object') return json({ error: 'bad save' }, 400);
    // the money check: the wallet and savings may grow by what the server itself handed over (credit) plus what play
    // could have earned since (the budget, refilling at $8,000 a minute up to $150,000); anything past that is taken off
    const now = Date.now(), prev = await env.DB.prepare('SELECT data FROM saves WHERE user_id = ?').bind(u.id).first(), U = await env.DB.prepare('SELECT credit, budget, budget_at FROM users WHERE id = ?').bind(u.id).first();
    let budget = Math.min(BUDGET_CAP, U.budget + (U.budget_at ? Math.max(0, now - U.budget_at) / 60000 * EARN_PER_MIN : 0)), cut = 0;
    const before = prev ? worthOf(JSON.parse(prev.data)) : 250, gain = worthOf(b.data) - before - U.credit;
    if (gain > budget) {
      cut = Math.round(gain - budget); let left = cut;
      const fromWallet = Math.min(left, Math.max(0, Number(b.data.money) || 0)); b.data.money = (Number(b.data.money) || 0) - fromWallet; left -= fromWallet;
      if (left > 0) b.data.bank = Math.max(0, (Number(b.data.bank) || 0) - left);
    }
    budget = Math.max(0, budget - Math.max(0, Math.min(gain, budget)));
    await env.DB.prepare('UPDATE users SET credit = 0, budget = ?, budget_at = ? WHERE id = ?').bind(Math.round(budget), now, u.id).run();
    await env.DB.prepare('INSERT INTO saves (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated').bind(u.id, JSON.stringify(b.data), Date.now()).run();
    const worth = (Number(b.data.money) || 0) + (Number(b.data.bank) || 0); // the richest board: wallet plus savings
    if (worth > 0 && await publicWorld(env, b.world)) await putRecord(env, 'money', u.id, Math.round(worth), '');
    return json(cut ? { ok: true, cut, money: b.data.money, bank: b.data.bank } : { ok: true });
  }
  if (url.pathname === '/record' && req.method === 'POST') {
    const b = await readJson(req); if (!b) return json({ error: 'bad request' }, 400);
    if (!(await publicWorld(env, b.world))) return json({ error: 'records only count in public worlds' }, 403);
    const best = await putRecord(env, String(b.board || ''), u.id, Number(b.value), b.detail);
    return json({ ok: true, best });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (['/worlds', '/match', '/newcode'].includes(url.pathname)) return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby' + (url.pathname === '/worlds' ? '/list' : url.pathname));
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a websocket' }, 426);
      const code = String(url.searchParams.get('world') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
      if (code.length < 4) return json({ error: 'bad world code' }, 400);
      const u = await userFor(env, req, url); if (!u) return json({ error: 'log in first' }, 401);
      // the world gets the account's name from here, never from the player
      const q = new URL(url); q.searchParams.delete('token'); q.searchParams.set('name', u.name); q.searchParams.set('uid', String(u.id));
      const c = await crewOf(env, u.id); q.searchParams.set('crew', c ? c.tag : ''); // the crew tag comes from the database too
      return env.WORLD.get(env.WORLD.idFromName(code)).fetch(new Request(q, req));
    }
    if (['/signup', '/login', '/leaders', '/me', '/logout', '/save', '/record', '/crew', '/crew/create', '/crew/join', '/crew/leave', '/crews', '/online', '/ping', '/gifts', '/chat', '/houses'].includes(url.pathname) || url.pathname.startsWith('/house/') || url.pathname.startsWith('/admin/')) return api(req, env, url);
    return json({ ok: true, game: 'Gold Coast Streets online' });
  },
};

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.last = new Map(); // id -> latest state (kept in memory: it changes several times a second)
    this.meta = null;      // { code, title, public }
  }
  sockets() { return this.ctx.getWebSockets(); }
  info(ws) { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) { /* closing */ } }
  broadcast(msg, except) { const s = JSON.stringify(msg); for (const ws of this.sockets()) if (ws !== except) this.send(ws, s); }
  async loadMeta() { if (!this.meta) this.meta = (await this.ctx.storage.get('meta')) || null; return this.meta; }
  async report(gone) { // tell the lobby how many are here (public worlds only show up in the list)
    const m = await this.loadMeta(); if (!m) return;
    const players = this.sockets().filter((ws) => ws !== gone).length; // a closing socket is still listed
    this.seq = Math.max((this.seq || 0) + 1, Date.now() * 100); // reports can arrive out of order when many leave at once: the newest wins
    await this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')).fetch('https://lobby/report', { method: 'POST', body: JSON.stringify({ ...m, players, seq: this.seq }) });
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.hostname === 'world') { // from the Worker itself (the admin panel), never from players: their requests all come in on /ws
      const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {}, mine = (o) => this.info(o).uid === b.uid;
      if (url.pathname === '/who') return json({ people: this.sockets().map((o) => { const I = this.info(o); return { name: I.name, crew: I.crew || '', uid: I.uid, since: I.since }; }) });
      if (url.pathname === '/nudge') { const ws = this.sockets().filter(mine); for (const o of ws) this.send(o, { t: 'gifts' }); return json({ n: ws.length }); }
      if (url.pathname === '/kick') { const ws = this.sockets().filter(mine); for (const o of ws) { this.send(o, { t: 'kicked', why: b.why === 'banned' ? 'banned' : 'kicked' }); try { o.close(4001, 'kicked'); } catch (e) { /* gone */ } await this.left(o); } return json({ n: ws.length }); }
      if (url.pathname === '/announce') { const text = String(b.text || '').slice(0, 140); this.broadcast({ t: 'announce', text }); return json({ n: this.sockets().length }); }
      return json({ error: 'not found' }, 404);
    }
    if (this.sockets().length >= MAX_PLAYERS) return json({ error: 'world full' }, 403);
    let m = await this.loadMeta();
    if (!m || !this.sockets().length) { // the first player in starts the world (codes get reused once a world empties)
      m = this.meta = { code: String(url.searchParams.get('world')).toUpperCase().slice(0, 12), title: clean(url.searchParams.get('title'), 24, 'Gold Coast'), public: url.searchParams.get('public') === '1' };
      await this.ctx.storage.put('meta', m);
    }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8), name = clean(url.searchParams.get('name'), 16, 'Player ' + id.slice(0, 3));
    this.ctx.acceptWebSocket(server);
    const crew = String(url.searchParams.get('crew') || '').replace(/[^A-Z0-9]/g, '').slice(0, 4), uid = Number(url.searchParams.get('uid')) || 0;
    server.serializeAttachment({ id, name, crew, uid, since: Date.now(), look: null, props: [], open: false, n: 0, t0: Date.now() });
    const players = this.sockets().filter((ws) => ws !== server).map((ws) => { const I = this.info(ws); return { id: I.id, name: I.name, crew: I.crew || '', look: I.look, props: I.props || [], open: !!I.open, s: this.last.get(I.id) || null }; });
    this.send(server, { t: 'hello', id, name, crew, world: m, players, max: SHOWN_MAX });
    this.broadcast({ t: 'join', id, name, crew }, server);
    await this.report();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    const I = this.info(ws); if (!I.id) return;
    // a simple flood guard: about 30 messages a second at most
    const now = Date.now(); if (now - I.t0 > 1000) { I.t0 = now; I.n = 0; } if (++I.n > 30) { ws.serializeAttachment(I); return; }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 's' && m.s && typeof m.s === 'object') { this.last.set(I.id, m.s); this.broadcast({ t: 's', id: I.id, s: m.s }, ws); }
    else if (m.t === 'look' && m.look && typeof m.look === 'object') { I.look = m.look; this.broadcast({ t: 'look', id: I.id, look: m.look }, ws); }
    else if (m.t === 'hit' && typeof m.to === 'string') { // only to the player who was hit, with the damage capped
      const dmg = Math.max(0, Math.min(40, Number(m.dmg) || 0));
      for (const o of this.sockets()) if (this.info(o).id === m.to) this.send(o, { t: 'hit', from: I.id, dmg, kx: Number(m.kx) || 0, kz: Number(m.kz) || 0 });
    } else if (m.t === 'down') this.broadcast({ t: 'down', id: I.id, by: typeof m.by === 'string' ? m.by : null });
    else if (m.t === 'say' && Number.isInteger(m.k) && m.k >= 0 && m.k < 20) this.broadcast({ t: 'say', id: I.id, k: m.k }, ws);
    else if (m.t === 'race' && Number.isFinite(m.x) && Number.isFinite(m.z)) this.broadcast({ t: 'race', id: I.id, x: m.x, z: m.z, name: clean(m.name, 40, 'the finish') }, ws);
    else if (m.t === 'party' && Array.isArray(m.to) && m.d && typeof m.d === 'object') { // heist crews: passed on only to the players named (up to 8)
      const to = new Set(m.to.filter((x) => typeof x === 'string').slice(0, 8));
      for (const o of this.sockets()) if (o !== ws && to.has(this.info(o).id)) this.send(o, { t: 'party', from: I.id, d: m.d });
    } else if (m.t === 'props' && Array.isArray(m.props)) { // the houses you own, so friends can come over
      I.props = m.props.slice(0, 12).filter((p) => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z)).map((p) => ({ id: p.id.slice(0, 40), x: Math.round(p.x), z: Math.round(p.z), name: clean(p.name, 40, 'a house') }));
      I.open = m.open === true; this.broadcast({ t: 'props', id: I.id, props: I.props, open: I.open }, ws);
    }
    ws.serializeAttachment(I);
  }
  async webSocketClose(ws) { await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }
  async left(ws) {
    const I = this.info(ws); if (!I.id) return;
    try { ws.close(1000, 'bye'); } catch (e) { /* already closed */ }
    this.last.delete(I.id); this.broadcast({ t: 'leave', id: I.id }, ws);
    await this.report(ws);
    if (!this.sockets().some((o) => o !== ws)) { this.meta = null; await this.ctx.storage.delete('meta'); } // empty: the code is free again
  }
}

// every live world and its player count; the public ones are listed and filled by quick join
export class Lobby extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    const all = (await this.ctx.storage.get('worlds')) || {};
    const now = Date.now(), live = (w) => w.players > 0 && now - w.t < 6 * 3600 * 1000;
    const worlds = Object.fromEntries(Object.entries(all).filter(([, w]) => live(w)));
    const freeCode = () => { for (let k = 0; k < 200; k++) { const c = String(1000 + Math.floor(Math.random() * 9000)); if (!worlds[c]) return c; } return String(Date.now() % 9000 + 1000); };
    if (url.pathname === '/count') return json({ players: Object.values(worlds).reduce((a, w) => a + w.players, 0), worlds: Object.keys(worlds).length });
    if (url.pathname === '/all') return json({ worlds: Object.values(worlds).map(({ code, title, public: pub, players }) => ({ code, title, public: pub, players })) });
    if (url.pathname === '/has') { const w = worlds[url.searchParams.get('code')]; return json({ public: !!(w && w.public) }); }
    if (url.pathname === '/newcode') return json({ code: freeCode() });
    if (url.pathname === '/match') { // the one shared Gold Coast: GC01, or the next copy when that one's full
      for (let n = 1; n < 100; n++) { const code = 'GC' + String(n).padStart(2, '0'), w = worlds[code]; if (!w || w.players < SHOWN_MAX) return json({ code, title: 'Gold Coast' + (n > 1 ? ' ' + n : ''), fresh: !w }); }
      return json({ code: freeCode(), fresh: true });
    }
    if (url.pathname === '/report') {
      const w = await req.json();
      const seen = (await this.ctx.storage.get('seq:' + w.code)) || 0; if (w.seq && w.seq < seen) return json({ ok: true, stale: true });
      if (w.seq) await this.ctx.storage.put('seq:' + w.code, w.seq);
      if (w.players > 0) worlds[w.code] = { code: w.code, title: w.title, public: !!w.public, players: w.players, max: SHOWN_MAX, t: now };
      else delete worlds[w.code];
      await this.ctx.storage.put('worlds', worlds);
      return json({ ok: true });
    }
    const list = Object.values(worlds).filter((w) => w.public).sort((a, b) => b.players - a.players).slice(0, 30).map(({ code, title, players, max }) => ({ code, title, players, max }));
    return json({ worlds: list });
  }
}
