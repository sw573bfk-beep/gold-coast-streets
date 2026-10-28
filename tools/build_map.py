"""Convert OpenStreetMap data for Surfers Paradise into the compact game map (map.json).

Run: python3 tools/build_map.py   (reads data/osm.json + data/parts.json, writes data/map.json)
"""
import json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S, W, N, E = -28.013, 153.411, -27.986, 153.436
LAT0, LON0 = (S + N) / 2, (W + E) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0

def proj(lat, lon):
    return (round((lon - LON0) * KX, 1), round((LAT0 - lat) * KZ, 1))

MINX, MAXX = proj(LAT0, W)[0], proj(LAT0, E)[0]
MINZ, MAXZ = proj(N, LON0)[1], proj(S, LON0)[1]
PAD = 40

def inside(p, pad=PAD):
    return MINX - pad <= p[0] <= MAXX + pad and MINZ - pad <= p[1] <= MAXZ + pad

def flat(pts):
    out = []
    for x, z in pts:
        out += [x, z]
    return out

def geom(e):
    return [proj(g['lat'], g['lon']) for g in e.get('geometry', []) if g]

def area(pts):
    a = 0
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return a / 2

def pip(pt, poly):
    x, z = pt; c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            c = not c
        j = i
    return c

def simplify(pts, tol=0.4):
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        ax, az = out[-1]; bx, bz = pts[i]; cx, cz = pts[i + 1]
        dx, dz = cx - ax, cz - az
        L = math.hypot(dx, dz) or 1
        d = abs((bx - ax) * dz - (bz - az) * dx) / L
        if d > tol or math.hypot(bx - ax, bz - az) > 60:
            out.append(pts[i])
    out.append(pts[-1])
    return out

def ring_clean(pts):
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts

def join_rings(ways):
    """Join open member ways of a multipolygon into closed rings."""
    ways = [list(w) for w in ways if len(w) > 1]
    rings = []
    while ways:
        cur = ways.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w + cur[1:]
                elif w[0] == cur[0]:
                    cur = w[::-1] + cur[1:]
                else:
                    continue
                ways.pop(i); changed = True
                break
        rings.append(ring_clean(cur))
    return rings

osm = json.load(open(os.path.join(ROOT, 'data', 'osm.json')))['elements']
parts = json.load(open(os.path.join(ROOT, 'data', 'parts.json')))['elements']

# ---------------------------------------------------------------- roads
ROAD_TYPES = ['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service',
              'pedestrian', 'footway', 'cycleway', 'path', 'steps', 'unclassified',
              'living_street', 'track']
LINK = {'trunk_link': 'trunk', 'primary_link': 'primary', 'secondary_link': 'secondary',
        'tertiary_link': 'tertiary'}
DRIVABLE = {'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street'}
DEFAULT_W = {'trunk': 13, 'primary': 10, 'secondary': 9, 'tertiary': 8, 'residential': 6.5,
             'unclassified': 6.5, 'living_street': 5.5, 'service': 4.2, 'pedestrian': 7,
             'footway': 2.2, 'cycleway': 2.5, 'path': 2, 'steps': 2.2, 'track': 3}
names = []
def name_idx(n):
    if not n:
        return -1
    if n not in names:
        names.append(n)
    return names.index(n)

roads = []
graph_ways = []
for e in osm:
    t = e.get('tags', {})
    hw = t.get('highway')
    if e['type'] != 'way' or not hw:
        continue
    is_link = hw in LINK
    hw = LINK.get(hw, hw)
    if hw not in ROAD_TYPES or t.get('area') == 'yes':
        continue
    if t.get('access') == 'private' and hw == 'service':
        pass
    if t.get('tunnel') in ('yes', 'building_passage') and hw in ('footway', 'corridor'):
        continue
    oneway = t.get('oneway') == 'yes' or t.get('junction') == 'roundabout'
    lanes = t.get('lanes')
    try:
        lanes = int(lanes.split(';')[0]) if lanes else None
    except ValueError:
        lanes = None
    if lanes:
        width = lanes * 3.3 + (0.6 if hw in ('trunk', 'primary') else 0)
    else:
        width = DEFAULT_W[hw]
        if oneway and hw in ('trunk', 'primary', 'secondary'):
            width *= 0.65
        if is_link:
            width = 4.5
        lanes = 2 if not oneway else (2 if width > 7 else 1)
    pts = geom(e)
    ids = e['nodes']
    # split at out-of-bounds points
    segs, cur, curids = [], [], []
    for p, nid in zip(pts, ids):
        if inside(p):
            cur.append(p); curids.append(nid)
        else:
            if len(cur) > 1:
                segs.append((cur, curids))
            cur, curids = [], []
    if len(cur) > 1:
        segs.append((cur, curids))
    bridge = 1 if t.get('bridge') == 'yes' else 0
    ni = name_idx(t.get('name'))
    for sp, sid in segs:
        roads.append([ROAD_TYPES.index(hw), round(width, 1), ni, bridge] + flat(simplify(sp, 0.25)))
        if hw in DRIVABLE or is_link:
            graph_ways.append(dict(pts=sp, ids=sid, oneway=oneway, lanes=lanes, width=width,
                                   name=ni, type=ROAD_TYPES.index(hw)))

# ---------------------------------------------------------------- road graph (traffic)
use = {}
for w in graph_ways:
    for i, nid in enumerate(w['ids']):
        use[nid] = use.get(nid, 0) + (2 if i in (0, len(w['ids']) - 1) else 1)
node_index, nodes, node_ids = {}, [], []
def nidx(nid, p):
    if nid not in node_index:
        node_index[nid] = len(nodes) // 2
        nodes.extend(p)
        node_ids.append(nid)  # OSM node id, so streamed tiles can join this road network
    return node_index[nid]
edges = []
for w in graph_ways:
    start = 0
    for i in range(1, len(w['ids'])):
        if use[w['ids'][i]] >= 2 or i == len(w['ids']) - 1:
            sp = w['pts'][start:i + 1]
            a = nidx(w['ids'][start], w['pts'][start]); b = nidx(w['ids'][i], w['pts'][i])
            if a != b:
                edges.append([a, b, 1 if w['oneway'] else 0, w['lanes'], w['name'], w['type'],
                              round(w['width'], 1)] + flat(simplify(sp, 0.3)))
            start = i

# ---------------------------------------------------------------- buildings
MALL_PTS = [(r[4 + i], r[5 + i]) for r in roads if r[0] == ROAD_TYPES.index('pedestrian') and r[2] >= 0 and names[r[2]] == 'Cavill Avenue' for i in range(0, len(r) - 4, 2)]
part_polys = []
out_parts = []
for e in parts:
    if e['type'] != 'way':
        continue
    t = e['tags']
    pts = ring_clean(geom(e))
    if len(pts) < 3 or not inside(pts[0], 0):
        continue
    h = float(str(t.get('height', '0')).split()[0] or 0)
    lv = t.get('building:levels')
    if not h and lv:
        h = float(lv.split(';')[0]) * 3.2
    if not h:
        h = 6
    mh = float(str(t.get('min_height', '0')).split()[0] or 0)
    if not mh and t.get('building:min_level'):
        mh = float(t['building:min_level']) * 3.2
    part_polys.append(pts)
    out_parts.append((h, mh, t, pts))

def default_h(kind, rnd):
    return {'house': 6, 'detached': 6.5, 'semidetached_house': 6.5, 'residential': 7,
            'apartments': 14, 'hotel': 22, 'retail': 5.5, 'commercial': 10, 'roof': 3.2,
            'garage': 3, 'garages': 3, 'shed': 2.8, 'carport': 2.6, 'school': 8,
            'church': 10, 'office': 14, 'toilets': 3.4}.get(kind, 7) * (0.85 + rnd.random() * 0.35)

KINDS = {'house': 0, 'detached': 0, 'semidetached_house': 0, 'residential': 1, 'apartments': 1,
         'hotel': 1, 'retail': 2, 'commercial': 2, 'office': 2, 'roof': 3, 'carport': 3,
         'garage': 4, 'garages': 4, 'shed': 4, 'school': 2, 'church': 2}
buildings = []
bnames = []   # parallel to buildings: OSM name or ''
bpolys = []   # parallel to buildings: ring as list of (x, z)
# heights the OSM data is missing for well-known towers (metres, approximate)
HEIGHT_FIX = {'Soul': 243}
rnd = random.Random(7)
def add_building(pts, h, mh, kind, name=''):
    if area(pts) < 0:
        pts = pts[::-1]
    pts = simplify(pts + [pts[0]], 0.3)[:-1]
    if len(pts) < 3 or abs(area(pts)) < 4:
        return
    buildings.append([round(h, 1), round(mh, 1), kind] + flat(pts))
    bnames.append(name or '')
    bpolys.append(pts)

for e in osm:
    t = e.get('tags', {})
    b = t.get('building')
    if not b:
        continue
    if e['type'] == 'way':
        rings = [ring_clean(geom(e))]
    else:
        rings = join_rings([geom(m) for m in e['members'] if m.get('role') == 'outer'])
    for pts in rings:
        if len(pts) < 3 or not inside(pts[0], 0):
            continue
        # skip outlines that are represented by building:parts
        minx = min(p[0] for p in pts); maxx = max(p[0] for p in pts)
        minz = min(p[1] for p in pts); maxz = max(p[1] for p in pts)
        covered = False
        for pp in part_polys:
            cx = sum(p[0] for p in pp) / len(pp); cz = sum(p[1] for p in pp) / len(pp)
            if minx <= cx <= maxx and minz <= cz <= maxz and pip((cx, cz), pts):
                covered = True; break
        if covered:
            continue
        h = float(str(t.get('height', '0')).split()[0] or 0)
        lv = t.get('building:levels')
        if not h and lv:
            try:
                h = float(lv.split(';')[0]) * 3.2 + 1
            except ValueError:
                h = 0
        if not h:
            h = default_h(b, rnd)
        mh = 0
        if b == 'roof':
            mh = max(0, h - 0.4)
            # shade roofs over Cavill Mall would hide the shopfronts and Soul's octopus
            if any(math.hypot(px - mx, pz - mz) < 22 for px, pz in pts for mx, mz in MALL_PTS):
                continue
        if t.get('name') in HEIGHT_FIX:
            h = HEIGHT_FIX[t['name']]
        add_building(pts, h, mh, KINDS.get(b, 1 if h > 12 else 2), t.get('name', ''))

for h, mh, t, pts in out_parts:
    add_building(pts, h, mh, 6 if t.get('name') == 'Q1 Tower' else 5 if h > 60 else 1, t.get('name', ''))

# ---------------------------------------------------------------- areas
areas = {k: [] for k in ['beach', 'park', 'grass', 'water', 'pool', 'parking', 'residential',
                         'pitch', 'commercial', 'scrub', 'pier', 'construction', 'wood']}
def area_kind(t):
    if t.get('natural') == 'beach': return 'beach'
    if t.get('natural') == 'water' or t.get('water'): return 'water'
    if t.get('leisure') == 'swimming_pool': return 'pool'
    if t.get('leisure') in ('park', 'garden', 'playground', 'nature_reserve', 'golf_course'): return 'park'
    if t.get('leisure') in ('pitch', 'sports_centre', 'stadium', 'track'): return 'pitch'
    if t.get('landuse') in ('grass', 'greenfield', 'recreation_ground', 'village_green') or t.get('natural') in ('grassland',): return 'grass'
    if t.get('natural') in ('scrub', 'heath', 'wetland'): return 'scrub'
    if t.get('natural') == 'wood' or t.get('landuse') == 'forest': return 'wood'
    if t.get('amenity') == 'parking': return 'parking'
    if t.get('landuse') == 'residential': return 'residential'
    if t.get('landuse') in ('retail', 'commercial'): return 'commercial'
    if t.get('landuse') in ('construction', 'brownfield'): return 'construction'
    if t.get('man_made') in ('pier', 'breakwater', 'groyne'): return 'pier'
    return None

linear = []  # piers / breakwaters drawn as lines
for e in osm:
    t = e.get('tags', {})
    k = area_kind(t)
    if not k:
        continue
    if e['type'] == 'way':
        pts = geom(e)
        if len(pts) < 2:
            continue
        if pts[0] != pts[-1]:
            if k == 'pier':
                linear.append([3.0] + flat(pts))
            continue
        rings = [ring_clean(pts)]
    else:
        rings = join_rings([geom(m) for m in e['members'] if m.get('type') == 'way'])
    rings = [r for r in rings if len(r) > 2]
    if not rings:
        continue
    if not any(inside(p, 300) for r in rings for p in r):
        continue
    areas[k].append([flat(simplify(r + [r[0]], 0.4)[:-1]) for r in rings])

# ocean: the coastline runs south -> north with land on the left; close it to the east
coast = [e for e in osm if e.get('tags', {}).get('natural') == 'coastline']
ocean = []
for c in coast:
    pts = [p for p in geom(c) if inside(p, 600)]
    if len(pts) > 2:
        far = MAXX + 2000
        ring = simplify(pts, 0.4) + [(far, pts[-1][1] - 2000), (far, pts[0][1] + 2000)]
        ocean.append(flat(ring))

# lifeguard towers etc. as landmark points
towers = []
for e in osm:
    t = e.get('tags', {})
    if t.get('man_made') == 'tower' or 'Lifeguard' in str(t.get('name', '')):
        pts = geom(e)
        if pts:
            cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
            towers.append([round(cx, 1), round(cz, 1)])

# named buildings, used for map labels and spawn points
landmarks = {}
for e in osm + parts:
    t = e.get('tags', {})
    if e['type'] == 'way' and (t.get('building') or t.get('building:part')) and t.get('name'):
        pts = geom(e)
        if pts and inside(pts[0], 0):
            cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
            landmarks[t['name']] = [round(cx, 1), round(cz, 1)]

exec(open(os.path.join(ROOT, 'tools', 'build_details.py')).read())

out = dict(bounds=[MINX, MINZ, MAXX, MAXZ], origin=[LAT0, LON0], names=names, roads=roads,
           buildings=buildings, areas=areas, ocean=ocean, piers=linear, towers=towers,
           landmarks=landmarks, details=details,
           graph=dict(nodes=nodes, edges=edges, ids=node_ids))
path = os.path.join(ROOT, 'data', 'map.json')
json.dump(out, open(path, 'w'), separators=(',', ':'))
print('roads', len(roads), 'buildings', len(buildings), 'graph nodes', len(nodes) // 2,
      'edges', len(edges), {k: len(v) for k, v in areas.items()}, 'ocean', len(ocean),
      'size', os.path.getsize(path))
