"""Download mapped fences, walls, hedges, railings, retaining walls and gates for the region (OpenStreetMap, Overpass API).

Run: python3 tools/fetch_barriers.py  -> data/region/barriers_<row>_<col>.json
Same 5 x 3 blocks as tools/fetch_region.py; finished blocks are skipped, with a pause between requests.
"""
import json, os, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
S, W, N, E = -28.110, 153.355, -27.935, 153.468
ROWS, COLS = 5, 3
QUERY = """[out:json][timeout:180][bbox:{s},{w},{n},{e}];
(way["barrier"];node["barrier"~"^(gate|lift_gate|swing_gate|sliding_gate|kissing_gate|entrance|bollard)$"];);
out geom qt;"""
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

for r in range(ROWS):
    for c in range(COLS):
        path = os.path.join(OUT, 'barriers_%d_%d.json' % (r, c))
        if os.path.exists(path) and os.path.getsize(path) > 100:
            continue
        s = S + (N - S) * r / ROWS; n = S + (N - S) * (r + 1) / ROWS
        w = W + (E - W) * c / COLS; e = W + (E - W) * (c + 1) / COLS
        q = QUERY.format(s=s, w=w, n=n, e=e)
        for attempt in range(8):
            ep = ENDPOINTS[attempt % len(ENDPOINTS)]
            subprocess.run(['curl', '-s', '-m', '240', '-A', 'GoldCoastStreetsGame/0.1 (personal project)', '-X', 'POST', ep,
                            '--data-urlencode', 'data=' + q, '-o', path + '.part'])
            try:
                d = json.load(open(path + '.part'))
                os.replace(path + '.part', path)
                print('block', r, c, len(d['elements']), 'features', flush=True)
                break
            except Exception:
                wait = min(180, 20 * (attempt + 1))
                print('block', r, c, 'busy, retry in', wait, 's', flush=True)
                time.sleep(wait)
        else:
            print('block', r, c, 'FAILED', flush=True)
        time.sleep(5)
print('done', flush=True)
