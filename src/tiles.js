// ============================================================================
// Gold Coast Streets — the streamed world around Surfers Paradise.
// 1 km tiles (Southport to Burleigh Heads, inland to Robina, Carrara and Benowa)
// load around the player and unload behind them. Each tile brings its own ground,
// roads, buildings (OpenStreetMap + Microsoft footprints), trees, street lights,
// street shops, petrol stations, collision walls and road network.
// ============================================================================
let REGION = null;                 // tiles/region.json: index, overview roads/water, suburbs, landmarks
const WORLD = { x0: MINX, z0: MINZ, x1: MAXX, z1: MAXZ };
const TILES = new Map();           // "i,j" -> loaded tile
const TILE_INDEX = new Set();      // tiles that exist on disk
const LOAD_RADIUS = 1300, UNLOAD_RADIUS = 1800;
let tileBusy = false, tileCheckT = 0;
const NODE_INDEX = new Map();      // OSM node id -> index into GN (shared with the Surfers core network)
(MAP.graph.ids || []).forEach((id, i) => NODE_INDEX.set(String(id), i));

async function loadRegion() {
  try {
    const r = await fetch('tiles/region.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    REGION = await r.json();
  } catch (e) { console.warn('[tiles] no region data, Surfers only', e); return; }
  for (const [i, j] of REGION.tiles) TILE_INDEX.add(i + ',' + j);
  Object.assign(WORLD, { x0: REGION.bounds[0], z0: REGION.bounds[1], x1: REGION.bounds[2], z1: REGION.bounds[3] });
  buildOverview();
  buildRegionSurf();
}
// a band of white water just off every stretch of open coastline (the core has its own)
function buildRegionSurf() {
  if (!REGION.coast) return;
  const pos = [], uv = [];
  for (const p of REGION.coast) {
    let acc = 0;
    for (let q = 0; q < p.length / 2 - 1; q++) {
      const ax = p[2 * q], az = p[2 * q + 1], bx = p[2 * q + 2], bz = p[2 * q + 3], L = Math.hypot(bx - ax, bz - az) || 1;
      const rx = -(bz - az) / L, rz = (bx - ax) / L; // coastline runs with land on the left: the sea is to the right
      const o0 = 2, o1 = 46, u0 = acc / 30, u1 = (acc + L) / 30; acc += L;
      const A0 = [ax + rx * o0, az + rz * o0], A1 = [ax + rx * o1, az + rz * o1], B0 = [bx + rx * o0, bz + rz * o0], B1 = [bx + rx * o1, bz + rz * o1];
      pos.push(A0[0], -0.4, A0[1], B0[0], -0.4, B0[1], B1[0], -0.4, B1[1], A0[0], -0.4, A0[1], B1[0], -0.4, B1[1], A1[0], -0.4, A1[1]);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, foamMat); m.renderOrder = 2; scene.add(m);
}
function tileAt(x, z) { return TILES.get(Math.floor(x / REGION.tile) + ',' + Math.floor(z / REGION.tile)); }
function tileIsLand(x, z) {
  if (!REGION) return true;
  if (x < WORLD.x0 || x > WORLD.x1 || z < WORLD.z0 || z > WORLD.z1) return false;
  const T = tileAt(x, z);
  if (!T || !T.mask) return true;
  const i = Math.floor((x - T.x0) * 0.5), j = Math.floor((z - T.z0) * 0.5);
  return T.mask[clamp(j, 0, 499) * 500 + clamp(i, 0, 499)] === 1;
}

// ---------------------------------------------------------------- the stream: which tiles should be loaded?
function updateTiles(dt) {
  if (!REGION) return;
  updateTileSignals();
  tileCheckT -= dt; if (tileCheckT > 0) return; tileCheckT = 0.4;
  const S = REGION.tile, px = player.x, pz = player.z;
  const dist = (i, j) => { const cx = clamp(px, i * S, (i + 1) * S), cz = clamp(pz, j * S, (j + 1) * S); return Math.hypot(px - cx, pz - cz); };
  for (const [k, T] of TILES) if (dist(T.i, T.j) > UNLOAD_RADIUS) unloadTile(k);
  if (tileBusy) return;
  let best = null, bd = LOAD_RADIUS;
  const i0 = Math.floor((px - LOAD_RADIUS) / S), i1 = Math.floor((px + LOAD_RADIUS) / S), j0 = Math.floor((pz - LOAD_RADIUS) / S), j1 = Math.floor((pz + LOAD_RADIUS) / S);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = i + ',' + j; if (!TILE_INDEX.has(k) || TILES.has(k)) continue;
    const d = dist(i, j); if (d < bd) { bd = d; best = [i, j]; }
  }
  if (best) loadTile(best[0], best[1]);
}
const tileYield = () => new Promise((r) => setTimeout(r, 0));
async function loadTile(i, j) {
  tileBusy = true;
  const k = i + ',' + j, S = REGION.tile;
  const T = { i, j, k, x0: i * S, z0: j * S, meshes: [], disposables: [], edges: [], shops: [], spots: [], mask: null, mini: null, roads: [], names: [] };
  TILES.set(k, T);
  try {
    const res = await fetch(`tiles/t_${i}_${j}.json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!TILES.has(k)) return; // unloaded while fetching
    T.roads = data.roads; T.names = data.names;
    tileGround(T, data); await tileYield(); if (!TILES.has(k)) return;
    tileRoads(T, data); await tileYield(); if (!TILES.has(k)) return;
    const plan = planFronts(data);
    const segs = tileBuildings(T, data, plan.fronts); await tileYield(); if (!TILES.has(k)) return;
    tileTrees(T, data); tileLamps(T, data, segs);
    tileShops(T, data, segs, plan); tileFuel(T, data, segs);
    tileTowerNames(T, data); tileSignals(T, data, segs);
    T.grid = makeGrid(segs, T.x0 - 60, T.z0 - 60, T.x0 + S + 60, T.z0 + S + 60); GRIDS.push(T.grid);
    tileGraph(T, data);
    tileMini(T, data);
    for (const m of T.meshes) scene.add(m);
  } catch (e) {
    console.warn('[tiles] failed to load', k, e);
    window.__gcsErrors && window.__gcsErrors.push('tile ' + k + ': ' + e.message);
  } finally { tileBusy = false; }
}
function unloadTile(k) {
  const T = TILES.get(k); if (!T) return;
  TILES.delete(k);
  for (const m of T.meshes) scene.remove(m);
  for (const d of T.disposables) d.dispose();
  if (T.grid) { const gi = GRIDS.indexOf(T.grid); if (gi >= 0) GRIDS.splice(gi, 1); }
  // the road network: agents on these roads leave with them
  const gone = new Set(T.edges);
  for (const ei of T.edges) {
    const E = EDGES[ei]; if (!E) continue;
    for (const [m, list] of [[ADJ, ADJ.get(E.a)], [ADJ, ADJ.get(E.b)], [PADJ, PADJ.get(E.a)], [PADJ, PADJ.get(E.b)]]) {
      if (!list) continue; for (let q = list.length - 1; q >= 0; q--) if (list[q].e === ei) list.splice(q, 1);
    }
    EDGES[ei] = null;
  }
  for (let q = LIVE_EDGES.length - 1; q >= 0; q--) if (gone.has(LIVE_EDGES[q])) LIVE_EDGES.splice(q, 1);
  for (const c of cars.slice()) {
    if (c === player.car || (player.seq && player.seq.car === c)) continue;
    if (c.ai && (gone.has(c.ai.e) || (c.ai.next && gone.has(c.ai.next.e)))) { if (c.kind === 'police') { c.ai.next = null; if (!attachToRoad(c)) c.remove(); } else c.remove(); }
  }
  for (const p of peds.slice()) if (!p.cop && (p.state === 'walk') && gone.has(p.e)) p.remove();
  for (const sh of T.shops) { const si = SHOPS.indexOf(sh); if (si >= 0) SHOPS.splice(si, 1); if (sh.keeper) { disposePerson(sh.keeper.m); sh.keeper = null; } }
  for (const sg of T.signals || []) { const si = SIGNALS.indexOf(sg); if (si >= 0) SIGNALS.splice(si, 1); }
  for (const sp of T.spots) { const pi = PARK_SPOTS.indexOf(sp); if (pi >= 0) PARK_SPOTS.splice(pi, 1); }
}

// ---------------------------------------------------------------- ground
function drawTileLayers(ctx, T, data, P, mini) {
  const S = REGION.tile;
  ctx.fillStyle = P.base; ctx.fillRect(T.x0, T.z0, S, S);
  for (const k of ['residential', 'commercial', 'construction', 'grass', 'scrub', 'wood', 'park', 'pitch', 'parking', 'beach']) fillFeatures(ctx, data.areas[k], P[k]);
  if (!mini) {
    const r = mulberry32(T.i * 7919 + T.j);
    for (let n = 0; n < 26000; n++) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; const s = 0.6 + r() * 2.2; ctx.fillRect(T.x0 + r() * S, T.z0 + r() * S, s, s); }
  }
  const stroke = (f, wf, color) => {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of data.roads) { if (!f(r[0])) continue; ctx.lineWidth = wf(r); ctx.beginPath(); trace(ctx, r.slice(4), false); ctx.stroke(); }
  };
  const path = (t) => t === RT.footway || t === RT.path || t === RT.cycleway || t === RT.steps || t === RT.track;
  stroke(path, (r) => r[1] + (mini ? 0 : 0.4), P.path);
  stroke((t) => t === RT.pedestrian, (r) => r[1], P.plaza);
  if (!mini) { stroke((t) => DRIVE.has(t), (r) => r[1] + 4.2, P.kerb); stroke((t) => DRIVE.has(t), (r) => r[1] + 3.6, P.sidewalk); stroke((t) => t === RT.service, (r) => r[1] + 1.2, P.sidewalk); }
  fillFeatures(ctx, data.areas.pool, P.pool);
  if (mini) {
    ctx.fillStyle = P.building;
    for (const b of data.buildings) { ctx.beginPath(); trace(ctx, b.slice(3), true); ctx.fill(); }
    stroke((t) => t === RT.service, (r) => r[1], P.minor);
    stroke((t) => DRIVE.has(t) && !MAJOR.has(t), (r) => r[1] + 1, P.minor);
    stroke((t) => MAJOR.has(t), (r) => r[1] + 2, P.major);
  }
  if (!mini) ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = P.water;
  ctx.beginPath(); for (const ring of data.water) trace(ctx, ring, true); ctx.fill('evenodd');
  fillFeatures(ctx, data.areas.water, P.water);
  ctx.globalCompositeOperation = 'source-over';
  fillFeatures(ctx, data.areas.pier, P.pier);
  if (mini) stroke((t) => DRIVE.has(t), (r) => (r[3] ? r[1] + 1 : 0.001), P.minor); // bridges over water
  // leave the hand-built Surfers core alone
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
  ctx.fillRect(MINX, MINZ, MAXX - MINX, MAXZ - MINZ);
  ctx.globalCompositeOperation = 'source-over';
}
function tileCanvas(T, ppm) {
  const S = REGION.tile, c = document.createElement('canvas'); c.width = c.height = Math.round(S * ppm);
  const x = c.getContext('2d', { willReadFrequently: ppm < 1 }); x.setTransform(ppm, 0, 0, ppm, -T.x0 * ppm, -T.z0 * ppm);
  return [c, x];
}
function tileGround(T, data) {
  const S = REGION.tile, [c, x] = tileCanvas(T, 1.024);
  // suburbs without mapped land use still get lawns rather than bare concrete
  const houses = data.buildings.filter((b) => b[2] === 0).length;
  const pal = houses > data.buildings.length * 0.5 && houses > 40 ? Object.assign({}, GROUND_PAL, { base: '#86965f' }) : GROUND_PAL;
  drawTileLayers(x, T, data, pal, false);
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = MAX_ANISO;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.96, metalness: 0, envMapIntensity: 0.3 });
  const g = new THREE.PlaneGeometry(S, S); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(T.x0 + S / 2, 0, T.z0 + S / 2); m.receiveShadow = true;
  T.meshes.push(m); T.disposables.push(g, mat, tex);
  // land/water mask at 0.5 px per metre
  const [mc, mx] = tileCanvas(T, 0.5);
  mx.fillStyle = '#fff'; mx.fillRect(T.x0, T.z0, S, S);
  mx.fillStyle = '#000'; mx.beginPath(); for (const ring of data.water) trace(mx, ring, true); mx.fill('evenodd');
  fillFeatures(mx, data.areas.water, '#000');
  mx.strokeStyle = '#fff'; mx.lineCap = 'round';
  for (const r of data.roads) if (r[3]) { mx.lineWidth = r[1] + 2; mx.beginPath(); trace(mx, r.slice(4), false); mx.stroke(); }
  fillFeatures(mx, data.areas.pier, '#fff');
  const d = mx.getImageData(0, 0, 500, 500).data, mask = new Uint8Array(250000);
  for (let n = 0; n < 250000; n++) mask[n] = d[n * 4] > 127 ? 1 : 0;
  T.mask = mask;
}

// ---------------------------------------------------------------- roads
const TILE_ROAD_MATS = (() => {
  const asphalt = noiseTexture(256, '#57595d', 40, 9000);
  const mk = (color, po) => new THREE.MeshStandardMaterial({ map: asphalt, color: col(color), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po * 2, envMapIntensity: 0.3 });
  const line = (alpha) => new THREE.MeshStandardMaterial({ color: col('#f1efe6'), roughness: 0.7, alphaMap: alpha || null, alphaTest: alpha ? 0.5 : 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, envMapIntensity: 0.3 });
  const dc = document.createElement('canvas'); dc.width = 4; dc.height = 64;
  const dx = dc.getContext('2d'); dx.fillStyle = '#000'; dx.fillRect(0, 0, 4, 64); dx.fillStyle = '#fff'; dx.fillRect(0, 0, 4, 16);
  const dash = new THREE.CanvasTexture(dc); dash.wrapS = dash.wrapT = THREE.RepeatWrapping;
  return { service: mk('#d6d6d6', -1), minor: mk('#ffffff', -2), major: mk('#f2f2f2', -3), solid: line(null), dashed: line(dash),
    concrete: new THREE.MeshStandardMaterial({ color: col('#bdb8ad'), roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.3 }) };
})();
function tileRoads(T, data) {
  const sets = [[(t) => t === RT.service, 0.03, TILE_ROAD_MATS.service], [(t) => DRIVE.has(t) && !MAJOR.has(t), 0.045, TILE_ROAD_MATS.minor], [(t) => MAJOR.has(t), 0.06, TILE_ROAD_MATS.major]];
  const addMesh = (B, mat) => { if (!B.pos.length) return; const g = toGeometry(B); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; T.meshes.push(m); T.disposables.push(g); };
  for (const [f, y, mat] of sets) {
    const B = newBuf();
    for (const r of data.roads) {
      if (!f(r[0])) continue;
      const p = r.slice(4), hw = r[1] / 2, us = r[1] / 6, n = p.length;
      ribbonInto(B, p, 0, hw, y, 6, us);
      discInto(B, p[0], p[1], hw, y, us); discInto(B, p[n - 2], p[n - 1], hw, y, us);
    }
    addMesh(B, mat);
  }
  const solid = newBuf(), dashed = newBuf();
  for (const e of data.edges) {
    const type = e[5], w = e[6], oneway = e[2], lanes = Math.max(1, e[3] || 1), p = e.slice(7), lw = 0.07;
    if (type === RT.residential || type === RT.living_street || type === RT.unclassified || w < 6) continue;
    if (!oneway) {
      if (type === RT.tertiary) ribbonInto(dashed, p, 0, lw, 0.075, 12, 1);
      else { ribbonInto(solid, p, 0.16, lw, 0.075, 12, 1); ribbonInto(solid, p, -0.16, lw, 0.075, 12, 1); }
    } else if (lanes > 1) { const lwid = w / lanes; for (let q = 1; q < lanes; q++) ribbonInto(dashed, p, -w / 2 + q * lwid, lw, 0.075, 12, 1); }
    if (type === RT.trunk || type === RT.primary || type === RT.secondary || type === RT.motorway) { ribbonInto(solid, p, w / 2 - 0.35, lw, 0.075, 12, 1); ribbonInto(solid, p, -w / 2 + 0.35, lw, 0.075, 12, 1); }
  }
  addMesh(solid, TILE_ROAD_MATS.solid); addMesh(dashed, TILE_ROAD_MATS.dashed);
  const BB = newBuf();
  for (const r of data.roads) {
    if (!r[3]) continue;
    const p = r.slice(4), hw = r[1] / 2 + (DRIVE.has(r[0]) ? 1.8 : 0.2);
    for (let q = 0; q < p.length / 2 - 1; q++) {
      const ax = p[2 * q], az = p[2 * q + 1], bx = p[2 * q + 2], bz = p[2 * q + 3], L = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (const s of [1, -1]) { const ox = nx * hw * s, oz = nz * hw * s; wallInto(BB, ax + ox, az + oz, bx + ox, bz + oz, -1.6, 0.06, nx * s, nz * s); wallInto(BB, ax + ox, az + oz, bx + ox, bz + oz, 0.06, 1.0, -nx * s, -nz * s); }
    }
  }
  addMesh(BB, TILE_ROAD_MATS.concrete);
}

// ---------------------------------------------------------------- buildings (houses get hip roofs)
const TILE_ROOFS = ['#a4553b', '#8a4b38', '#5c5f63', '#7d8288', '#b36a46', '#9a9d9f', '#3f4a52', '#c9c4b8', '#6b3d2e'];
const BRICK = ['#b7704f', '#a35d43', '#c98a63', '#d8c3a5', '#efe7da', '#f4f1ea', '#d9d3c7', '#e8dcc6', '#b9b0a2'];
function tileBuildings(T, data, fronts) {
  const bufs = {}, segs = [], br = mulberry32(T.i * 4099 + T.j * 7);
  let bi = -1;
  const buf = (cls) => bufs[cls] || (bufs[cls] = Object.assign(newBuf(), { cls }));
  for (const b of data.buildings) {
    bi++;
    const mh = b[1], kind = b[2], f = b.slice(3), n = f.length / 2;
    // footprint heights include the roof: a house gets ~3 m walls per storey and its roof on top
    const h = kind === 0 ? (b[0] < 6.5 ? 3.0 : b[0] < 9.5 ? 5.8 : b[0] - 1.6) : b[0];
    let cx = 0, cz = 0; for (let q = 0; q < n; q++) { cx += f[2 * q]; cz += f[2 * q + 1]; } cx /= n; cz /= n;
    const r1 = br(), r2 = br(), a = Math.abs(polyArea(f));
    let cls = 'low';
    if (kind === 3 || kind === 4) cls = 'plain';
    else if (kind === 5) cls = 'glass';
    else if (h >= 11) cls = h > 70 && r1 < 0.3 ? 'glass' : r1 < 0.4 ? 'tower' : r1 < 0.72 ? 'balcony' : r1 < 0.92 ? 'grid' : 'glass';
    const tints = STYLE_TINTS[cls];
    const wall = col(kind === 0 ? BRICK[Math.floor(r2 * BRICK.length)] : tints ? tints[Math.floor(r2 * tints.length)] : pick(WALLS[kind] || WALLS[2]));
    const roof = col(kind === 0 ? TILE_ROOFS[Math.floor(br() * TILE_ROOFS.length)] : cls === 'plain' ? '#8f9498' : '#b4b3ad');
    const W = buf(cls), R = buf('plain'), cv = cls === 'low' ? 24 : 25.6;
    let acc = 0;
    for (let q = 0; q < n; q++) {
      const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L, ex = (bx - ax) / L, ez = (bz - az) / L;
      const fr = (fronts && fronts.get(bi + ':' + q)) || [];
      const piece = (t0, t1, y0, y1) => {
        if (t1 - t0 < 0.01 || y1 - y0 < 0.01) return;
        const s0 = W.pos.length; wallInto(W, ax + ex * t0, az + ez * t0, ax + ex * t1, az + ez * t1, y0, y1, nx, nz, wall);
        if (cls !== 'plain') for (let v = s0; v < W.pos.length; v += 3) W.uv.push((acc + Math.hypot(W.pos[v] - ax, W.pos[v + 2] - az)) / 32, W.pos[v + 1] / cv);
      };
      let from = 0;
      for (const [t0, t1] of fr) { piece(from, t0, mh, h); piece(t0, t1, Math.min(h, 3.6), h); from = t1; }
      piece(from, L, mh, h);
      acc += L;
      if (mh < 2.5 && h > 1.2) {
        let g0 = 0;
        for (const [t0, t1] of fr) { const c = (t0 + t1) / 2; segs.push(ax + ex * g0, az + ez * g0, ax + ex * (c - 0.85), az + ez * (c - 0.85), h); g0 = c + 0.85; }
        segs.push(ax + ex * g0, az + ez * g0, bx, bz, h);
      }
    }
    if (kind === 0 && n <= 10 && a < 650) { // hip roof: every eave rises to a ridge point over the middle
      const ry = h + Math.min(2.6, Math.sqrt(a) * 0.17), apex = [cx, ry, cz];
      for (let q = 0; q < n; q++) {
        const A = [f[2 * q], h, f[2 * q + 1]], Bv = [f[(2 * q + 2) % (2 * n)], h, f[(2 * q + 3) % (2 * n)]];
        const st = R.pos.length; triInto(R, A, Bv, apex, 1);
        const ux = Bv[0] - A[0], uz = Bv[2] - A[2], vx = apex[0] - A[0], vy = ry - h, vz = apex[2] - A[2];
        let nx = uz * vy, ny = -(ux * vz - uz * vx), nz = -ux * vy; const nl = Math.hypot(nx, ny, nz) || 1;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        for (let v = st; v < R.pos.length; v += 3) { R.nor.push(nx / nl, ny / nl, nz / nl); R.col.push(roof.r, roof.g, roof.b); }
      }
    } else {
      const contour = []; for (let q = 0; q < n; q++) contour.push(new THREE.Vector2(f[2 * q], f[2 * q + 1]));
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { tris = []; }
      for (const t of tris) {
        triInto(R, [f[2 * t[0]], h, f[2 * t[0] + 1]], [f[2 * t[1]], h, f[2 * t[1] + 1]], [f[2 * t[2]], h, f[2 * t[2] + 1]], 1);
        for (let v = 0; v < 3; v++) { R.nor.push(0, 1, 0); R.col.push(roof.r, roof.g, roof.b); }
      }
      if (h > 30 && n >= 4 && cls !== 'glass') boxInto(R, cx, h, cz, Math.min(6, Math.sqrt(a) * 0.18), 3.2, Math.min(6, Math.sqrt(a) * 0.18), roof);
    }
  }
  for (const B of Object.values(bufs)) {
    if (!B.pos.length) continue;
    const g = toGeometry(B), m = new THREE.Mesh(g, buildingMats[B.cls]); m.castShadow = true; m.receiveShadow = true;
    T.meshes.push(m); T.disposables.push(g);
  }
  return segs;
}

// ---------------------------------------------------------------- trees and street lights
const LEAFY_GEO = (() => {
  const ico = new THREE.IcosahedronGeometry(1, 1), ip = ico.attributes.position;
  for (let q = 0; q < ip.count; q++) { const x = ip.getX(q), y = ip.getY(q), z = ip.getZ(q), k = 0.88 + 0.24 * (Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 0.5 + 0.5); ip.setXYZ(q, x * k, y * k, z * k); }
  ico.computeVertexNormals();
  const tr = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); tr.translate(0, 0.5, 0);
  return { ico, tr };
})();
const TREE_MATS = { trunk: new THREE.MeshStandardMaterial({ color: col('#8b7a62'), roughness: 0.95, envMapIntensity: 0.3 }), crown: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.3 }),
  ltrunk: new THREE.MeshStandardMaterial({ color: col('#6b5844'), envMapIntensity: 0.3 }), leaf: new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: 0.9, flatShading: true, envMapIntensity: 0.3 }) };
const GREENS = ['#4e7d36', '#5a8a3c', '#3f6e2f', '#6b9046', '#567f3a'].map(col);
// a lighter palm crown for the suburbs (7 fronds x 4 segments instead of 11 x 7)
const LIGHT_CROWN = (() => {
  const pos = [], colr = [], r = mulberry32(42);
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * TAU + (r() - 0.5) * 0.3, len = 2.8 + r() * 0.8, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    let prev = null;
    for (let k = 0; k <= 4; k++) {
      const s = k / 4, rr2 = s * len, y = 0.7 * s * 1.6 - 1.9 * s * s, w = 0.62 * Math.sin(Math.PI * Math.min(1, s * 1.1 + 0.05));
      const C = [dx * rr2, y, dz * rr2], Lp = [C[0] + px * w, y - 0.18 * w, C[2] + pz * w], Rp = [C[0] - px * w, y - 0.18 * w, C[2] - pz * w];
      if (prev) for (const [p0, p1, p2, p3] of [[prev.L, prev.C, C, Lp], [prev.C, prev.R, Rp, C]]) {
        pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3); const g = 0.75 + 0.25 * s; for (let q = 0; q < 6; q++) colr.push(0.16 * g, 0.36 * g, 0.12 * g);
      }
      prev = { C, L: Lp, R: Rp };
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.computeVertexNormals();
  return g;
})();
function tileTrees(T, data) {
  const palms = data.trees.filter((t) => t[2] === 1), leafy = data.trees.filter((t) => t[2] !== 1);
  const trunkG = palmGeometries()[0], crownG = LIGHT_CROWN, r = mulberry32(T.i * 31 + T.j * 17);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  if (palms.length) {
    const tm = new THREE.InstancedMesh(trunkG, TREE_MATS.trunk, palms.length), cm = new THREE.InstancedMesh(crownG, TREE_MATS.crown, palms.length);
    palms.forEach(([x, z], k) => {
      const H = 6 + r() * 6, a = r() * TAU; e.set(0, a, 0); q.setFromEuler(e);
      m4.compose(v.set(x, 0, z), q, sc.set(1, H, 1)); tm.setMatrixAt(k, m4);
      e.set(0, r() * TAU, 0); q.setFromEuler(e); const s = 0.85 + r() * 0.3;
      m4.compose(v.set(x + Math.cos(a) * 0.9, H, z - Math.sin(a) * 0.9), q, sc.set(s, s, s)); cm.setMatrixAt(k, m4);
    });
    tm.castShadow = cm.castShadow = true; T.meshes.push(tm, cm); T.disposables.push(tm, cm);
  }
  if (leafy.length) {
    const lt = new THREE.InstancedMesh(LEAFY_GEO.tr, TREE_MATS.ltrunk, leafy.length), lc = new THREE.InstancedMesh(LEAFY_GEO.ico, TREE_MATS.leaf, leafy.length);
    leafy.forEach(([x, z], k) => {
      const H = 2.2 + r() * 2.6, R = 1.8 + r() * 1.8;
      m4.compose(v.set(x, 0, z), q.identity(), sc.set(1, H, 1)); lt.setMatrixAt(k, m4);
      e.set(r(), r() * TAU, 0); q.setFromEuler(e); m4.compose(v.set(x, H + R * 0.55, z), q, sc.set(R, R * (0.7 + r() * 0.25), R)); lc.setMatrixAt(k, m4);
      lc.setColorAt(k, GREENS[Math.floor(r() * GREENS.length)]);
    });
    lt.castShadow = lc.castShadow = true; T.meshes.push(lt, lc); T.disposables.push(lt, lc);
  }
}
const LAMP_GEOS = (() => {
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 8, 6); pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 2.0); arm.translate(0, 7.9, 1.0);
  const head = new THREE.BoxGeometry(0.34, 0.12, 0.7); head.translate(0, 7.85, 1.9);
  return { pole, arm, head, metal: new THREE.MeshStandardMaterial({ color: col('#9aa1a6'), metalness: 0.6, roughness: 0.4, envMapIntensity: 0.3 }) };
})();
function tileLamps(T, data, segs) {
  const L = data.lamps; if (!L.length) return;
  const ms = [new THREE.InstancedMesh(LAMP_GEOS.pole, LAMP_GEOS.metal, L.length), new THREE.InstancedMesh(LAMP_GEOS.arm, LAMP_GEOS.metal, L.length), new THREE.InstancedMesh(LAMP_GEOS.head, lampMat, L.length)];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  L.forEach(([x, z, a], k) => { e.set(0, a, 0); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, one); for (const m of ms) m.setMatrixAt(k, m4); segs.push(x - 0.14, z - 0.14, x + 0.14, z + 0.14, 8); });
  ms[0].castShadow = true;
  for (const m of ms) { T.meshes.push(m); T.disposables.push(m); }
}

// ---------------------------------------------------------------- street shops (signs and a counter) and petrol stations
const FUEL_BRANDS = [
  [/ampol|caltex/i, { bg: '#ffffff', fg: '#e2231a', band: '#1e3c8c' }], [/\bbp\b/i, { bg: '#009b3a', fg: '#ffe600', band: '#ffe600' }],
  [/shell/i, { bg: '#ffd500', fg: '#dd1d21', band: '#dd1d21' }], [/7-eleven|7 eleven/i, { bg: '#ffffff', fg: '#008163', band: '#ee2526' }],
  [/puma/i, { bg: '#e30613', fg: '#ffffff', band: '#ffffff' }], [/united/i, { bg: '#0a3d91', fg: '#ffd200', band: '#ffd200' }],
  [/liberty/i, { bg: '#123c8c', fg: '#ffffff', band: '#e11b22' }], [/coles express|reddy/i, { bg: '#e01a22', fg: '#ffffff', band: '#ffffff' }],
  [/\beg\b|eg ampol/i, { bg: '#002f6c', fg: '#ffffff', band: '#e2231a' }], [/metro/i, { bg: '#e2231a', fg: '#ffd200', band: '#ffd200' }],
];
const fuelStyle = (name) => { for (const [re, st] of FUEL_BRANDS) if (re.test(name)) return st; return { bg: '#1f3b57', fg: '#ffffff', band: '#f6c445' }; };
function textCanvasTex(text, w, h, bg, fg, font) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  fitFont(x, text, w * 0.9, h * 0.66, font === 'display' ? '400' : '700', FONT[font || 'cond']);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return t;
}
function nearestFacade(data, x, z, maxD) {
  let best = null, bi = -1;
  for (const b of data.buildings) {
    bi++;
    if (b[1] > 2.5) continue;
    const f = b.slice(3), n = f.length / 2;
    if (Math.abs(f[0] - x) > 80 || Math.abs(f[1] - z) > 80) continue;
    for (let q = 0; q < n; q++) {
      const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 3) continue;
      const ex = bx - ax, ez = bz - az, t = clamp(((x - ax) * ex + (z - az) * ez) / (L * L), 0.15, 0.85), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < maxD && (!best || d < best.d)) best = { d, x: px, z: pz, nx: ez / L, nz: -ex / L, L, h: b[0], bi, k: q, t: t * L, ax, az, bx, bz };
    }
  }
  return best;
}
function tileShops(T, data, segs, plan) {
  if (!data.pois.length) return;
  const IB = newBuf(), IG = newBuf(), boards = new Map();
  const slotW = 256, slotH = 48, cols = 4, rows = 21, atlases = [];
  let A = null, n = 0;
  const frame = col('#2a2d30'), poleSegs = [];
  for (const [x, z, cat, name, id] of data.pois) {
    if (inCore(x, z)) continue;
    if (!A || n >= cols * rows) { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; A = { c, ctx: c.getContext('2d'), B: newBuf(), F: newBuf() }; atlases.push(A); n = 0; }
    const sx = (n % cols) * slotW, sy = Math.floor(n / cols) * slotH; n++;
    drawSign(A.ctx, sx, sy, slotW, slotH, name, styleFor(name, cat));
    const uv = { u0: sx / 1024, u1: (sx + slotW) / 1024, v0: 1 - (sy + slotH) / 1024, v1: 1 - sy / 1024 };
    const pl = plan && plan.plans.get(id);
    const fc = pl ? pl.fc : nearestFacade(data, x, z, 22), w = Math.min(5, Math.max(1.8, 0.3 * name.length + 0.8));
    let shop;
    if (fc && fc.L > w) {
      const y = pl ? Math.max(3.95, Math.min(fc.h - 0.45, 4.1)) : fc.h > 5 ? 3.3 : Math.max(2.2, fc.h - 0.6); // above the glass on walk-ins
      quadInto(A.B, fc.x + fc.nx * 0.24, y, fc.z + fc.nz * 0.24, fc.nx, fc.nz, w, 0.7, uv);
      quadInto(A.F, fc.x + fc.nx * 0.18, y, fc.z + fc.nz * 0.18, fc.nx, fc.nz, w + 0.14, 0.84, null, frame);
      shop = { x: fc.x, z: fc.z, cx: fc.x + fc.nx * 1.6, cz: fc.z + fc.nz * 1.6 };
    } else {
      quadInto(A.B, x + 0.06, 2.7, z, 1, 0, w, 0.7, uv); quadInto(A.B, x - 0.06, 2.7, z, -1, 0, w, 0.7, uv);
      poleSegs.push([x, z]);
      shop = { x, z, cx: x + 1.2, cz: z };
    }
    const sh = Object.assign(shop, { id, name, cat, kind: shopKind(cat, name), dx: shop.cx, dz: shop.cz, walkIn: false, keeper: null, robT: 0, robbedAt: -1e9, tile: T.k });
    if (pl) { // a real shopfront: doorway, glass, a room with a counter and someone behind it
      Object.assign(sh, { ax: pl.ax, az: pl.az, ex: pl.ex, ez: pl.ez, ix: pl.ix, iz: pl.iz, t0: pl.t0, t1: pl.t1, depth: pl.depth, walkIn: true });
      buildInterior(IB, IG, boards, sh, (ax, az, bx, bz, h) => segs.push(ax, az, bx, bz, h));
    }
    SHOPS.push(sh); T.shops.push(sh);
  }
  if (IB.pos.length) { const g = toGeometry(IB); T.meshes.push(new THREE.Mesh(g, INTERIOR_MAT)); T.disposables.push(g); }
  if (IG.pos.length) { const g = toGeometry(IG); T.meshes.push(new THREE.Mesh(g, SHOP_GLASS)); T.disposables.push(g); }
  for (const [mat, MB] of boards) { const g = toGeometry(MB); T.meshes.push(new THREE.Mesh(g, mat)); T.disposables.push(g); }
  for (const At of atlases) {
    const t = new THREE.CanvasTexture(At.c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
    const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: col('#ffffff'), emissiveIntensity: 0, roughness: 0.6 });
    const g = toGeometry(At.B), m = new THREE.Mesh(g, mat); T.meshes.push(m); T.disposables.push(g, mat, t);
    if (At.F.pos.length) { const g2 = toGeometry(At.F), m2 = new THREE.Mesh(g2, SIGN_FRAME_MAT); T.meshes.push(m2); T.disposables.push(g2); }
    T.nightMats = (T.nightMats || []).concat([mat]);
  }
  if (poleSegs.length) {
    const pg = SIGN_POLE_GEO, pm = new THREE.InstancedMesh(pg, SIGN_POLE_MAT, poleSegs.length), m4 = new THREE.Matrix4();
    poleSegs.forEach(([x, z], k) => { m4.makeTranslation(x, 0, z); pm.setMatrixAt(k, m4); segs.push(x - 0.06, z, x + 0.06, z, 2.4); });
    T.meshes.push(pm); T.disposables.push(pm);
  }
}
// which street shops get a walk-in shopfront: room for a 3.2 m+ opening and a room behind it
function inwardDepth(f, mx, mz, nx, nz) {
  let best = 30; const n = f.length / 2, ex = mx - nx * 30, ez = mz - nz * 30;
  for (let q = 0; q < n; q++) {
    const t = segIntersect(mx, mz, ex, ez, f[2 * q], f[2 * q + 1], f[(2 * q + 2) % (2 * n)], f[(2 * q + 3) % (2 * n)]);
    if (t > 0.01) best = Math.min(best, t * 30);
  }
  return best;
}
function planFronts(data) {
  const fronts = new Map(), plans = new Map();
  for (const [x, z, cat, name, id] of data.pois) {
    if (inCore(x, z)) continue;
    const fc = nearestFacade(data, x, z, 22); if (!fc) continue;
    const b = data.buildings[fc.bi]; if (b[1] > 1 || b[0] < 3) continue;
    const w = Math.min(5, Math.max(1.8, 0.3 * name.length + 0.8)), sw = Math.max(3.6, Math.min(9, w + 0.8));
    let a0 = Math.max(0.3, fc.t - sw / 2), a1 = Math.min(fc.L - 0.3, fc.t + sw / 2);
    const key = fc.bi + ':' + fc.k, fu = fronts.get(key) || [];
    for (const [f0, f1] of fu) { if (f1 + 0.3 <= fc.t && f1 + 0.3 > a0) a0 = f1 + 0.3; if (fc.t <= f0 - 0.3 && f0 - 0.3 < a1) a1 = f0 - 0.3; }
    if (a1 - a0 < 3.2 || !fu.every(([f0, f1]) => a1 <= f0 - 0.3 || a0 >= f1 + 0.3)) continue;
    const ex = (fc.bx - fc.ax) / fc.L, ez = (fc.bz - fc.az) / fc.L, m = (a0 + a1) / 2;
    const dep = inwardDepth(b.slice(3), fc.ax + ex * m, fc.az + ez * m, fc.nx, fc.nz);
    if (dep < 3.5) continue;
    fu.push([a0, a1]); fronts.set(key, fu.sort((p, q) => p[0] - q[0]));
    plans.set(id, { ax: fc.ax, az: fc.az, ex, ez, ix: -fc.nx, iz: -fc.nz, t0: a0, t1: a1, depth: Math.min(8, dep - 0.4), fc });
  }
  return { fronts, plans };
}
const SIGN_FRAME_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, envMapIntensity: 0.3 });
const SIGN_POLE_GEO = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(0, 1.2, 0);
const SIGN_POLE_MAT = new THREE.MeshStandardMaterial({ color: col('#6f7478'), metalness: 0.5, envMapIntensity: 0.3 });
const FUEL_MATS = { white: new THREE.MeshStandardMaterial({ color: col('#f4f4f2'), roughness: 0.5, envMapIntensity: 0.3 }), grey: new THREE.MeshStandardMaterial({ color: col('#8c9196'), roughness: 0.6, envMapIntensity: 0.3 }),
  pump: new THREE.MeshStandardMaterial({ color: col('#2a2f33'), roughness: 0.5, envMapIntensity: 0.3 }), glass: new THREE.MeshStandardMaterial({ color: col('#9fc4d4'), roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6, envMapIntensity: 0.6 }) };
function tileFuel(T, data, segs) {
  for (const [x, z, name, brand, id, ring] of data.fuel) {
    if (inCore(x, z)) continue;
    const st = fuelStyle(brand + ' ' + name);
    // line the forecourt up with the nearest road
    let ang = 0, bestD = 1e9;
    for (const r of data.roads) {
      if (!DRIVE.has(r[0])) continue;
      const p = r.slice(4);
      for (let q = 0; q < p.length - 2; q += 2) {
        const ax = p[q], az = p[q + 1], ex = p[q + 2] - ax, ez = p[q + 3] - az, L2 = ex * ex + ez * ez || 1, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), d = Math.hypot(x - ax - ex * t, z - az - ez * t);
        if (d < bestD) { bestD = d; ang = Math.atan2(ex, ez); }
      }
    }
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ang;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 16), FUEL_MATS.white); canopy.position.y = 5.1; canopy.castShadow = true; g.add(canopy);
    const bandTex = textCanvasTex(brand.toUpperCase(), 512, 32, st.bg, st.fg, 'display');
    const bandMat = new THREE.MeshStandardMaterial({ map: bandTex, emissiveMap: bandTex, emissive: col('#ffffff'), emissiveIntensity: 0 });
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.7), bandMat); b.position.set(s * 5.02, 5.1, 0); b.rotation.y = s * Math.PI / 2; g.add(b); }
    for (const [px, pz] of [[-4, -7], [4, -7], [-4, 7], [4, 7]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.8, 0.35), FUEL_MATS.grey); p.position.set(px, 2.4, pz); g.add(p); }
    for (const pz of [-4.5, 0, 4.5]) {
      const island = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 3.2), FUEL_MATS.grey); island.position.set(0, 0.09, pz); g.add(island);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 1.1), FUEL_MATS.pump); pump.position.set(0, 1.0, pz); pump.castShadow = true; g.add(pump);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), bandMat); face.position.set(0.36, 1.55, pz); face.rotation.y = Math.PI / 2; g.add(face);
    }
    // the shop behind the pumps (unless a mapped building already stands there)
    const hasBuilding = !!nearestFacade(data, x, z, 14);
    const shopPos = new THREE.Vector3(-11, 0, 0);
    if (!hasBuilding) {
      const shopBox = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 12), FUEL_MATS.white); shopBox.position.set(-11, 2, 0); shopBox.castShadow = true; g.add(shopBox);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.4), FUEL_MATS.glass); win.position.set(-6.98, 1.5, 0); win.rotation.y = Math.PI / 2; g.add(win);
      const sb = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.8), bandMat); sb.position.set(-6.97, 3.4, 0); sb.rotation.y = Math.PI / 2; g.add(sb);
    }
    // the tall price sign by the road
    const sign = new THREE.Group(); sign.position.set(6.5, 0, -9);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), FUEL_MATS.grey); post.position.y = 3.5; sign.add(post);
    const brandTex = textCanvasTex(brand, 256, 96, st.bg, st.fg, 'display');
    const brandMat = new THREE.MeshStandardMaterial({ map: brandTex, emissiveMap: brandTex, emissive: col('#ffffff'), emissiveIntensity: 0 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.3), [FUEL_MATS.white, FUEL_MATS.white, FUEL_MATS.white, FUEL_MATS.white, brandMat, brandMat]); board.position.y = 6.6; sign.add(board);
    const priceTex = textCanvasTex('U91 ' + (1.79 + ((Math.abs(x + z) % 30) / 100)).toFixed(2), 256, 64, '#111111', '#ffd200', 'cond');
    const price = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.3), [FUEL_MATS.pump, FUEL_MATS.pump, FUEL_MATS.pump, FUEL_MATS.pump, new THREE.MeshBasicMaterial({ map: priceTex, toneMapped: false }), new THREE.MeshBasicMaterial({ map: priceTex, toneMapped: false })]);
    price.position.y = 5.7; sign.add(price); g.add(sign);
    T.meshes.push(g);
    g.traverse((o) => { if (o.geometry) T.disposables.push(o.geometry); });
    T.disposables.push(bandTex, bandMat, brandTex, brandMat, priceTex);
    T.nightMats = (T.nightMats || []).concat([bandMat, brandMat]);
    // walls: pillars, pumps, the shop
    g.updateMatrixWorld(true);
    const w2 = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
    for (const [px, pz] of [[-4, -7], [4, -7], [-4, 7], [4, 7], [0, -4.5], [0, 0], [0, 4.5], [6.5, -9]]) { const p = w2(px, pz); segs.push(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3, 3); segs.push(p.x - 0.3, p.z + 0.3, p.x + 0.3, p.z - 0.3, 3); }
    if (!hasBuilding) { const c = [w2(-15, -6), w2(-7, -6), w2(-7, 6), w2(-15, 6)]; for (let q = 0; q < 4; q++) segs.push(c[q].x, c[q].z, c[(q + 1) % 4].x, c[(q + 1) % 4].z, 4); }
    const counter = w2(hasBuilding ? -2 : -6, 0);
    const sh = { id, name: brand === name ? name : `${brand} ${name}`.trim(), cat: 9, kind: 'fuel', x, z, cx: counter.x, cz: counter.z, dx: counter.x, dz: counter.z, walkIn: false, keeper: null, robT: 0, robbedAt: -1e9, tile: T.k };
    SHOPS.push(sh); T.shops.push(sh);
  }
}

// ---------------------------------------------------------------- the road network: join tile roads to everything else
function tileGraph(T, data) {
  const idx = (id) => {
    const k = String(id); let n = NODE_INDEX.get(k);
    if (n === undefined) { const p = data.nodes[k]; n = GN.length / 2; GN.push(p[0], p[1]); NODE_INDEX.set(k, n); }
    return n;
  };
  const add = (map, node, o) => { let a = map.get(node); if (!a) map.set(node, (a = [])); a.push(o); };
  for (const e of data.edges) {
    const p = e.slice(7), cum = [0];
    for (let q = 2; q < p.length; q += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[q] - p[q - 2], p[q + 1] - p[q - 1]));
    const len = cum[cum.length - 1]; if (len < 0.5) continue;
    const E = { a: idx(e[0]), b: idx(e[1]), oneway: !!e[2], lanes: Math.max(1, e[3] || 1), name: e[4] >= 0 ? data.names[e[4]] : null, type: e[5], width: e[6], p, cum, len, tile: T.k };
    const ei = EDGES.length; EDGES.push(E); T.edges.push(ei); LIVE_EDGES.push(ei);
    add(ADJ, E.a, { e: ei, dir: 1 }); if (!E.oneway) add(ADJ, E.b, { e: ei, dir: -1 });
    add(PADJ, E.a, { e: ei, dir: 1 }); add(PADJ, E.b, { e: ei, dir: -1 });
    // kerbside parking on suburban streets
    if (!E.oneway && (E.type === RT.residential || E.type === RT.tertiary || E.type === RT.unclassified) && E.width >= 6) {
      for (const side of [1, -1]) for (let s = 10 + (ei % 7) * 3; s < len - 8; s += 26 + (ei % 5) * 6) {
        const P = edgePoint(E, 1, s, {}), off = (E.width / 2 - 1.0) * side, x = P.x + P.tz * off, z = P.z - P.tx * off;
        if (!tileIsLand(x, z) || resolveCircle(x, z, 1.2)) continue;
        const sp = { x, z, h: Math.atan2(P.tx * side, P.tz * side), used: false, tile: T.k };
        PARK_SPOTS.push(sp); T.spots.push(sp);
      }
    }
  }
}

// ---------------------------------------------------------------- maps: region overview, tile minimap pieces, suburb names
let OVERVIEW = null; const OV_PPM = 0.16;
function buildOverview() {
  const [x0, z0, x1, z1] = REGION.bounds, c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) * OV_PPM); c.height = Math.round((z1 - z0) * OV_PPM);
  const x = c.getContext('2d'); x.setTransform(OV_PPM, 0, 0, OV_PPM, -x0 * OV_PPM, -z0 * OV_PPM);
  x.fillStyle = MINI_PAL.base; x.fillRect(x0, z0, x1 - x0, z1 - z0);
  x.fillStyle = MINI_PAL.water; x.beginPath(); for (const r of REGION.water) trace(x, r, true); x.fill('evenodd');
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const r of REGION.roads) {
    const major = MAJOR.has(r[0]);
    x.strokeStyle = major ? MINI_PAL.major : MINI_PAL.minor; x.lineWidth = major ? (r[0] === RT.motorway ? 26 : 14) : 7;
    x.beginPath(); trace(x, r.slice(1), false); x.stroke();
  }
  OVERVIEW = { canvas: c, x0, z0 };
}
function tileMini(T, data) {
  const [c, x] = tileCanvas(T, MAPPPM);
  drawTileLayers(x, T, data, MINI_PAL, true);
  // keep the Surfers core out of the tile piece: the core has its own map
  T.mini = c;
}
function suburbAt(x, z) {
  if (!REGION) return null;
  let best = null, bd = 2600;
  for (const [sx, sz, name, place] of REGION.suburbs) {
    if (place !== 'suburb' && place !== 'town') continue;
    const d = Math.hypot(sx - x, sz - z); if (d < bd) { bd = d; best = name; }
  }
  return best;
}
function tileStreetName(x, z) {
  let best = 30 * 30, name = '';
  for (const T of TILES.values()) {
    if (x < T.x0 - 40 || x > T.x0 + REGION.tile + 40 || z < T.z0 - 40 || z > T.z0 + REGION.tile + 40) continue;
    for (const r of T.roads) {
      if (r[2] < 0) continue;
      for (let q = 4; q < r.length - 2; q += 2) {
        const ax = r[q], az = r[q + 1], ex = r[q + 2] - ax, ez = r[q + 3] - az, L2 = ex * ex + ez * ez || 1, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
        const d = (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
        if (d < best) { best = d; name = T.names[r[2]]; }
      }
    }
  }
  return { name, d2: best };
}
function updateTileNightLights() {
  // tile signs share the clock with the rest of the city
  for (const T of TILES.values()) if (T.nightMats) for (const m of T.nightMats) m.emissiveIntensity = smooth(0.3, 0.85, nightLevel) * 0.9;
}

// ---------------------------------------------------------------- names on top of named towers (Broadbeach, Southport…)
function tileTowerNames(T, data) {
  const list = Object.entries(data.bnames || {}).map(([i, nm]) => [data.buildings[+i], nm]).filter(([b]) => b && b[0] >= 24);
  if (!list.length) return;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d'); const B = newBuf();
  let n = 0;
  for (const [b, nm] of list) {
    if (n >= 64) break;
    const f = b.slice(3), m = f.length / 2, edges = [];
    for (let q = 0; q < m; q++) { const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * m)], bz = f[(2 * q + 3) % (2 * m)], L = Math.hypot(bx - ax, bz - az); if (L > 6) edges.push([L, ax, az, bx, bz]); }
    edges.sort((p, q) => q[0] - p[0]);
    const sx = (n % 2) * 512, sy = Math.floor(n / 2) * 32; n++;
    x.save(); x.translate(sx, sy); fitFont(x, nm.toUpperCase(), 500, 26, '700', FONT.cond); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(nm.toUpperCase(), 256, 17); x.restore();
    const uv = { u0: sx / 1024, u1: (sx + 512) / 1024, v0: 1 - (sy + 32) / 1024, v1: 1 - sy / 1024 }, chosen = [];
    for (const [L, ax, az, bx, bz] of edges) {
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      if (!chosen.every((cn) => nx * cn[0] + nz * cn[1] < 0.3)) continue;
      chosen.push([nx, nz]); const w = Math.min(L * 0.75, 1.5 * nm.length + 3);
      quadInto(B, (ax + bx) / 2 + nx * 0.2, b[0] - 3.5, (az + bz) / 2 + nz * 0.2, nx, nz, w, w / 16, uv);
      if (chosen.length >= 3) break;
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = MAX_ANISO;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, emissiveMap: tex, emissive: col('#fff3d6'), emissiveIntensity: 0, roughness: 0.5 });
  const g = toGeometry(B), mesh = new THREE.Mesh(g, mat); T.meshes.push(mesh); T.disposables.push(g, mat, tex);
  T.nightMats = (T.nightMats || []).concat([mat]);
}

// ---------------------------------------------------------------- traffic lights (traffic stops for them)
const TSIG = { pole: new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6).translate(0, 1.8, 0), head: new THREE.BoxGeometry(0.34, 0.95, 0.26).translate(0, 3.1, 0),
  lamp: new THREE.SphereGeometry(0.095, 8, 6), metal: new THREE.MeshStandardMaterial({ color: col('#2b2f33'), roughness: 0.6, envMapIntensity: 0.3 }) };
function tileSignals(T, data, segs) {
  const heads = [];
  for (const [sx, sz] of data.signals) {
    let best = null;
    for (const r of data.roads) {
      if (!DRIVE.has(r[0])) continue;
      for (let q = 4; q < r.length - 2; q += 2) {
        const ax = r[q], az = r[q + 1], ex = r[q + 2] - ax, ez = r[q + 3] - az, L2 = ex * ex + ez * ez || 1, t = clamp(((sx - ax) * ex + (sz - az) * ez) / L2, 0, 1);
        const d = Math.hypot(sx - ax - ex * t, sz - az - ez * t);
        if (!best || d < best.d) { const L = Math.sqrt(L2); best = { d, cx: ax + ex * t, cz: az + ez * t, tx: ex / L, tz: ez / L, w: r[1] }; }
      }
    }
    if (!best || best.d > 6) continue;
    const axis = Math.abs(best.tx) > Math.abs(best.tz) ? 1 : 0, off = best.w / 2 + 0.9;
    let px = best.cx - best.tz * off, pz = best.cz + best.tx * off;
    if (!tileIsLand(px, pz)) { px = best.cx + best.tz * off; pz = best.cz - best.tx * off; }
    if (heads.some((h) => Math.abs(h.px - px) < 3 && Math.abs(h.pz - pz) < 3)) continue;
    const sg = { x: best.cx, z: best.cz, px, pz, axis };
    SIGNALS.push(sg); (T.signals = T.signals || []).push(sg);
    heads.push({ px, pz, tx: best.tx, tz: best.tz, axis });
    segs.push(px - 0.1, pz, px + 0.1, pz, 3.5);
  }
  if (!heads.length) return;
  const pm = new THREE.InstancedMesh(TSIG.pole, TSIG.metal, heads.length), bm = new THREE.InstancedMesh(TSIG.head, TSIG.metal, heads.length * 2);
  const lamps = new THREE.InstancedMesh(TSIG.lamp, new THREE.MeshBasicMaterial({ toneMapped: false }), heads.length * 6);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  heads.forEach((hd, i) => {
    m4.makeTranslation(hd.px, 0, hd.pz); pm.setMatrixAt(i, m4);
    for (const s of [1, -1]) {
      const fx = hd.tx * s, fz = hd.tz * s; e.set(0, Math.atan2(-fx, -fz), 0); q.setFromEuler(e);
      m4.compose(v.set(hd.px, 0, hd.pz), q, one); bm.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), m4);
      for (let k = 0; k < 3; k++) { m4.makeTranslation(hd.px - fx * 0.14, 3.42 - k * 0.3, hd.pz - fz * 0.14); lamps.setMatrixAt(i * 6 + (s > 0 ? 0 : 3) + k, m4); lamps.setColorAt(i * 6 + (s > 0 ? 0 : 3) + k, LAMP_OFF); }
    }
  });
  pm.castShadow = true;
  T.meshes.push(pm, bm, lamps); T.disposables.push(pm, bm, lamps, lamps.material);
  T.sigHeads = heads; T.sigLamps = lamps; T.sigPhase = -1;
}
function updateTileSignals() {
  const ph = Math.floor(signalClock * 2);
  for (const T of TILES.values()) {
    if (!T.sigLamps || T.sigPhase === ph) continue;
    T.sigPhase = ph;
    T.sigHeads.forEach((hd, i) => {
      const st = signalState(hd.axis);
      for (const base of [0, 3]) for (let k = 0; k < 3; k++) {
        const on = (k === 0 && st === 2) || (k === 1 && st === 1) || (k === 2 && st === 0);
        T.sigLamps.setColorAt(i * 6 + base + k, on ? LAMP_ON[2 - k] : LAMP_OFF);
      }
    });
    T.sigLamps.instanceColor.needsUpdate = true;
  }
}
