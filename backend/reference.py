"""Emission factors and unit prices — the one table every screen and the model share.

The web app fetches this on start (GET /api/v1/reference) and falls back to an identical built-in
copy only when the API is unreachable, so a factor can be changed here once and every calculation
follows. ai/train.py uses the same coal and grid figures.
"""
REFERENCE = {
    "carbonEUR": 75,          # € per tCO2e, CBAM reference
    "eurINR": 90,
    "creditLowINR": 600,      # indicative voluntary-credit range, INR per unit
    "creditHighINR": 1500,
    "gridFactor": 0.000716,   # tCO2e per kWh, national average grid
    "coalFactor": 2.42,       # tCO2e per tonne of coal
    "wasteFactor": 0.45,      # tCO2e per tonne of mixed industrial waste
    "gridRateINR": 7.5,       # INR per kWh
    "coalRateINR": 8200,      # INR per tonne of coal
    "wasteRateINR": 1400,     # INR per tonne treated
    "processRateINR": 600,    # INR per tCO2e of process emissions (abatement proxy)
}
REFERENCE_META = {
    "updated": "2026-02-01",
    "sources": {
        "gridFactor": "CEA CO2 baseline database, weighted average (illustrative)",
        "coalFactor": "IPCC default for sub-bituminous coal (illustrative)",
        "wasteFactor": "Illustrative mixed-waste treatment factor",
        "carbonEUR": "EU ETS reference price, dated",
    },
}
