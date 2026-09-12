"""API contract tests. Skipped unless LEAKPOINT_API_URL points at a running service."""
import os

import pytest
import requests

BASE_URL = os.environ.get('LEAKPOINT_API_URL')
SOURCES = ['fuel', 'electricity', 'process', 'waste']
pytestmark = pytest.mark.skipif(not BASE_URL, reason='LEAKPOINT_API_URL is not set')


@pytest.fixture(scope='session')
def api():
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    return session


def url(path: str) -> str:
    return f"{BASE_URL.rstrip('/')}{path}"


@pytest.mark.parametrize('endpoint', ['/api/', '/api/health'])
def test_health_reports_model_state(endpoint: str, api: requests.Session):
    response = api.get(url(endpoint), timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data['service'] == 'Leakpoint API'
    assert isinstance(data['model_loaded'], bool)
    # The service must come up and answer even when the database is absent.
    assert 'database' in data


def test_model_card_declares_its_training_and_baseline(api: requests.Session):
    data = api.get(url('/api/v1/model'), timeout=20).json()
    assert data['loaded'] is True, 'run `python ai/train.py` to produce ai/models/hotspots.joblib'
    # The honesty contract: the card must say what it was trained on.
    assert data['training'] == 'synthetic'
    assert data['model_share_mae'] < data['sector_table_share_mae'], 'the model must beat the sector table it replaces'
    assert data['improvement_pct'] > 25


def test_prediction_is_a_normalised_share_vector(api: requests.Session):
    body = {'sector': 'Cement', 'route': 'Dry kiln', 'primary_fuel': 'Coal', 'region': 'West',
            'production_t': 400000, 'energy_spend_inr': 310000000, 'plant_age_years': 18, 'headcount': 320}
    response = api.post(url('/api/v1/hotspots'), json=body, timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert set(data['shares']) == set(SOURCES)
    assert abs(sum(data['shares'].values()) - 1.0) < 1e-3
    assert all(v >= 0 for v in data['shares'].values())
    assert data['baseline_tco2e_yr'] > 0
    assert abs(sum(data['hotspots_tco2e_yr'].values()) - data['baseline_tco2e_yr']) < 1.0
    assert data['training'] == 'synthetic'
    # Cement is calcination-heavy; the model must not put that in thermal fuel.
    assert data['shares']['process'] > data['shares']['waste']


def test_route_changes_the_prediction(api: requests.Session):
    base = {'sector': 'Steel', 'primary_fuel': 'Coal', 'region': 'East', 'production_t': 150000,
            'energy_spend_inr': 480000000, 'plant_age_years': 12, 'headcount': 300}
    integrated = api.post(url('/api/v1/hotspots'), json={**base, 'route': 'BF-BOF'}, timeout=30).json()
    electric = api.post(url('/api/v1/hotspots'), json={**base, 'route': 'EAF', 'primary_fuel': 'Electric'}, timeout=30).json()
    # This is the whole point of the model: two steel plants must not get the same split.
    assert electric['shares']['electricity'] > integrated['shares']['electricity']
    assert integrated['shares']['fuel'] > electric['shares']['fuel']


def test_invalid_input_is_rejected(api: requests.Session):
    bad = {'sector': 'Steel', 'route': 'EAF', 'production_t': 0, 'energy_spend_inr': 1}
    assert api.post(url('/api/v1/hotspots'), json=bad, timeout=20).status_code == 422


def test_zero_energy_spend_is_refused_not_guessed():
    """A zero spend is outside anything the model has seen and produces a degenerate split.
    The API refuses it with a validation error rather than returning a wrong answer."""
    body = dict(sector='Steel', route='BF-BOF', primary_fuel='Coal', region='West',
                production_t=842000, energy_spend_inr=0, plant_age_years=15, headcount=150)
    res = requests.post(f'{BASE_URL}/api/v1/hotspots', json=body, timeout=10)
    assert res.status_code == 422
    assert 'energy_spend_inr' in res.text
