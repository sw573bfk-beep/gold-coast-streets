"""The map's extent, shared by every tool.

OLD is the original streamed map (Southport to Burleigh); S, W, N, E is the extended map: south to Coolangatta and the
Gold Coast Airport, and about 30 km inland (Tallebudgera, Currumbin Valley, Mudgeeraba, Nerang, towards Springbrook).
"""
OLD = (-28.110, 153.355, -27.935, 153.468)  # south, west, north, east
N0 = -27.935  # where the map stopped before the northern strip (tools/fetch_north.py)
S, W, N, E = -28.200, 153.180, -27.820, 153.560  # north now reaches Coomera, Oxenford and the theme parks
# Brisbane: a second box on top of the map's north-west, from Logan up through the CBD to Chermside and the airport,
# west to Indooroopilly and Kenmore, east to Wynnum and Cleveland on Moreton Bay (tools/fetch_brisbane.py)
BRIS = (-27.820, 152.900, -27.360, 153.340)  # south, west, north, east (153.27-153.34 came later, in its own files: the rail line and the M1 cross into the map there)
BRIS_EAST = (-27.820, 153.270, -27.360, 153.340)
