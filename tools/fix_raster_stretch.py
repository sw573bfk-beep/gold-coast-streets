"""Undo the north-south stretch in the Queensland Government exports (heights and aerial photos).

The ImageServer only returns square pixels in degrees. We ask for pixels that are square in metres
(narrower in latitude), so it quietly widens each chunk's latitude range by MZ/MX (about 12%) around the
chunk's centre and squeezes that into the same number of rows. Every row away from the centre is then
out of place, by up to ~60 m at a 2048-row chunk's edges: hills come out flat or in the wrong spot and
photo colours land on the wrong ground.

Run once after downloading: python3 tools/fix_raster_stretch.py  (rewrites dem, demx, air, airx chunks
in data/region/ to the intended grid; marks each .json "unstretched" so it never runs twice)
"""
import array, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'data', 'region')
MX, MZ = 98330.0, 110574.0
K = MX / MZ  # intended row height / the row height the server used

for kind in ('dem', 'demx', 'air', 'airx'):
    mp = os.path.join(DIR, kind + '.json')
    if not os.path.exists(mp): continue
    meta = json.load(open(mp))
    if meta.get('unstretched'): print(kind, 'already fixed'); continue
    bands, nbytes = meta['bands'], meta['bytes']
    for c in meta['chunks']:
        p = os.path.join(DIR, c['file'])
        if not os.path.exists(p): continue
        cw, ch = c['w'], c['h']; n = cw * ch * bands
        raw = open(p, 'rb').read(); tail = raw[n * nbytes:]  # the 1-bit mask after the pixels is kept as it is
        if nbytes == 4:
            src = array.array('f'); src.frombytes(raw[:n * 4]); out = array.array('f', bytes(n * 4))
        else:
            src = raw[:n]; out = bytearray(n)
        for b in range(bands):
            base = b * cw * ch
            for i in range(ch):
                t = (i + 0.5 - ch / 2) * K + ch / 2 - 0.5  # where intended row i sits among the rows we got
                r0 = min(ch - 1, max(0, int(t // 1))); r1 = min(ch - 1, r0 + 1); f = min(1.0, max(0.0, t - r0))
                d = base + i * cw
                if nbytes == 4:  # heights: blend the two nearest rows (keep no-data where either is no-data)
                    a0 = base + r0 * cw; a1 = base + r1 * cw
                    for x in range(cw):
                        u, v = src[a0 + x], src[a1 + x]
                        out[d + x] = u if (u < -1000 or v < -1000) else u + (v - u) * f
                else:  # photo colours: the nearest row
                    r = r1 if f >= 0.5 else r0; a = base + r * cw
                    out[d:d + cw] = src[a:a + cw]
        open(p, 'wb').write((out.tobytes() if nbytes == 4 else bytes(out)) + tail)
    meta['unstretched'] = True
    json.dump(meta, open(mp, 'w'))
    print(kind, 'fixed', len(meta['chunks']), 'chunks', flush=True)
