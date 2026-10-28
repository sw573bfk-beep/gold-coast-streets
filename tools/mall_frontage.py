# Cavill Mall geometry and frontage.
# OSM has no outlines for most mall shopfronts: on the south side the nearest outline is the Paradise Centre
# block ~33 m back, while the shops' own coordinates sit 12-15 m from the walkway's centreline. So shopfront
# terraces are added along the real frontage line wherever no OSM building already fronts the mall.
# Executed from build_details.py (shares its globals).

MALL_NAME = 'Cavill Avenue'
MALL = []
for r in roads:
    if r[0] == ROAD_TYPES.index('pedestrian') and r[2] >= 0 and names[r[2]] == MALL_NAME:
        for i in range(4, len(r), 2):
            q = (r[i], r[i + 1])
            if not MALL or MALL[-1] != q:
                MALL.append(q)
if MALL and MALL[0][0] > MALL[-1][0]:
    MALL.reverse()  # west (Surfers Paradise Blvd) -> east (The Esplanade)
MCUM = [0.0]
for i in range(1, len(MALL)):
    MCUM.append(MCUM[-1] + math.hypot(MALL[i][0] - MALL[i - 1][0], MALL[i][1] - MALL[i - 1][1]))
MALL_LEN = MCUM[-1] if MALL else 0.0
FRONT = 10.5  # metres from the centreline to the shopfronts

def mall_at(s):
    """point and direction at distance s along the mall (extrapolated past the ends)"""
    i = 0
    while i < len(MALL) - 2 and MCUM[i + 1] < s:
        i += 1
    L = MCUM[i + 1] - MCUM[i] or 1
    ex, ez = (MALL[i + 1][0] - MALL[i][0]) / L, (MALL[i + 1][1] - MALL[i][1]) / L
    return MALL[i][0] + ex * (s - MCUM[i]), MALL[i][1] + ez * (s - MCUM[i]), ex, ez

def mall_normal(s, side):
    _, _, ex, ez = mall_at(s)
    return (-ez * side, ex * side)  # side +1 = south side, -1 = north side

def mall_proj(x, z):
    """(distance from centreline, s along the mall, side) — s is extrapolated beyond the ends"""
    best = None
    for i in range(len(MALL) - 1):
        ax, az = MALL[i]; bx, bz = MALL[i + 1]
        ex, ez = bx - ax, bz - az; L = math.hypot(ex, ez) or 1
        t = ((x - ax) * ex + (z - az) * ez) / (L * L)
        tc = t if (i == 0 and t < 0) or (i == len(MALL) - 2 and t > 1) else max(0, min(1, t))
        cx, cz = ax + ex * tc, az + ez * tc
        d = math.hypot(x - cx, z - cz)
        side = 1 if ex * (z - az) - ez * (x - ax) > 0 else -1
        if best is None or d < best[0]:
            best = (d, MCUM[i] + tc * L, side)
    return best

def ray_hit(x, z, dx, dz, maxd=45):
    """first ground-level building wall along a ray: (distance, building, edge, t along edge)"""
    best = (maxd, -1, -1, 0.0)
    ex_, ez_ = x + dx * maxd, z + dz * maxd
    for bi, pts in enumerate(bpolys):
        if buildings[bi][1] > 2.5 or buildings[bi][0] < 2.5:
            continue
        for k in range(len(pts)):
            ax, az = pts[k]; bx, bz = pts[(k + 1) % len(pts)]
            rx, rz, sx, sz = ex_ - x, ez_ - z, bx - ax, bz - az
            den = rx * sz - rz * sx
            if abs(den) < 1e-9:
                continue
            t = ((ax - x) * sz - (az - z) * sx) / den
            u = ((ax - x) * rz - (az - z) * rx) / den
            if 0 < t <= 1 and 0 <= u <= 1 and t * maxd < best[0]:
                best = (t * maxd, bi, k, u * math.hypot(sx, sz))
    return best

def near_other_road(x, z, r=2.0):
    gx, gz = gkey(x, z)
    for a in range(gx - 1, gx + 2):
        for b in range(gz - 1, gz + 2):
            for s in road_grid.get((a, b), ()):
                if seg_dist(x, z, *s[:4])[0] < r:
                    return True
    return False

mall_terraces = 0
if MALL:
    for side in (-1, 1):
        run = []
        def flush():
            global mall_terraces
            if len(run) >= 3 and run[-1][0] - run[0][0] >= 4:
                back = min(b for _, b in run)
                def sharp(i):  # only follow bends in the walkway sharper than ~15 degrees
                    if i <= 0 or i >= len(MALL) - 1: return False
                    a = math.atan2(MALL[i][1] - MALL[i - 1][1], MALL[i][0] - MALL[i - 1][0]); b = math.atan2(MALL[i + 1][1] - MALL[i][1], MALL[i + 1][0] - MALL[i][0])
                    return abs((b - a + math.pi) % (2 * math.pi) - math.pi) > 0.26
                ss = [run[0][0]] + [MCUM[i] for i in range(len(MALL)) if run[0][0] + 3 < MCUM[i] < run[-1][0] - 3 and sharp(i)] + [run[-1][0]]
                front, rear = [], []
                for s in ss:
                    cx, cz, _, _ = mall_at(s); nx, nz = mall_normal(s, side)
                    front.append((round(cx + nx * FRONT, 2), round(cz + nz * FRONT, 2)))
                    rear.append((round(cx + nx * back, 2), round(cz + nz * back, 2)))
                n0 = len(buildings)
                add_building(front + rear[::-1], 8.6, 0, 2, 'Cavill Mall shopfronts %s%d' % ('S' if side > 0 else 'N', mall_terraces))
                if len(buildings) > n0:
                    mall_terraces += 1
            run.clear()
        s = 3.0
        while s <= MALL_LEN - 2:
            cx, cz, _, _ = mall_at(s); nx, nz = mall_normal(s, side)
            d = ray_hit(cx, cz, nx, nz)[0]
            ok = d > FRONT + 6.5  # deep enough for a walk-in shop; otherwise the existing building is the frontage
            back = min(d - 0.4, FRONT + 13)
            if ok and (near_other_road(cx + nx * (FRONT + 0.5), cz + nz * (FRONT + 0.5)) or near_other_road(cx + nx * (FRONT + back) / 2, cz + nz * (FRONT + back) / 2)):
                ok = False
            if ok:
                run.append((s, back))
            else:
                flush()
            s += 2.0
        flush()
print('mall length', round(MALL_LEN), 'm, frontage terraces added', mall_terraces)
