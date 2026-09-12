"""Read a source document and pull out the figures an intake record needs.

Deterministic and inspectable: every result carries the evidence it was read from (the column, the
row, the line of text) so a reviewer can check it against the document. Supported today:

  * tables   — CSV, XLSX, XLS: quantity and cost columns found by header keywords, summed by row
  * text     — TXT, and PDFs that carry a text layer: quantities found by unit, amounts by ₹/INR
  * scans    — images and image-only PDFs go through the local OCR engine (see ocr.py); each line
               carries its confidence and the extraction reports the mean

Nothing is guessed silently. If a quantity cannot be found the response says so and the operator
types it, which is still better than a figure invented to fill the box.
"""
from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional

import ocr

QUANTITY_HEADERS = {
    "electricity": ["kwh", "units consumed", "units", "consumption", "energy", "kvah"],
    "fuel": ["coal", "tonnes", "tons", "mt", "quantity", "qty", "fuel", "diesel", "furnace oil", "fo", "litres", "liters"],
    "waste": ["waste", "sludge", "effluent", "disposed", "tonnes", "tons", "qty", "quantity"],
}
COST_HEADERS = ["amount", "total", "cost", "charges", "value", "bill", "payable", "inr", "rs", "₹"]
# A unit price is not a cost. Columns whose header says so are never summed as one.
RATE_WORDS = ["rate", "price", "per ", "/t", "/kl", "/kwh", "per unit", "tariff"]
DATE_HEADERS = ["date", "period", "month", "billing", "invoice date"]
UNIT_RE = re.compile(r"([\d][\d,]*(?:\.\d+)?)\s*(kwh|kvah|units?|mt|tonnes?|tons?|kg|kl|litres?|liters?|ltrs?)\b", re.I)
AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)\s*([\d][\d,]*(?:\.\d+)?)|([\d][\d,]*(?:\.\d+)?)\s*(?:₹|inr|rupees)", re.I)
PERIOD_RE = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-/,']*(20\d{2})\b|\b(20\d{2})[-/](0[1-9]|1[0-2])\b|\b(0[1-9]|1[0-2])[-/](20\d{2})\b",
    re.I,
)
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
KIND_WORDS = {
    "electricity": ["electric", "kwh", "kvah", "units consumed", "discom", "power", "grid", "tariff"],
    "fuel": ["coal", "diesel", "furnace oil", "fuel", "lignite", "pet coke", "petcoke", "gas"],
    "waste": ["waste", "effluent", "sludge", "disposal", "manifest", "etp", "hazardous"],
}
UNIT_FOR = {"electricity": "kWh", "fuel": "tonnes coal", "waste": "tonnes waste"}


def _num(v) -> Optional[float]:
    try:
        s = str(v).replace(",", "").replace("₹", "").strip()
        if not s or s.lower() in ("nan", "none", "-"):
            return None
        return float(s)
    except ValueError:
        return None


def _guess_kind(text: str, hint: Optional[str]) -> str:
    if hint in KIND_WORDS:
        return hint
    low = text.lower()
    scores = {k: sum(low.count(w) for w in words) for k, words in KIND_WORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "unknown"


def _period_from_text(text: str) -> Optional[str]:
    m = PERIOD_RE.search(text)
    if not m:
        return None
    if m.group(1):
        return f"{m.group(2)}-{MONTHS[m.group(1).lower()[:3]]:02d}"
    if m.group(3):
        return f"{m.group(3)}-{m.group(4)}"
    return f"{m.group(6)}-{m.group(5)}"


def _from_table(frame, hint: Optional[str], filename: str, sheet: str = "") -> Dict[str, Any]:
    import pandas as pd  # noqa: F401

    cols = {c: str(c).strip().lower() for c in frame.columns}
    joined = " ".join(cols.values()) + " " + " ".join(map(str, frame.head(20).to_numpy().ravel()))
    # The document's own name is evidence too: "coal-purchase-register.xlsx" with a sheet called
    # "Coal register" is a fuel record even if no cell spells the word.
    kind = _guess_kind(f"{filename} {sheet} {joined}", hint)
    evidence: List[str] = []
    warnings: List[str] = []

    def pick(keys: List[str], exclude: List[str] = ()):
        # Headers are tried in the order the keyword list gives, so "amount" beats a stray "inr".
        for key in keys:
            for c, low in cols.items():
                if key in low and not any(x in low for x in exclude):
                    series = frame[c].map(_num).dropna()
                    if len(series):
                        return c, series
        return None, None

    qcol, qseries = pick(QUANTITY_HEADERS.get(kind, sum(QUANTITY_HEADERS.values(), [])))
    ccol, cseries = pick(COST_HEADERS, exclude=RATE_WORDS)
    dcol = next((c for c, low in cols.items() if any(k in low for k in DATE_HEADERS)), None)

    quantity = float(qseries.sum()) if qseries is not None else None
    cost = float(cseries.sum()) if cseries is not None else None
    if qcol is not None:
        evidence.append(f"Quantity: column “{qcol}”, {len(qseries)} row(s) summed = {quantity:,.2f}")
    else:
        warnings.append("No quantity column recognised — enter the figure from the document.")
    if ccol is not None:
        evidence.append(f"Cost: column “{ccol}”, {len(cseries)} row(s) summed = ₹{cost:,.0f}")
    period = None
    if dcol is not None:
        periods = sorted({p for p in (_period_from_text(str(v)) for v in frame[dcol].astype(str).head(200)) if p})
        if periods:
            period = periods[-1]
            if len(periods) > 1:
                evidence.append(f"Period: column “{dcol}” spans {len(periods)} periods ({periods[0]} to {periods[-1]}); quantity and cost are the sum, recorded against {period}")
                warnings.append(f"This file covers {len(periods)} periods. Record it as one entry, or split the rows if you want one record per month.")
            else:
                evidence.append(f"Period: column “{dcol}” → {period}")
    if period is None:
        period = _period_from_text(filename) or _period_from_text(joined)
    confidence = "High" if quantity is not None and cost is not None else "Medium" if quantity is not None else "Low"
    return {
        "method": "table", "source_type": kind, "unit": UNIT_FOR.get(kind),
        "quantity": quantity, "cost_inr": cost, "period": period,
        "rows": int(len(frame)), "confidence": confidence, "evidence": evidence, "warnings": warnings,
    }


def _from_text(text: str, hint: Optional[str], filename: str, method: str) -> Dict[str, Any]:
    kind = _guess_kind(text, hint)
    evidence: List[str] = []
    warnings: List[str] = []
    wanted = {"electricity": ("kwh", "kvah", "unit"), "fuel": ("mt", "tonne", "ton", "kg", "kl", "litre", "liter", "ltr"),
              "waste": ("mt", "tonne", "ton", "kg")}.get(kind, ())
    best = None
    for m in UNIT_RE.finditer(text):
        val, unit = _num(m.group(1)), m.group(2).lower()
        if val is None:
            continue
        if wanted and not unit.startswith(wanted):
            continue
        if unit in ("kg",):
            val /= 1000.0
        if best is None or val > best[0]:
            best = (val, m.group(0).strip(), unit)
    quantity = best[0] if best else None
    if best:
        evidence.append(f"Quantity: “{best[1]}”" + (" (kg → tonnes)" if best[2] == "kg" else ""))
    else:
        warnings.append("No quantity with a unit was found in the text — enter it from the document.")
    amounts = [(_num(a or b), (a or b)) for a, b in AMOUNT_RE.findall(text)]
    amounts = [(v, raw) for v, raw in amounts if v is not None]
    cost = max(amounts, key=lambda x: x[0])[0] if amounts else None
    if amounts:
        evidence.append(f"Cost: largest amount “₹{max(amounts, key=lambda x: x[0])[1]}” of {len(amounts)} found")
    period = _period_from_text(text) or _period_from_text(filename)
    if period:
        evidence.append(f"Period: {period}")
    confidence = "High" if quantity is not None and cost is not None else "Medium" if quantity is not None else "Low"
    return {
        "method": method, "source_type": kind, "unit": UNIT_FOR.get(kind),
        "quantity": quantity, "cost_inr": cost, "period": period,
        "chars": len(text), "confidence": confidence, "evidence": evidence, "warnings": warnings,
    }


def extract(data: bytes, filename: str, content_type: str, hint: Optional[str] = None) -> Dict[str, Any]:
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if name.endswith(".csv") or "csv" in ct:
        import pandas as pd
        frame = pd.read_csv(io.BytesIO(data))
        return {"filename": filename, **_from_table(frame, hint, filename)}
    if name.endswith((".xlsx", ".xls")) or "spreadsheet" in ct or "excel" in ct:
        import pandas as pd
        book = pd.read_excel(io.BytesIO(data), sheet_name=None)
        sheet, frame = next(iter(book.items()))
        return {"filename": filename, "sheet": str(sheet), **_from_table(frame, hint, filename, str(sheet))}
    if name.endswith(".pdf") or ct == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        if len(text.strip()) >= 20:
            return {"filename": filename, "pages": len(reader.pages), **_from_text(text, hint, filename, "pdf-text")}
        # No text layer: a scan. Rasterise and read it locally.
        return _ocr_result(ocr.read_pdf(data), hint, filename)
    if name.endswith((".txt", ".md", ".log")) or ct.startswith("text/"):
        return {"filename": filename, **_from_text(data.decode("utf-8", errors="replace"), hint, filename, "text")}
    if ct.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff")):
        return _ocr_result(ocr.read_image(data), hint, filename)
    raise ValueError("Unsupported file type. Use CSV, XLSX, TXT, PDF, or a photo or scan (PNG, JPG, WEBP, TIFF).")


def _ocr_result(read: Dict[str, Any], hint: Optional[str], filename: str) -> Dict[str, Any]:
    lines = read.get("lines", [])
    if not lines:
        raise ValueError("No readable text was found in the image. Try a sharper, straighter photo with the figures in frame.")
    out = _from_text(read["text"], hint, filename, "ocr")
    mean_conf = sum(l["confidence"] for l in lines) / len(lines)
    out["ocr_confidence"] = round(mean_conf, 3)
    out["ocr_lines"] = len(lines)
    out["evidence"].insert(0, f"OCR: {len(lines)} line(s) read locally, mean confidence {mean_conf:.0%}")
    if mean_conf < 0.8:
        out["warnings"].append("OCR confidence is below 80% — check the figures against the document.")
        if out["confidence"] == "High":
            out["confidence"] = "Medium"
    if read.get("pages"):
        out["pages"] = read["pages"]
    if read.get("truncated"):
        out["warnings"].append("Only the first pages were read.")
    return {"filename": filename, **out}
