// ============================================================================
// Gold Coast Streets — grass up close: clumps of blades over lawns, parks, verges and bush within a few dozen
// metres of you, swaying in the breeze. Where it grows comes from the painted ground (green means grass), with
// buildings, roads and water masked out; each clump takes its colour from the ground under it so it blends in.
// High and Ultra graphics only.
// ============================================================================
const GRASS = { mesh: null, meshes: null, show: 0, job: null, cx: 1e9, cz: 1e9, t: 0, core: null };
const GRASS_MAX = 60000, GRASS_PPM = 0.512; // grass mask: 512 px per 1 km tile
const GRASS_GEO = (() => { // nine thin leaning blades; normals point up so a clump is lit like the lawn it stands on
  const pos = [], colr = [], nor = [], r = mulberry32(7);
  for (let k = 0; k < 9; k++) {
    const a = r() * TAU, rad = r() * 0.2, h = 0.18 + r() * 0.26, w = 0.035 + r() * 0.025, lean = 0.08 + r() * 0.14;
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad, px = -Math.sin(a) * w, pz = Math.cos(a) * w, tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    colr.push(0.55, 0.62, 0.48, 0.55, 0.62, 0.48, 1.1, 1.2, 0.95); // darker at the root, sunlit at the tip
    for (let q = 0; q < 3; q++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
})();
const GRASS_MAT = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0 });
  m.onBeforeCompile = (sh) => { // the tips move, the roots stay put
    sh.uniforms.windT = TREE_WIND;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float windT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27; float w = sin(windT * 1.9 + ph) * 0.7 + sin(windT * 3.7 + ph * 2.3) * 0.3;
  float k = position.y * position.y * 1.6; transformed.x += w * k * 0.35; transformed.z += w * k * 0.2; }`);
    // both faces of a blade are lit like the lawn (normals up), instead of the back face going black
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize( vNormal );\nvec3 geometryNormal = normal;');
  };
  return m;
})();
// the green mask for a streamed tile, from its painted ground; called by tileGround
function tileGrassMask(T, data, groundCanvas) {
  const N = Math.round(REGION.tile * GRASS_PPM), c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(groundCanvas, 0, 0, N, N);
  x.setTransform(GRASS_PPM, 0, 0, GRASS_PPM, -T.x0 * GRASS_PPM, -T.z0 * GRASS_PPM); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineCap = 'round';
  for (const b of data.buildings) { x.beginPath(); trace(x, b.slice(3), true); x.fill(); }
  for (const r of data.roads) { if (r[0] > 4 && r[0] !== 11 && r[0] !== 12 && r[0] !== 14 && r[1] < 2.5) continue; x.lineWidth = r[1] + 1.5; x.beginPath(); trace(x, r.slice(4), false); x.stroke(); }
  T.grass = x.getImageData(0, 0, N, N).data;
}
function coreGrassMask() {
  const ppm = 0.5, [c, x] = worldCanvas(ppm); x.drawImage(groundCanvas, GX0, GZ0, GW, GH);
  x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineCap = 'round';
  for (const b of MAP.buildings) { x.beginPath(); trace(x, b.slice(3), true); x.fill(); }
  for (const r of MAP.roads) { if (r[0] > 4 && r[0] !== 11 && r[0] !== 12 && r[0] !== 14 && r[1] < 2.5) continue; x.lineWidth = r[1] + 1.5; x.beginPath(); trace(x, r.slice(4), false); x.stroke(); }
  GRASS.core = { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, ppm };
}
// the ground colour where grass grows, or null for bare ground
const _gc = [0, 0, 0];
function grassAt(x, z) {
  let d, o;
  if (inCore(x, z)) {
    if (!GRASS.core) coreGrassMask();
    const C = GRASS.core, i = Math.floor((x - GX0) * C.ppm), j = Math.floor((z - GZ0) * C.ppm); if (i < 0 || j < 0 || i >= C.w || j >= C.h) return null;
    d = C.d; o = (j * C.w + i) * 4;
  } else {
    const T = REGION && tileAt(x, z); if (!T || !T.grass) return null;
    const N = Math.round(REGION.tile * GRASS_PPM), i = clamp(Math.floor((x - T.x0) * GRASS_PPM), 0, N - 1), j = clamp(Math.floor((z - T.z0) * GRASS_PPM), 0, N - 1);
    d = T.grass; o = (j * N + i) * 4;
  }
  const r = d[o], g = d[o + 1], b = d[o + 2], s = r + g + b;
  if (!(g > r + 4 && g > b + 10 && s > 110 && s < 600)) return null;
  _gc[0] = r / 255; _gc[1] = g / 255; _gc[2] = b / 255; return _gc;
}
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gv = new THREE.Vector3(), _gs = new THREE.Vector3(), _gcol = new THREE.Color();
function updateGrass(dt) {
  const R = GFX.cfg.grass, flying = player.plane && player.plane.alt > 25;
  if (!R || flying) { for (const m of GRASS.meshes || []) m.visible = false; GRASS.job = null; return; }
  if (!GRASS.meshes) { // two meshes: one on show while the other is filled in over a few frames
    GRASS.meshes = [0, 1].map(() => { const m = new THREE.InstancedMesh(GRASS_GEO, GRASS_MAT, GRASS_MAX); m.frustumCulled = false; m.receiveShadow = true; m.count = 0; m.visible = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS_MAX * 3).fill(0.4), 3); scene.add(m); return m; }); // colours exist before the first draw, or the shader is built without them
    GRASS.show = 0; GRASS.mesh = GRASS.meshes[0];
  }
  GRASS.meshes[GRASS.show].visible = true; GRASS.t -= dt;
  const px = player.x, pz = player.z;
  if (!GRASS.job && (GFX.rescatter || (Math.hypot(px - GRASS.cx, pz - GRASS.cz) > R * 0.22 && GRASS.t <= 0))) { // re-scatter after moving a fair way
    GFX.rescatter = false; GRASS.cx = px; GRASS.cz = pz; GRASS.t = 0.25;
    const s = R > 50 ? 0.5 : 0.56, n0 = Math.ceil(R / s);
    GRASS.job = { s, n0, i: -n0, n: 0, px, pz, R, gi0: Math.floor(px / s), gj0: Math.floor(pz / s), M: GRASS.meshes[1 - GRASS.show] };
  }
  const J = GRASS.job; if (!J) return;
  const t0 = performance.now(), M = J.M;
  for (; J.i <= J.n0 && J.n < GRASS_MAX; J.i++) {
    if (performance.now() - t0 > 5) return; // about 5 ms a frame, then carry on next frame
    for (let j = -J.n0; j <= J.n0 && J.n < GRASS_MAX; j++) {
      const gi = J.gi0 + J.i, gj = J.gj0 + j;
      let h = Math.imul(gi, 73856093) ^ Math.imul(gj, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); // the same clump comes back in the same cell
      const r1 = ((h >>> 8) & 1023) / 1024, r2 = ((h >>> 18) & 1023) / 1024, r3 = (h & 255) / 256;
      if (r3 < 0.06) continue; // a few bare patches
      const x = (gi + r1) * J.s, z = (gj + r2) * J.s, d = Math.hypot(x - J.px, z - J.pz); if (d > J.R) continue;
      const c = grassAt(x, z); if (!c) continue;
      const sc = (0.7 + r3 * 0.7) * Math.min(1, (J.R - d) / 8);
      _ge.set(0, r1 * TAU, 0); _gq.setFromEuler(_ge); _gm.compose(_gv.set(x, groundAt(x, z), z), _gq, _gs.set(sc, sc * (0.8 + r2 * 0.5), sc));
      M.setMatrixAt(J.n, _gm); M.setColorAt(J.n, _gcol.setRGB(c[0] * 1.05, c[1] * 1.12, c[2] * 0.95).convertSRGBToLinear()); J.n++; // the painted ground is sRGB; lighting works in linear
    }
  }
  M.count = J.n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  GRASS.meshes[GRASS.show].visible = false; GRASS.show = 1 - GRASS.show; M.visible = true; GRASS.mesh = M; GRASS.job = null;
}
