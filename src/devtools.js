// ============================================================================
// Gold Coast Streets — developer inspection mode (press ` to toggle).
// Shows shop names, IDs, source confidence and mall order over every entrance,
// building footprints, the Cavill Mall centreline, and an in-game order check.
// ============================================================================
const DEV = { on: false, group: null, labels: new Map(), lastX: 1e9, lastZ: 1e9, report: null };
const STATUS_COL = { verified: '#33d17a', unverified: '#f6c445', approximate: '#ff9a3c', fictional: '#c77dff', obsolete: '#888', duplicate: '#888' };
function devMeta(sh) { return (D.shopMeta && D.shopMeta[sh.id]) || ['unknown', '', '']; }
function devLabel(sh) {
  if (DEV.labels.has(sh.id)) return DEV.labels.get(sh.id);
  const [status, order, ref] = devMeta(sh);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,14,18,0.82)'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = STATUS_COL[status] || '#fff'; x.fillRect(0, 0, 10, 128);
  x.font = `700 34px ${FONT.cond}`; x.fillStyle = '#fff'; x.textBaseline = 'top'; x.fillText(((order ? order + ' · ' : '') + sh.name).slice(0, 34), 20, 8);
  x.font = `600 24px ${FONT.cond}`; x.fillStyle = STATUS_COL[status] || '#ccc';
  x.fillText(`${status}${sh.walkIn ? ' · walk-in' : ' · counter'} · ${sh.kind}`, 20, 50);
  x.fillStyle = '#9fb0b5'; x.fillText(`${sh.id}`.slice(0, 40), 20, 84);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false }));
  s.scale.set(4.8, 1.2, 1); s.renderOrder = 20;
  DEV.labels.set(sh.id, s); return s;
}
function devRebuild() {
  if (DEV.group) { scene.remove(DEV.group); DEV.group.traverse((o) => { if (o.geometry && o.isLine) o.geometry.dispose(); }); }
  const g = new THREE.Group(); DEV.group = g; scene.add(g);
  DEV.lastX = player.x; DEV.lastZ = player.z;
  // shop labels and entrance markers
  const pole = new THREE.CylinderGeometry(0.12, 0.12, 3, 6);
  for (const sh of SHOPS) {
    if (Math.abs(sh.x - player.x) > 110 || Math.abs(sh.z - player.z) > 110) continue;
    const [status] = devMeta(sh);
    const lbl = devLabel(sh); lbl.position.set(sh.dx, 5.6, sh.dz); g.add(lbl);
    const m = new THREE.Mesh(pole, new THREE.MeshBasicMaterial({ color: STATUS_COL[status] || '#fff', toneMapped: false })); m.position.set(sh.dx, 1.5, sh.dz); g.add(m);
  }
  // building footprints nearby (mall frontage terraces in cyan)
  const pos = [], cyan = [];
  MAP.buildings.forEach((b, bi) => {
    const f = b.slice(3), n = f.length / 2;
    if (Math.abs(f[0] - player.x) > 90 || Math.abs(f[1] - player.z) > 90) return;
    const target = (D.bnames[bi] || '').startsWith('Cavill Mall shopfronts') ? cyan : pos;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; target.push(f[2 * i], 0.25, f[2 * i + 1], f[2 * j], 0.25, f[2 * j + 1]); }
  });
  const lines = (arr, color) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 19; g.add(l); };
  lines(pos, 0xff4fd8); lines(cyan, 0x35c6cf);
  // the mall centreline with a tick every 10 m
  const mall = D.mall, ml = [];
  for (let i = 0; i < mall.length - 2; i += 2) ml.push(mall[i], 0.3, mall[i + 1], mall[i + 2], 0.3, mall[i + 3]);
  lines(ml, 0xffffff);
}
// project a point onto the mall: distance along it, side (+1 south, -1 north), distance from the centreline
function devMallProj(x, z) {
  const m = D.mall; let best = null, acc = 0;
  for (let i = 0; i < m.length - 2; i += 2) {
    const ax = m[i], az = m[i + 1], ex = m[i + 2] - ax, ez = m[i + 3] - az, L = Math.hypot(ex, ez);
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (L * L), 0, 1), d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    const side = ex * (z - az) - ez * (x - ax) > 0 ? 1 : -1;
    if (!best || d < best.d) best = { d, s: acc + t * L, side };
    acc += L;
  }
  return best;
}
// walk the mall in the running game: are the signs in the expected order on each side?
function devMallCheck() {
  const rows = { '-1': [], '1': [] }, issues = [];
  for (const sh of SHOPS) {
    const [, order] = devMeta(sh); if (!order) continue;
    const side = order[0] === 'S' ? 1 : -1, n = +order.slice(1), p = devMallProj(sh.x, sh.z);
    if (p.side !== side) issues.push(`${sh.name}: on the wrong side`);
    rows[side].push({ name: sh.name, n, s: p.s, id: sh.id, walkIn: sh.walkIn });
  }
  for (const k of ['-1', '1']) {
    const r = rows[k].sort((a, b) => a.s - b.s);
    r.forEach((q, i) => { if (q.n !== i + 1) issues.push(`${q.name}: expected #${q.n}, found #${i + 1} on the ${k === '1' ? 'south' : 'north'} side`); });
  }
  const signs = SHOPS.filter((s) => devMallProj(s.x, s.z).d < 20);
  for (let i = 0; i < signs.length; i++) for (let j = i + 1; j < signs.length; j++) if (Math.hypot(signs[i].x - signs[j].x, signs[i].z - signs[j].z) < 0.5) issues.push(`duplicate position: ${signs[i].name} / ${signs[j].name}`);
  DEV.report = { north: rows['-1'].map((q) => q.name), south: rows['1'].map((q) => q.name), issues };
  return DEV.report;
}
function devToggle() {
  DEV.on = !DEV.on;
  $('dev').hidden = !DEV.on;
  if (DEV.on) { devRebuild(); const r = devMallCheck(); console.table && console.log('[dev] Cavill Mall order check', r); toast(`Inspection mode on · mall order issues: ${r.issues.length}`); }
  else if (DEV.group) { scene.remove(DEV.group); DEV.group = null; }
}
function devUpdate() {
  if (!DEV.on) return;
  if (Math.hypot(player.x - DEV.lastX, player.z - DEV.lastZ) > 40) devRebuild();
  const p = devMallProj(player.x, player.z), near = SHOPS.reduce((a, s) => (Math.hypot(s.dx - player.x, s.dz - player.z) < (a ? Math.hypot(a.dx - player.x, a.dz - player.z) : 1e9) ? s : a), null);
  const [status, order, ref] = near ? devMeta(near) : ['', '', ''];
  $('dev').innerHTML = `<b>INSPECT</b> x ${player.x.toFixed(1)} · z ${player.z.toFixed(1)}<br>mall ${p.d < 25 ? `${p.s.toFixed(1)} m · ${p.side > 0 ? 'south' : 'north'} side` : '—'}<br>nearest: ${near ? `${near.name} (${order || 'off-mall'})<br>${near.id}<br>${status} · ${ref}` : '—'}<br>mall order issues: ${DEV.report ? DEV.report.issues.length : '?'} · draw calls ${renderer.info.render.calls}`;
}
window.gcsDev = { toggle: () => devToggle(), mallCheck: () => devMallCheck(), shop: (q) => SHOPS.filter((s) => s.name.toLowerCase().includes(String(q).toLowerCase()) || s.id === q) };
