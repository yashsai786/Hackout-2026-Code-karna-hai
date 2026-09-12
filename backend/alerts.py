"""Alerts computed from the data, not written in advance.

Every message here is derived from the current session document at request time, so it changes the
moment a baseline, a ledger record or a location does. Ids are stable per subject so the inbox can
keep a message's read state across regenerations.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from reference import REFERENCE

SOURCE_LABEL = {"fuel": "thermal energy", "electricity": "electricity", "process": "process emissions", "waste": "waste and effluent"}


def _fmt(n: float) -> str:
    return f"{n:,.0f}"


def build_alerts(doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    factories = [f for f in doc.get("factories", []) if isinstance(f, dict)]
    ledger = [e for e in doc.get("ledger", []) if isinstance(e, dict)]
    with_base = [f for f in factories if f.get("baseline")]
    out: List[Dict[str, Any]] = []

    if with_base:
        top = max(with_base, key=lambda f: f["baseline"])
        hs = top.get("hotspots") or {}
        src = max(hs, key=hs.get) if hs else None
        share = (hs[src] / top["baseline"] * 100) if src and top["baseline"] else None
        out.append({
            "id": f"ranking-{top['id']}", "type": "ranking",
            "title": f"{top['name']} leads the emissions ranking",
            "body": f"{top['name']} accounts for {_fmt(top['baseline'])} tCO\u2082e a year, the largest baseline in the portfolio."
                    + (f" {SOURCE_LABEL.get(src, src).capitalize()} is {share:.0f}% of it — the first place to look." if src and share else ""),
            "date": now, "read": False, "factoryId": top["id"],
        })

    gaps = [f for f in with_base if f.get("confidence") != "High" or not (f.get("readiness") or {}).get("baselineDocumented")]
    if gaps:
        names = ", ".join(f["name"] for f in gaps[:3]) + (f" and {len(gaps) - 3} more" if len(gaps) > 3 else "")
        out.append({
            "id": "baseline-gaps", "type": "baseline",
            "title": f"{len(gaps)} plant{'s' if len(gaps) != 1 else ''} with baseline documentation gaps",
            "body": f"{names} {'have' if len(gaps) != 1 else 'has'} a baseline below High confidence or without documented sources. "
                    "Complete the four emission sources on the process page to raise confidence and credit readiness.",
            "date": now, "read": False,
        })

    exposed = [f for f in with_base if f.get("sector") in ("Steel", "Cement") and (f.get("exportShare") or 0) > 0]
    if exposed:
        total = sum(f["baseline"] * f["exportShare"] * REFERENCE["carbonEUR"] * REFERENCE["eurINR"] for f in exposed)
        out.append({
            "id": "export-exposure", "type": "exposure",
            "title": f"CBAM exposure across {len(exposed)} exporting plant{'s' if len(exposed) != 1 else ''}",
            "body": f"At \u20ac{REFERENCE['carbonEUR']}/tCO\u2082e and \u20b9{REFERENCE['eurINR']}/\u20ac the declared EU export shares imply about "
                    f"\u20b9{total / 1e7:,.1f} crore a year of gross carbon-border exposure. A scenario, not a tax liability.",
            "date": now, "read": False,
        })

    unmapped = [f for f in factories if not f.get("coordinates")]
    if unmapped:
        out.append({
            "id": "unmapped", "type": "location",
            "title": f"{len(unmapped)} plant{'s' if len(unmapped) != 1 else ''} not yet on the map",
            "body": ", ".join(f["name"] for f in unmapped[:4]) + (" and more" if len(unmapped) > 4 else "")
                    + " have no coordinates. Add them on the process page so context layers apply.",
            "date": now, "read": False,
        })

    review = [e for e in ledger if e.get("status") == "In review"]
    if review:
        out.append({
            "id": "ledger-review", "type": "ledger",
            "title": f"{len(review)} ledger record{'s' if len(review) != 1 else ''} awaiting review",
            "body": "Estimates in review are counted in portfolio totals but carry no verified savings. Advance or discard them.",
            "date": now, "read": False,
        })
    return out
