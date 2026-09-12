"""Independent recomputation of every figure the product shows.

Nothing here imports the frontend or the domain layer: each check rebuilds the number from the raw
inputs the API exposes (state, reference table, catalogue) using the formulas documented in
docs/ARCHITECTURE.md, and compares with what the API — and therefore every screen and the
Copilot — reports. If a formula and its documentation drift apart, this is where it shows.
"""
import math
import os
import re

import pytest
import requests

BASE_URL = os.environ.get('LEAKPOINT_API_URL')
pytestmark = pytest.mark.skipif(not BASE_URL, reason='LEAKPOINT_API_URL is not set')
CAPEX_EXPONENT, CREDIT_FACTOR = 0.7, 0.7


@pytest.fixture(scope='module')
def data():
    s = requests.get(f'{BASE_URL}/api/v1/state', timeout=10).json()
    r = requests.get(f'{BASE_URL}/api/v1/reference', timeout=10).json()['reference']
    c = {i['id']: i for i in requests.get(f'{BASE_URL}/api/v1/interventions', timeout=10).json()['interventions']}
    return s, r, c


def scenario(f, i, adopt):
    s = adopt / 100
    red = min(f['baseline'], min(f['hotspots'][i['source']], f['hotspots'][i['source']] * i['reductionRate'] * s))
    net = f['costs'][i['source']] * i['costSavingRate'] * s - i['annualOpex'] * s
    addr = f['hotspots'][i['source']] * i['reductionRate']
    capex = i['capex'] if not i['addressableRef'] or addr <= 0 else round(i['capex'] * (addr / i['addressableRef']) ** CAPEX_EXPONENT)
    payback = None if net <= 0 else (0 if capex == 0 else capex / net * 12)
    return red, net, capex, payback


def test_cost_model_is_unit_consistent(data):
    s, r, _ = data
    for f in s['factories']:
        if not f['baseline']:
            continue
        assert abs(sum(f['hotspots'].values()) - f['baseline']) < 1e-6
        assert f['costs']['fuel'] == pytest.approx(f['hotspots']['fuel'] / r['coalFactor'] * r['coalRateINR'], rel=1e-6)
        assert f['costs']['electricity'] == pytest.approx(f['hotspots']['electricity'] / r['gridFactor'] * r['gridRateINR'], rel=1e-6)
        assert f['costs']['waste'] == pytest.approx(f['wasteTonnes'] * r['wasteRateINR'], rel=1e-6)


def test_ledger_records_match_the_scenario_formula(data):
    s, _, c = data
    fac = {f['id']: f for f in s['factories']}
    for e in s['ledger']:
        red, net, capex, _ = scenario(fac[e['factoryId']], c[e['interventionIds'][0]], e['adoption'])
        assert e['reduction'] == pytest.approx(red, rel=1e-6)
        assert e['operatingSavings'] == pytest.approx(net, rel=1e-6)
        assert e['capex'] == capex


def test_flagship_scenario_figures(data):
    """The numbers on the Bhilai waste-heat card, scenario page and Copilot answers."""
    s, r, c = data
    b = next(f for f in s['factories'] if f['id'] == 'bhilai-steel')
    red, net, capex, payback = scenario(b, c['waste-heat'], 100)
    assert red == 75780 and capex == 191941271
    assert round(net, 2) == 254275206.61 and round(payback, 2) == 9.06
    assert round(net / capex * 100) == 132
    vol = math.floor(red * CREDIT_FACTOR)
    assert vol == 53046 and vol * r['creditLowINR'] == 31827600 and vol * r['creditHighINR'] == 79569000
    assert b['baseline'] * b['exportShare'] * r['carbonEUR'] * r['eurINR'] == 1023030000


def test_model_outputs_are_internally_consistent(data):
    s, r, _ = data
    b = next(f for f in s['factories'] if f['id'] == 'bhilai-steel')
    req = dict(sector='Steel', route='BF-BOF', primary_fuel='Coal', region='East', production_t=b['production'],
               energy_spend_inr=b['costs']['fuel'] + b['costs']['electricity'], plant_age_years=28, headcount=1400)
    h = requests.post(f'{BASE_URL}/api/v1/hotspots', json=req, timeout=20).json()
    assert sum(h['shares'].values()) == pytest.approx(1.0, abs=1e-6)
    assert sum(h['hotspots_tco2e_yr'].values()) == pytest.approx(h['baseline_tco2e_yr'], rel=1e-4)
    assert h['intensity_tco2e_per_t'] * b['production'] == pytest.approx(h['baseline_tco2e_yr'], rel=1e-4)
    a = requests.post(f'{BASE_URL}/api/v1/analyse', json={**req, 'declared_tco2e': b['hotspots'], 'baseline_tco2e': b['baseline']}, timeout=20).json()
    for d in a['discrepancies']:
        assert d['declared_share'] == pytest.approx(b['hotspots'][d['source']] / b['baseline'], abs=1e-6)
        assert d['delta'] == pytest.approx(d['declared_share'] - d['model_share'], abs=1e-9)
        assert d['flag'] == (abs(d['delta']) >= 0.15)
    q, x = a['benchmark']['quantiles'], a['benchmark']['intensity_used']
    pts = [(10, q['p10']), (25, q['p25']), (50, q['p50']), (75, q['p75']), (90, q['p90'])]
    exp = 5.0 if x <= pts[0][1] else 95.0 if x >= pts[-1][1] else next(pa + (pb - pa) * (x - va) / (vb - va) for (pa, va), (pb, vb) in zip(pts, pts[1:]) if va <= x <= vb)
    assert a['benchmark']['percentile'] == pytest.approx(exp, abs=1e-6)
    cur = a['predicted']['intensity_tco2e_per_t']
    for w in a['what_ifs']:
        assert w['intensity_change_pct'] == pytest.approx((w['intensity'] / cur - 1) * 100, abs=1e-6)
        assert sum(w['shares'].values()) == pytest.approx(1.0, abs=1e-6)
    assert a['agreement'] == (a['declared']['primary_hotspot'] == a['predicted']['primary_hotspot'])


def test_alert_exposure_total_is_recomputable(data):
    s, r, _ = data
    total = sum(f['baseline'] * f['exportShare'] * r['carbonEUR'] * r['eurINR'] for f in s['factories'] if f['sector'] in ('Steel', 'Cement') and f['exportShare'] > 0 and f['baseline'])
    alerts = requests.get(f'{BASE_URL}/api/v1/alerts', timeout=10).json()['alerts']
    body = next(x['body'] for x in alerts if x['type'] == 'exposure')
    assert float(re.search(r'₹([\d,.]+) crore', body).group(1).replace(',', '')) == pytest.approx(total / 1e7, abs=0.06)
