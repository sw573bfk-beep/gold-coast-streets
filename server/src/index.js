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
import { DurableObject } from 'cloudflare:workers';

const SHOWN_MAX = 16, MAX_PLAYERS = 20; // public worlds fill to 16; friends with the code can still get in up to 20
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const BAD = /fuck|shit|cunt|bitch|nigg|fag|slut|whore|rape|nazi|porn|dick|cock|pussy|wank/i;
// names and world titles: letters, numbers and spaces only, nothing rude
function clean(s, max, fallback) {
  const t = String(s || '').replace(/’/g, "'").replace(/[^A-Za-z0-9 _'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t && !BAD.test(t.replace(/[\s_'-]/g, '')) ? t : fallback;
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
  return env.DB.prepare('SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires > ?').bind(token, Date.now()).first();
}
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
    const u = await env.DB.prepare('SELECT id, name, pass_hash, salt FROM users WHERE name_lc = ?').bind(String(b.name || '').trim().toLowerCase()).first();
    if (!u || !sameText(await hashPassword(String(b.password || ''), u.salt), u.pass_hash)) return json({ error: 'Wrong name or password' }, 401);
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
  const u = await userFor(env, req, url); if (!u) return json({ error: 'log in first' }, 401);
  if (url.pathname === '/me') return json({ name: u.name });
  if (url.pathname === '/logout' && req.method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind((req.headers.get('Authorization') || '').replace(/^Bearer /, '')).run(); return json({ ok: true }); }
  if (url.pathname === '/save' && req.method === 'GET') { const r = await env.DB.prepare('SELECT data FROM saves WHERE user_id = ?').bind(u.id).first(); return json({ data: r ? JSON.parse(r.data) : null }); }
  if (url.pathname === '/save' && req.method === 'POST') {
    const b = await readJson(req); if (!b || !b.data || typeof b.data !== 'object') return json({ error: 'bad save' }, 400);
    await env.DB.prepare('INSERT INTO saves (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated').bind(u.id, JSON.stringify(b.data), Date.now()).run();
    const worth = (Number(b.data.money) || 0) + (Number(b.data.bank) || 0); // the richest board: wallet plus savings
    if (worth > 0 && await publicWorld(env, b.world)) await putRecord(env, 'money', u.id, Math.round(worth), '');
    return json({ ok: true });
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
      return env.WORLD.get(env.WORLD.idFromName(code)).fetch(new Request(q, req));
    }
    if (['/signup', '/login', '/leaders', '/me', '/logout', '/save', '/record'].includes(url.pathname)) return api(req, env, url);
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
    if (this.sockets().length >= MAX_PLAYERS) return json({ error: 'world full' }, 403);
    let m = await this.loadMeta();
    if (!m || !this.sockets().length) { // the first player in starts the world (codes get reused once a world empties)
      m = this.meta = { code: String(url.searchParams.get('world')).toUpperCase().slice(0, 12), title: clean(url.searchParams.get('title'), 24, 'Gold Coast'), public: url.searchParams.get('public') === '1' };
      await this.ctx.storage.put('meta', m);
    }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8), name = clean(url.searchParams.get('name'), 16, 'Player ' + id.slice(0, 3));
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name, look: null, n: 0, t0: Date.now() });
    const players = this.sockets().filter((ws) => ws !== server).map((ws) => { const I = this.info(ws); return { id: I.id, name: I.name, look: I.look, s: this.last.get(I.id) || null }; });
    this.send(server, { t: 'hello', id, name, world: m, players, max: SHOWN_MAX });
    this.broadcast({ t: 'join', id, name }, server);
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
    if (url.pathname === '/has') { const w = worlds[url.searchParams.get('code')]; return json({ public: !!(w && w.public) }); }
    if (url.pathname === '/newcode') return json({ code: freeCode() });
    if (url.pathname === '/match') { // the busiest public world that still has room, or a fresh one
      const w = Object.values(worlds).filter((q) => q.public && q.players < SHOWN_MAX).sort((a, b) => b.players - a.players)[0];
      return json(w ? { code: w.code, fresh: false } : { code: freeCode(), fresh: true });
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
