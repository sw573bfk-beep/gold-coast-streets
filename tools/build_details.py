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

# ---- shop signs on facades, a walk-in shopfront behind each one
CATS = {'food': 0, 'cafe': 1, 'night': 2, 'shop': 3, 'hotel': 4, 'fun': 5, 'clothes': 6, 'service': 7, 'bank': 8}
def cat_of(t):
    a, s, tr, l = t.get('amenity'), t.get('shop'), t.get('tourism'), t.get('leisure')
    if a == 'bank': return 'bank'
    if s in ('clothes', 'shoes', 'boutique', 'department_store', 'sports', 'surf', 'swimwear', 'fashion_accessories'): return 'clothes'
    if a in ('restaurant', 'fast_food', 'ice_cream', 'food_court'): return 'food'
    if a in ('cafe',): return 'cafe'
    if a in ('bar', 'pub', 'nightclub', 'biergarten'): return 'night'
    if tr in ('hotel', 'motel', 'hostel', 'apartment', 'guest_house'): return 'hotel'
    if tr in ('attraction', 'museum') or l in ('amusement_arcade', 'escape_game', 'adult_gaming_centre') or a in ('cinema', 'theatre'): return 'fun'
    if s: return 'shop'
    if a in ('pharmacy', 'bank', 'post_office', 'police', 'clinic', 'doctors', 'dentist', 'car_rental'): return 'service'
    return None
SKIP_NAMES = {'Condom Kingdom'}
# real banks appear under made-up names (you can rob them in the game)
BANK_NAMES = {'BOQ': 'Paradise Savings Bank'}

items = []  # (x, z, cat, name)
for e in pois_raw:
    t = e.get('tags', {})
    name = t.get('name')
    if not name or name in SKIP_NAMES:
        continue
    c = cat_of(t)
    if not c:
        continue
    if c == 'bank':
        name = BANK_NAMES.get(name, 'Gold Coast Savings Bank')
    p = epos(e)
    if p and inside(p, 0):
        items.append((p[0], p[1], c, name))

# shops on Cavill that the map data is missing (from a Google Maps survey); placed by street number.
# Odd numbers are on the north side, even on the south, counting up westward from the beach.
cav = [(r[4 + i], r[5 + i]) for r in roads if r[2] >= 0 and names[r[2]] == 'Cavill Avenue' for i in range(0, len(r) - 4, 2)]
def cavill_z(x):
    best = min(cav, key=lambda q: abs(q[0] - x)) if cav else (x, 290)
    return best[1]
EXTRA = [('City Beach', 13, 'clothes'), ('Just In Paradise', 23, 'shop'), ('Ghanda', 25, 'clothes'), ('Pashin', 26, 'clothes'),
         ('Cotton On', 27, 'clothes'), ('Alcotraz', 29, 'night'), ('Creamy Italiano Gelato', 15, 'food'), ('Royal Copenhagen', 22, 'food'),
         ('El Camino Cantina', 'PC', 'food'), ('Pappa Flock', 'PC', 'food'), ('Ally Fashion', 'PC', 'clothes'), ('Kiki Koala Gifts', 'PC', 'shop'),
         ('Unique Trendz Boutique', 'PC', 'clothes'), ('Huntress Homewares', 'PC', 'shop'), ('Gelato Messina', 'PC', 'food'),
         ('Gold Coast Credit Union', 'PC', 'bank'), ('Goo-E', 'COC', 'food'), ('Kiki Koala Souvenirs', 23, 'shop')]
pc_i = 0
for name, num, c in EXTRA:
    if num == 'PC':  # Paradise Centre frontage on the south side of the mall
        x = 612 + (pc_i % 8) * 11; pc_i += 1; z = cavill_z(x) + 10
    elif num == 'COC':
        x, z = 380, 208
    else:
        x = 712 - 6.5 * num; z = cavill_z(x) + (-9 if num % 2 else 9)
    if any(n.lower().startswith(name.lower()[:8]) and math.hypot(px - x, pz - z) < 80 for px, pz, _, n in items):
        continue
    items.append((x, z, c, name))

# Ripley's moved into Soul's podium on the Cavill Mall corner; its Cargo Hold gift shop sits beside it
soul = None
mall_pts = [(r[4 + i], r[5 + i]) for r in roads if r[0] == ROAD_TYPES.index('pedestrian') and r[2] >= 0 and names[r[2]] == 'Cavill Avenue' for i in range(0, len(r) - 4, 2)]
for e in osm:
    t = e.get('tags', {})
    if e['type'] == 'way' and t.get('name') == 'Soul':
        g = ring_clean(geom(e)); cx = sum(q[0] for q in g) / len(g); cz = sum(q[1] for q in g) / len(g)
        dm = min(math.hypot(cx - a, cz - b) for a, b in mall_pts)
        if soul is None or dm < soul[2]: soul = (cx, cz, dm)
if mall_pts:
    # Soul's podium is the north-side frontage at the beach end of the mall
    ex_pt = max(mall_pts, key=lambda q: q[0])
    def mall_z(x): return min(mall_pts, key=lambda q: abs(q[0] - x))[1]
    items = [it for it in items if not it[3].startswith('Ripley')]
    items.insert(0, (ex_pt[0] - 22, mall_z(ex_pt[0] - 22) - 9, 'fun', 'Ripleys Believe it or Not'))
    items.insert(1, (ex_pt[0] - 34, mall_z(ex_pt[0] - 34) - 9, 'shop', "Ripley's Cargo Hold Gift Shop"))
    print('Ripleys at', [round(v) for v in items[0][:2]])

edge_used = {}   # (building, edge, row) -> [(t, w)]
front_used = {}  # (building, edge) -> [(t0, t1)] storefront openings
signs = []       # x, z, nx, nz, w, y, cat, name, building, edge, t0, t1, depth  (t0/t1/depth = 0 when no walk-in front)
clothes = []
free_signs = []
seen_names = set()

def inward_depth(pts, mx, mz, nx, nz):
    """how far you can go into the building from a facade point before leaving it"""
    best = 30.0
    ex, ez = mx - nx * 30, mz - nz * 30
    for k in range(len(pts)):
        ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
        rx, rz, sx, sz = ex - mx, ez - mz, bx - ax, bz - az
        den = rx * sz - rz * sx
        if abs(den) < 1e-9: continue
        t = ((ax - mx) * sz - (az - mz) * sx) / den
        u = ((ax - mx) * rz - (az - mz) * rx) / den
        if 0.02 < t <= 1 and 0 <= u <= 1:
            best = min(best, t * 30)
    return best

for px, pz, c, name in items:
    key = (name, round(px / 40), round(pz / 40))
    if key in seen_names:
        continue
    seen_names.add(key)
    bi = building_at(px, pz, 24)  # mall pins often sit in the middle of the walkway
    placed = False
    if bi >= 0:
        pts = bpolys[bi]
        cands = []
        for k in range(len(pts)):
            ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
            L = math.hypot(bx - ax, bz - az)
            if L < 2.5: continue
            nx, nz = (bz - az) / L, -(bx - ax) / L
            mx, mz = (ax + bx) / 2, (az + bz) / 2
            rd, rx, rz = nearest_road(mx + nx * 2, mz + nz * 2)
            if rd > 45 or (rx - mx) * nx + (rz - mz) * nz <= 0: continue
            cands.append((rd + 0.35 * seg_dist(px, pz, ax, az, bx, bz)[0], k, ax, az, bx, bz, L, nx, nz))
        cands.sort()
        for _, k, ax, az, bx, bz, L, nx, nz in cands[:3]:
            w = min(L - 0.4, max(1.8, 0.46 * len(name) + 1.0))
            if w < 1.2: continue
            ex, ez = (bx - ax) / L, (bz - az) / L
            t_pref = (px - ax) * ex + (pz - az) * ez
            rows = [3.4, 4.7] if buildings[bi][0] > 6.5 else [max(2.2, buildings[bi][0] - 0.6)]
            for y in rows:
                used = edge_used.setdefault((bi, k, y), [])
                # try positions along the facade, nearest to where the shop really is first
                for step in sorted(set([0] + [s * (w * 0.55) for s in range(-14, 15)]), key=abs):
                    t = max(w / 2 + 0.2, min(L - w / 2 - 0.2, t_pref + step))
                    if not all(abs(t - u0) > (w + uw) / 2 + 0.25 for u0, uw in used): continue
                    sx, sz = ax + ex * t + nx * 0.18, az + ez * t + nz * 0.18
                    if any(abs(q[2] * nx + q[3] * nz) > 0.8 and abs(q[5] - y) < 0.5 and math.hypot(q[0] - sx, q[1] - sz) < (w + q[4]) / 2 + 0.2 for q in signs): continue
                    used.append((t, w))
                    # walk-in shopfront under the lower sign row, if the facade below is free
                    t0 = t1 = depth = 0
                    if y == rows[0] and buildings[bi][1] < 1:
                        sw = max(3.6, min(9.0, w + 0.8))
                        a0, a1 = max(0.3, t - sw / 2), min(L - 0.3, t + sw / 2)
                        fu = front_used.setdefault((bi, k), [])
                        if a1 - a0 >= 3.2 and all(a1 <= f0 - 0.3 or a0 >= f1 + 0.3 for f0, f1 in fu):
                            dep = inward_depth(pts, ax + ex * (a0 + a1) / 2, az + ez * (a0 + a1) / 2, nx, nz)
                            if dep >= 3.5:
                                t0, t1, depth = a0, a1, min(8.0, dep - 0.4)
                                fu.append((a0, a1))
                    signs.append([round(sx, 2), round(sz, 2), round(nx, 3), round(nz, 3), round(w, 2), round(y, 2), CATS[c], name, bi, k, round(t0, 2), round(t1, 2), round(depth, 2)])
                    if c == 'clothes':
                        clothes.append([round(ax + ex * t + nx * 2.2, 2), round(az + ez * t + nz * 2.2, 2), name])
                    placed = True
                    break
                if placed: break
            if placed: break
    if not placed:  # a sign on a pole by the footpath, so nothing goes missing
        rd, rx, rz = nearest_road(px, pz)
        if rd < 60 and rd > 0.5:
            fx, fz = px + (rx - px) * max(0, (rd - 4) / rd), pz + (rz - pz) * max(0, (rd - 4) / rd)
        else:
            fx, fz = px, pz
        free_signs.append([round(fx, 2), round(fz, 2), CATS[c], name])
        if c == 'clothes':
            clothes.append([round(fx, 2), round(fz, 2), name])

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
mall = mall_pts
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

details = dict(dealers=dealers, bnames={i: n for i, n in enumerate(bnames) if n}, signs=signs, freeSigns=free_signs, towerSigns=tower_signs, clothes=clothes, trees=trees, props=props,
               crossings=crossings, rail=rail, railLines=rail_lines, stations=stations, spots=spots, heroes=heroes)
print('signs', len(signs), 'free', len(free_signs), 'tower signs', len(tower_signs), 'clothes', len(clothes), 'trees', len(trees),
      {k: len(v) for k, v in props.items()}, 'crossings', len(crossings), 'rail', len(rail), 'stations', stations, 'spots', list(spots), 'heroes', list(heroes))
