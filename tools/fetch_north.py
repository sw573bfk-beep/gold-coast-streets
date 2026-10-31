"""Download the northern strip of the map: Labrador and Biggera Waters (Harbour Town) up to Coomera, Oxenford and the
theme parks (Dreamworld, Movie World, Wet'n'Wild), and across to Paradise Point and South Stradbroke Island.

Run: python3 tools/fetch_north.py  (resumable; finished pieces are skipped)
Writes, in data/region/:
  osmn_<c>.json      OpenStreetMap for the strip (roads, buildings, land use, shops, fences...)
  poin_<c>.json      gyms, arcades, bakeries and clinics for the strip (like tools/fetch_pois_extra.py)
  demn_*.bin/json    Queensland LiDAR ground heights (5 m) for the strip
  airn_*.bin/json    Queensland public aerial photos (3 m) for the strip
The rest of the map keeps its own files (osm/osmx, dem/demx, air/airx); tools/build_tiles.py reads them all.
"""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region_bounds as RB

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
S, W, N, E = RB.N0, RB.W, RB.N, RB.E  # from the old north edge up to the new one
UA = 'GoldCoastStreetsGame/0.1 (personal project)'
EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
OSM_Q = """[out:json][timeout:240][bbox:{s},{w},{n},{e}];
(way["highway"];way["building"];relation["building"];
 way["landuse"];way["leisure"];way["natural"];way["water"];way["waterway"="riverbank"];way["amenity"="parking"];way["man_made"];way["aeroway"];
 relation["natural"="water"];relation["water"];relation["landuse"];relation["leisure"];
 nwr["amenity"];nwr["shop"];nwr["tourism"];nwr["office"]["name"];nwr["aeroway"];
 node["natural"="tree"];way["railway"];node["place"];node["highway"="traffic_signals"];
 way["barrier"];node["barrier"~"^(gate|lift_gate|swing_gate|sliding_gate|kissing_gate|entrance|bollard)$"];);
out geom qt;"""
POI_Q = """[out:json][timeout:180][bbox:{s},{w},{n},{e}];
(nwr["leisure"~"^(fitness_centre|sports_centre|amusement_arcade|bowling_alley|escape_game|trampoline_park|water_park|miniature_golf|ice_rink)$"]["name"];
 nwr["craft"~"^(bakery|brewery|distillery|winery|confectionery)$"]["name"];
 nwr["healthcare"]["name"][!"amenity"];);
out tags center qt;"""


def overpass(q, path):
    for attempt in range(40):  # the public servers are often busy: keep trying, politely
        subprocess.run(['curl', '-s', '-m', '300', '-A', UA, '-X', 'POST', EPS[attempt % len(EPS)], '--data-urlencode', 'data=' + q, '-o', path + '.part'])
        try:
            d = json.load(open(path + '.part')); os.replace(path + '.part', path); return d
        except Exception:
            time.sleep(min(240, 20 * (attempt + 1)))
    return None


BLOCK = 0.06
cols = int((E - W) / BLOCK + 0.999)
for c in range(cols):
    w = W + c * BLOCK; e = min(E, w + BLOCK)
    p = os.path.join(OUT, 'osmn_%d.json' % c)
    if not os.path.exists(p): d = overpass(OSM_Q.format(s=S, w=w, n=N, e=e), p); print(p, d and len(d['elements']), flush=True); time.sleep(4)
    q = os.path.join(OUT, 'poin_%d.json' % c)
    if not os.path.exists(q):
        d = overpass(POI_Q.format(s=S, w=w, n=N, e=e), q)
        if d:
            for el in d['elements']:
                if 'center' in el and 'lat' not in el: el['lat'], el['lon'] = el['center']['lat'], el['center']['lon']; el['type'] = 'node'
            json.dump(d, open(q, 'w'))
        print(q, d and len(d['elements']), flush=True); time.sleep(4)

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
            if not ok: open(p, 'wb').write(bytes(cw * ch * bands * nbytes))  # no data here (open ocean)
            print(name, 'ok' if ok else 'blank', flush=True)
    json.dump(dict(bbox=[W, S, E, N], w=w, h=h, px=px, bands=bands, bytes=nbytes, size=size, chunks=chunks, rows='north first'),
              open(os.path.join(OUT, kind + '.json'), 'w'))


chunked('demn', 5.0, 'Elevation/DEM_TimeSeries_AllUsers', '&pixelType=F32', 1, 4, 2048)
chunked('airn', 3.0, 'TimeSeries/AerialOrtho_AllUsers', '&pixelType=U8&bandIds=0,1,2', 3, 1, 1024)
print('done', flush=True)
