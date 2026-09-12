"""Leakpoint API.

Serves the hotspot-disaggregation model (see train.py) plus a health endpoint. The frontend degrades
to its own arithmetic if this service is unavailable, so the demonstration never depends on it.
"""
from contextlib import asynccontextmanager
from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent / '.env')

MODEL_PATH = Path(__file__).parent / 'models' / 'hotspots.joblib'
SOURCES = ['fuel', 'electricity', 'process', 'waste']
state: Dict = {'bundle': None, 'db': None}


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
    yield
    if client is not None:
        client.close()


app = FastAPI(title='Leakpoint API', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Content-Type'],
)


class Health(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    service: str = 'Leakpoint API'
    model_loaded: bool
    model_training: Optional[str] = None
    database: str


class HotspotRequest(BaseModel):
    sector: str = Field(..., description='Steel | Cement | Textiles | Chemicals')
    route: str = Field(..., description='Process route, e.g. BF-BOF or Dry kiln')
    primary_fuel: str = Field('Coal', description='Coal | Natural gas | Biomass | Electric')
    region: str = Field('West', description='North | West | South | East | Central')
    production_t: float = Field(..., gt=0, description='Annual saleable output in tonnes')
    energy_spend_inr: float = Field(..., ge=0, description='Annual energy spend in INR')
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
    )


@app.get('/api/v1/model')
async def model_card() -> Dict:
    """What the model is, what it was trained on, and how it compares to the table it replaces."""
    bundle = state['bundle']
    if bundle is None:
        return {'loaded': False, 'hint': 'Run `python train.py` to produce models/hotspots.joblib.'}
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
        raise HTTPException(status_code=503, detail='Model artefact not loaded. Run train.py.')

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
