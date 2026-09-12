"""Local OCR for scanned bills and photographed registers.

RapidOCR (PaddleOCR models on ONNX Runtime): pip-installable, CPU-only, offline once installed, and
about half a second per page on a laptop. No system binary, no cloud call — a photo of a coal
register never leaves the machine. Scanned PDFs are rasterised page by page with pypdfium2.

The engine loads lazily on first use and is warmed in the background at startup so the first
upload does not pay for it; if the packages are missing the extractor says so rather than failing.
"""
from __future__ import annotations

import io
import threading
from typing import Any, Dict, List, Optional

_engine = None
_lock = threading.Lock()
_error: Optional[str] = None


def _load():
    global _engine, _error
    with _lock:
        if _engine is not None or _error is not None:
            return _engine
        try:
            from rapidocr_onnxruntime import RapidOCR
            _engine = RapidOCR()
        except Exception as e:  # missing wheel, unsupported CPU — report, do not crash the API
            _error = f"{type(e).__name__}: {e}"
        return _engine


def warm() -> None:
    threading.Thread(target=_load, name="ocr-warm", daemon=True).start()


def status() -> Dict[str, Any]:
    if _engine is not None:
        return {"ocr": "ready", "engine": "RapidOCR (ONNX Runtime, CPU)"}
    if _error is not None:
        return {"ocr": "unavailable", "error": _error}
    return {"ocr": "loading"}


def read_image(data: bytes) -> Dict[str, Any]:
    """Text lines with confidences, top-to-bottom, for one image."""
    import numpy as np
    from PIL import Image, ImageOps

    engine = _load()
    if engine is None:
        raise RuntimeError(f"OCR engine unavailable: {_error}")
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    # Phone photos are large; the models are trained around ~1000 px on the long side.
    if max(img.size) > 1600:
        img.thumbnail((1600, 1600))
    result, _ = engine(np.array(img))
    lines: List[Dict[str, Any]] = []
    for box, text, conf in result or []:
        ys = [p[1] for p in box]
        lines.append({"text": str(text).strip(), "confidence": float(conf), "y": float(sum(ys) / len(ys))})
    lines.sort(key=lambda l: l["y"])
    return {"lines": lines, "text": "\n".join(l["text"] for l in lines), "width": img.size[0], "height": img.size[1]}


def read_pdf(data: bytes, max_pages: int = 6) -> Dict[str, Any]:
    """Rasterise an image-only PDF and OCR each page."""
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(io.BytesIO(data))
    pages, texts, lines = 0, [], []
    for i in range(min(len(doc), max_pages)):
        bitmap = doc[i].render(scale=2.2)  # ≈160 dpi: enough for print, small enough to stay quick
        buf = io.BytesIO()
        bitmap.to_pil().save(buf, format="PNG")
        out = read_image(buf.getvalue())
        pages += 1
        texts.append(out["text"])
        lines.extend(out["lines"])
    return {"lines": lines, "text": "\n".join(texts), "pages": pages, "truncated": len(doc) > max_pages}
