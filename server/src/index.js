// Gold Coast Streets — the online world server (Cloudflare Worker + Durable Objects).
// Each world is a room code with up to 16 players. The server relays where everyone is, hits between players and
// preset quick messages; every player's game still runs its own traffic, pedestrians and police.
//   GET /worlds                          the public worlds and how many are in each
//   GET /ws?world=CODE&name=N&public=1&title=T   join (or start) a world over a WebSocket
import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 16;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const BAD = /fuck|shit|cunt|bitch|nigg|fag|slut|whore|rape|nazi|porn|dick|cock|pussy|wank/i;
// names and world titles: letters, numbers and spaces only, nothing rude
function clean(s, max, fallback) {
  const t = String(s || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t && !BAD.test(t.replace(/[\s_-]/g, '')) ? t : fallback;
}
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/worlds') return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby/list');
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a websocket' }, 426);
      const code = String(url.searchParams.get('world') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
      if (code.length < 4) return json({ error: 'bad world code' }, 400);
      return env.WORLD.get(env.WORLD.idFromName(code)).fetch(req);
    }
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
    await this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')).fetch('https://lobby/report', { method: 'POST', body: JSON.stringify({ ...m, players }) });
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (this.sockets().length >= MAX_PLAYERS) return json({ error: 'world full' }, 403);
    let m = await this.loadMeta();
    if (!m) { // the first player in starts the world
      m = this.meta = { code: String(url.searchParams.get('world')).toUpperCase().slice(0, 12), title: clean(url.searchParams.get('title'), 24, 'Gold Coast'), public: url.searchParams.get('public') === '1' };
      await this.ctx.storage.put('meta', m);
    }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8), name = clean(url.searchParams.get('name'), 16, 'Player ' + id.slice(0, 3));
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name, look: null, n: 0, t0: Date.now() });
    const players = this.sockets().filter((ws) => ws !== server).map((ws) => { const I = this.info(ws); return { id: I.id, name: I.name, look: I.look, s: this.last.get(I.id) || null }; });
    this.send(server, { t: 'hello', id, name, world: m, players, max: MAX_PLAYERS });
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
  }
}

// the list of public worlds: each world reports its player count; empty or silent ones drop off
export class Lobby extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    const worlds = (await this.ctx.storage.get('worlds')) || {};
    const now = Date.now();
    if (url.pathname === '/report') {
      const w = await req.json();
      if (w.players > 0 && w.public) worlds[w.code] = { code: w.code, title: w.title, players: w.players, max: MAX_PLAYERS, t: now };
      else delete worlds[w.code];
      await this.ctx.storage.put('worlds', worlds);
      return json({ ok: true });
    }
    const list = Object.values(worlds).filter((w) => now - w.t < 6 * 3600 * 1000).sort((a, b) => b.players - a.players).slice(0, 30);
    return json({ worlds: list });
  }
}
