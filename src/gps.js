// Gold Coast Streets — GPS: a yellow line along the roads to your waypoint (on the road, the minimap and the big map).
// The route covers the road network that has loaded around you; beyond it the line runs straight to the destination
// and fills in as you drive. X cancels the destination.
const GPS = { t: 0, mesh: null, path: null };
function clearGPS() {
  if (GPS.mesh) { scene.remove(GPS.mesh); GPS.mesh.geometry.dispose(); GPS.mesh = null; }
  GPS.path = null;
}
function cancelDestination() { if (!WAYPOINT) return; WAYPOINT = null; clearGPS(); toast('Destination cancelled'); }
function routeTo(tx, tz) {
  const ne = nearestEdge(player.x, player.z, ANY_EDGE);
  if (ne.e < 0 || !EDGES[ne.e]) return [[player.x, player.z], [tx, tz]];
  const E0 = EDGES[ne.e], N = GN.length / 2, d = new Float64Array(N).fill(1e9), prevE = new Int32Array(N).fill(-1), prevN = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  d[E0.a] = ne.s; d[E0.b] = E0.len - ne.s;
  const heap = [[d[E0.a], E0.a], [d[E0.b], E0.b]];
  const hpush = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let goal = -1, gd = Infinity;
  while (heap.length) {
    const [du, u] = hpop(); if (done[u] || du > d[u]) continue; done[u] = 1;
    const ex = Math.hypot(GN[2 * u] - tx, GN[2 * u + 1] - tz); if (ex < gd) { gd = ex; goal = u; }
    for (const o of (PADJ.get(u) || []).concat(GPS_ADJ.get(u) || [])) { const O = EDGES[o.e]; if (!O) continue; const v = o.dir > 0 ? O.b : O.a, nd = du + O.len; if (nd < d[v]) { d[v] = nd; prevE[v] = o.e; prevN[v] = u; hpush([nd, v]); } }
  }
  if (goal < 0) return [[player.x, player.z], [tx, tz]];
  const chain = []; for (let v = goal; prevN[v] >= 0; v = prevN[v]) chain.push([prevE[v], prevN[v], v]);
  chain.reverse();
  const pts = [[player.x, player.z]];
  const startNode = chain.length ? chain[0][1] : goal; // walk along the first road to the junction we start from
  const toB = startNode === E0.b, sp = E0.p;
  if (toB) { for (let q = 0; q < sp.length; q += 2) if (E0.cum[q / 2] > ne.s) pts.push([sp[q], sp[q + 1]]); }
  else { for (let q = sp.length - 2; q >= 0; q -= 2) if (E0.cum[q / 2] < ne.s) pts.push([sp[q], sp[q + 1]]); }
  for (const [ei, from] of chain) { const E = EDGES[ei], p = E.p, fwd = E.a === from; if (fwd) for (let q = 2; q < p.length; q += 2) pts.push([p[q], p[q + 1]]); else for (let q = p.length - 4; q >= 0; q -= 2) pts.push([p[q], p[q + 1]]); }
  pts.push([tx, tz]);
  return pts;
}
function drawGPS(path) {
  if (GPS.mesh) { scene.remove(GPS.mesh); GPS.mesh.geometry.dispose(); GPS.mesh = null; }
  const B = newBuf(), hw = 1.1;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue;
    const steps = Math.max(1, Math.ceil(L / 6)), nx = -(bz - az) / L * hw, nz = (bx - ax) / L * hw;
    for (let k = 0; k < steps; k++) {
      const x0 = ax + (bx - ax) * k / steps, z0 = az + (bz - az) * k / steps, x1 = ax + (bx - ax) * (k + 1) / steps, z1 = az + (bz - az) * (k + 1) / steps;
      const y0 = standAt(x0, z0) + 0.22, y1 = standAt(x1, z1) + 0.22;
      triInto(B, [x0 + nx, y0, z0 + nz], [x1 + nx, y1, z1 + nz], [x1 - nx, y1, z1 - nz], 1); triInto(B, [x0 + nx, y0, z0 + nz], [x1 - nx, y1, z1 - nz], [x0 - nx, y0, z0 - nz], 1);
    }
  }
  if (!B.pos.length) return;
  GPS.mesh = new THREE.Mesh(toGeometry(B), GPS_MAT); GPS.mesh.renderOrder = 3; GPS.mesh.frustumCulled = false; scene.add(GPS.mesh);
}
const GPS_MAT = new THREE.MeshBasicMaterial({ color: col('#ffd21f'), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function updateGPS(dt) {
  if (!WAYPOINT) { if (GPS.mesh || GPS.path) clearGPS(); return; }
  GPS.t -= dt; if (GPS.t > 0) return; GPS.t = 1.2;
  GPS.path = routeTo(WAYPOINT.x, WAYPOINT.z); drawGPS(GPS.path);
}
// the route on a 2D map: f maps world (x, z) to canvas coordinates
function strokeGPS(ctx, f, width) {
  if (!GPS.path || !WAYPOINT) return;
  ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath();
  GPS.path.forEach(([x, z], i) => { const [px, pz] = f(x, z); if (i) ctx.lineTo(px, pz); else ctx.moveTo(px, pz); }); ctx.stroke();
}
