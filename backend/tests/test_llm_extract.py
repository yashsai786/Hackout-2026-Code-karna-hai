"""The model-assist validator: what the model claims must be in the document."""
import os
import pytest
import requests

from llm_extract import validate, candidates_from_text, FUEL_FACTORS

PLANTS = [{"id": "surat-textiles", "name": "Surat Textile Mills", "city": "Surat"}, {"id": "bhilai-steel", "name": "Bhilai Steel Works", "city": "Bhilai"}]
TEXT = ("SURAT TEXTILE MILLS - electricity account. Consumption for December 2025 stood at 2.14 million units. "
        "Amount payable Rupees 1.6 crore before GST. Supplier DGVCL.")


def test_scale_words_become_candidates():
    c = candidates_from_text(TEXT)
    assert any(abs(x - 2_140_000) < 1 for x in c) and any(abs(x - 16_000_000) < 1 for x in c)


def test_accepts_only_what_the_text_supports():
    claim = {"source_type": "electricity", "quantity": 2140000, "cost_inr": 16000000, "period": "2025-12",
             "factory_id": "surat-textiles", "fuel_kind": None,
             "evidence": ["stood at 2.14 million units", "Amount payable Rupees 1.6 crore"]}
    accepted, rejected = validate(claim, TEXT, PLANTS)
    assert accepted["quantity"] == 2140000 and accepted["cost_inr"] == 16000000 and accepted["period"] == "2025-12"
    assert accepted["factory_id"] == "surat-textiles" and len(accepted["evidence"]) == 2 and rejected == []


def test_rejects_invented_figures_plants_and_quotes():
    claim = {"source_type": "electricity", "quantity": 2500000, "cost_inr": 16000000, "period": "2025-11",
             "factory_id": "bhilai-steel", "fuel_kind": "coal", "evidence": ["units consumed 2,500,000"]}
    accepted, rejected = validate(claim, TEXT, PLANTS)
    assert "quantity" not in accepted and "period" not in accepted and "factory_id" not in accepted and "fuel_kind" not in accepted
    assert accepted["cost_inr"] == 16000000 and accepted["evidence"] == []
    assert len(rejected) == 5


def test_fuel_maps_to_the_fixed_factor_table():
    text = "Furnace oil delivered: 1,860 KL, December 2025, value INR 100,812,000"
    accepted, _ = validate({"source_type": "fuel", "quantity": 1860, "fuel_kind": "furnace oil", "period": "2025-12", "evidence": []}, text, PLANTS)
    assert accepted["factor"] == FUEL_FACTORS["furnace oil"][0] and accepted["unit"] == "KL furnace oil"


BASE_URL = os.environ.get("LEAKPOINT_API_URL")


@pytest.mark.skipif(not BASE_URL, reason="LEAKPOINT_API_URL is not set")
def test_live_prose_bill_is_read_by_the_model_when_a_key_is_connected():
    if not requests.get(f"{BASE_URL}/api/v1/settings", timeout=10).json().get("has_key"):
        pytest.skip("no OpenRouter key connected")
    res = requests.post(f"{BASE_URL}/api/v1/intake/extract", files={"file": ("surat-account-note.txt", TEXT.encode(), "text/plain")}, timeout=90)
    assert res.status_code == 200, res.text
    out = res.json()
    if out.get("llm", {}).get("unavailable"):
        pytest.skip(f"model unavailable: {out['llm']['unavailable']}")  # a provider cap is not a defect here
    assert out["method"].endswith("+llm"), out
    assert out["quantity"] == 2140000 and out["cost_inr"] == 16000000 and out["period"] == "2025-12"
    assert out.get("factory_id") == "surat-textiles"
    assert any(e.startswith("Model (") for e in out["evidence"])
