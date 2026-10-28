# Shop registry: one record per business with a stable ID, source, verification status and placement.
# The registry is the single source for signs, walk-in shopfronts, map markers and interaction triggers.
# Executed from build_details.py (shares its globals). Writes data/shops_registry.json.
import re
from urllib.parse import quote

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
    if a in ('pharmacy', 'post_office', 'police', 'clinic', 'doctors', 'dentist', 'car_rental'): return 'service'
    return None
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def norm(n):
    n = n.lower().replace("’", "'")
    n = re.sub(r"surfers paradise|gold coast|\(.*?\)|'s\b|the\b", '', n)
    return re.sub(r'[^a-z0-9]', '', n)

# Businesses seen on Google Maps listings (searches of Cavill Ave / Cavill Mall / Soul Boardwalk, 28 Oct 2026),
# plus ones the player confirmed in person (Timezone, Grill'd, Ripley's at Soul).
SURVEY = ["City Beach", "Universal Store", "Just In Paradise", "TGI Fridays", "La Playa Beach and Eats", "El Camino Cantina", "Vapiano",
          "Cavill Lane", "White Rhino Bar & Eats", "The Cavill Hotel", "Pappa Flock", "Milky Lane", "Hungry Jack's", "Wendy's", "Grill'd",
          "Guzman y Gomez", "Betty's Burgers", "Kiki Koala Gifts", "Australia the Gift", "Huntress Homewares", "Royal Gifts Tax Free", "GBO",
          "Finn McCool's", "Surfers Paradise Beergarden", "Alcotraz", "Cocktails Nightclub", "Unique Trendz Boutique", "Ghanda", "Pashin",
          "Cotton On", "Ally Fashion", "C9 Chocolate & Gelato", "Creamy Italiano Gelato", "Gelatissimo", "Royal Copenhagen", "Goo-E",
          "Gelato Messina", "Lik Lik Lik", "Ripley's Believe It or Not", "Hurricane's Grill", "Brazilian Flame", "Hog's Breath Cafe", "Timezone"]
SURVEY_N = [norm(s) for s in SURVEY]
def in_survey(n):
    nn = norm(n)
    return bool(nn) and any(len(s) > 3 and (s in nn or nn in s) for s in SURVEY_N)
SKIP_NAMES = {'Condom Kingdom'}
BANK_NAMES = {'BOQ': 'Paradise Savings Bank'}  # real bank locations appear under made-up names (they can be robbed)

def centroid_of(name):
    for e in osm:
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('name') == name and e.get('geometry'):
            g = geom(e); return (sum(q[0] for q in g) / len(g), sum(q[1] for q in g) / len(g))
    return None

registry = []
for e in pois_raw:
    t = e.get('tags', {})
    name = t.get('name')
    if not name or name in ('Condom Kingdom',):
        continue
    c = cat_of(t)
    if not c or name == 'Cavill Mall':  # the mall itself is not a business
        continue
    p = epos(e)
    if not p or not inside(p, 0):
        continue
    addr = ' '.join(x for x in [t.get('addr:unit') and 'Shop ' + t['addr:unit'] + '/', t.get('addr:housenumber'), t.get('addr:street')] if x).replace('/ ', '/') or None
    rec = dict(id='osm-%s-%s' % (e['type'], e['id']), name=name, category=c, x=round(p[0], 2), z=round(p[1], 2),
               address=addr, source={'kind': 'OpenStreetMap', 'ref': '%s/%s' % (e['type'], e['id']), 'url': 'https://www.openstreetmap.org/%s/%s' % (e['type'], e['id'])},
               status='verified' if in_survey(name) else 'unverified', note=None)
    if c == 'bank':
        rec.update(name=BANK_NAMES.get(name, 'Gold Coast Savings Bank'), status='fictional', note='Real bank location (%s) under a made-up name' % name)
    if re.search(r'\bclosed\b', name, re.I):
        rec.update(status='obsolete', note='Listing name says the business has closed')
    registry.append(rec)

# Businesses from the Google Maps survey that OSM is missing: placed from their street address only.
# Cavill Ave numbering runs west from the beach; odd numbers on the north side. Fitted to OSM points with
# known numbers (no. 3 at s=120 m, no. 15 at s=34 m along the mall): s = 141.5 - 7.17 * number.
PC = centroid_of('Paradise Centre'); COC = centroid_of('Circle on Cavill Shopping Centre')
EXTRA = [('City Beach', 13, 'clothes', '13 Cavill Ave'), ('Just In Paradise', 23, 'shop', '23 Cavill Ave'), ('Ghanda', 25, 'clothes', '25 Cavill Ave'),
         ('Pashin', 26, 'clothes', '26 Cavill Ave'), ('Cotton On', 27, 'clothes', '27 Cavill Ave'), ('Alcotraz', 29, 'night', '29 Cavill Ave'),
         ('Creamy Italiano Gelato', 15, 'food', 'Shop 4/15 Cavill Ave'), ('Royal Copenhagen', 22, 'food', 'Shop 204/22 Cavill Ave'),
         ('El Camino Cantina', 'PC', 'food', '2 Cavill Ave (Paradise Centre)'), ('Pappa Flock', 'PC', 'food', 'Paradise Centre, Shop 24/2 Cavill Ave'),
         ('Ally Fashion', 'PC', 'clothes', 'Paradise Centre, SP061 2 Cavill Ave'), ('Kiki Koala Gifts', 'PC', 'shop', '2 Cavill Ave'),
         ('Unique Trendz Boutique', 'PC', 'clothes', 'G Shop 040/2 Cavill Ave'), ('Huntress Homewares', 'PC', 'shop', 'Paradise Centre, 2 Cavill Ave'),
         ('Gelato Messina', 'PC', 'food', '2A Cavill Ave'), ('Goo-E', 'COC', 'food', 'T43B Circle on Cavill, 55 Cavill Ave'),
         ('Gold Coast Credit Union', 'PC', 'bank', None)]
for name, num, c, addr in EXTRA:
    rec = dict(id='survey-' + slug(name), name=name, category=c, address=addr,
               source={'kind': 'Google Maps listing (address only)', 'ref': addr, 'url': 'https://www.google.com/maps/search/' + quote(name + ' Surfers Paradise')},
               status='approximate', note=None)
    if c == 'bank':
        rec.update(status='fictional', note='Made-up bank inside Paradise Centre', source={'kind': 'fictional', 'ref': None, 'url': None})
    if num == 'PC' and PC:
        rec.update(x=round(PC[0], 2), z=round(PC[1], 2), note=rec['note'] or 'Inside Paradise Centre; exact unit not verified')
    elif num == 'COC' and COC:
        rec.update(x=round(COC[0], 2), z=round(COC[1], 2), note='Inside Circle on Cavill; exact unit not verified')
    elif isinstance(num, int):
        s = 141.5 - 7.17 * num; side = -1 if num % 2 else 1
        cx, cz, _, _ = mall_at(s); nx, nz = mall_normal(s, side)
        rec.update(x=round(cx + nx * 13, 2), z=round(cz + nz * 13, 2), note='Position estimated from street number')
        if 0 <= s <= MALL_LEN:
            rec['mallHint'] = {'s': round(s, 1), 'side': side}
    else:
        continue
    registry.append(rec)

# Ripley's: the OSM point is an older location. Google Maps lists it in Soul Boardwalk (ground floor) and the
# player's photo shows it, with its Cargo Hold gift shop, on Soul's podium at the beach end of the mall.
for rec in registry:
    if rec['name'].startswith('Ripley'):
        rec.update(status='verified', note='OSM point is an old location; placed at Soul Boardwalk per Google Maps and player photo', mallHint={'s': 154.0, 'side': -1})
ripley_id = next((r['id'] for r in registry if r['name'].startswith('Ripley')), None)
registry.append(dict(id='photo-ripleys-cargo-hold', name="Ripley's Cargo Hold Gift Shop", category='shop', address='Soul Boardwalk, 4 Esplanade',
                     source={'kind': 'Player photo', 'ref': 'Soul podium, Cavill Mall', 'url': None}, status='duplicate', duplicateOf=ripley_id,
                     note="Ripley's own gift-shop entrance (the sign under the octopus); shown on the Soul podium, not a separate shop", x=0, z=0))

# duplicates: same business name within 70 m — keep the best-sourced record
rank = {'verified': 0, 'unverified': 1, 'approximate': 2, 'fictional': 3, 'obsolete': 4, 'duplicate': 5}
by = {}
for rec in registry:
    by.setdefault(norm(rec['name']), []).append(rec)
for group in by.values():
    group.sort(key=lambda r: (rank[r['status']], 0 if r['source']['kind'] == 'OpenStreetMap' else 1, 0 if r['id'].startswith('osm-node') else 1))
    for i, r in enumerate(group):
        for keep in group[:i]:
            if keep.get('status') != 'duplicate' and math.hypot(r['x'] - keep['x'], r['z'] - keep['z']) < 70 and not r.get('mallHint'):
                r.update(status='duplicate', note='Duplicate of ' + keep['id'], duplicateOf=keep['id'])
                if r['source']['kind'] != 'OpenStreetMap' and keep['status'] == 'unverified':
                    keep['status'] = 'verified'  # two independent sources agree
                break

# which side of the mall, and how far along it
for rec in registry:
    if rec['status'] in ('duplicate', 'obsolete'):
        continue
    if rec.get('mallHint'):
        rec['mall'] = {'s': rec['mallHint']['s'], 'side': rec['mallHint']['side']}
    else:
        d, s, side = mall_proj(rec['x'], rec['z'])
        if d < 38 and 0 <= s <= MALL_LEN:
            rec['mall'] = {'s': round(s, 1), 'side': side}
    rec.pop('mallHint', None)

# ---------------------------------------------------------------- placement
edge_used = {}   # (building, edge, row) -> [(t, w)]
front_used = {}  # (building, edge) -> [(t0, t1)]
signs = []       # x, z, nx, nz, w, y, cat, name, building, edge, t0, t1, depth, id
free_signs = []  # x, z, cat, name, id
clothes = []

def inward_depth(pts, mx, mz, nx, nz):
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
def sign_width(name, cap=7.0): return min(cap, max(2.2, 0.42 * len(name) + 1.0))

def put_sign(rec, bi, k, t, w, y, walk_width=None, front=True):
    """mount a sign on building bi edge k at distance t, with a walk-in front underneath when there's room"""
    pts = bpolys[bi]; ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
    L = math.hypot(bx - ax, bz - az); ex, ez = (bx - ax) / L, (bz - az) / L; nx, nz = ez, -ex
    w = min(w, L - 0.4); t = max(w / 2 + 0.2, min(L - w / 2 - 0.2, t))
    used = edge_used.setdefault((bi, k, y), [])
    if not all(abs(t - u0) > (w + uw) / 2 + 0.2 for u0, uw in used):
        return False
    used.append((t, w))
    t0 = t1 = depth = 0
    if front and buildings[bi][1] < 1:
        sw = walk_width or max(3.6, min(9.0, w + 0.8))
        a0, a1 = max(0.3, t - sw / 2), min(L - 0.3, t + sw / 2)
        fu = front_used.setdefault((bi, k), [])
        for f0, f1 in fu:  # squeeze between neighbouring shopfronts instead of giving up
            if f1 + 0.3 <= t <= a1 and f1 + 0.3 > a0: a0 = f1 + 0.3
            if a0 <= t <= f0 - 0.3 and f0 - 0.3 < a1: a1 = f0 - 0.3
        if a1 - a0 >= 3.2 and all(a1 <= f0 - 0.3 or a0 >= f1 + 0.3 for f0, f1 in fu):
            dep = inward_depth(pts, ax + ex * (a0 + a1) / 2, az + ez * (a0 + a1) / 2, nx, nz)
            if dep >= 3.5:
                t0, t1, depth = a0, a1, min(8.0, dep - 0.4)
                fu.append((a0, a1))
    sx, sz = ax + ex * t + nx * 0.18, az + ez * t + nz * 0.18
    signs.append([round(sx, 2), round(sz, 2), round(nx, 3), round(nz, 3), round(w, 2), round(y, 2), CATS[rec['category']], rec['name'], bi, k, round(t0, 2), round(t1, 2), round(depth, 2), rec['id']])
    rec['placement'] = {'type': 'facade', 'x': round(sx, 2), 'z': round(sz, 2), 'building': bi, 'walkIn': depth > 0}
    if rec['category'] == 'clothes':
        clothes.append([round(sx + nx * 2.2, 2), round(sz + nz * 2.2, 2), rec['name']])
    return True

def put_pole(rec, x, z):
    free_signs.append([round(x, 2), round(z, 2), CATS[rec['category']], rec['name'], rec['id']])
    rec['placement'] = {'type': 'pole', 'x': round(x, 2), 'z': round(z, 2), 'building': None, 'walkIn': False}
    if rec['category'] == 'clothes':
        clothes.append([round(x, 2), round(z, 2), rec['name']])

live = [r for r in registry if r['status'] not in ('duplicate', 'obsolete')]

# 1. Cavill Mall: keep the real order along each side, only nudging shops apart so signs don't overlap
for side in (-1, 1):
    row = sorted([r for r in live if r.get('mall') and r['mall']['side'] == side], key=lambda r: r['mall']['s'])
    if not row: continue
    ws = [sign_width(r['name'], 6.0) for r in row]
    ss = [r['mall']['s'] for r in row]
    for i in range(1, len(ss)):  # forward pass, then pull back from the far end
        ss[i] = max(ss[i], ss[i - 1] + (ws[i - 1] + ws[i]) / 2 + 0.4)
    ss[-1] = min(ss[-1], MALL_LEN - ws[-1] / 2)
    for i in range(len(ss) - 2, -1, -1):
        ss[i] = min(ss[i], ss[i + 1] - (ws[i] + ws[i + 1]) / 2 - 0.4)
    for order, (rec, s, w) in enumerate(zip(row, ss, ws), 1):
        rec['mall'].update(order=order, placedS=round(s, 1), shift=round(s - rec['mall']['s'], 1))
        cx, cz, _, _ = mall_at(s); nx, nz = mall_normal(s, side)
        d, bi, k, t = ray_hit(cx, cz, nx, nz)
        placed = False
        if bi >= 0 and d < 30:
            pts = bpolys[bi]; ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]; L = math.hypot(bx - ax, bz - az)
            enx, enz = (bz - az) / L, -(bx - ax) / L
            if enx * -nx + enz * -nz > 0.5:  # the wall faces the mall
                placed = put_sign(rec, bi, k, t, w, 3.4, max(3.4, min(8.0, w + 0.6))) or put_sign(rec, bi, k, t, w, 4.7, front=False)
        if not placed:
            put_pole(rec, cx + nx * (FRONT - 1.5), cz + nz * (FRONT - 1.5))

# 2. everything else: the facade nearest the business, staying within a few metres of its real spot
for rec in live:
    if rec.get('placement'): continue
    px, pz, name = rec['x'], rec['z'], rec['name']
    bi = building_at(px, pz, 24)
    placed = False
    if bi >= 0:
        pts = bpolys[bi]; cands = []
        for k in range(len(pts)):
            ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
            L = math.hypot(bx - ax, bz - az)
            if L < 2.5: continue
            nx, nz = (bz - az) / L, -(bx - ax) / L
            mx, mz = (ax + bx) / 2, (az + bz) / 2
            rd, rx, rz = nearest_road(mx + nx * 2, mz + nz * 2)
            if rd > 45 or (rx - mx) * nx + (rz - mz) * nz <= 0: continue
            cands.append((rd + 0.35 * seg_dist(px, pz, ax, az, bx, bz)[0], k, ax, az, bx, bz, L))
        cands.sort()
        w = sign_width(name)
        for _, k, ax, az, bx, bz, L in cands[:3]:
            ex, ez = (bx - ax) / L, (bz - az) / L
            t_pref = (px - ax) * ex + (pz - az) * ez
            rows = [3.4, 4.7] if buildings[bi][0] > 6.5 else [max(2.2, buildings[bi][0] - 0.6)]
            for y in rows:
                for step in sorted(set([0] + [s * 1.5 for s in range(-8, 9)]), key=abs):  # within 12 m of the real spot
                    if put_sign(rec, bi, k, t_pref + step, w, y, front=(y == rows[0])):
                        placed = True; rec['placementShift'] = round(abs(step), 1); break
                if placed: break
            if placed: break
    if not placed:
        rd, rx, rz = nearest_road(px, pz)
        f = max(0, (rd - 4) / rd) if 0.5 < rd < 60 else 0
        put_pole(rec, px + (rx - px) * f, pz + (rz - pz) * f)

for rec in registry:
    rec['interaction'] = 'walk-in' if rec.get('placement', {}).get('walkIn') else 'counter' if rec.get('placement') else 'none'

json.dump({'generated': 'build_map.py', 'mallLength': round(MALL_LEN, 1), 'shops': registry},
          open(os.path.join(ROOT, 'data', 'shops_registry.json'), 'w'), indent=1)
counts = {}
for r in registry: counts[r['status']] = counts.get(r['status'], 0) + 1
print('registry', len(registry), counts, 'signs', len(signs), 'poles', len(free_signs), 'walk-in', sum(1 for s in signs if s[12] > 0))
shop_meta = {r['id']: [r['status'], (('S' if r['mall']['side'] > 0 else 'N') + str(r['mall'].get('order', 0))) if r.get('mall') else '', r['source']['ref'] or ''] for r in registry if r.get('placement')}
