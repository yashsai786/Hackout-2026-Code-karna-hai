"""Leakpoint API.

Serves the hotspot-disaggregation model (trained by ai/train.py) plus a health endpoint. The frontend degrades
to its own arithmetic if this service is unavailable, so the demonstration never depends on it.
"""
from contextlib import asynccontextmanager
from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

from store import Store, SettingsStore
from reference import REFERENCE, REFERENCE_META
from extract import extract as extract_document
import ocr

load_dotenv(Path(__file__).parent / '.env')

# The model lives in ai/ so the learned component is reviewable on its own; the API only loads it.
MODEL_PATH = Path(__file__).resolve().parent.parent / 'ai' / 'models' / 'hotspots.joblib'
SOURCES = ['fuel', 'electricity', 'process', 'waste']
state: Dict = {'bundle': None, 'db': None, 'store': Store(), 'settings': SettingsStore()}


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from joblib import load
        state['bundle'] = load(MODEL_PATH)
    except Exception:
        state['bundle'] = None          # the endpoint reports this rather than crashing the service
    client = None
    mongo_url = os.environ.get('MONGO_URL')
    if mongo_url:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1500)
            state['db'] = client[os.environ.get('DB_NAME', 'leakpoint')]
        except Exception:
            state['db'] = None
    state['store'] = Store(state['db'])
    state['settings'] = SettingsStore(state['db'])
    ocr.warm()
    yield
    if client is not None:
        client.close()


app = FastAPI(title='Leakpoint API', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allow_headers=['Content-Type'],
)


class Health(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    service: str = 'Leakpoint API'
    model_loaded: bool
    model_training: Optional[str] = None
    database: str
    ocr: str = 'loading'


class HotspotRequest(BaseModel):
    sector: str = Field(..., description='Steel | Cement | Textiles | Chemicals')
    route: str = Field(..., description='Process route, e.g. BF-BOF or Dry kiln')
    primary_fuel: str = Field('Coal', description='Coal | Natural gas | Biomass | Electric')
    region: str = Field('West', description='North | West | South | East | Central')
    production_t: float = Field(..., gt=0, description='Annual saleable output in tonnes')
    # Strictly positive: the model was trained on real bills and a zero drives the electricity share
    # to nothing. Refusing it is more honest than returning a degenerate split.
    energy_spend_inr: float = Field(..., gt=0, description='Annual energy spend in INR (fuel plus electricity bills)')
    plant_age_years: int = Field(15, ge=0, le=100)
    headcount: int = Field(150, ge=1)


class HotspotResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    shares: Dict[str, float]
    hotspots_tco2e_yr: Dict[str, float]
    baseline_tco2e_yr: float
    intensity_tco2e_per_t: float
    training: str
    model_share_mae: float
    sector_table_share_mae: float
    note: str


@app.get('/api/', response_model=Health)
@app.get('/api/health', response_model=Health)
async def health() -> Health:
    bundle = state['bundle']
    database = 'not configured'
    if state['db'] is not None:
        try:
            await state['db'].command('ping')
            database = 'available'
        except Exception:
            database = 'unavailable (service unaffected)'
    return Health(
        model_loaded=bundle is not None,
        model_training=(bundle or {}).get('training'),
        database=database,
        ocr=ocr.status()['ocr'],
    )


@app.get('/api/v1/model')
async def model_card() -> Dict:
    """What the model is, what it was trained on, and how it compares to the table it replaces."""
    bundle = state['bundle']
    if bundle is None:
        return {'loaded': False, 'hint': 'Run `python ai/train.py` to produce ai/models/hotspots.joblib.'}
    metrics = bundle.get('metrics', {})
    return {
        'loaded': True,
        'name': 'hotspot-disaggregation',
        'predicts': 'Share of annual emissions across thermal fuel, electricity, process and waste, plus emissions intensity.',
        'algorithm': 'HistGradientBoostingRegressor, one head per share, normalised to sum to 1',
        'features': bundle.get('features'),
        'routes': bundle.get('routes'),
        'regions': list((bundle.get('regions') or {})),
        'training': bundle.get('training'),
        'n_samples': bundle.get('n_samples'),
        'model_share_mae': metrics.get('model_share_mae'),
        'sector_table_share_mae': metrics.get('sector_table_share_mae'),
        'improvement_pct': None if not metrics.get('sector_table_share_mae') else
            (1 - metrics['model_share_mae'] / metrics['sector_table_share_mae']) * 100,
    }


@app.post('/api/v1/hotspots', response_model=HotspotResponse)
async def predict_hotspots(body: HotspotRequest) -> HotspotResponse:
    bundle = state['bundle']
    if bundle is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail='Model artefact not loaded. Run `python ai/train.py`.')

    import numpy as np
    import pandas as pd

    features, categorical = bundle['features'], bundle['categorical']
    row = pd.DataFrame([{
        'sector': body.sector, 'route': body.route, 'primary_fuel': body.primary_fuel, 'region': body.region,
        'production_t': body.production_t, 'energy_spend_inr': body.energy_spend_inr,
        'plant_age_years': body.plant_age_years, 'headcount': body.headcount,
    }])[features]
    row[categorical] = bundle['encoder'].transform(row[categorical])

    raw = np.array([float(bundle['models'][f'share_{s}'].predict(row)[0]) for s in SOURCES]).clip(0, None)
    shares = (raw / raw.sum()) if raw.sum() > 0 else np.array([0.25] * 4)
    intensity = max(float(bundle['models']['intensity_tco2e_per_t'].predict(row)[0]), 0.0)

    baseline = intensity * body.production_t
    metrics = bundle.get('metrics', {})
    return HotspotResponse(
        shares={s: round(float(v), 4) for s, v in zip(SOURCES, shares)},
        hotspots_tco2e_yr={s: round(float(v) * baseline, 1) for s, v in zip(SOURCES, shares)},
        baseline_tco2e_yr=round(baseline, 1),
        intensity_tco2e_per_t=round(intensity, 4),
        training=bundle.get('training', 'unknown'),
        model_share_mae=round(metrics.get('model_share_mae', 0), 4),
        sector_table_share_mae=round(metrics.get('sector_table_share_mae', 0), 4),
        note='Estimated split, not a measurement. Replace it with metered figures where you have them.',
    )


# ------------------------------------------------------------------------------------------------
# System of record: the session document the web app reads on load and writes through on change.
# ------------------------------------------------------------------------------------------------
class SessionDoc(BaseModel):
    factories: List[Dict[str, Any]]
    ledger: List[Dict[str, Any]] = []
    intake: List[Dict[str, Any]] = []
    inbox: List[Dict[str, Any]] = []
    savedAt: Optional[str] = None


@app.get('/api/v1/state')
async def get_state() -> Dict:
    doc = await state['store'].load()
    if doc is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail='No session has been saved yet.')
    return doc


@app.put('/api/v1/state')
async def put_state(body: SessionDoc) -> Dict:
    if not body.factories:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail='A session must contain at least one factory.')
    from datetime import datetime, timezone
    doc = body.model_dump()
    doc['savedAt'] = datetime.now(timezone.utc).isoformat()
    await state['store'].save(doc)
    return {'saved': True, 'savedAt': doc['savedAt'], 'factories': len(doc['factories']), 'ledger': len(doc['ledger'])}


@app.delete('/api/v1/state')
async def delete_state() -> Dict:
    await state['store'].clear()
    return {'cleared': True}


# ------------------------------------------------------------------------------------------------
# Analysis: everything the model can say about one plant. The arithmetic of measures stays in the
# web app's domain layer (one source of truth); this endpoint answers the questions only a trained
# model can — where the carbon most likely is, how the plant compares with its peers, and what the
# model expects to change if the plant changed.
# ------------------------------------------------------------------------------------------------
class AnalyseRequest(HotspotRequest):
    declared_tco2e: Dict[str, float] = Field(default_factory=dict, description='Declared tCO2e per source')
    baseline_tco2e: Optional[float] = Field(None, ge=0)


def _predict(bundle, row_dict: Dict) -> Dict:
    import numpy as np
    import pandas as pd
    features, categorical = bundle['features'], bundle['categorical']
    row = pd.DataFrame([row_dict])[features]
    row[categorical] = bundle['encoder'].transform(row[categorical])
    raw = np.array([float(bundle['models'][f'share_{s}'].predict(row)[0]) for s in SOURCES]).clip(0, None)
    shares = (raw / raw.sum()) if raw.sum() > 0 else np.array([0.25] * 4)
    intensity = max(float(bundle['models']['intensity_tco2e_per_t'].predict(row)[0]), 0.0)
    return {'shares': {s: float(v) for s, v in zip(SOURCES, shares)}, 'intensity': intensity}


def _percentile(value: float, q: Dict[str, float]) -> float:
    """Where a value sits among the cohort, interpolating between the stored quantiles."""
    pts = [(10, q['p10']), (25, q['p25']), (50, q['p50']), (75, q['p75']), (90, q['p90'])]
    if value <= pts[0][1]:
        return 5.0
    if value >= pts[-1][1]:
        return 95.0
    for (pa, va), (pb, vb) in zip(pts, pts[1:]):
        if va <= value <= vb:
            return pa + (pb - pa) * ((value - va) / (vb - va) if vb > va else 0)
    return 50.0


@app.post('/api/v1/analyse')
async def analyse(body: AnalyseRequest) -> Dict:
    bundle = state['bundle']
    if bundle is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail='Model artefact not loaded. Run `python ai/train.py`.')

    base = {
        'sector': body.sector, 'route': body.route, 'primary_fuel': body.primary_fuel, 'region': body.region,
        'production_t': body.production_t, 'energy_spend_inr': body.energy_spend_inr,
        'plant_age_years': body.plant_age_years, 'headcount': body.headcount,
    }
    current = _predict(bundle, base)

    # Declared split, if the plant gave one.
    declared_total = sum(max(0.0, float(body.declared_tco2e.get(s, 0.0))) for s in SOURCES)
    declared_shares = {s: (max(0.0, float(body.declared_tco2e.get(s, 0.0))) / declared_total if declared_total > 0 else None)
                       for s in SOURCES}
    discrepancies = []
    for s in SOURCES:
        d = declared_shares[s]
        m = current['shares'][s]
        delta = None if d is None else (d - m)
        discrepancies.append({
            'source': s, 'declared_share': d, 'model_share': m, 'delta': delta,
            # 15 points is well outside the model's held-out error (≈3 points), so it is a real question, not noise.
            'flag': delta is not None and abs(delta) >= 0.15,
        })

    # Peer benchmark on intensity: the declared figure if we have it, else the model's.
    benchmarks = bundle.get('benchmarks', {}).get(body.sector)
    declared_intensity = (body.baseline_tco2e / body.production_t) if body.baseline_tco2e and body.production_t else None
    intensity_used = declared_intensity if declared_intensity is not None else current['intensity']
    benchmark = None
    if benchmarks:
        benchmark = {
            'intensity_used': intensity_used,
            'basis': 'declared' if declared_intensity is not None else 'model',
            'sector_median': benchmarks['p50'],
            'percentile': _percentile(intensity_used, benchmarks),
            'quantiles': benchmarks,
        }

    # What the model expects if the plant changed one thing. These are model expectations, not
    # engineering estimates; the domain layer prices the actual measures.
    what_ifs = []
    for fuel in ['Coal', 'Natural gas', 'Biomass', 'Electric']:
        if fuel == body.primary_fuel:
            continue
        alt = _predict(bundle, {**base, 'primary_fuel': fuel})
        what_ifs.append({'change': f'Switch primary fuel to {fuel.lower()}', 'kind': 'fuel', 'value': fuel,
                         'intensity': alt['intensity'],
                         'intensity_change_pct': (alt['intensity'] / current['intensity'] - 1) * 100 if current['intensity'] > 0 else None,
                         'shares': alt['shares']})
    if body.plant_age_years > 10:
        alt = _predict(bundle, {**base, 'plant_age_years': 10})
        what_ifs.append({'change': 'Refurbish to the efficiency of a 10-year-old plant', 'kind': 'age', 'value': 10,
                         'intensity': alt['intensity'],
                         'intensity_change_pct': (alt['intensity'] / current['intensity'] - 1) * 100 if current['intensity'] > 0 else None,
                         'shares': alt['shares']})
    what_ifs.sort(key=lambda w: (w['intensity_change_pct'] if w['intensity_change_pct'] is not None else 0))

    primary_model = max(current['shares'], key=current['shares'].get)
    primary_declared = max((s for s in SOURCES if declared_shares[s] is not None), key=lambda s: declared_shares[s], default=None)
    metrics = bundle.get('metrics', {})
    return {
        'model': {'training': bundle.get('training', 'unknown'), 'n_samples': bundle.get('n_samples'),
                  'top_hotspot_accuracy': metrics.get('model_top_hotspot_accuracy'),
                  'sector_table_top_hotspot_accuracy': metrics.get('sector_table_top_hotspot_accuracy'),
                  'share_mae': metrics.get('model_share_mae')},
        'predicted': {'shares': current['shares'], 'intensity_tco2e_per_t': current['intensity'],
                      'baseline_tco2e_yr': current['intensity'] * body.production_t,
                      'primary_hotspot': primary_model},
        'declared': {'shares': declared_shares, 'intensity_tco2e_per_t': declared_intensity,
                     'primary_hotspot': primary_declared},
        'agreement': primary_declared is None or primary_declared == primary_model,
        'discrepancies': discrepancies,
        'benchmark': benchmark,
        'what_ifs': what_ifs,
        'note': 'Model expectations from a synthetic cohort. Measured figures always take precedence.',
    }


# ------------------------------------------------------------------------------------------------
# Operator settings: the OpenRouter key and default model persist here so they survive a refresh.
# ------------------------------------------------------------------------------------------------
class OperatorSettings(BaseModel):
    openrouter_key: Optional[str] = Field(None, min_length=8, max_length=400)
    default_model: Optional[str] = Field(None, max_length=200)
    tools_only: Optional[bool] = None


@app.get('/api/v1/settings')
async def get_settings() -> Dict:
    doc = await state['settings'].load()
    return {
        'openrouter_key': doc.get('openrouter_key'),
        'default_model': doc.get('default_model'),
        'tools_only': doc.get('tools_only'),
        'has_key': bool(doc.get('openrouter_key')),
    }


@app.put('/api/v1/settings')
async def put_settings(body: OperatorSettings) -> Dict:
    current = await state['settings'].load()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.openrouter_key is not None and not body.openrouter_key.startswith('sk-'):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail='That does not look like an OpenRouter key.')
    merged = {**current, **patch}
    await state['settings'].save(merged)
    return {'saved': True, 'has_key': bool(merged.get('openrouter_key')), 'default_model': merged.get('default_model')}


@app.delete('/api/v1/settings')
async def delete_settings() -> Dict:
    await state['settings'].clear()
    return {'cleared': True}


# ------------------------------------------------------------------------------------------------
# Reference table and document extraction.
# ------------------------------------------------------------------------------------------------
@app.get('/api/v1/reference')
async def reference() -> Dict:
    """Emission factors and unit prices. The web app hydrates its calculation engine from this."""
    return {'reference': REFERENCE, **REFERENCE_META}


@app.post('/api/v1/intake/extract')
async def intake_extract(file: UploadFile = File(...), hint: Optional[str] = Form(None)) -> Dict:
    """Read a bill, register or manifest and return the figures with the evidence they came from."""
    from fastapi import HTTPException
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail='Files over 20 MB are not read.')
    try:
        return extract_document(data, file.filename or '', file.content_type or '', hint)
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except RuntimeError as e:  # OCR engine missing on this machine
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # a malformed spreadsheet should read as a message, not a stack trace
        raise HTTPException(status_code=422, detail=f'Could not read the file: {e}')
