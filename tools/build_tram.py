"""The G:link light rail for the game: tracks and stops from OpenStreetMap, joined into one route.

Run: python3 tools/build_tram.py  -> data/tram.json {line: [x, z, ...] every ~4 m, stops: [[distance along, name, x, z]]}
(bundle.py puts it in the page as window.TRAM_DATA)
"""
import glob, heapq, json, math, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAT0, LON0 = (-28.013 + -27.986) / 2, (153.411 + 153.436) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
proj = lambda lat, lon: ((lon - LON0) * KX, (LAT0 - lat) * KZ)
ways, stops, seen = [], {}, set()
for p in [os.path.join(ROOT, 'data', 'rail.json')] + glob.glob(os.path.join(ROOT, 'data', 'region', 'osm*_*.json')):
    try: d = json.load(open(p))
    except Exception: continue
    for e in d.get('elements', []):
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('railway') in ('tram', 'light_rail') and t.get('service') not in ('yard', 'siding', 'crossover') and e.get('geometry') and e['id'] not in seen:
            seen.add(e['id']); ways.append([proj(g['lat'], g['lon']) for g in e['geometry']])
        if t.get('name') and (t.get('railway') in ('tram_stop', 'platform', 'station') or t.get('public_transport') in ('platform', 'station', 'stop_position')):
            nm = t['name'].replace(' station', '').replace(' Station', '').replace(' light rail', '').replace(' Light Rail', '').replace(' platform', '').strip()
            g = e.get('geometry') or ([{'lat': e['lat'], 'lon': e['lon']}] if 'lat' in e else [])
            if g: stops.setdefault(nm, []).append(proj(sum(q['lat'] for q in g) / len(g), sum(q['lon'] for q in g) / len(g)))
# the stations in the map search (transport entries) fill in any platforms the download missed
try:
    for nm, k, x, z, *rest in json.load(open(os.path.join(ROOT, 'dist', 'tiles', 'region.json')))['search']:
        if k == 14: stops.setdefault(nm.replace(' station', '').replace(' Station', '').strip(), []).append((x, z))
except Exception: pass
key = lambda p: (round(p[0] * 2), round(p[1] * 2))
adj, pos = {}, {}
for w in ways:
    for a, b in zip(w, w[1:]):
        ka, kb = key(a), key(b); pos[ka] = a; pos[kb] = b; L = math.hypot(b[0] - a[0], b[1] - a[1])
        adj.setdefault(ka, []).append((kb, L)); adj.setdefault(kb, []).append((ka, L))
# track pieces that stop short of each other (separate ways, switches) are joined within 12 m
ends = [key(w[0]) for w in ways] + [key(w[-1]) for w in ways]
for i, a in enumerate(ends):
    for b in ends[i + 1:]:
        if a != b:
            L = math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1])
            if L < 12: adj[a].append((b, L)); adj[b].append((a, L))
def nearest(p): return min(pos, key=lambda k: (pos[k][0] - p[0]) ** 2 + (pos[k][1] - p[1]) ** 2)
def dijkstra(src):
    dist, prev, h = {src: 0}, {}, [(0, src)]
    while h:
        d, u = heapq.heappop(h)
        if d > dist[u]: continue
        for v, L in adj.get(u, ()):
            if d + L < dist.get(v, 1e18): dist[v] = d + L; prev[v] = u; heapq.heappush(h, (d + L, v))
    return dist, prev
# the line's two ends: the farthest node from anywhere, then the farthest from that (a double sweep)
d1, _ = dijkstra(next(iter(pos))); a = max(d1, key=d1.get)
d2, prev = dijkstra(a); b = max(d2, key=d2.get)
path = [b]
while path[-1] != a: path.append(prev[path[-1]])
line = [pos[k] for k in path]
print('tram ways', len(ways), 'line', round(d2[b]), 'm')
# resample every ~4 m
out, cum = [line[0]], [0]
for p0, p1 in zip(line, line[1:]):
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); n = max(1, int(L // 4))
    for k in range(1, n + 1): out.append((p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n))
for p0, p1 in zip(out, out[1:]): cum.append(cum[-1] + math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
# stops: named platforms and stations within 80 m of the line, one per 250 m stretch (the better-named one wins)
cand = []
for nm, ps in stops.items():
    if 'relief' in nm.lower() or nm.isdigit(): continue
    x, z = sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps)
    i = min(range(len(out)), key=lambda i: (out[i][0] - x) ** 2 + (out[i][1] - z) ** 2)
    if math.hypot(out[i][0] - x, out[i][1] - z) < 80: cand.append([round(cum[i], 1), nm.split(',')[0].strip(), round(out[i][0], 1), round(out[i][1], 1)])
cand.sort(); stops_out = []
for c in cand:
    if stops_out and c[0] - stops_out[-1][0] < 250: continue
    stops_out.append(c)
# the map has no station names: a stop every ~900 m, named after what's beside it (a centre, hospital, beach,
# attraction) or else the suburb
reg = json.load(open(os.path.join(ROOT, 'dist', 'tiles', 'region.json')))
B = reg['bounds']; used = set()
for s0 in range(300, int(cum[-1]) - 100, 900):
    i = min(range(len(cum)), key=lambda i: abs(cum[i] - s0)); x, z = out[i]
    if not (B[0] < x < B[2] and B[1] < z < B[3]) or any(abs(s0 - q[0]) < 400 for q in stops_out): continue
    best, bd = None, 320
    for e in reg['search']:
        if e[1] in (5, 4, 10, 3) and not e[0].isupper() and not re.search(r'clinic|medical|doctor|cosmetic|sign|dental|day hospital|x-ray|observ|deck', e[0], re.I) and (e[1] != 4 or 'Hospital' in e[0]):
            d = math.hypot(e[2] - x, e[3] - z) * (0.7 if e[1] in (5, 4) else 1)
            if d < bd: bd, best = d, e[0]
    if not best:
        sub = min(reg['suburbs'], key=lambda q: math.hypot(q[0] - x, q[1] - z)); best = sub[2]
    nm = best; k = 0
    while nm in used: nm = [f'{best} North', f'{best} Central', f'{best} West'][k] if k < 3 else f'{best} {k}'; k += 1 # the line runs south to north
    used.add(nm); stops_out.append([round(cum[i], 1), nm, round(x, 1), round(z, 1)])
stops_out.sort()
json.dump({'line': [round(v, 1) for p in out for v in p], 'stops': stops_out}, open(os.path.join(ROOT, 'data', 'tram.json'), 'w'), separators=(',', ':'))
print('route', round(cum[-1]), 'm,', len(stops_out), 'stops:', ', '.join(s[1] for s in stops_out))
