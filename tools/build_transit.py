"""The train and CityCat routes for the game, from OpenStreetMap (tools/fetch_transit.py).

Run: python3 tools/build_transit.py   (writes dist/tiles/transit.json)
Trains: the Gold Coast line, Varsity Lakes to Roma Street, found as the shortest way over the mapped railway between the
two stations, stopping at every station it passes. CityCats: Northshore Hamilton to UQ St Lucia along the mapped ferry
routes, stopping at the terminals on the way.
"""
import heapq, json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAT0, LON0 = (-28.013 + -27.986) / 2, (153.411 + 153.436) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
def proj(lat, lon): return ((lon - LON0) * KX, (LAT0 - lat) * KZ)
els = {}
for f in ('transit_gc.json', 'transit_bris.json'):
    p = os.path.join(ROOT, 'data', 'region', f)
    if os.path.exists(p):
        for e in json.load(open(p))['elements']: els[(e['type'], e['id'])] = e
els = list(els.values())

def network(pred):  # node id -> [(neighbour, metres)], node id -> (x, z)
    adj, pos = {}, {}
    for e in els:
        if e['type'] != 'way' or not pred(e.get('tags', {})): continue
        ids, g = e.get('nodes', []), e.get('geometry', [])
        if len(ids) != len(g): continue
        for k, (n, q) in enumerate(zip(ids, g)):
            pos[n] = proj(q['lat'], q['lon'])
            if k:
                a, b = ids[k - 1], n; d = math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1])
                adj.setdefault(a, []).append((b, d)); adj.setdefault(b, []).append((a, d))
    return adj, pos

def nearest(pos, x, z):
    return min(pos, key=lambda n: (pos[n][0] - x) ** 2 + (pos[n][1] - z) ** 2)

def route(adj, pos, a, b):
    dist, prev, q = {a: 0}, {}, [(0, a)]
    while q:
        d, n = heapq.heappop(q)
        if n == b: break
        if d > dist.get(n, 1e18): continue
        for m, w in adj.get(n, ()):
            if d + w < dist.get(m, 1e18): dist[m] = d + w; prev[m] = n; heapq.heappush(q, (d + w, m))
    if b not in dist: return None
    path = [b]
    while path[-1] != a: path.append(prev[path[-1]])
    return [pos[n] for n in reversed(path)]

def simplify(pts, tol):  # Douglas-Peucker, keeps the shape of the line
    if len(pts) < 3: return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]; L = math.hypot(bx - ax, bz - az) or 1; best, bi = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L
        if d > best: best, bi = d, i
    if best <= tol: return [pts[0], pts[-1]]
    return simplify(pts[:bi + 1], tol)[:-1] + simplify(pts[bi:], tol)

def stops_on(line, places, within):  # [(distance along the line, name)] for each place beside it, in order
    cum = [0]
    for i in range(1, len(line)): cum.append(cum[-1] + math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]))
    out = []
    for name, (x, z) in places:
        best = None
        for i in range(len(line) - 1):
            (ax, az), (bx, bz) = line[i], line[i + 1]; ex, ez = bx - ax, bz - az; L2 = ex * ex + ez * ez or 1
            t = max(0, min(1, ((x - ax) * ex + (z - az) * ez) / L2)); d = math.hypot(x - ax - ex * t, z - az - ez * t)
            if best is None or d < best[0]: best = (d, cum[i] + math.sqrt(L2) * t)
        if best and best[0] < within: out.append((round(best[1], 1), name))
    out.sort(); dedup = []
    for s, n in out:
        if not dedup or (n != dedup[-1][1] and s - dedup[-1][0] > 150): dedup.append((s, n))
    return dedup, round(cum[-1], 1)

def named(pred):
    out = {}
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'node' and t.get('name') and pred(t): out.setdefault(t['name'], proj(e['lat'], e['lon']))
    return list(out.items())

result = {'trains': [], 'ferries': []}
# the Gold Coast line
radj, rpos = network(lambda t: t.get('railway') == 'rail' and not t.get('service'))
stations = named(lambda t: t.get('railway') in ('station', 'halt') and t.get('station') not in ('light_rail', 'subway') and t.get('light_rail') != 'yes' and t.get('tram') != 'yes')
st = dict(stations)
for a, b, name in (('Varsity Lakes', 'Roma Street', 'Gold Coast line'),):
    A = st.get(a); B = st.get(b) or st.get('Brisbane Roma Street') or st.get('Roma Street railway station')
    if not (A and B and rpos): print('no route for', name, bool(A), bool(B)); continue
    line = route(radj, rpos, nearest(rpos, *A), nearest(rpos, *B))
    if not line: print('no rail path for', name); continue
    line = simplify(line, 1.5)
    stops, total = stops_on(line, stations, 140)
    result['trains'].append({'name': name, 'line': [round(v, 1) for p in line for v in p], 'stops': stops, 'len': total})
    print(name, '%.1f km' % (total / 1000), len(stops), 'stations:', ', '.join(n for _, n in stops))
# CityCats on the Brisbane River
fadj, fpos = network(lambda t: t.get('route') == 'ferry')
terms = named(lambda t: t.get('amenity') == 'ferry_terminal' or t.get('ferry') == 'yes')
tm = dict(terms)
def find(word): return next((p for n, p in terms if word.lower() in n.lower()), None)
A, B = find('Northshore') or find('Hamilton'), find('St Lucia') or find('UQ')
if A and B and fpos:
    line = route(fadj, fpos, nearest(fpos, *A), nearest(fpos, *B))
    if line:
        line = simplify(line, 2.0)
        stops, total = stops_on(line, terms, 120)
        result['ferries'].append({'name': 'CityCat', 'line': [round(v, 1) for p in line for v in p], 'stops': stops, 'len': total})
        print('CityCat', '%.1f km' % (total / 1000), len(stops), 'terminals:', ', '.join(n for _, n in stops))
    else: print('no ferry path')
else: print('ferry terminals not found', bool(A), bool(B), [n for n, _ in terms][:20])
os.makedirs(os.path.join(ROOT, 'dist', 'tiles'), exist_ok=True)
json.dump(result, open(os.path.join(ROOT, 'dist', 'tiles', 'transit.json'), 'w'), separators=(',', ':'))
