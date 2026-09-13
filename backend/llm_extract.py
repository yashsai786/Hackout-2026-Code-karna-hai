"""Model-assisted extraction, with the model kept honest.

The deterministic parsers in extract.py read the layouts they know. A bill written as prose — "the
month's consumption stood at 2.14 million units, payable Rs 1.6 crore" — defeats header matching. When
the operator has connected a key, the document text is also given to their model with a strict JSON
schema and the hints the parsers found. Its answer is then VALIDATED, field by field, against the
document itself:

  * a quantity or cost is accepted only if the number can be derived from the text — the same digits,
    or a figure with a scale word beside it (2.14 million, 1.6 crore, 22.23 lakh);
  * a period is accepted only if that month and year appear in the text;
  * a plant match is accepted only if the plant's name or city appears in the text;
  * a fuel kind maps to an emission factor from a fixed table here, never from the model;
  * every evidence quote must be a substring of the document.

Anything that fails stays with the parser's value and is listed under "rejected" so the reviewer sees
what the model claimed but could not back. This is the same discipline the Copilot works under.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

import requests

OPENROUTER = "https://openrouter.ai/api/v1/chat/completions"

# tCO2e per unit as sold. Reference values; the operator can edit the factor on screen.
FUEL_FACTORS: Dict[str, Tuple[float, str]] = {
    "coal": (2.42, "tonnes coal"),
    "lignite": (1.60, "tonnes lignite"),
    "pet coke": (3.10, "tonnes pet coke"),
    "furnace oil": (3.10, "KL furnace oil"),
    "diesel": (2.68, "KL diesel"),
    "lpg": (1.51, "tonnes LPG"),
    "natural gas": (2.75, "tonnes natural gas"),
    "biomass": (0.10, "tonnes biomass"),
}
SCALE = {"thousand": 1e3, "k": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5, "l": 1e5,
         "crore": 1e7, "crores": 1e7, "cr": 1e7, "million": 1e6, "mn": 1e6, "m": 1e6, "billion": 1e9, "bn": 1e9}
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\u2019", "'").replace("\u20b9", "rs")).strip().lower()


def candidates_from_text(text: str) -> List[float]:
    """Every number a reader could take from the text, including scale words beside it."""
    out: List[float] = []
    # A comma is a grouping separator only when a 2–3 digit group ends the number — so Indian
    # grouping (1,60,50,000) and Western (2,140,000) are read, while CSV field separators
    # (17600000,42000) are not glued into one figure.
    for m in re.finditer(r"(\d+(?:,\d{2,3}(?!\d))*(?:\.\d+)?)\s*([A-Za-z]+)?", text):
        try:
            base = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        out.append(base)
        word = (m.group(2) or "").lower()
        if word in SCALE:
            out.append(base * SCALE[word])
    for m in re.finditer(r"\d+(?:\.\d+)?", text):  # every bare digit run, as a safety net
        try:
            out.append(float(m.group(0)))
        except ValueError:
            pass
    return out


def _close(value: float, cands: List[float], tol: float = 0.006) -> bool:
    return any(c == value or (c != 0 and abs(c - value) / abs(c) <= tol) for c in cands)


def _period_in_text(period: str, text: str) -> bool:
    m = re.fullmatch(r"(20\d\d)-(0[1-9]|1[0-2])", period or "")
    if not m:
        return False
    year, month = m.group(1), int(m.group(2))
    low = text.lower()
    if year not in low:
        return False
    name = MONTHS[month - 1]
    return name in low or f"{year}-{month:02d}" in low or f"{month:02d}/{year}" in low or f"{month}/{year}" in low


def validate(claim: Dict[str, Any], text: str, factories: List[Dict[str, str]]) -> Tuple[Dict[str, Any], List[str]]:
    """Keep what the document supports; name what it does not."""
    accepted: Dict[str, Any] = {}
    rejected: List[str] = []
    cands = candidates_from_text(text)
    low = _norm(text)

    st = str(claim.get("source_type", "")).lower()
    if st in ("electricity", "fuel", "waste"):
        accepted["source_type"] = st

    for key in ("quantity", "cost_inr"):
        v = claim.get(key)
        if isinstance(v, (int, float)) and v > 0:
            if _close(float(v), cands):
                accepted[key] = float(v)
            else:
                rejected.append(f"{key} {v:,.2f} — no such figure in the document")

    period = claim.get("period")
    if isinstance(period, str):
        if _period_in_text(period, text):
            accepted["period"] = period
        else:
            rejected.append(f"period {period} — that month is not in the document")

    fid = claim.get("factory_id")
    if isinstance(fid, str) and fid:
        f = next((x for x in factories if x["id"] == fid), None)
        if f and (_norm(f["name"]) in low or (f.get("city") and _norm(f["city"]) in low)):
            accepted["factory_id"] = fid
            accepted["factory_name"] = f["name"]
        else:
            rejected.append(f"plant {fid} — the document does not name it")

    fuel_raw = claim.get("fuel_kind")
    fuel = str(fuel_raw).lower().strip() if isinstance(fuel_raw, str) else ""
    if fuel in FUEL_FACTORS and fuel in low:
        accepted["fuel_kind"] = fuel
        accepted["factor"], accepted["unit"] = FUEL_FACTORS[fuel]
    elif fuel:
        rejected.append(f"fuel '{fuel}' — not in the factor table or not in the document")

    quotes = claim.get("evidence") or []
    good = [q for q in quotes if isinstance(q, str) and 3 < len(q) < 200 and _norm(q) in low]
    if len(good) < len(quotes):
        rejected.append(f"{len(quotes) - len(good)} evidence quote(s) not found verbatim in the document")
    accepted["evidence"] = good
    return accepted, rejected


def _prompt(text: str, hints: Dict[str, Any], factories: List[Dict[str, str]]) -> List[Dict[str, str]]:
    plants = "\n".join(f"{f['id']} — {f['name']}, {f.get('city', '')}" for f in factories)
    system = (
        "You extract fields from an industrial utility bill, fuel register, or waste manifest. Reply with JSON only:\n"
        '{"source_type":"electricity"|"fuel"|"waste","quantity":number,"quantity_unit":string,"cost_inr":number,'
        '"period":"YYYY-MM","factory_id":string|null,"fuel_kind":string|null,"supplier":string|null,"evidence":[string]}\n'
        "quantity is the physical amount for the period (kWh for electricity; tonnes or KL for fuel; tonnes for waste) — "
        "not a rate, not a demand figure. cost_inr is the total amount payable in rupees, converting lakh/crore/million. "
        "period is the billing month. factory_id must be one of the ids below, only if the document names that plant, else null. "
        "fuel_kind is one of: coal, lignite, pet coke, furnace oil, diesel, lpg, natural gas, biomass — or null. "
        "evidence is 1-4 short verbatim quotes from the document supporting the figures. Never invent a figure; use null.\n"
        f"Plants:\n{plants}"
    )
    user = f"Parser hints (may be wrong): {json.dumps(hints)}\n\nDocument text:\n{text[:7000]}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def call_model(key: str, model: str, messages: List[Dict[str, str]], timeout: int = 60) -> str:
    """One call, one retry. Reasoning models spend tokens before the JSON appears; a 600-token cap
    returned empty content from a model that produces the right answer at 1,500."""
    # Three attempts with a growing budget. Free-tier models return an empty completion now and then
    # for no reason the response explains; a second attempt usually answers.
    last = ""
    for max_tokens in (1500, 3000, 3000):
        res = requests.post(
            OPENROUTER,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "HTTP-Referer": "http://localhost", "X-Title": "Leakpoint intake"},
            json={"model": model, "messages": messages, "temperature": 0, "max_tokens": max_tokens},
            timeout=timeout,
        )
        res.raise_for_status()
        choice = (res.json().get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content") or ""
        if "{" in content:
            return content
        last = content
    return last


def enrich(base: Dict[str, Any], text: str, factories: List[Dict[str, str]], key: Optional[str], model: Optional[str]) -> Dict[str, Any]:
    """Merge validated model fields over the parser result. Never raises: a model failure is a note."""
    out = dict(base)
    if not key or not model or not text or len(text.strip()) < 20:
        return out
    hints = {k: base.get(k) for k in ("source_type", "quantity", "unit", "cost_inr", "period")}
    try:
        raw = call_model(key, model, _prompt(text, hints, factories))
        m = re.search(r"\{[\s\S]*\}", raw)
        claim = json.loads(m.group(0)) if m else {}
    except Exception as e:  # network, auth, rate limit, JSON — the parser result stands, and the reason is quoted
        detail = type(e).__name__
        resp = getattr(e, "response", None)
        if resp is not None:
            try:
                detail = resp.json().get("error", {}).get("message") or f"HTTP {resp.status_code}"
            except Exception:
                detail = f"HTTP {resp.status_code}"
        out.setdefault("warnings", []).append(f"Model assist unavailable — {detail}. Parser result shown.")
        out["llm"] = {"model": model, "accepted": [], "rejected": [], "unavailable": detail}
        return out
    if not claim:
        # Say so rather than label the result model-assisted when the model gave nothing usable.
        out.setdefault("warnings", []).append(f"The model ({model}) returned no usable reply; parser result shown.")
        return out
    accepted, rejected = validate(claim, text, factories)
    for k in ("source_type", "quantity", "cost_inr", "period", "factory_id", "factory_name", "fuel_kind", "factor", "unit"):
        if k in accepted:
            out[k] = accepted[k]
    if accepted.get("unit") is None and accepted.get("source_type") and not out.get("unit"):
        out["unit"] = {"electricity": "kWh", "fuel": "tonnes coal", "waste": "tonnes waste"}[accepted["source_type"]]
    ev = out.setdefault("evidence", [])
    for q in accepted.get("evidence", []):
        ev.append(f"Model ({model}) cites: “{q}”")
    if accepted.get("factory_name"):
        ev.append(f"Matched to {accepted['factory_name']}: the document names the plant")
    if rejected:
        out.setdefault("warnings", []).extend(f"Model claim rejected — {r}" for r in rejected)
    out["method"] = f"{base.get('method', 'text')}+llm"
    out["llm"] = {"model": model, "accepted": sorted(k for k in accepted if k != "evidence"), "rejected": rejected}
    # Confidence describes how much of the record is read rather than assumed — recomputed after the
    # merge, so a prose bill the parser could not read but the model did (and the document confirms)
    # is not still labelled Low.
    have_q, have_c = out.get("quantity") is not None, out.get("cost_inr") is not None
    out["confidence"] = "High" if have_q and have_c and not rejected else "Medium" if have_q else "Low"
    return out
