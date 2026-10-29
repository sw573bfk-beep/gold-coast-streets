"""Download everything for the extended map: south to Coolangatta and the Gold Coast Airport, and about 30 km inland.

Run: python3 tools/fetch_extension.py  (resumable; finished pieces are skipped)
Writes, in data/region/:
  osmx_<r>_<c>.json   OpenStreetMap (roads, buildings, land use, shops...) for blocks outside the original map
  barx_<r>_<c>.json   fences, walls, hedges and gates for the same blocks
  demx_*.bin/json     Queensland LiDAR ground heights (5 m) for the whole extended map
  airx_*.bin/json     Queensland public aerial photos (3 m) for the whole extended map
"""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from region_bounds import S, W, N, E, OLD

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
BLOCK = 0.055
UA = 'GoldCoastStreetsGame/0.1 (personal project)'
OSM_Q = """[out:json][timeout:240][bbox:{s},{w},{n},{e}];
(way["highway"];way["building"];relation["building"];
 way["landuse"];way["leisure"];way["natural"];way["water"];way["waterway"="riverbank"];way["amenity"="parking"];way["man_made"];way["aeroway"];
 relation["natural"="water"];relation["water"];relation["landuse"];relation["leisure"];
 nwr["amenity"];nwr["shop"];nwr["tourism"];nwr["office"]["name"];nwr["aeroway"];
 node["natural"="tree"];way["railway"];node["place"];node["highway"="traffic_signals"];);
out geom qt;"""
BAR_Q = """[out:json][timeout:180][bbox:{s},{w},{n},{e}];
(way["barrier"];node["barrier"~"^(gate|lift_gate|swing_gate|sliding_gate|kissing_gate|entrance|bollard)$"];);
out geom qt;"""
EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']


def overpass(q, path):
    for attempt in range(10):
        subprocess.run(['curl', '-s', '-m', '300', '-A', UA, '-X', 'POST', EPS[attempt % 2], '--data-urlencode', 'data=' + q, '-o', path + '.part'])
        try:
            d = json.load(open(path + '.part')); os.replace(path + '.part', path); return len(d['elements'])
        except Exception:
            time.sleep(min(240, 20 * (attempt + 1)))
    return None


rows, cols = int((N - S) / BLOCK + 0.999), int((E - W) / BLOCK + 0.999)
blocks = []
for r in range(rows):
    for c in range(cols):
        s = S + r * BLOCK; n = min(N, s + BLOCK); w = W + c * BLOCK; e = min(E, w + BLOCK)
        inside_old = s >= OLD[0] and w >= OLD[1] and n <= OLD[2] and e <= OLD[3]
        if not inside_old: blocks.append((r, c, s, w, n, e))
print('blocks outside the original map:', len(blocks), flush=True)
for kind, q in (('osmx', OSM_Q), ('barx', BAR_Q)):
    for r, c, s, w, n, e in blocks:
        p = os.path.join(OUT, '%s_%d_%d.json' % (kind, r, c))
        if os.path.exists(p): continue
        got = overpass(q.format(s=s, w=w, n=n, e=e), p)
        print(kind, r, c, got if got is not None else 'FAILED', flush=True)
        time.sleep(4)

# ground heights and photos over the whole extended map, in chunks the services accept
BASE = 'https://spatial-img.information.qld.gov.au/arcgis/rest/services/'
MX, MZ = 98330.0, 110574.0


def fetch(url, path, expect, tries):
    for attempt in range(tries):
        subprocess.run(['curl', '-s', '-m', '600', '-A', UA, '-o', path + '.part', url])
        if os.path.exists(path + '.part') and os.path.getsize(path + '.part') >= expect:
            os.replace(path + '.part', path); return True
        time.sleep(8 * (attempt + 1))
    if os.path.exists(path + '.part'): os.remove(path + '.part')
    return False


def chunked(kind, px, service, query, bands, nbytes, size):
    w = round((E - W) * MX / px); h = round((N - S) * MZ / px); dlon = (E - W) / w; dlat = (N - S) / h; chunks = []
    for r in range(0, h, size):
        for c in range(0, w, size):
            cw, ch = min(size, w - c), min(size, h - r); n = N - r * dlat; s = n - ch * dlat; w0 = W + c * dlon; e0 = w0 + cw * dlon
            name = '%s_%d_%d.bin' % (kind, r // size, c // size); chunks.append(dict(file=name, row=r, col=c, w=cw, h=ch)); p = os.path.join(OUT, name)
            if os.path.exists(p): continue
            url = (BASE + service + '/ImageServer/exportImage?bbox=%.7f,%.7f,%.7f,%.7f&bboxSR=4326&imageSR=4326&size=%d,%d&format=bsq'
                   '&interpolation=RSP_BilinearInterpolation&f=image' + query) % (w0, s, e0, n, cw, ch)
            ok = fetch(url, p, cw * ch * bands * nbytes, 3)
            if not ok: open(p, 'wb').write(bytes(cw * ch * bands * nbytes))  # no data here (open ocean): zeros mean "no photo/height"
            print(name, 'ok' if ok else 'blank', flush=True)
    json.dump(dict(bbox=[W, S, E, N], w=w, h=h, px=px, bands=bands, bytes=nbytes, size=size, chunks=chunks, rows='north first'),
              open(os.path.join(OUT, kind + '.json'), 'w'))


chunked('demx', 5.0, 'Elevation/DEM_TimeSeries_AllUsers', '&pixelType=F32', 1, 4, 2048)
chunked('airx', 3.0, 'TimeSeries/AerialOrtho_AllUsers', '&pixelType=U8&bandIds=0,1,2', 3, 1, 1024)
print('done', flush=True)
