"""
Train the hotspot-disaggregation model.

WHY THIS MODEL EXISTS
---------------------
Leakpoint's whole premise is telling a factory WHERE its carbon comes from. Until now the split
across thermal fuel, electricity, process and waste came from a constant lookup table keyed on
sector alone, so every steel plant in the country received an identical 50/20/27/3 breakdown and
therefore an identical ranked list of recommendations. That is the single reason the product could
not differentiate between two plants in the same sector.

An SME does not know its CO2 split — that is the thing it is asking us for. It does know: its
sector, its process route, roughly how much it produces, what it spends on energy, which fuel it
burns, where it is, how old the plant is and how many people work there. The split is NOT a
deterministic function of those observables, so this is a genuine supervised learning problem with
irreducible uncertainty, not arithmetic wearing a hat.

HONESTY ABOUT THE TRAINING DATA
-------------------------------
Plant-level Indian disclosures (BEE PAT designated-consumer filings, the CEA CO2 baseline database,
India GHG Programme inventories, CDM/Gold Standard PDDs) are the right training source, but they
are not redistributable and could not be assembled inside the hackathon window. This script
therefore fits on a SYNTHETIC cohort generated from published per-tonne intensity ranges and process
archetypes, with plant-to-plant lognormal variation. That is stated in the README, in the API
response (`training: "synthetic"`), and on screen wherever a prediction is shown.

What the synthetic fit still demonstrates honestly: the model recovers plant-level structure that
the constant sector table cannot. The script reports both its own held-out error and the error of
the constant-sector-table baseline the app used before, so the comparison is explicit.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OrdinalEncoder

SEED = 20260912
RNG = np.random.default_rng(SEED)
N = 8000
OUT = Path(__file__).parent / "models"
SOURCES = ["fuel", "electricity", "process", "waste"]

# Emission factors shared with the frontend (frontend/src/domain/fixtures.ts `reference`).
COAL_FACTOR = 2.42          # tCO2e per tonne of coal
WASTE_FACTOR = 0.45         # tCO2e per tonne of waste
COAL_RATE = 8200            # INR per tonne
GRID_RATE = 7.5             # INR per kWh

# Per-tonne-of-product archetypes. Illustrative central values drawn from published sector ranges;
# every plant is sampled around these with lognormal spread, so no two plants are alike.
ARCHETYPES = {
    ("Steel", "BF-BOF"):      dict(coal=0.60, kwh=420, process=0.55, waste=0.30),
    ("Steel", "EAF"):         dict(coal=0.06, kwh=620, process=0.08, waste=0.15),
    ("Cement", "Dry kiln"):   dict(coal=0.11, kwh=95,  process=0.53, waste=0.02),
    ("Cement", "Wet kiln"):   dict(coal=0.18, kwh=110, process=0.53, waste=0.03),
    ("Textiles", "Spinning"): dict(coal=0.02, kwh=720, process=0.01, waste=0.05),
    ("Textiles", "Wet processing"): dict(coal=0.12, kwh=480, process=0.02, waste=0.35),
    ("Chemicals", "Bulk"):    dict(coal=0.18, kwh=540, process=0.35, waste=0.22),
    ("Chemicals", "Specialty"): dict(coal=0.10, kwh=780, process=0.18, waste=0.30),
}
ROUTES = {s: [r for (sec, r) in ARCHETYPES if sec == s] for s in {k[0] for k in ARCHETYPES}}
# Regional grid carbon intensity, tCO2e per kWh.
REGIONS = {"North": 0.00078, "West": 0.00071, "South": 0.00065, "East": 0.00082, "Central": 0.00076}

FEATURES = ["sector", "route", "primary_fuel", "region", "production_t", "energy_spend_inr", "plant_age_years", "headcount"]
CATEGORICAL = ["sector", "route", "primary_fuel", "region"]


def synthesise(n: int) -> pd.DataFrame:
    """Generate a plant cohort. Latent intensities drive the true split; only a realistic subset of
    plant attributes is exposed as features, which is what makes the split inferable rather than
    computable."""
    keys = list(ARCHETYPES)
    idx = RNG.integers(0, len(keys), n)
    sector = np.array([keys[i][0] for i in idx])
    route = np.array([keys[i][1] for i in idx])

    production = np.exp(RNG.normal(np.log(120_000), 0.95, n)).clip(4_000, 3_000_000)
    region = RNG.choice(list(REGIONS), n)
    grid = np.array([REGIONS[r] for r in region])
    age = RNG.integers(2, 45, n)
    # Older plants are less efficient; bigger plants a little more efficient.
    ineff = 1 + (age - 20) * 0.006 - (np.log(production) - np.log(120_000)) * 0.02

    def draw(field: str) -> np.ndarray:
        base = np.array([ARCHETYPES[keys[i]][field] for i in idx])
        return base * RNG.lognormal(0.0, 0.22, n) * ineff

    coal_pt, kwh_pt, proc_pt, waste_pt = (draw(f) for f in ("coal", "kwh", "process", "waste"))

    # A plant that has switched fuel burns less coal for the same heat.
    primary_fuel = RNG.choice(["Coal", "Natural gas", "Biomass", "Electric"], n, p=[0.58, 0.22, 0.13, 0.07])
    fuel_mult = np.select(
        [primary_fuel == "Coal", primary_fuel == "Natural gas", primary_fuel == "Biomass", primary_fuel == "Electric"],
        [1.0, 0.62, 0.28, 0.05])
    coal_pt = coal_pt * fuel_mult
    # Electrifying heat moves load onto the grid.
    kwh_pt = kwh_pt * np.where(primary_fuel == "Electric", 1.75, 1.0)

    emissions = {
        "fuel": coal_pt * production * COAL_FACTOR,
        "electricity": kwh_pt * production * grid,
        "process": proc_pt * production,
        "waste": waste_pt * production * WASTE_FACTOR,
    }
    total = sum(emissions.values())

    # What an operator can actually tell us, with the ±12% error of a real bookkeeping answer.
    spend = (coal_pt * production * COAL_RATE + kwh_pt * production * GRID_RATE) * RNG.lognormal(0, 0.12, n)
    headcount = (production ** 0.42 * RNG.lognormal(np.log(2.6), 0.3, n)).round().clip(8, 9000)

    frame = pd.DataFrame({
        "sector": sector, "route": route, "primary_fuel": primary_fuel, "region": region,
        "production_t": production.round(), "energy_spend_inr": spend.round(),
        "plant_age_years": age, "headcount": headcount,
    })
    for s in SOURCES:
        frame[f"share_{s}"] = emissions[s] / total
    frame["intensity_tco2e_per_t"] = total / production
    return frame


def main() -> None:
    data = synthesise(N)
    encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
    x = data[FEATURES].copy()
    x[CATEGORICAL] = encoder.fit_transform(x[CATEGORICAL])
    cat_mask = [c in CATEGORICAL for c in FEATURES]

    targets = [f"share_{s}" for s in SOURCES] + ["intensity_tco2e_per_t"]
    x_train, x_test, y_train, y_test = train_test_split(x, data[targets], test_size=0.2, random_state=SEED)

    models, report = {}, {}
    for target in targets:
        model = HistGradientBoostingRegressor(
            max_iter=320, learning_rate=0.07, max_depth=6, min_samples_leaf=25,
            categorical_features=cat_mask, random_state=SEED)
        model.fit(x_train, y_train[target])
        models[target] = model
        report[target] = float(np.abs(model.predict(x_test) - y_test[target]).mean())

    # The honest comparison: the constant sector table this model replaces.
    sector_means = data.loc[x_train.index].join(data["sector"], rsuffix="_r").groupby("sector")[[f"share_{s}" for s in SOURCES]].mean()
    test_sectors = data.loc[x_test.index, "sector"]
    baseline = {}
    for s in SOURCES:
        guess = test_sectors.map(sector_means[f"share_{s}"]).to_numpy()
        baseline[f"share_{s}"] = float(np.abs(guess - y_test[f"share_{s}"]).mean())

    share_keys = [f"share_{s}" for s in SOURCES]
    model_mae = float(np.mean([report[k] for k in share_keys]))
    table_mae = float(np.mean([baseline[k] for k in share_keys]))

    OUT.mkdir(exist_ok=True)
    dump({"models": models, "encoder": encoder, "features": FEATURES, "categorical": CATEGORICAL,
          "sources": SOURCES, "targets": targets, "seed": SEED, "n_samples": N,
          "routes": ROUTES, "regions": REGIONS, "training": "synthetic",
          "metrics": {"model_share_mae": model_mae, "sector_table_share_mae": table_mae, "per_target": report}},
         OUT / "hotspots.joblib")

    print(f"trained on {N} synthetic plants, {len(x_test)} held out\n")
    print("held-out mean absolute error, per share:")
    for s in SOURCES:
        print(f"  {s:<12} model {report['share_' + s]:.4f}   sector-table {baseline['share_' + s]:.4f}")
    print(f"\n  mean share MAE      model {model_mae:.4f}   sector-table {table_mae:.4f}")
    print(f"  improvement over the constant sector table: {(1 - model_mae / table_mae) * 100:.1f}%")
    print(f"  intensity MAE       {report['intensity_tco2e_per_t']:.4f} tCO2e/t")
    print(f"\nsaved {OUT / 'hotspots.joblib'}")
    (OUT / "metrics.json").write_text(json.dumps(
        {"model_share_mae": model_mae, "sector_table_share_mae": table_mae,
         "improvement_pct": (1 - model_mae / table_mae) * 100, "per_target": report,
         "n_samples": N, "training": "synthetic"}, indent=2))


if __name__ == "__main__":
    main()
