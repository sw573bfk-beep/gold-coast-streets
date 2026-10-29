// ============================================================================
// Gold Coast Streets — world: renderer, sky, ground, roads, buildings, trees
// Map data: OpenStreetMap (ODbL), converted by tools/build_map.py
// ============================================================================
'use strict';
THREE.ColorManagement.legacyMode = false;

const MAP = window.MAP;
const [MINX, MINZ, MAXX, MAXZ] = MAP.bounds;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- utilities
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261028);
const rr = (a, b) => a + (b - a) * rand();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const col = (hex) => new THREE.Color(hex);

// ---------------------------------------------------------------- road data
const ROAD_TYPES = ['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'pedestrian',
  'footway', 'cycleway', 'path', 'steps', 'unclassified', 'living_street', 'track', 'motorway'];
const RT = {}; ROAD_TYPES.forEach((t, i) => (RT[t] = i));
const DRIVE = new Set([RT.motorway, RT.trunk, RT.primary, RT.secondary, RT.tertiary, RT.residential, RT.unclassified, RT.living_street]);
const MAJOR = new Set([RT.motorway, RT.trunk, RT.primary, RT.secondary, RT.tertiary]);
const ROADS = MAP.roads.map((r) => ({ type: r[0], w: r[1], name: r[2] >= 0 ? MAP.names[r[2]] : null, bridge: !!r[3], p: r.slice(4) }));

// ---------------------------------------------------------------- renderer + scene
// colour grade: a touch more saturation and contrast before the filmic curve (ACES alone washes the coast out)
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 ACESFilmicToneMapping( vec3 color ) {',
  'vec3 ACESFilmicToneMapping( vec3 color ) {\n\tfloat lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );\n\tcolor = max( mix( vec3( lum ), color, 1.18 ), 0.0 );\n\tcolor = pow( color, vec3( 1.06 ) ) * 1.04;');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('view').appendChild(renderer.domElement);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 4200);
scene.fog = new THREE.Fog(0xbfe3f2, 480, 1350); // the streamed world loads about 1.3 km around you
// the painted ground is soft up close: add fine grain (grass, bitumen) and larger patches, in world space so tiles match
function addGroundDetail(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vGroundXZ;
float gHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec2 w = vGroundXZ; float n = gNoise(w * 2.1) * 0.45 + gNoise(w * 0.27) * 0.35 + gNoise(w * 0.035) * 0.2;
  diffuseColor.rgb *= 0.84 + 0.32 * n; }`);
  };
  return mat;
}

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a8068, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 900 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- sky dome
const skyU = {
  top: { value: col('#3f8fd6') }, horizon: { value: col('#bfe3f2') }, bottom: { value: col('#8fb7c4') },
  sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: col('#fff2d0') }, time: { value: 0 }, cloud: { value: 1 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir; uniform float time; uniform float cloud; varying vec3 vDir;
    float cH(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
    float cN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cH(i), cH(i + vec2(1.0, 0.0)), f.x), mix(cH(i + vec2(0.0, 1.0)), cH(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, clamp(-h * 6.0, 0.0, 1.0));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      c += sunCol * (pow(s, 1200.0) * 8.0 + pow(s, 14.0) * 0.28);
      if (h > 0.01) { // fair-weather cumulus drifting off the sea, thinning towards the horizon
        vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.006, time * 0.002);
        float n = cN(uv) * 0.5 + cN(uv * 2.1) * 0.27 + cN(uv * 4.3) * 0.15 + cN(uv * 9.0) * 0.08;
        float k = smoothstep(0.52, 0.78, n) * smoothstep(0.01, 0.2, h) * cloud;
        vec3 lit = mix(horizon * 1.05, vec3(1.0), 0.75) * (0.75 + 0.35 * max(dot(normalize(sunDir), vec3(0.0, 1.0, 0.0)), 0.0)) + sunCol * pow(s, 6.0) * 0.4;
        c = mix(c, mix(lit * 0.82, lit, smoothstep(0.55, 0.9, n)), k * 0.9);
      }
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(3300, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
let envRT = null;
function refreshEnvironment() {
  const next = pmrem.fromScene(envScene, 0.02);
  scene.environment = next.texture;
  if (envRT) envRT.dispose();
  envRT = next;
}

// ---------------------------------------------------------------- canvas helpers (world metres -> pixels)
const GM = 0, GX0 = MINX - GM, GZ0 = MINZ - GM, GW = MAXX - MINX + 2 * GM, GH = MAXZ - MINZ + 2 * GM;
function worldCanvas(ppm) {
  const c = document.createElement('canvas');
  c.width = Math.round(GW * ppm); c.height = Math.round(GH * ppm);
  const x = c.getContext('2d');
  x.setTransform(ppm, 0, 0, ppm, -GX0 * ppm, -GZ0 * ppm);
  return [c, x];
}
function trace(ctx, f, close) {
  ctx.moveTo(f[0], f[1]);
  for (let i = 2; i < f.length; i += 2) ctx.lineTo(f[i], f[i + 1]);
  if (close) ctx.closePath();
}
function fillFeatures(ctx, list, color) {
  if (!list) return;
  ctx.fillStyle = color;
  for (const rings of list) { ctx.beginPath(); for (const r of rings) trace(ctx, r, true); ctx.fill('evenodd'); }
}
function strokeRoads(ctx, filter, widthFn, color) {
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of ROADS) {
    if (!filter(r)) continue;
    ctx.lineWidth = widthFn(r); ctx.beginPath(); trace(ctx, r.p, false); ctx.stroke();
  }
}
function fillWater(ctx, color) {
  ctx.fillStyle = color;
  for (const ring of MAP.ocean) { ctx.beginPath(); trace(ctx, ring, true); ctx.fill(); }
  fillFeatures(ctx, MAP.areas.water, color);
}
function coastLine(ring) { return ring.slice(0, ring.length - 4); } // last two points close the ocean to the east
const isPath = (r) => r.type === RT.footway || r.type === RT.path || r.type === RT.cycleway || r.type === RT.steps || r.type === RT.track;

function drawLayers(ctx, P, mini) {
  ctx.fillStyle = P.base; ctx.fillRect(GX0, GZ0, GW, GH);
  for (const k of ['residential', 'commercial', 'construction', 'grass', 'scrub', 'wood', 'park', 'pitch', 'parking', 'beach'])
    fillFeatures(ctx, MAP.areas[k], P[k]);
  if (!mini) {
    for (let i = 0; i < 110000; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      const s = 0.5 + rand() * 2.4;
      ctx.fillRect(GX0 + rand() * GW, GZ0 + rand() * GH, s, s);
    }
    ctx.strokeStyle = P.wet; ctx.lineWidth = 20; ctx.lineJoin = 'round';
    for (const ring of MAP.ocean) { ctx.beginPath(); trace(ctx, coastLine(ring), false); ctx.stroke(); }
  }
  strokeRoads(ctx, isPath, (r) => r.w + (mini ? 0 : 0.4), P.path);
  strokeRoads(ctx, (r) => r.type === RT.pedestrian, (r) => r.w, P.plaza);
  strokeRoads(ctx, (r) => DRIVE.has(r.type), (r) => r.w + 4.2, P.kerb);
  strokeRoads(ctx, (r) => DRIVE.has(r.type), (r) => r.w + 3.6, P.sidewalk);
  strokeRoads(ctx, (r) => r.type === RT.service, (r) => r.w + 1.2, P.sidewalk);
  fillFeatures(ctx, MAP.areas.pool, P.pool);
  if (mini) {
    ctx.fillStyle = P.building;
    for (const b of MAP.buildings) { ctx.beginPath(); trace(ctx, b.slice(3), true); ctx.fill(); }
    strokeRoads(ctx, (r) => r.type === RT.service, (r) => r.w, P.minor);
    strokeRoads(ctx, (r) => DRIVE.has(r.type) && !MAJOR.has(r.type), (r) => r.w + 1, P.minor);
    strokeRoads(ctx, (r) => MAJOR.has(r.type), (r) => r.w + 2, P.major);
  }
  if (!mini) ctx.globalCompositeOperation = 'destination-out';
  fillWater(ctx, P.water);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = P.pier; ctx.lineCap = 'butt';
  for (const pl of MAP.piers) { ctx.lineWidth = pl[0]; ctx.beginPath(); trace(ctx, pl.slice(1), false); ctx.stroke(); }
  fillFeatures(ctx, MAP.areas.pier, P.pier);
  if (mini) strokeRoads(ctx, (r) => r.bridge && (DRIVE.has(r.type) || r.type === RT.service), (r) => r.w + 1, P.minor);
}

// ---------------------------------------------------------------- ground
const GROUND_PAL = {
  base: '#9f9b88', residential: '#7a9157', commercial: '#a9a396', construction: '#94805f', grass: '#6f8f4c',
  scrub: '#6c7a47', wood: '#466b34', park: '#618843', pitch: '#56893e', parking: '#5e5e5c', beach: '#dcc897',
  wet: '#b9a67b', path: '#bdb4a0', plaza: '#c2b59b', kerb: '#85817a', sidewalk: '#b4ae9f', pool: '#3aa9c9',
  water: '#000', pier: '#a8977a',
};
let groundCanvas, groundMesh;
function buildGround() {
  const ppm = Math.min(4096 / GW, 4096 / GH);
  const [c, ctx] = worldCanvas(ppm);
  drawLayers(ctx, GROUND_PAL, false);
  groundCanvas = c;
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = MAX_ANISO;
  const mat = addGroundDetail(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.96, metalness: 0 }));
  const g = new THREE.PlaneGeometry(GW, GH);
  g.rotateX(-Math.PI / 2);
  groundMesh = new THREE.Mesh(g, mat);
  groundMesh.position.set(GX0 + GW / 2, 0, GZ0 + GH / 2);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}

// ---------------------------------------------------------------- water + surf
let waterMat, foamMat;
function makeWaveNormals() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  const H = (i, j) => {
    const u = (i / N) * TAU, v = (j / N) * TAU;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + Math.sin(v * 9 - u * 2) * 0.2;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = H(i + 1, j) - H(i - 1, j), dz = H(i, j + 1) - H(i, j - 1);
    const nx = -dx * 2.2, nz = -dz * 2.2, l = Math.hypot(nx, nz, 1);
    const k = (j * N + i) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(420, 420);
  return t;
}
function buildWater() {
  waterMat = new THREE.MeshStandardMaterial({ color: col('#1c8fb2'), roughness: 0.08, metalness: 0.1, normalMap: makeWaveNormals(), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1 });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), waterMat);
  w.rotation.x = -Math.PI / 2; w.position.set((MINX + MAXX) / 2, -0.55, (MINZ + MAXZ) / 2);
  w.receiveShadow = true;
  scene.add(w);

  // surf: a white foam band just offshore of the coastline
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 256;
  const fx = fc.getContext('2d');
  for (let j = 0; j < 256; j++) {
    const v = j / 256;
    const a = (Math.pow(Math.max(0, Math.sin(v * TAU * 3)), 6) * 0.9 + Math.pow(1 - v, 3) * 0.8) * (0.4 + 0.6 * (1 - v));
    fx.fillStyle = `rgba(255,255,255,${clamp(a, 0, 1).toFixed(3)})`; fx.fillRect(0, j, 64, 1);
  }
  const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  foamMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, color: col('#ffffff'), opacity: 0.8 });
  for (const ring of MAP.ocean) {
    const p = coastLine(ring), pos = [], uv = [];
    let acc = 0;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3];
      const L = Math.hypot(bx - ax, bz - az) || 1, rx = -(bz - az) / L, rz = (bx - ax) / L; // seaward = right of S->N
      const o0 = 2, o1 = 46;
      const A0 = [ax + rx * o0, az + rz * o0], A1 = [ax + rx * o1, az + rz * o1], B0 = [bx + rx * o0, bz + rz * o0], B1 = [bx + rx * o1, bz + rz * o1];
      const u0 = acc / 30, u1 = (acc + L) / 30; acc += L;
      pos.push(A0[0], -0.4, A0[1], B0[0], -0.4, B0[1], B1[0], -0.4, B1[1], A0[0], -0.4, A0[1], B1[0], -0.4, B1[1], A1[0], -0.4, A1[1]);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, foamMat); m.renderOrder = 2;
    foamMat.side = THREE.DoubleSide;
    scene.add(m);
  }
}

// ---------------------------------------------------------------- masks (land/water, plantable)
const MPPM = 0.5;
let MW = 0, MH = 0, landMask = null, plantMask = null;
function readMask(c, ctx) {
  const d = ctx.getImageData(0, 0, c.width, c.height).data, out = new Uint8Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] > 127 ? 1 : 0;
  return out;
}
function buildMasks() {
  const [c, ctx] = worldCanvas(MPPM);
  MW = c.width; MH = c.height;
  ctx.fillStyle = '#fff'; ctx.fillRect(GX0, GZ0, GW, GH);
  fillWater(ctx, '#000');
  strokeRoads(ctx, (r) => r.bridge, (r) => r.w + 2, '#fff');
  ctx.strokeStyle = '#fff';
  for (const pl of MAP.piers) { ctx.lineWidth = pl[0]; ctx.beginPath(); trace(ctx, pl.slice(1), false); ctx.stroke(); }
  fillFeatures(ctx, MAP.areas.pier, '#fff');
  landMask = readMask(c, ctx);

  ctx.fillStyle = '#000'; ctx.fillRect(GX0, GZ0, GW, GH);
  for (const k of ['residential', 'park', 'grass', 'wood', 'scrub']) fillFeatures(ctx, MAP.areas[k], '#fff');
  strokeRoads(ctx, () => true, (r) => r.w + 5, '#000');
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  for (const b of MAP.buildings) { ctx.beginPath(); trace(ctx, b.slice(3), true); ctx.fill(); ctx.stroke(); }
  fillFeatures(ctx, MAP.areas.pool, '#000');
  fillFeatures(ctx, MAP.areas.pitch, '#000');
  fillWater(ctx, '#000');
  plantMask = readMask(c, ctx);
}
function maskAt(mask, x, z) {
  const i = Math.floor((x - GX0) * MPPM), j = Math.floor((z - GZ0) * MPPM);
  if (i < 0 || j < 0 || i >= MW || j >= MH) return 1;
  return mask[j * MW + i];
}
const inCore = (x, z) => x >= MINX && x <= MAXX && z >= MINZ && z <= MAXZ;
const isLand = (x, z) => (inCore(x, z) ? maskAt(landMask, x, z) === 1 : tileIsLand(x, z));
// street furniture (lamp posts, poles) belongs beside the carriageway, never on it
const CARRIAGEWAY = new Set([0, 1, 2, 3, 4, 5, 11, 12, 14]); // road types cars use, driveways and car-park lanes included
function onCarriageway(roads, x, z, pad = 0.5) {
  for (const r of roads) {
    if (!CARRIAGEWAY.has(r[0])) continue;
    const hw = r[1] / 2 + pad;
    for (let i = 4; i < r.length - 2; i += 2) {
      const ax = r[i], az = r[i + 1], ex = r[i + 2] - ax, ez = r[i + 3] - az;
      if (Math.abs(x - ax) > 40 + Math.abs(ex) || Math.abs(z - az) > 40 + Math.abs(ez)) continue;
      const L2 = ex * ex + ez * ez || 1, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
      if (Math.hypot(x - ax - ex * t, z - az - ez * t) < hw) return true;
    }
  }
  return false;
}
// the nearest spot just off the road, or null when there's no room (a lamp in the middle of an intersection)
function besideRoad(roads, x, z) {
  if (!onCarriageway(roads, x, z)) return [x, z];
  for (const d of [1.5, 3, 4.5, 6]) for (let a = 0; a < 8; a++) {
    const px = x + Math.cos(a * Math.PI / 4) * d, pz = z + Math.sin(a * Math.PI / 4) * d;
    if (!onCarriageway(roads, px, pz)) return [px, pz];
  }
  return null;
}

// ---------------------------------------------------------------- collision grid (building walls, trunks, poles)
const CELL = 16;
const gridMap = new Map();
let SEG = [], segStamp = null, stampId = 1;
const cellKey = (i, j) => (i + 500) * 2000 + (j + 500);
function addSeg(ax, az, bx, bz, h) {
  const id = SEG.length / 5;
  SEG.push(ax, az, bx, bz, h);
  const i0 = Math.floor(Math.min(ax, bx) / CELL), i1 = Math.floor(Math.max(ax, bx) / CELL);
  const j0 = Math.floor(Math.min(az, bz) / CELL), j1 = Math.floor(Math.max(az, bz) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = cellKey(i, j); let a = gridMap.get(k); if (!a) gridMap.set(k, (a = [])); a.push(id);
  }
}
function addBox(x, z, half, h) {
  addSeg(x - half, z - half, x + half, z - half, h); addSeg(x + half, z - half, x + half, z + half, h);
  addSeg(x + half, z + half, x - half, z + half, h); addSeg(x - half, z + half, x - half, z - half, h);
}
function finishGrid() { SEG = new Float32Array(SEG); segStamp = new Int32Array(SEG.length / 5); CORE_GRID.segs = SEG; CORE_GRID.stamp = segStamp; }
// collision grids: the Surfers core, plus one per streamed tile (added and removed as tiles load)
const CORE_GRID = { segs: null, cells: gridMap, stamp: null, stampId: 1, x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9 };
const GRIDS = [CORE_GRID];
function makeGrid(flatSegs, x0, z0, x1, z1) {
  const G = { segs: new Float32Array(flatSegs), cells: new Map(), stamp: new Int32Array(flatSegs.length / 5), stampId: 1, x0, z0, x1, z1 };
  for (let id = 0; id < flatSegs.length / 5; id++) {
    const o = id * 5, ax = flatSegs[o], az = flatSegs[o + 1], bx = flatSegs[o + 2], bz = flatSegs[o + 3];
    for (let i = Math.floor(Math.min(ax, bx) / CELL); i <= Math.floor(Math.max(ax, bx) / CELL); i++)
      for (let j = Math.floor(Math.min(az, bz) / CELL); j <= Math.floor(Math.max(az, bz) / CELL); j++) {
        const k = cellKey(i, j); let c = G.cells.get(k); if (!c) G.cells.set(k, (c = [])); c.push(id);
      }
  }
  return G;
}
// call fn(segs, offset) once for every wall segment near the box
function forSegs(x0, z0, x1, z1, fn) {
  const ax = Math.min(x0, x1), az = Math.min(z0, z1), bx = Math.max(x0, x1), bz = Math.max(z0, z1);
  const i0 = Math.floor(ax / CELL), i1 = Math.floor(bx / CELL), j0 = Math.floor(az / CELL), j1 = Math.floor(bz / CELL);
  for (const G of GRIDS) {
    if (!G.segs || bx < G.x0 || ax > G.x1 || bz < G.z0 || az > G.z1) continue;
    const st = ++G.stampId;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = G.cells.get(cellKey(i, j)); if (!c) continue;
      for (const id of c) if (G.stamp[id] !== st) { G.stamp[id] = st; fn(G.segs, id * 5); }
    }
  }
}
// ---------------------------------------------------------------- street furniture a car can knock over
// lamp posts and bins are instances in shared meshes; a hard hit hides the instance, drops its collision and
// swaps in a loose copy that topples (posts) or tumbles away (bins)
const BREAKABLES = [], LOOSE = [];
const _bm = new THREE.Matrix4(), _bzero = new THREE.Matrix4().makeScale(0, 0, 0);
function addBreakable(x, z, parts, h, kind, tile) { BREAKABLES.push({ x, z, parts, h, kind, tile, broken: false }); }
// clear the small collision boxes (posts, bins) standing at a point
function knockWalls(x, z, r) {
  forSegs(x - r, z - r, x + r, z + r, (S, o) => {
    if (Math.abs(S[o] - S[o + 2]) > 1.2 || Math.abs(S[o + 1] - S[o + 3]) > 1.2) return;
    if (Math.hypot((S[o] + S[o + 2]) / 2 - x, (S[o + 1] + S[o + 3]) / 2 - z) > r) return;
    S[o] = S[o + 2] = 1e7; S[o + 1] = S[o + 3] = 1e7;
  });
}
// called for a fast car just before it resolves walls: anything in its path breaks instead of stopping it
function hitBreakables(c) {
  const sp = c.speed; if (sp < 7) return;
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  for (const b of BREAKABLES) {
    if (b.broken || Math.abs(b.x - c.x) > 5 || Math.abs(b.z - c.z) > 5) continue;
    if (!c.offs.some((s) => Math.hypot(c.x + fx * s - b.x, c.z + fz * s - b.z) < c.r + 0.35)) continue;
    b.broken = true; knockWalls(b.x, b.z, 0.7);
    const gy = groundAt(b.x, b.z), g = new THREE.Group(); g.position.set(b.x, gy, b.z);
    for (const [m, k] of b.parts) {
      m.getMatrixAt(k, _bm); const piece = new THREE.Mesh(m.geometry, m.material); piece.applyMatrix4(_bm); piece.position.x -= b.x; piece.position.y -= gy; piece.position.z -= b.z;
      piece.castShadow = true; g.add(piece); m.setMatrixAt(k, _bzero); m.instanceMatrix.needsUpdate = true;
    }
    scene.add(g);
    const ux = c.vx / sp, uz = c.vz / sp;
    LOOSE.push({ g, kind: b.kind, axis: new THREE.Vector3(uz, 0, -ux), ang: 0, av: 1.5 + sp * 0.12, vx: c.vx * (b.kind === 'bin' ? 0.9 : 0.25), vz: c.vz * (b.kind === 'bin' ? 0.9 : 0.25), vy: b.kind === 'bin' ? 3 + sp * 0.15 : 0, y: 0, t: 0 });
    c.vx *= b.kind === 'bin' ? 0.93 : 0.72; c.vz *= b.kind === 'bin' ? 0.93 : 0.72; c.health -= b.kind === 'bin' ? 1 : 5;
    if (c === player.car) { shake = Math.min(1, shake + (b.kind === 'bin' ? 0.1 : 0.35)); sfxNoise(0.35, b.kind === 'bin' ? 900 : 300, 0.5); }
  }
}
function updateLoose(dt) {
  for (let q = LOOSE.length - 1; q >= 0; q--) {
    const L = LOOSE[q]; L.t += dt;
    if (L.kind === 'bin') { // thrown: flies, bounces, rolls to a stop
      L.vy -= 20 * dt; L.y += L.vy * dt; L.ang += L.av * 3 * dt;
      if (L.y < 0) { L.y = 0; L.vy = Math.abs(L.vy) > 1.5 ? -L.vy * 0.35 : 0; L.vx *= 0.7; L.vz *= 0.7; L.av *= 0.7; }
    } else if (L.ang < Math.PI / 2) { // toppling: gravity speeds it up the further it leans
      L.av += (2 + 9 * Math.sin(L.ang)) * dt; L.ang = Math.min(Math.PI / 2, L.ang + L.av * dt);
      if (L.ang >= Math.PI / 2 && L.av > 1) { L.av = 0; sfxNoise(0.2, 500, 0.25); }
    }
    const fr = Math.exp(-(L.kind === 'bin' && L.y > 0 ? 0.2 : 2.5) * dt); L.vx *= fr; L.vz *= fr;
    L.g.position.x += L.vx * dt; L.g.position.z += L.vz * dt; L.g.position.y = groundAt(L.g.position.x, L.g.position.z) + L.y;
    L.g.quaternion.setFromAxisAngle(L.axis, L.ang);
    if (L.t > 40) { scene.remove(L.g); LOOSE.splice(q, 1); }
  }
}
function querySegs(x0, z0, x1, z1) { // core grid only (kept for older callers)
  qbuf.length = 0; stampId++;
  const i0 = Math.floor(Math.min(x0, x1) / CELL), i1 = Math.floor(Math.max(x0, x1) / CELL);
  const j0 = Math.floor(Math.min(z0, z1) / CELL), j1 = Math.floor(Math.max(z0, z1) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = gridMap.get(cellKey(i, j)); if (!a) continue;
    for (const id of a) if (segStamp[id] !== stampId) { segStamp[id] = stampId; qbuf.push(id); }
  }
  return qbuf;
}
const qbuf = [];
const hitRes = { x: 0, z: 0, nx: 0, nz: 0, hit: false };
let _rc = null;
function resolveCircle(x, z, r) {
  const st = (_rc = _rc || { px: 0, pz: 0, nx: 0, nz: 0, hit: false, r: 0 });
  st.px = x; st.pz = z; st.nx = 0; st.nz = 0; st.hit = false; st.r = r;
  for (let pass = 0; pass < 2; pass++) forSegs(x - r, z - r, x + r, z + r, pushOut);
  const nl = Math.hypot(st.nx, st.nz) || 1;
  hitRes.x = st.px; hitRes.z = st.pz; hitRes.nx = st.nx / nl; hitRes.nz = st.nz / nl; hitRes.hit = st.hit;
  return st.hit;
}
function pushOut(S, o) {
  const st = _rc, r = st.r, ax = S[o], az = S[o + 1], bx = S[o + 2], bz = S[o + 3];
  const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
  const t = clamp(((st.px - ax) * ex + (st.pz - az) * ez) / L2, 0, 1);
  let dx = st.px - (ax + ex * t), dz = st.pz - (az + ez * t); const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  let d = Math.sqrt(d2);
  if (d < 1e-5) { const L = Math.sqrt(L2); dx = ez / L; dz = -ex / L; d = 0; } else { dx /= d; dz /= d; }
  const pen = r - d;
  st.px += dx * pen; st.pz += dz * pen; st.nx += dx; st.nz += dz; st.hit = true;
}
function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}
// first wall hit along a->b (fraction 0..1), or 1 if clear; walls lower than minH are ignored
function rayWalls(ax, az, bx, bz, minH) {
  let best = 1;
  forSegs(ax, az, bx, bz, (S, o) => {
    if (S[o + 4] < minH) return;
    const t = segIntersect(ax, az, bx, bz, S[o], S[o + 1], S[o + 2], S[o + 3]);
    if (t >= 0 && t < best) best = t;
  });
  return best;
}

// ---------------------------------------------------------------- geometry helpers
function triInto(B, a, b, c, ny) { // a,b,c = [x,y,z]; flips winding so the face normal points along +y*ny
  const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  if ((cy > 0) !== (ny > 0)) { const t = b; b = c; c = t; }
  B.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}
function ribbonInto(B, p, off, hw, y, vScale, uScale) {
  const n = p.length / 2; if (n < 2) return;
  let acc = 0, pL = null, pR = null, pv = 0;
  for (let i = 0; i < n; i++) {
    const x = p[2 * i], z = p[2 * i + 1];
    const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
    let tx = p[2 * ib] - p[2 * ia], tz = p[2 * ib + 1] - p[2 * ia + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;
    let m = 1;
    if (i > 0 && i < n - 1) {
      let sx = p[2 * i] - p[2 * i - 2], sz = p[2 * i + 1] - p[2 * i - 1]; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      m = 1 / Math.max(0.45, nx * sz - nz * sx);
    }
    if (i > 0) acc += Math.hypot(x - p[2 * i - 2], z - p[2 * i - 1]);
    const cx = x + nx * off * m, cz = z + nz * off * m;
    const L = [cx + nx * hw * m, y, cz + nz * hw * m], R = [cx - nx * hw * m, y, cz - nz * hw * m];
    const v = acc / vScale;
    if (pL) {
      const s = B.pos.length;
      triInto(B, pL, L, pR, 1); triInto(B, pR, L, R, 1);
      // uvs follow vertex positions (winding may have been swapped)
      for (let k = s; k < B.pos.length; k += 3) {
        const vx = B.pos[k], vz = B.pos[k + 2];
        const isL = (Math.abs(vx - L[0]) < 1e-4 && Math.abs(vz - L[2]) < 1e-4) || (Math.abs(vx - pL[0]) < 1e-4 && Math.abs(vz - pL[2]) < 1e-4);
        const isNew = (Math.abs(vx - L[0]) < 1e-4 && Math.abs(vz - L[2]) < 1e-4) || (Math.abs(vx - R[0]) < 1e-4 && Math.abs(vz - R[2]) < 1e-4);
        B.uv.push(isL ? 0 : uScale, isNew ? v : pv);
      }
    }
    pL = L; pR = R; pv = v;
  }
}
function discInto(B, x, z, r, y, uScale) {
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
    triInto(B, [x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], 1);
    B.uv.push(uScale / 2, 0, 0, 0, uScale, 0);
  }
}
function wallInto(B, ax, az, bx, bz, y0, y1, nx, nz, color) {
  const A0 = [ax, y0, az], B0 = [bx, y0, bz], B1 = [bx, y1, bz], A1 = [ax, y1, az];
  for (const [a, b, c] of [[A0, B0, B1], [A0, B1, A1]]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cxn = uy * vz - uz * vy, czn = ux * vy - uy * vx;
    const flip = cxn * nx + czn * nz < 0;
    const t = flip ? [a, c, b] : [a, b, c];
    for (const q of t) { B.pos.push(q[0], q[1], q[2]); B.nor.push(nx, 0, nz); if (color) B.col.push(color.r, color.g, color.b); }
  }
}
function toGeometry(B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  if (B.nor && B.nor.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
  else { const n = new Float32Array(B.pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); }
  if (B.uv && B.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
  if (B.col && B.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  g.computeBoundingSphere();
  return g;
}
const newBuf = () => ({ pos: [], uv: [], nor: [], col: [] });

// ---------------------------------------------------------------- road meshes
function noiseTexture(size, base, spread, specks) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, size, size);
  for (let i = 0; i < specks; i++) {
    const v = Math.floor(rr(-spread, spread));
    x.fillStyle = v > 0 ? `rgba(255,255,255,${(v / 255).toFixed(3)})` : `rgba(0,0,0,${(-v / 255).toFixed(3)})`;
    x.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  return t;
}
let lampMat;
function buildRoads() {
  const asphalt = noiseTexture(256, '#57595d', 40, 9000);
  const mk = (color, po) => new THREE.MeshStandardMaterial({ map: asphalt, color: col(color), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po * 2 });
  const sets = [
    { f: (r) => r.type === RT.service, y: 0.03, mat: mk('#d6d6d6', -1) },
    { f: (r) => DRIVE.has(r.type) && !MAJOR.has(r.type), y: 0.045, mat: mk('#ffffff', -2) },
    { f: (r) => MAJOR.has(r.type), y: 0.06, mat: mk('#f2f2f2', -3) },
  ];
  for (const S of sets) {
    const B = newBuf();
    for (const r of ROADS) {
      if (!S.f(r)) continue;
      const hw = r.w / 2, us = r.w / 6;
      ribbonInto(B, r.p, 0, hw, S.y, 6, us);
      const n = r.p.length;
      discInto(B, r.p[0], r.p[1], hw, S.y, us);
      discInto(B, r.p[n - 2], r.p[n - 1], hw, S.y, us);
    }
    const m = new THREE.Mesh(toGeometry(B), S.mat); m.receiveShadow = true; scene.add(m);
  }

  // lane markings from the drivable graph
  const dc = document.createElement('canvas'); dc.width = 4; dc.height = 64;
  const dx = dc.getContext('2d'); dx.fillStyle = '#000'; dx.fillRect(0, 0, 4, 64); dx.fillStyle = '#fff'; dx.fillRect(0, 0, 4, 16);
  const dashTex = new THREE.CanvasTexture(dc); dashTex.wrapS = dashTex.wrapT = THREE.RepeatWrapping;
  const lineMat = (alpha) => new THREE.MeshStandardMaterial({ color: col('#f1efe6'), roughness: 0.7, alphaMap: alpha || null, alphaTest: alpha ? 0.5 : 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const solid = newBuf(), dashed = newBuf();
  for (const E of EDGES) {
    const p = E.p, w = E.width, lw = 0.07;
    if (E.type === RT.residential || E.type === RT.living_street || E.type === RT.unclassified || w < 6) continue;
    if (!E.oneway) {
      if (E.type === RT.tertiary) ribbonInto(dashed, p, 0, lw, 0.075, 12, 1);
      else { ribbonInto(solid, p, 0.16, lw, 0.075, 12, 1); ribbonInto(solid, p, -0.16, lw, 0.075, 12, 1); }
    } else if (E.lanes > 1) {
      const lwid = w / E.lanes;
      for (let k = 1; k < E.lanes; k++) ribbonInto(dashed, p, -w / 2 + k * lwid, lw, 0.075, 12, 1);
    }
    if (E.type === RT.trunk || E.type === RT.primary || E.type === RT.secondary) {
      ribbonInto(solid, p, w / 2 - 0.35, lw, 0.075, 12, 1); ribbonInto(solid, p, -w / 2 + 0.35, lw, 0.075, 12, 1);
    }
  }
  buildRoadIndex(); buildCrossings(solid);
  scene.add(new THREE.Mesh(toGeometry(solid), lineMat(null)));
  scene.add(new THREE.Mesh(toGeometry(dashed), lineMat(dashTex)));

  // bridge decks: side walls and parapets
  const concrete = new THREE.MeshStandardMaterial({ color: col('#bdb8ad'), roughness: 0.9, side: THREE.DoubleSide });
  const BB = newBuf();
  for (const r of ROADS) {
    if (!r.bridge) continue;
    const p = r.p, hw = r.w / 2 + (DRIVE.has(r.type) ? 1.8 : 0.2);
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (const s of [1, -1]) {
        const ox = nx * hw * s, oz = nz * hw * s;
        wallInto(BB, ax + ox, az + oz, bx + ox, bz + oz, -1.6, 0.06, nx * s, nz * s);
        wallInto(BB, ax + ox, az + oz, bx + ox, bz + oz, 0.06, 1.0, -nx * s, -nz * s);
      }
    }
    if (DRIVE.has(r.type)) { // footpaths on the deck
      const B2 = newBuf();
      ribbonInto(B2, p, 0, r.w / 2 + 1.8, 0.02, 6, 1);
      const m = new THREE.Mesh(toGeometry(B2), concrete); m.receiveShadow = true; scene.add(m);
    }
  }
  scene.add(new THREE.Mesh(toGeometry(BB), concrete));
}

// ---------------------------------------------------------------- traffic graph
const GN = MAP.graph.nodes;
const EDGES = MAP.graph.edges.map((e) => {
  const p = e.slice(7), cum = [0];
  for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  return { a: e[0], b: e[1], oneway: !!e[2], lanes: Math.max(1, e[3] || 1), name: e[4] >= 0 ? MAP.names[e[4]] : null, type: e[5], width: e[6], p, cum, len: cum[cum.length - 1] };
}).filter((E) => E.len > 0.5);
const ADJ = new Map();
const LIVE_EDGES = EDGES.map((_, i) => i); // indices of loaded roads (streamed tiles add and remove theirs)
EDGES.forEach((E, i) => {
  const push = (n, o) => { let a = ADJ.get(n); if (!a) ADJ.set(n, (a = [])); a.push(o); };
  push(E.a, { e: i, dir: 1 });
  if (!E.oneway) push(E.b, { e: i, dir: -1 });
});
// point on edge at distance s measured in the direction of travel
const _ep = { x: 0, z: 0, tx: 0, tz: 1 };
function edgePoint(E, dir, s, out = _ep) {
  const L = E.len; let d = dir > 0 ? s : L - s; d = clamp(d, 0, L);
  const cum = E.cum, p = E.p;
  let i = 0; while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i] || 1, t = (d - cum[i]) / seg;
  const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3];
  out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t;
  const l = Math.hypot(bx - ax, bz - az) || 1;
  out.tx = ((bx - ax) / l) * dir; out.tz = ((bz - az) / l) * dir;
  return out;
}
// distance along edge (in travel direction) of the closest point to x,z
function projectOnEdge(E, dir, x, z) {
  const p = E.p; let best = 1e18, bs = 0;
  for (let i = 0; i < p.length / 2 - 1; i++) {
    const ax = p[2 * i], az = p[2 * i + 1], ex = p[2 * i + 2] - ax, ez = p[2 * i + 3] - az, L2 = ex * ex + ez * ez || 1;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), cx = ax + ex * t, cz = az + ez * t;
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < best) { best = d; bs = E.cum[i] + Math.sqrt(L2) * t; }
  }
  return dir > 0 ? bs : E.len - bs;
}
const ANY_EDGE = () => true; // nearestEdge filter that includes GPS-only links
function nearestEdge(x, z, filter) {
  let best = 1e18, be = -1, bs = 0;
  for (let i = 0; i < EDGES.length; i++) {
    const E = EDGES[i]; if (!E || (E.gps && filter !== ANY_EDGE) || (filter && !filter(E))) continue; // GPS-only links are for routing, not traffic
    const p = E.p;
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const ax = p[2 * k], az = p[2 * k + 1], ex = p[2 * k + 2] - ax, ez = p[2 * k + 3] - az, L2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), cx = ax + ex * t, cz = az + ez * t;
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < best) { best = d; be = i; bs = E.cum[k] + Math.sqrt(L2) * t; }
    }
  }
  return { e: be, s: bs, d: Math.sqrt(best) };
}

// ---------------------------------------------------------------- buildings
const BTILE = 320;
let winTex = {}, buildingMats = {};
function windowTextures() {
  const finish = (c, e) => {
    const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
    for (const q of [t, te]) { q.wrapS = q.wrapT = THREE.RepeatWrapping; q.encoding = THREE.sRGBEncoding; q.anisotropy = MAX_ANISO; }
    return [t, te];
  };
  const canvases = (w, h, base) => {
    const c = document.createElement('canvas'), e = document.createElement('canvas');
    c.width = e.width = w; c.height = e.height = h;
    const x = c.getContext('2d'), ex = e.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, w, h); ex.fillStyle = '#000'; ex.fillRect(0, 0, w, h);
    return [c, e, x, ex];
  };
  const litColour = () => (rand() < 0.75 ? `rgb(255,${200 + Math.floor(rand() * 40)},${120 + Math.floor(rand() * 60)})` : 'rgb(190,215,255)');
  const glassGrad = (x, y0, h, tint) => { const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#b4cad4'); g.addColorStop(0.35, tint); g.addColorStop(1, '#2c3d47'); return g; };
  const make = (kind) => {
    const S = 512, cell = 64;
    const [c, e, x, ex] = canvases(S, S, kind === 'grid' ? '#ece6da' : '#f3f0ea');
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const X = i * cell, Y = j * cell, lit = rand() < 0.38, lc = litColour();
      if (kind === 'low') {
        if (rand() < 0.25) continue;
        const wx = X + 18, wy = Y + 14, ww = 28, wh = 26;
        x.fillStyle = '#e9e5dc'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        x.fillStyle = glassGrad(x, wy, wh, '#5f7684'); x.fillRect(wx, wy, ww, wh);
        x.fillStyle = '#e9e5dc'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (lit) { ex.fillStyle = lc; ex.fillRect(wx, wy, ww, wh); }
      } else if (kind === 'grid') { // punched windows in rendered concrete, 70s and 80s towers
        for (const k of [0, 1]) {
          const wx = X + 6 + k * 30, wy = Y + 12, ww = 22, wh = 34;
          x.fillStyle = glassGrad(x, wy, wh, pick(['#55707e', '#4a6270', '#6b5f4f'])); x.fillRect(wx, wy, ww, wh);
          x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(wx, wy + wh, ww, 3);
          if (lit && rand() < 0.7) { ex.fillStyle = lc; ex.fillRect(wx, wy, ww, wh); }
        }
      } else if (kind === 'balcony') { // deep white balcony slabs with glass rails, very Surfers
        const gh = cell - 18;
        x.fillStyle = glassGrad(x, Y, gh, pick(['#4f6b7a', '#5e7d8c', '#46606e'])); x.fillRect(X, Y, cell, gh);
        x.fillStyle = 'rgba(180,215,225,0.55)'; x.fillRect(X, Y + gh - 16, cell, 16);
        x.fillStyle = '#ffffff'; x.fillRect(X, Y + gh, cell, 18);
        x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(X, Y + gh + 14, cell, 4);
        x.fillStyle = 'rgba(20,30,36,0.5)'; x.fillRect(X + cell - 3, Y, 3, gh);
        if (lit) { ex.fillStyle = lc; ex.fillRect(X + 4, Y + 3, cell - 10, gh - 20); }
      } else {
        const slab = kind === 'glass' ? 6 : 15, gh = cell - slab;
        const tint = kind === 'glass' ? ['#6fa1b8', '#5f93ad', '#7bb0c2'] : ['#5b7686', '#4c6676', '#6a8796', '#56707a'];
        x.fillStyle = glassGrad(x, Y, gh, pick(tint)); x.fillRect(X, Y, cell, gh);
        if (kind !== 'glass' && rand() < 0.2) { x.fillStyle = 'rgba(236,226,205,0.75)'; x.fillRect(X + 4, Y + 4, cell / 2 - 6, gh - 8); }
        x.fillStyle = 'rgba(20,30,36,0.55)'; x.fillRect(X, Y, 2, gh); x.fillRect(X + cell / 2, Y, 2, gh);
        if (kind !== 'glass') { x.fillStyle = 'rgba(240,240,236,0.9)'; x.fillRect(X, Y + gh - 9, cell, 2); }
        if (lit) { ex.fillStyle = lc; ex.fillRect(X + 3, Y + 2, cell - 6, gh - 12); }
      }
    }
    return finish(c, e);
  };
  for (const k of ['low', 'tower', 'glass', 'grid', 'balcony']) winTex[k] = make(k);
  // ground-floor shopfronts: 4 bays of 4m, one 4m storey (glass, doors, a fascia band on top)
  const [c, e, x, ex] = canvases(512, 128, '#e8e3d8');
  for (let i = 0; i < 4; i++) {
    const X = i * 128;
    x.fillStyle = '#d9d2c4'; x.fillRect(X, 0, 128, 30);
    const g = x.createLinearGradient(0, 30, 0, 128); g.addColorStop(0, '#7d929c'); g.addColorStop(1, '#27323a');
    x.fillStyle = g; x.fillRect(X + 6, 34, 116, 94);
    x.fillStyle = 'rgba(255,240,210,0.18)'; x.fillRect(X + 10, 60, 108, 60);
    x.fillStyle = '#3a3f44'; x.fillRect(X + 6, 34, 116, 4); x.fillRect(X + 62, 34, 4, 94);
    if (i % 2 === 0) { x.fillStyle = '#1f272c'; x.fillRect(X + 70, 70, 40, 58); }
    ex.fillStyle = `rgb(255,${215 + Math.floor(rand() * 30)},${160 + Math.floor(rand() * 50)})`; ex.fillRect(X + 8, 40, 112, 86);
  }
  winTex.shop = finish(c, e);
  winTex.shop[0].wrapT = winTex.shop[1].wrapT = THREE.ClampToEdgeWrapping;
}
const WALLS = {
  0: ['#f2ede3', '#e9dcc5', '#dccdb6', '#f5f0e6', '#d3dadd', '#efe2cf', '#e7d9c9', '#cfd8cf'],
  1: ['#f4f2ec', '#e8e4da', '#e1e8ec', '#f0e7d8', '#d2dde1', '#ece9e2', '#f2e6cf', '#dfe3e8', '#e9d7c4'],
  2: ['#dcd5c8', '#c9cdcf', '#e8e0d0', '#d6cfc2', '#e3d3bd'],
  3: ['#8c9196'], 4: ['#c9c4b8', '#b9b4a8'], 5: ['#eef4f7'],
};
const STYLE_TINTS = {
  tower: ['#ffffff', '#f2f0ea', '#e6edf2', '#f4ead8', '#dde6ea'],
  balcony: ['#ffffff', '#f7f5ef', '#eef3f6'],
  grid: ['#efe6d6', '#e8dcc6', '#dcd6cc', '#e9d2b8', '#d9ccb6', '#f0eadf', '#cfc3b0'],
  glass: ['#ffffff', '#e9f3f7', '#d9ecef', '#f3efe6'],
};
const ROOFS_HOUSE = ['#a4553b', '#8a4b38', '#5c5f63', '#7d8288', '#b36a46', '#9a9d9f'];
const SHOP_H = 4.0;
function buildBuildings() {
  windowTextures();
  for (const k of ['low', 'tower', 'glass', 'grid', 'balcony', 'shop']) {
    buildingMats[k] = new THREE.MeshStandardMaterial({ map: winTex[k][0], emissiveMap: winTex[k][1], emissive: col('#ffffff'), emissiveIntensity: 0, vertexColors: true, roughness: k === 'glass' ? 0.25 : 0.72, metalness: k === 'glass' ? 0.35 : 0.05 });
  }
  buildingMats.plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const shopFront = new Set(), FRONTS = new Map(); // building:edge -> walk-in openings [t0, t1]
  for (const s of MAP.details.signs) {
    shopFront.add(s[8]);
    if (s[12] > 0) { const k = s[8] + ':' + s[9]; if (!FRONTS.has(k)) FRONTS.set(k, []); FRONTS.get(k).push([s[10], s[11]]); }
  }
  const tiles = new Map();
  const buf = (cx, cz, cls) => {
    const k = Math.floor(cx / BTILE) + ':' + Math.floor(cz / BTILE) + ':' + cls;
    let b = tiles.get(k); if (!b) tiles.set(k, (b = Object.assign(newBuf(), { cls }))); return b;
  };
  const brand = mulberry32(99);
  const V2 = THREE.Vector2;
  MAP.buildings.forEach((b, bi) => {
    const kind = b[2], f = b.slice(3), n = f.length / 2;
    let h = b[0];
    const mh = b[1];
    if (kind === 6) { Q1_FOOT = f; return; } // Q1 gets its own model
    let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += f[2 * i]; cz += f[2 * i + 1]; } cx /= n; cz /= n;
    const r1 = brand(), r2 = brand();
    let cls = 'low';
    if (kind === 3 || kind === 4) cls = 'plain';
    else if (kind === 5) cls = 'glass';
    else if (h >= 11) cls = h > 70 && r1 < 0.3 ? 'glass' : r1 < 0.4 ? 'tower' : r1 < 0.72 ? 'balcony' : r1 < 0.92 ? 'grid' : 'glass';
    if (MAP.details.bnames[bi] === 'Soul') cls = 'balcony'; // Soul: white balconies all the way up
    const tints = STYLE_TINTS[cls];
    const wall = col(tints ? tints[Math.floor(r2 * tints.length)] : pick(WALLS[kind] || WALLS[1]));
    const roof = col(kind === 0 ? ROOFS_HOUSE[Math.floor(brand() * ROOFS_HOUSE.length)] : cls === 'plain' ? '#8f9498' : pick(['#b4b3ad', '#a9a8a2', '#c2bfb6']));
    const shop = shopFront.has(bi) && mh < 1 && cls !== 'plain';
    const W = buf(cx, cz, cls), R = buf(cx, cz, 'plain'), S = shop ? buf(cx, cz, 'shop') : null;
    const shopTint = col(pick(['#ffffff', '#f3ecdf', '#e5ecef', '#efe2d2']));
    const cu = 32, cv = cls === 'low' ? 24 : 25.6; // 8 cells of 4m, 3m or 3.2m floors
    const wallBase = shop ? Math.min(h, SHOP_H) : mh;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const ax = f[2 * i], az = f[2 * i + 1], bx = f[(2 * i + 2) % (2 * n)], bz = f[(2 * i + 3) % (2 * n)];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      const uvFor = (B, s0, fu, fv) => { for (let k = s0; k < B.pos.length; k += 3) { const along = Math.abs(B.pos[k] - ax) + Math.abs(B.pos[k + 2] - az) < 1e-4 ? 0 : L; B.uv.push(fu(acc + along), fv(B.pos[k + 1])); } };
      const fronts = (FRONTS.get(bi + ':' + i) || []).slice().sort((p, q) => p[0] - q[0]);
      const ex = (bx - ax) / L, ez = (bz - az) / L;
      if (shop) {
        // shop band, with walk-in openings left out (the glass, door and room are built in shops.js)
        let from = 0;
        const band = (t0, t1, y0, y1) => {
          if (t1 - t0 < 0.01) return;
          const s0 = S.pos.length; wallInto(S, ax + ex * t0, az + ez * t0, ax + ex * t1, az + ez * t1, y0, y1, nx, nz, shopTint);
          for (let k = s0; k < S.pos.length; k += 3) { const along = Math.hypot(S.pos[k] - ax, S.pos[k + 2] - az); S.uv.push((acc + along) / 16, (S.pos[k + 1] - mh) / SHOP_H); }
        };
        const top = Math.min(h, SHOP_H);
        for (const [t0, t1] of fronts) { band(from, t0, mh, top); if (top > 3.6) band(t0, t1, 3.6, top); from = t1; }
        band(from, L, mh, top);
      }
      if (h > wallBase + 0.05) {
        const s0 = W.pos.length;
        wallInto(W, ax, az, bx, bz, wallBase, h, nx, nz, wall);
        if (cls !== 'plain') uvFor(W, s0, (u) => u / cu, (y) => y / cv);
      }
      acc += L;
      if (mh < 2.5 && h > 1.2 && (cls !== 'plain' || kind === 4)) {
        // leave a doorway in the middle of each walk-in shopfront
        let from = 0;
        for (const [t0, t1] of fronts) { const c = (t0 + t1) / 2; addSeg(ax + ex * from, az + ez * from, ax + ex * (c - 0.85), az + ez * (c - 0.85), h); from = c + 0.85; }
        addSeg(ax + ex * from, az + ez * from, bx, bz, h);
      }
    }
    const contour = []; for (let i = 0; i < n; i++) contour.push(new V2(f[2 * i], f[2 * i + 1]));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { tris = []; }
    for (const t of tris) {
      const A = [f[2 * t[0]], h, f[2 * t[0] + 1]], Bv = [f[2 * t[1]], h, f[2 * t[1] + 1]], C = [f[2 * t[2]], h, f[2 * t[2] + 1]];
      triInto(R, A, Bv, C, 1); for (let q = 0; q < 3; q++) { R.nor.push(0, 1, 0); R.col.push(roof.r, roof.g, roof.b); }
      if (mh > 0.5) { triInto(R, [A[0], mh, A[2]], [Bv[0], mh, Bv[2]], [C[0], mh, C[2]], -1); for (let q = 0; q < 3; q++) { R.nor.push(0, -1, 0); R.col.push(roof.r * 0.7, roof.g * 0.7, roof.b * 0.7); } }
    }
    if (h > 30 && n >= 4 && cls !== 'glass') {
      const s = Math.min(6, Math.sqrt(Math.abs(polyArea(f))) * 0.18);
      boxInto(R, cx, h, cz, s, 3.2, s, roof);
    }
    // a lit crown band on the taller towers, so the skyline reads at night
    if (h > 90) CROWNS.push({ f, h, cx, cz });
  });
  for (const b of tiles.values()) {
    const m = new THREE.Mesh(toGeometry(b), buildingMats[b.cls]);
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
}
let Q1_FOOT = null;
const CROWNS = [];
function polyArea(f) { let a = 0; const n = f.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += f[2 * i] * f[2 * j + 1] - f[2 * j] * f[2 * i + 1]; } return a / 2; }
function boxInto(B, x, y, z, sx, sy, sz, c) {
  const hx = sx / 2, hz = sz / 2;
  const pts = [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az);
    wallInto(B, ax, az, bx, bz, y, y + sy, (bz - az) / L, -(bx - ax) / L, c);
  }
  triInto(B, [x - hx, y + sy, z - hz], [x + hx, y + sy, z - hz], [x + hx, y + sy, z + hz], 1);
  triInto(B, [x - hx, y + sy, z - hz], [x + hx, y + sy, z + hz], [x - hx, y + sy, z + hz], 1);
  for (let q = 0; q < 6; q++) { B.nor.push(0, 1, 0); B.col.push(c.r, c.g, c.b); }
}

// ---------------------------------------------------------------- trees and street furniture
let PALM_GEOS = null;
function palmGeometries() {
  if (PALM_GEOS) return PALM_GEOS;
  const trunk = new THREE.CylinderGeometry(0.15, 0.26, 1, 7, 8, true);
  trunk.translate(0, 0.5, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + 0.9 * y * y); }
  trunk.computeVertexNormals();
  const B = { pos: [], col: [] };
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * TAU + rr(-0.15, 0.15), lift = rr(-0.25, 0.35), len = rr(2.8, 3.6);
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    let prev = null;
    for (let k = 0; k <= 7; k++) {
      const s = k / 7, r = s * len, y = (0.55 + lift) * s * 1.6 - 1.9 * s * s;
      const w = 0.62 * Math.sin(Math.PI * Math.min(1, s * 1.1 + 0.05));
      const C = [dx * r, y, dz * r], Lp = [C[0] + px * w, y - 0.18 * w, C[2] + pz * w], Rp = [C[0] - px * w, y - 0.18 * w, C[2] - pz * w];
      if (prev) {
        const quads = [[prev.L, prev.C, C, Lp], [prev.C, prev.R, Rp, C]];
        for (const [p0, p1, p2, p3] of quads) {
          B.pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
          const g = 0.75 + 0.25 * s;
          for (let q = 0; q < 6; q++) B.col.push(0.16 * g, 0.36 * g, 0.12 * g);
        }
      }
      prev = { C, L: Lp, R: Rp };
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  crown.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  crown.computeVertexNormals();
  return (PALM_GEOS = [trunk, crown]);
}
function buildTrees() {
  const spots = [], taken = new Map();
  const ok = (x, z, minGap) => {
    const i = Math.floor(x / 4), j = Math.floor(z / 4);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const s = taken.get(a * 100000 + b);
      if (s && Math.abs(s[0] - x) < minGap && Math.abs(s[1] - z) < minGap) return false;
    }
    taken.set(i * 100000 + j, [x, z]);
    return true;
  };
  for (const [x, z, k] of MAP.details.trees) { ok(x, z, 0.5); spots.push([x, z, k]); } // recorded trees, exact spots
  // palms along the Esplanade (seaward side) and the big boulevards
  for (const r of ROADS) {
    if (!r.name) continue;
    const esp = r.name === 'The Esplanade' || r.name === 'Esplanade';
    const blvd = r.name === 'Surfers Paradise Boulevard' || r.name === 'Gold Coast Highway' || r.name === 'Cavill Avenue' || r.name === 'Orchid Avenue';
    if (!esp && !blvd) continue;
    const p = r.p; let acc = 0, next = rr(2, 8);
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3], L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      while (next < acc + L) {
        const t = (next - acc) / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const sides = esp ? [Math.sign(nx || 1)] : [1, -1];
        for (const s of sides) {
          const off = r.w / 2 + (esp ? 6 : 2.6), px = x + nx * off * s, pz = z + nz * off * s;
          if (isLand(px, pz) && ok(px, pz, 4)) spots.push([px, pz, 1]);
        }
        next += esp ? rr(9, 14) : rr(16, 30);
      }
      acc += L;
    }
  }
  let tries = 0;
  while (spots.length < 1700 && tries++ < 60000) {
    const x = rr(MINX, MAXX), z = rr(MINZ, MAXZ);
    if (!maskAt(plantMask, x, z) || !ok(x, z, 3.5)) continue;
    spots.push([x, z, rand() < 0.55 ? 1 : 0]);
  }
  const palms = spots.filter((s) => s[2] === 1), leafy = spots.filter((s) => s[2] === 0);
  const [trunkG, crownG] = palmGeometries();
  const trunkM = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: col('#8b7a62'), roughness: 0.95 }), palms.length);
  const crownM = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), palms.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  palms.forEach(([x, z], i) => {
    const H = rr(6.5, 12.5), a = rr(0, TAU);
    e.set(0, a, 0); q.setFromEuler(e);
    m4.compose(v.set(x, 0, z), q, sc.set(1, H, 1)); trunkM.setMatrixAt(i, m4);
    const tx = x + Math.cos(-a) * 0.9, tz = z + Math.sin(-a) * 0.9; // the trunk leans 0.9m along its local +x
    e.set(0, rr(0, TAU), 0); q.setFromEuler(e);
    const s = rr(0.85, 1.15);
    m4.compose(v.set(tx, H, tz), q, sc.set(s, s, s)); crownM.setMatrixAt(i, m4);
    addBox(x, z, 0.22, H);
  });
  trunkM.castShadow = crownM.castShadow = true;
  scene.add(trunkM, crownM);

  const ico = new THREE.IcosahedronGeometry(1, 1);
  const ip = ico.attributes.position;
  for (let i = 0; i < ip.count; i++) { // same bump for every copy of a shared corner, so faces stay joined
    const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i);
    const k = 0.88 + 0.24 * (Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 0.5 + 0.5);
    ip.setXYZ(i, x * k, y * k, z * k);
  }
  ico.computeVertexNormals();
  const tr2 = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); tr2.translate(0, 0.5, 0);
  const lt = new THREE.InstancedMesh(tr2, new THREE.MeshStandardMaterial({ color: col('#6b5844') }), leafy.length);
  const lc = new THREE.InstancedMesh(ico, new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: 0.9, flatShading: true }), leafy.length);
  const greens = ['#4e7d36', '#5a8a3c', '#3f6e2f', '#6b9046', '#567f3a'].map(col);
  leafy.forEach(([x, z], i) => {
    const H = rr(2.2, 4.5), R = rr(1.8, 3.4);
    m4.compose(v.set(x, 0, z), q.identity(), sc.set(1, H, 1)); lt.setMatrixAt(i, m4);
    e.set(rr(0, 1), rr(0, TAU), 0); q.setFromEuler(e);
    m4.compose(v.set(x, H + R * 0.55, z), q, sc.set(R, R * rr(0.7, 0.95), R)); lc.setMatrixAt(i, m4);
    lc.setColorAt(i, pick(greens));
    addBox(x, z, 0.2, H);
  });
  lt.castShadow = lc.castShadow = true;
  scene.add(lt, lc);
}
function buildStreetLights() {
  const spots = [];
  for (const E of EDGES) {
    if (!MAJOR.has(E.type) || E.len < 20) continue;
    for (let s = 12; s < E.len - 6; s += 38) {
      const P = edgePoint(E, 1, s, {}), nx = P.tz, nz = -P.tx, side = (Math.floor(s / 38) % 2 ? 1 : -1);
      const off = E.width / 2 + 1.0;
      const x = P.x + nx * off * side, z = P.z + nz * off * side;
      if (!isLand(x, z)) continue;
      spots.push([x, z, Math.atan2(-nx * side, -nz * side)]);
    }
  }
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 8, 6); pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 2.0); arm.translate(0, 7.9, 1.0);
  const head = new THREE.BoxGeometry(0.34, 0.12, 0.7); head.translate(0, 7.85, 1.9);
  const metal = new THREE.MeshStandardMaterial({ color: col('#9aa1a6'), metalness: 0.6, roughness: 0.4 });
  lampMat = new THREE.MeshStandardMaterial({ color: col('#e9e6da'), emissive: col('#ffd59a'), emissiveIntensity: 0 });
  const meshes = [new THREE.InstancedMesh(pole, metal, spots.length), new THREE.InstancedMesh(arm, metal, spots.length), new THREE.InstancedMesh(head, lampMat, spots.length)];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z, a], i) => {
    e.set(0, a, 0); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, one);
    for (const m of meshes) m.setMatrixAt(i, m4);
    addBox(x, z, 0.14, 8);
  });
  meshes[0].castShadow = true;
  for (const m of meshes) scene.add(m);
}

// ---------------------------------------------------------------- landmarks: the Surfers Paradise sign and lifeguard towers
function textTexture(text, w, h, bg, fg, font) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return t;
}
function buildLandmarks() {
  const red = new THREE.MeshStandardMaterial({ color: col('#d9412b') }), yel = new THREE.MeshStandardMaterial({ color: col('#f2c230') }), leg = new THREE.MeshStandardMaterial({ color: col('#c8c3b8') });
  for (const [x, z] of MAP.towers) {
    const g = new THREE.Group();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), leg); m.position.set(a * 1.1, 1.2, b * 1.1); g.add(m); }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 2.6), yel); hut.position.y = 3.4; hut.castShadow = true; g.add(hut);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 3.0), red); roof.position.y = 4.5; g.add(roof);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5), leg); flagPole.position.set(1.2, 5.7, 1.2); g.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: col('#e23b2a'), side: THREE.DoubleSide })); flag.position.set(1.65, 6.6, 1.2); g.add(flag);
    g.position.set(x, 0, z); scene.add(g);
    addBox(x, z, 1.3, 4);
  }
}
