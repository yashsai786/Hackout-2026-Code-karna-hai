"""Behavioural tests for the hotspot-disaggregation model.

These run against the committed artefact (ai/models/hotspots.joblib), so they pass on a fresh clone
without retraining. They assert the properties the product depends on, not the exact numbers a
retrain would move:

  1. the artefact loads and carries its own provenance,
  2. predicted shares form a valid distribution,
  3. the model still beats the constant sector table it replaced — the whole reason it exists,
  4. it actually discriminates between two plants the sector table would treat identically.

(4) is the one that matters. Before this model, every steel plant in the country received the same
50/20/27/3 split and therefore the same ranked recommendations. If that regressed, the product's
central claim would be false and every other test here would still pass.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from joblib import load

ARTEFACT = Path(__file__).resolve().parent.parent / "models" / "hotspots.joblib"
SOURCES = ["fuel", "electricity", "process", "waste"]

pytestmark = pytest.mark.skipif(
    not ARTEFACT.exists(), reason="run `python ai/train.py` to produce models/hotspots.joblib"
)


@pytest.fixture(scope="module")
def bundle():
    return load(ARTEFACT)


def predict(bundle, **plant):
    """Mirror of the inference path in backend/server.py, so a divergence fails here first."""
    row = pd.DataFrame([plant])[bundle["features"]]
    row[bundle["categorical"]] = bundle["encoder"].transform(row[bundle["categorical"]])
    raw = np.array(
        [float(bundle["models"][f"share_{s}"].predict(row)[0]) for s in SOURCES]
    ).clip(0, None)
    shares = raw / raw.sum() if raw.sum() > 0 else np.full(4, 0.25)
    intensity = max(float(bundle["models"]["intensity_tco2e_per_t"].predict(row)[0]), 0.0)
    return dict(zip(SOURCES, shares)), intensity


BF_BOF = dict(sector="Steel", route="BF-BOF", primary_fuel="Coal", region="East",
              production_t=850_000, energy_spend_inr=4_200_000_000, plant_age_years=28, headcount=1400)
EAF = dict(sector="Steel", route="EAF", primary_fuel="Electric", region="West",
           production_t=120_000, energy_spend_inr=780_000_000, plant_age_years=9, headcount=260)


def test_artefact_declares_its_own_provenance(bundle):
    """A model that cannot say how it was trained cannot be presented honestly."""
    assert bundle["training"] == "synthetic"
    assert bundle["n_samples"] == 8000
    assert set(bundle["sources"]) == set(SOURCES)
    assert len(bundle["features"]) == 8


def test_shares_form_a_valid_distribution(bundle):
    for plant in (BF_BOF, EAF):
        shares, intensity = predict(bundle, **plant)
        assert pytest.approx(sum(shares.values()), abs=1e-9) == 1.0
        assert all(0.0 <= v <= 1.0 for v in shares.values())
        assert intensity > 0


def test_model_beats_the_sector_table_it_replaced(bundle):
    """The justification for shipping a model at all. Held-out, recorded at training time."""
    m = bundle["metrics"]
    assert m["model_share_mae"] < m["sector_table_share_mae"]
    # Guard against a silent regression to a marginal win.
    assert (1 - m["model_share_mae"] / m["sector_table_share_mae"]) > 0.5


def test_two_steel_plants_get_materially_different_splits(bundle):
    """The sector table gave these two identical advice. They are not alike."""
    blast_furnace, _ = predict(bundle, **BF_BOF)
    electric_arc, _ = predict(bundle, **EAF)

    # A coal blast furnace burns fuel; an electric arc furnace pulls from the grid.
    assert blast_furnace["fuel"] > electric_arc["fuel"]
    assert electric_arc["electricity"] > blast_furnace["electricity"]
    # Different enough to change which intervention ranks first, not merely different in the decimals.
    assert max(abs(blast_furnace[s] - electric_arc[s]) for s in SOURCES) > 0.15


def test_older_plants_are_not_more_efficient(bundle):
    """Sanity check on a monotonic relationship the training data encodes."""
    young = dict(BF_BOF, plant_age_years=5)
    old = dict(BF_BOF, plant_age_years=40)
    assert predict(bundle, **old)[1] >= predict(bundle, **young)[1]


def test_unseen_categories_do_not_crash(bundle):
    """An operator will eventually type a route we have never seen. Degrade, never throw."""
    shares, intensity = predict(bundle, **dict(BF_BOF, route="Hydrogen DRI"))
    assert pytest.approx(sum(shares.values()), abs=1e-9) == 1.0
    assert intensity > 0
