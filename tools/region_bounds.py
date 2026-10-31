"""The map's extent, shared by every tool.

OLD is the original streamed map (Southport to Burleigh); S, W, N, E is the extended map: south to Coolangatta and the
Gold Coast Airport, and about 30 km inland (Tallebudgera, Currumbin Valley, Mudgeeraba, Nerang, towards Springbrook).
"""
OLD = (-28.110, 153.355, -27.935, 153.468)  # south, west, north, east
N0 = -27.935  # where the map stopped before the northern strip (tools/fetch_north.py)
S, W, N, E = -28.200, 153.180, -27.820, 153.560  # north now reaches Coomera, Oxenford and the theme parks
