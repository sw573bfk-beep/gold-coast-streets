"""Download OpenStreetMap data for the wider Gold Coast region in blocks (Overpass API), with retries.

Run: python3 tools/fetch_region.py   -> data/region/osm_<row>_<col>.json
Region: Southport (north) to Burleigh Heads (south), inland to Robina, Carrara and Benowa.
"""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
os.makedirs(OUT, exist_ok=True)
S, W, N, E = -28.110, 153.355, -27.935, 153.468
ROWS, COLS = 5, 3
QUERY = """[out:json][timeout:240][bbox:{s},{w},{n},{e}];
(way["highway"];way["building"];relation["building"];
 way["landuse"];way["leisure"];way["natural"];way["water"];way["waterway"="riverbank"];way["amenity"="parking"];way["man_made"];
 relation["natural"="water"];relation["water"];relation["landuse"];relation["leisure"];
 nwr["amenity"];nwr["shop"];nwr["tourism"];nwr["office"]["name"];
 node["natural"="tree"];way["railway"];node["place"];node["highway"="traffic_signals"];);
out geom qt;"""
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

for r in range(ROWS):
    for c in range(COLS):
        path = os.path.join(OUT, 'osm_%d_%d.json' % (r, c))
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            continue
        s = S + (N - S) * r / ROWS; n = S + (N - S) * (r + 1) / ROWS
        w = W + (E - W) * c / COLS; e = W + (E - W) * (c + 1) / COLS
        q = QUERY.format(s=s, w=w, n=n, e=e)
        for attempt in range(10):
            ep = ENDPOINTS[attempt % len(ENDPOINTS)]
            subprocess.run(['curl', '-s', '-m', '300', '-A', 'GoldCoastStreetsGame/0.1 (personal project)', '-X', 'POST', ep,
                            '--data-urlencode', 'data=' + q, '-o', path + '.part'])
            ok = False
            try:
                with open(path + '.part') as f:
                    ok = f.read(1) == '{'
                if ok:
                    json.load(open(path + '.part'))
            except Exception:
                ok = False
            if ok:
                os.replace(path + '.part', path)
                print('block', r, c, os.path.getsize(path) // 1024, 'KB', flush=True)
                break
            wait = min(240, 20 * (attempt + 1))
            print('block', r, c, 'busy, retry in', wait, 's', flush=True)
            time.sleep(wait)
        else:
            print('block', r, c, 'FAILED', flush=True)
        time.sleep(5)
print('done', flush=True)
