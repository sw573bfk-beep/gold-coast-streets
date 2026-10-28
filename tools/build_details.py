# Street-level detail for the map: shop signs, tower name signs, trees, street furniture,
# traffic lights, crossings, the G:link tram line and landmark positions.
# Executed from build_map.py (shares its globals: proj, inside, roads, buildings, bpolys, bnames ...).

pois_raw = json.load(open(os.path.join(ROOT, 'data', 'pois.json')))['elements']
rail_raw = json.load(open(os.path.join(ROOT, 'data', 'rail.json')))['elements']

def epos(e):
    if e['type'] == 'node':
        return proj(e['lat'], e['lon'])
    c = e.get('center')
    return proj(c['lat'], c['lon']) if c else None

# ---- spatial helpers
GRID = 30
def gkey(x, z): return (int(math.floor(x / GRID)), int(math.floor(z / GRID)))

road_grid = {}
FRONT_TYPES = {ROAD_TYPES.index(t) for t in ('trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian', 'service')}
for r in roads:
    if r[0] not in FRONT_TYPES:
        continue
    p = r[4:]
    for i in range(0, len(p) - 2, 2):
        seg = (p[i], p[i + 1], p[i + 2], p[i + 3], r[0])
        for gx in range(int(math.floor(min(seg[0], seg[2]) / GRID)), int(math.floor(max(seg[0], seg[2]) / GRID)) + 1):
            for gz in range(int(math.floor(min(seg[1], seg[3]) / GRID)), int(math.floor(max(seg[1], seg[3]) / GRID)) + 1):
                road_grid.setdefault((gx, gz), []).append(seg)

def seg_dist(px, pz, ax, az, bx, bz):
    ex, ez = bx - ax, bz - az
    L2 = ex * ex + ez * ez or 1
    t = max(0, min(1, ((px - ax) * ex + (pz - az) * ez) / L2))
    cx, cz = ax + ex * t, az + ez * t
    return math.hypot(px - cx, pz - cz), cx, cz

def nearest_road(x, z, rad=2):
    gx, gz = gkey(x, z)
    best = (1e9, x, z)
    for a in range(gx - rad, gx + rad + 1):
        for b in range(gz - rad, gz + rad + 1):
            for s in road_grid.get((a, b), ()):
                d = seg_dist(x, z, *s[:4])
                if d[0] < best[0]:
                    best = d
    return best

exec(open(os.path.join(ROOT, 'tools', 'mall_frontage.py')).read())

bgrid = {}
for i, pts in enumerate(bpolys):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    for gx in range(int(math.floor(min(xs) / GRID)), int(math.floor(max(xs) / GRID)) + 1):
        for gz in range(int(math.floor(min(zs) / GRID)), int(math.floor(max(zs) / GRID)) + 1):
            bgrid.setdefault((gx, gz), []).append(i)

def building_at(x, z, maxd=14):
    """index of the building containing x,z, else the nearest within maxd (ground buildings only)"""
    gx, gz = gkey(x, z)
    best, bi = maxd, -1
    for a in range(gx - 1, gx + 2):
        for b in range(gz - 1, gz + 2):
            for i in bgrid.get((a, b), ()):
                if buildings[i][1] > 2.5 or buildings[i][0] < 2.5:
                    continue
                pts = bpolys[i]
                if pip((x, z), pts):
                    return i
                for k in range(len(pts)):
                    ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
                    d = seg_dist(x, z, ax, az, bx, bz)[0]
                    if d < best:
                        best, bi = d, i
    return bi

exec(open(os.path.join(ROOT, 'tools', 'shop_registry.py')).read())

# back-room gun dealers (made-up people, in service lanes behind the strip)
DEALER_NAMES = ["Shady Steve's back room", "Back-alley Barry", "Old Mate's lock-up", "Dodgy Dave's garage", "The Bait Shed (back room)"]
dealers = []
SERVICE = ROAD_TYPES.index('service')
for r in roads:
    if r[0] != SERVICE: continue
    p = r[4:]
    if len(p) < 4: continue
    mx, mz = (p[0] + p[-2]) / 2, (p[1] + p[-1]) / 2
    if not (150 < mx < 760 and -600 < mz < 900): continue
    if building_at(mx, mz, 0.5) >= 0: continue
    if all(math.hypot(mx - d0[0], mz - d0[1]) > 320 for d0 in dealers):
        dealers.append([round(mx, 1), round(mz, 1), DEALER_NAMES[len(dealers) % len(DEALER_NAMES)]])
    if len(dealers) >= 5: break
print('dealers', dealers)

# ---- names on top of towers
tower_signs = []
for i, nm in enumerate(bnames):
    h = buildings[i][0]
    if not nm or h < 24 or nm.startswith('Q1'):
        continue
    pts = bpolys[i]
    tedges = []
    for k in range(len(pts)):
        ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
        L = math.hypot(bx - ax, bz - az)
        if L > 6:
            tedges.append((L, ax, az, bx, bz))
    tedges.sort(reverse=True)
    chosen = []
    for L, ax, az, bx, bz in tedges:
        nx, nz = (bz - az) / L, -(bx - ax) / L
        if all(nx * c[0] + nz * c[1] < 0.3 for c in chosen):
            chosen.append((nx, nz))
            w = min(L * 0.75, 1.5 * len(nm) + 3)
            tower_signs.append([round((ax + bx) / 2 + nx * 0.2, 2), round((az + bz) / 2 + nz * 0.2, 2), round(nx, 3), round(nz, 3), round(w, 2), round(h - 3.5, 1), nm])
        if len(chosen) >= 3:
            break

# ---- trees: exact positions where OSM records them
coast_x = {}
for c in ocean:
    for i in range(0, len(c) - 4, 2):
        coast_x[round(c[i + 1] / 50)] = c[i]
trees = []
for e in pois_raw:
    t = e.get('tags', {})
    if t.get('natural') == 'tree':
        p = epos(e)
        if p and inside(p, 0):
            near_beach = p[0] > coast_x.get(round(p[1] / 50), 1e9) - 120
            leafy = t.get('leaf_type') == 'broadleaved'
            kind = 0 if leafy else (1 if near_beach or (int(e['id']) % 10) < 6 else 0)
            trees.append([round(p[0], 1), round(p[1], 1), kind])
for e in rail_raw:
    if e.get('tags', {}).get('natural') == 'tree_row':
        g = geom(e); acc = 0
        for i in range(len(g) - 1):
            L = math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]); s = 0
            while s < L:
                tt = s / L; trees.append([round(g[i][0] + (g[i + 1][0] - g[i][0]) * tt, 1), round(g[i][1] + (g[i + 1][1] - g[i][1]) * tt, 1), 1]); s += 8

# ---- street furniture, lights and crossings
props = {'lamp': [], 'bench': [], 'bin': [], 'shower': [], 'water': [], 'bus': [], 'signal': [], 'phone': []}
crossings = []
drive_types = {ROAD_TYPES.index(t) for t in ('trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street')}
for e in pois_raw:
    t = e.get('tags', {})
    p = epos(e)
    if not p or not inside(p, 0):
        continue
    hw, am = t.get('highway'), t.get('amenity')
    k = {'street_lamp': 'lamp', 'traffic_signals': 'signal', 'bus_stop': 'bus'}.get(hw) or {'bench': 'bench', 'waste_basket': 'bin', 'shower': 'shower', 'drinking_water': 'water', 'telephone': 'phone'}.get(am)
    if k:
        props[k].append([round(p[0], 1), round(p[1], 1)])
    if hw == 'crossing' and t.get('crossing') != 'unmarked':
        # orient across the drivable road it sits on
        gx, gz = gkey(*p); best = None
        for a in range(gx - 1, gx + 2):
            for b in range(gz - 1, gz + 2):
                for s in road_grid.get((a, b), ()):
                    if s[4] not in drive_types:
                        continue
                    d = seg_dist(p[0], p[1], *s[:4])
                    if d[0] < 1.5 and (best is None or d[0] < best[0]):
                        best = (d[0], s)
        if best:
            s = best[1]; ang = math.atan2(s[2] - s[0], s[3] - s[1])
            crossings.append([round(p[0], 1), round(p[1], 1), round(ang, 3), 1 if t.get('crossing') in ('zebra', 'marked', 'uncontrolled') or t.get('crossing_ref') == 'zebra' else 0])

# ---- G:link light rail and stations
rail = []
for e in rail_raw:
    t = e.get('tags', {})
    if t.get('railway') == 'light_rail':
        pts = [q for q in geom(e) if inside(q, 60)]
        if len(pts) > 1:
            rail.append(flat(simplify(pts, 0.2)))
# chain the track pieces into long continuous lines for the trams to run on
pieces = []
for e in rail_raw:
    if e.get('tags', {}).get('railway') == 'light_rail' and e.get('tags', {}).get('service') not in ('crossover', 'siding', 'yard'):
        g = [q for q in geom(e)]
        if len(g) > 1:
            pieces.append(g)
def close(a, b): return abs(a[0] - b[0]) < 0.6 and abs(a[1] - b[1]) < 0.6
lines = []
while pieces:
    cur = pieces.pop(0); grew = True
    while grew:
        grew = False
        for i, w in enumerate(pieces):
            if close(w[0], cur[-1]): cur = cur + w[1:]
            elif close(w[-1], cur[0]): cur = w + cur[1:]
            elif close(w[-1], cur[-1]): cur = cur + w[::-1][1:]
            elif close(w[0], cur[0]): cur = w[::-1] + cur[1:]
            else: continue
            pieces.pop(i); grew = True; break
    lines.append(cur)
def plen(g): return sum(math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]) for i in range(len(g) - 1))
lines.sort(key=plen, reverse=True)
rail_lines = [flat(simplify([q for q in g if inside(q, 200)], 0.2)) for g in lines[:2]]
print('rail lines', [round(plen(g)) for g in lines[:4]])
stations = []
for e in pois_raw:
    t = e.get('tags', {})
    if (t.get('railway') == 'station' or t.get('public_transport') == 'station') and t.get('name') and t.get('station') != 'bus' and 'Bus' not in t['name'] and 'Ferry' not in t['name'] and 'Greyhound' not in t['name']:
        p = epos(e)
        if p and inside(p, 0):
            stations.append([round(p[0], 1), round(p[1], 1), t['name']])

# ---- named attractions and artworks
spots = {}
for e in pois_raw + osm:
    t = e.get('tags', {})
    nm = t.get('name')
    if nm and (t.get('tourism') in ('attraction', 'artwork', 'museum', 'viewpoint') or t.get('leisure') == 'amusement_arcade'):
        p = epos(e) if e['type'] != 'way' or e.get('center') else None
        if p is None and e['type'] == 'way' and e.get('geometry'):
            g = geom(e); p = (sum(q[0] for q in g) / len(g), sum(q[1] for q in g) / len(g))
        if p and inside(p, 0) and nm not in SKIP_NAMES:
            spots.setdefault(nm, [round(p[0], 1), round(p[1], 1), t.get('artwork_type') or t.get('tourism') or t.get('leisure')])

# footprints of hero buildings for custom models
# when a name has several outlines, keep the one nearest the pedestrian mall (Cavill Mall for Timezone)
mall = MALL
def mall_dist(pts):
    cx = sum(q[0] for q in pts) / len(pts); cz = sum(q[1] for q in pts) / len(pts)
    return min(math.hypot(cx - mx, cz - mz) for mx, mz in mall) if mall else 0
heroes, hero_d = {}, {}
for e in osm:
    t = e.get('tags', {})
    if e['type'] == 'way' and t.get('name') in ('Timezone', 'Ripleys Believe it or Not', 'Infinity', 'Q1', 'Soul', 'Ocean by Meriton'):
        pts = ring_clean(geom(e)); d = mall_dist(pts)
        if t['name'] not in heroes or d < hero_d[t['name']]:
            heroes[t['name']] = flat(pts); hero_d[t['name']] = d
print('hero mall distances', {k: round(v) for k, v in hero_d.items()})

details = dict(shopMeta=shop_meta, mall=[round(v, 2) for q in MALL for v in q], dealers=dealers, bnames={i: n for i, n in enumerate(bnames) if n}, signs=signs, freeSigns=free_signs, towerSigns=tower_signs, clothes=clothes, trees=trees, props=props,
               crossings=crossings, rail=rail, railLines=rail_lines, stations=stations, spots=spots, heroes=heroes)
print('signs', len(signs), 'free', len(free_signs), 'tower signs', len(tower_signs), 'clothes', len(clothes), 'trees', len(trees),
      {k: len(v) for k, v in props.items()}, 'crossings', len(crossings), 'rail', len(rail), 'stations', stations, 'spots', list(spots), 'heroes', list(heroes))
