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


def test_state_round_trips_through_the_api():
    """The web app writes its session through and reads it back on load."""
    doc = {'factories': [{'id': 'probe', 'name': 'Probe', 'sector': 'Steel', 'baseline': 1}], 'ledger': [], 'intake': [], 'inbox': []}
    before = requests.get(f'{BASE_URL}/api/v1/state', timeout=10)
    saved = requests.put(f'{BASE_URL}/api/v1/state', json=doc, timeout=10)
    assert saved.status_code == 200 and saved.json()['saved'] is True
    got = requests.get(f'{BASE_URL}/api/v1/state', timeout=10)
    assert got.status_code == 200 and got.json()['factories'][0]['id'] == 'probe'
    # Restore whatever was there so a running demo is not disturbed by the test suite.
    if before.status_code == 200:
        requests.put(f'{BASE_URL}/api/v1/state', json=before.json(), timeout=10)
    else:
        requests.delete(f'{BASE_URL}/api/v1/state', timeout=10)


def test_empty_session_is_refused():
    res = requests.put(f'{BASE_URL}/api/v1/state', json={'factories': []}, timeout=10)
    assert res.status_code == 422


def test_analysis_answers_every_question_it_promises():
    body = dict(sector='Steel', route='BF-BOF', primary_fuel='Coal', region='East', production_t=410000,
                energy_spend_inr=3_190_000_000, plant_age_years=28, headcount=1400,
                declared_tco2e={'fuel': 421000, 'electricity': 168400, 'process': 227340, 'waste': 25260},
                baseline_tco2e=842000)
    res = requests.post(f'{BASE_URL}/api/v1/analyse', json=body, timeout=20)
    assert res.status_code == 200, res.text
    a = res.json()
    assert abs(sum(a['predicted']['shares'].values()) - 1) < 1e-6
    assert a['predicted']['primary_hotspot'] in ('fuel', 'electricity', 'process', 'waste')
    assert len(a['discrepancies']) == 4 and all('flag' in d for d in a['discrepancies'])
    assert a['benchmark'] is not None and 0 <= a['benchmark']['percentile'] <= 100
    assert a['benchmark']['basis'] == 'declared'
    assert {w['kind'] for w in a['what_ifs']} >= {'fuel', 'age'}
    assert a['model']['training'] == 'synthetic'


def test_analysis_without_a_declared_split_benchmarks_on_the_model():
    body = dict(sector='Cement', route='Dry kiln', primary_fuel='Coal', region='West', production_t=700000,
                energy_spend_inr=900_000_000, plant_age_years=12, headcount=400)
    a = requests.post(f'{BASE_URL}/api/v1/analyse', json=body, timeout=20).json()
    assert a['declared']['primary_hotspot'] is None and a['agreement'] is True
    assert a['benchmark']['basis'] == 'model'


def test_operator_settings_persist_and_clear():
    """The key and model survive a refresh because they live here, not in the browser session."""
    before = requests.get(f'{BASE_URL}/api/v1/settings', timeout=10).json()
    saved = requests.put(f'{BASE_URL}/api/v1/settings', json={'openrouter_key': 'sk-or-v1-testkey-0000', 'default_model': 'test/model'}, timeout=10)
    assert saved.status_code == 200 and saved.json()['has_key'] is True
    got = requests.get(f'{BASE_URL}/api/v1/settings', timeout=10).json()
    assert got['openrouter_key'] == 'sk-or-v1-testkey-0000' and got['default_model'] == 'test/model'
    # A partial update keeps the key.
    requests.put(f'{BASE_URL}/api/v1/settings', json={'default_model': 'other/model'}, timeout=10)
    assert requests.get(f'{BASE_URL}/api/v1/settings', timeout=10).json()['openrouter_key'] == 'sk-or-v1-testkey-0000'
    assert requests.put(f'{BASE_URL}/api/v1/settings', json={'openrouter_key': 'not-a-key'}, timeout=10).status_code == 422
    requests.delete(f'{BASE_URL}/api/v1/settings', timeout=10)
    assert requests.get(f'{BASE_URL}/api/v1/settings', timeout=10).json()['has_key'] is False
    if before.get('has_key'):
        requests.put(f'{BASE_URL}/api/v1/settings', json={k: v for k, v in before.items() if k in ('openrouter_key', 'default_model', 'tools_only') and v is not None}, timeout=10)


def test_reference_table_is_served():
    ref = requests.get(f'{BASE_URL}/api/v1/reference', timeout=10).json()
    assert ref['reference']['coalFactor'] == 2.42 and ref['reference']['gridRateINR'] == 7.5
    assert 'sources' in ref


def test_extracts_figures_from_a_csv_bill_with_evidence():
    csv = ("Billing period,Units consumed (kWh),Amount (INR)\n"
           "2025-11,92000,690000\n2025-12,93000,697500\n").encode()
    res = requests.post(f'{BASE_URL}/api/v1/intake/extract', files={'file': ('electricity-dec-2025.csv', csv, 'text/csv')}, timeout=20)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out['method'] == 'table' and out['source_type'] == 'electricity'
    assert out['quantity'] == 185000 and out['cost_inr'] == 1387500
    assert out['period'] == '2025-11' and any('Units consumed' in e for e in out['evidence'])


def test_extracts_figures_from_text_and_refuses_scans():
    txt = b"Coal purchase register, December 2025. Delivered 420 MT to plant. Invoice value Rs 3,444,000 incl. freight."
    out = requests.post(f'{BASE_URL}/api/v1/intake/extract', files={'file': ('coal.txt', txt, 'text/plain')}, timeout=20).json()
    assert out['source_type'] == 'fuel' and out['quantity'] == 420 and out['cost_inr'] == 3444000 and out['period'] == '2025-12'
    png = requests.post(f'{BASE_URL}/api/v1/intake/extract', files={'file': ('scan.png', b'\x89PNG\r\n', 'image/png')}, timeout=20)
    assert png.status_code == 415 and 'OCR' in png.json()['detail']
