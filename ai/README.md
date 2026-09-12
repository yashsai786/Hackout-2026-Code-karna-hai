# Model card — hotspot disaggregation

The learned component of [Leakpoint](../README.md). One model, one job: given what a factory manager
can actually tell you, predict **where that factory's emissions come from**.

```bash
pip install -r requirements.txt
python train.py      # retrain; writes models/hotspots.joblib and models/metrics.json
python -m pytest     # behavioural tests against the committed artefact
```

The trained artefact is committed, so nothing above is required to run the demonstration.

---

## Why this model exists

Leakpoint's entire premise is telling a factory **where** its carbon comes from. Before this model,
that split came from a constant lookup table keyed on sector alone — so every steel plant in India
received an identical 50/20/27/3 breakdown, and therefore an identical ranked list of
recommendations. A 40-year-old coal blast furnace and a new electric arc furnace got the same advice.

That was the single thing stopping the product from being useful, and it is not fixable with better
arithmetic. An SME does not know its CO₂ split — that is the thing it is asking us for. It does know
its sector, its process route, roughly what it produces, what it spends on energy, what it burns,
where it is, how old the plant is, and how many people work there. The split is **not** a
deterministic function of those observables, so this is a genuine supervised learning problem with
irreducible uncertainty, not arithmetic wearing a hat.

## What it predicts

| Head | Target | Range |
| --- | --- | --- |
| `share_fuel` | proportion of annual emissions from thermal fuel | 0–1 |
| `share_electricity` | proportion from purchased electricity | 0–1 |
| `share_process` | proportion from process chemistry | 0–1 |
| `share_waste` | proportion from waste streams | 0–1 |
| `intensity_tco2e_per_t` | emissions intensity per tonne of product | > 0 |

The four shares are predicted independently and then normalised to sum to 1, so the output is always
a valid distribution regardless of what the individual heads return.

## Features

Eight, all of them things a plant manager can answer without an audit:

`sector`, `route`, `primary_fuel`, `region` (categorical) · `production_t`, `energy_spend_inr`,
`plant_age_years`, `headcount` (numeric)

Unseen categories are encoded to `-1` rather than raising, so a route we have never met degrades
instead of crashing. There is a test for that.

## Algorithm

`HistGradientBoostingRegressor` (scikit-learn), one head per target, native categorical support via
an `OrdinalEncoder`. 320 iterations, learning rate 0.07, max depth 6, min 25 samples per leaf,
seed 20260912.

Gradient boosting over a neural network because the dataset is tabular and eight-dimensional, where
boosted trees reliably win; because it trains in seconds on a laptop, which matters when a judge
wants to reproduce it; and because the relationships here are threshold-like — an electric route
moves load onto the grid — which trees express directly.

## How well it works

Held-out (20% of 8,000 plants), recorded in [`models/metrics.json`](models/metrics.json) at training
time and printed by `train.py`:

| | This model | The sector table it replaced |
| --- | --- | --- |
| **Names the correct primary hotspot** | **90.9%** | 78.0% |
| Mean absolute error across the four shares | **0.0280** | 0.0935 |
| Emissions-intensity MAE | 0.098 tCO₂e/t | — |

Per-share MAE: fuel 0.0359 · electricity 0.0309 · process 0.0303 · waste 0.0151.

The top-hotspot figure is the one that matters. A plant acts on its **single largest** source, so
naming the right one is worth more than being marginally closer on all four. The baseline in the
right-hand column is not a strawman — it is the exact constant-sector-mean table this product used
before, evaluated on the same held-out split.

## Training data — read this before quoting the numbers

**The model is trained on a synthetic cohort, not on real plant disclosures.** This is stated in
`train.py`, returned by the API as `training: "synthetic"`, asserted by a test, and shown on screen
wherever a prediction appears.

The right training sources are BEE PAT designated-consumer filings, the CEA CO₂ baseline database,
India GHG Programme inventories, and CDM/Gold Standard project design documents. They are not
redistributable and could not be assembled inside a hackathon window.

So 8,000 plants are generated from eight sector × route archetypes built on published per-tonne
intensity ranges, with lognormal plant-to-plant variation, age and scale efficiency effects, fuel
switching, and ±12% noise on the energy-spend figure to mirror the error in a real bookkeeping
answer.

**What this does and does not demonstrate.** It does not prove the model is accurate on real Indian
plants — no synthetic fit can. It does demonstrate that the model recovers plant-level structure the
constant sector table cannot, which is the specific claim being made. The comparison is like for
like: both are scored on the same held-out plants.

Swapping in real data means replacing `synthesise()` in `train.py`. Nothing else changes — not the
features, not the API, not the frontend.

## Where the model is used

`backend/server.py` loads `models/hotspots.joblib` at startup and serves it at `POST /api/v1/hotspots`;
`GET /api/v1/model` returns this card as JSON. In the app, the **Estimate my split** panel on the
factory profile page calls it. If the API is down the app falls back to its own arithmetic and says
so, so a demonstration never depends on the service being up.

`tests/test_model.py` mirrors the server's inference path exactly, so a divergence between the two
fails here first.

---

**This folder holds the trained model. It is not the only intelligence in Leakpoint** — the Copilot
in `frontend/src/copilot/` is an LLM assistant that computes nothing itself and may only read numbers
back from the domain functions. See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for why the two
are kept apart.
