"""The ground photos: the Queensland Government aerial photos (CC BY 4.0) cut to the game's map, one JPEG for each
3 x 3 block of tiles (the same blocks as the tile packs), laid over the ground in the game.

Run after tools/build_tiles.py: python3 tools/ground_photos.py   (writes dist/ground/g_<pi>_<pj>.jpg)
Pure Python (no image libraries): rows of the photo mosaics are gathered with itemgetter, written as BMP and turned
into JPEG by macOS's sips. The 2 m photos (air) win over the 3 m ones (airx, airn) where they overlap.
"""
import json, math, os, subprocess, sys
from operator import itemgetter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aerial import Raster

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAT0, LON0 = (-28.013 + -27.986) / 2, (153.411 + 153.436) / 2  # the Surfers map origin (as in build_tiles.py)
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
TILE, PACK, PX = 1000.0, 3, 384  # metres a tile, tiles a block side, photo pixels a tile (2.6 m a pixel)
QUALITY = int(os.environ.get('GROUND_Q', '55'))
OUT = os.path.join(ROOT, 'dist', 'ground'); os.makedirs(OUT, exist_ok=True)
RASTERS = [Raster(k) for k in ('air', 'airx', 'airn') if os.path.exists(os.path.join(ROOT, 'data', 'region', k + '.json'))]

class Rows:  # whole rows of a mosaic, one band at a time, stitched across its chunks (with a zero on the end for "no photo")
    def __init__(self, R):
        self.R, self.y, self.rows = R, None, None
        self.ncol = (R.w + R.size - 1) // R.size
    def get(self, y):
        R = self.R
        if y < 0 or y >= R.h: return None
        if y != self.y:
            out = [bytearray(), bytearray(), bytearray()]
            for cx in range(self.ncol):
                ch = R.chunks.get((y // R.size, cx))
                cw = min(R.size, R.w - cx * R.size)
                if not ch:
                    for b in out: b.extend(bytes(cw))
                    continue
                w, h, data = ch; off = (y % R.size) * w
                for b in range(3): out[b].extend(data[b * w * h + off: b * w * h + off + cw])
            for b in out: b.append(0)
            self.y, self.rows = y, [bytes(b) for b in out]
        return self.rows

def bmp(path, w, h, rows_bgr):  # rows top to bottom; BMP stores them bottom up
    size = 54 + w * h * 3
    hdr = b'BM' + size.to_bytes(4, 'little') + bytes(4) + (54).to_bytes(4, 'little') + (40).to_bytes(4, 'little') + w.to_bytes(4, 'little') + h.to_bytes(4, 'little')
    hdr += (1).to_bytes(2, 'little') + (24).to_bytes(2, 'little') + bytes(4) + (w * h * 3).to_bytes(4, 'little') + (2835).to_bytes(4, 'little') * 2 + bytes(8)
    with open(path, 'wb') as f:
        f.write(hdr)
        for r in reversed(rows_bgr): f.write(r)

def block(pi, pj):
    N = PX * PACK; mpp = TILE / PX; x0, z0 = pi * PACK * TILE, pj * PACK * TILE
    lons = [LON0 + (x0 + (px + 0.5) * mpp) / KX for px in range(N)]
    lats = [LAT0 - (z0 + (py + 0.5) * mpp) / KZ for py in range(N)]
    use = []
    for R in RASTERS:  # the photo sets that reach this block, best first
        if lons[-1] < R.W or lons[0] > R.E or lats[0] < R.S or lats[-1] > R.N: continue
        xs = [int(round((lo - R.W) / R.dlon - 0.5)) for lo in lons]
        xs = [x if 0 <= x < R.w else R.w for x in xs]  # R.w points at the zero on the end of each row
        use.append((R, Rows(R), itemgetter(*xs)))
    if not use: return None
    rows, got = [], 0
    for py in range(N):
        best = None
        for R, rw, gather in use:
            y = int(round((R.N - lats[py]) / R.dlat - 0.5)); r = rw.get(y)
            if r is None: continue
            px = [list(gather(r[0])), list(gather(r[1])), list(gather(r[2]))]
            if best is None: best = px
            else:  # fill the holes the better photos left
                b0, b1, b2 = best
                for i in range(N):
                    if not (b0[i] or b1[i] or b2[i]): b0[i], b1[i], b2[i] = px[0][i], px[1][i], px[2][i]
            if all(a or b or c for a, b, c in zip(*best)): break
        if best is None: best = [[0] * N] * 3
        got += sum(1 for a, b, c in zip(*best) if a or b or c)
        line = bytearray(N * 3); line[0::3] = bytes(best[2]); line[1::3] = bytes(best[1]); line[2::3] = bytes(best[0])
        rows.append(bytes(line))
    if got < N * N * 0.02: return None  # open ocean or no photo: the game keeps its painted ground
    tmp = os.path.join(OUT, 'tmp_%d_%d.bmp' % (pi, pj)); out = os.path.join(OUT, 'g_%d_%d.jpg' % (pi, pj))
    bmp(tmp, N, N, rows)
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', str(QUALITY), tmp, '--out', out], capture_output=True)
    os.remove(tmp)
    return os.path.getsize(out)

if __name__ == '__main__':
    packs = sorted({tuple(int(v) for v in f[2:-5].split('_')) for f in os.listdir(os.path.join(ROOT, 'dist', 'packs')) if f.startswith('p_')})
    only = sys.argv[1:] and [tuple(int(v) for v in a.split(',')) for a in sys.argv[1:]]
    total = n = 0
    for pi, pj in (only or packs):
        s = block(pi, pj)
        if s: total += s; n += 1
        print('g_%d_%d' % (pi, pj), s or 'skipped', flush=True)
    json.dump(sorted('%d_%d' % (pi, pj) for pi, pj in (only or packs) if os.path.exists(os.path.join(OUT, 'g_%d_%d.jpg' % (pi, pj)))), open(os.path.join(OUT, 'index.json'), 'w'))
    print('ground photos', n, 'total %.1f MB' % (total / 1e6))
