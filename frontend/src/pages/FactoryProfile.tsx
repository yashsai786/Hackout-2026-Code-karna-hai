import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '../state/SessionContext';
import { reference, sources, sourceLabels, historyFor, materialsFor } from '../domain/fixtures';
import { ROUTES, FUELS, REGIONS } from '../domain/plant';

import type { MaterialStream, Source } from '../domain/types';
import {
  PageHeading,
  Notice,
  Btn,
  Tag,
  NotFound,
  SectionHeading,
  fmt,
  money,
  compact,
} from '../components/Primitives';
import { predictHotspots, type HotspotPrediction } from '../lib/leakpointApi';

// Each source is priced in its own physical unit, matching the cost model in fixtures.ts.
const SOURCE_FORM: Record<Source, { unit: string; factor: number; rate: number; help: string }> = {
  fuel: {
    unit: 'tonnes coal',
    factor: reference.coalFactor,
    rate: reference.coalRateINR,
    help: 'Annual thermal fuel purchased',
  },
  electricity: {
    unit: 'kWh',
    factor: reference.gridFactor,
    rate: reference.gridRateINR,
    help: 'Annual grid electricity drawn',
  },
  process: {
    unit: 'tCO₂e',
    factor: 1,
    rate: reference.processRateINR,
    help: 'Direct process emissions, entered as tCO₂e',
  },
  waste: {
    unit: 'tonnes waste',
    factor: reference.wasteFactor,
    rate: reference.wasteRateINR,
    help: 'Annual waste and effluent sent for treatment',
  },
};

// Intake records name their sample; map that back onto the source it evidences.
const SAMPLE_TO_SOURCE: Record<string, Source> = {
  'Electricity bill': 'electricity',
  'Fuel purchase log': 'fuel',
  'Waste manifest': 'waste',
};

type Row = { quantity: string; factor: string; rate: string };
const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function FactoryProfile() {
  const { id } = useParams();
  const { factories, intake, updateFactory } = useSession();
  const navigate = useNavigate();
  const factory = factories.find(f => f.id === id);

  // Prefill order: what the factory already has, else any confirmed intake record, else blank.
  const seeded = useMemo(() => {
    const rows = {} as Record<Source, Row>;
    sources.forEach(s => {
      const cfg = SOURCE_FORM[s];
      const existing =
        factory && factory.hotspots[s] > 0 ? String(Math.round(factory.hotspots[s] / cfg.factor)) : '';
      const record = intake.find(r => r.factoryId === id && SAMPLE_TO_SOURCE[r.sample] === s);
      // A source record covers one month, so annualise it and say so on screen.
      const fromIntake = record ? String(Math.round(record.quantity * 12)) : '';
      rows[s] = {
        quantity: existing || fromIntake,
        factor: String(cfg.factor),
        rate: String(record?.costRate ?? cfg.rate),
      };
    });
    return rows;
  }, [factory, intake, id]);

  const [rows, setRows] = useState<Record<Source, Row>>(seeded);
  const [production, setProduction] = useState(factory?.production ? String(factory.production) : '');
  const [lat, setLat] = useState(factory?.coordinates ? String(factory.coordinates[0]) : '');
  const [lng, setLng] = useState(factory?.coordinates ? String(factory.coordinates[1]) : '');
  const [exportShare, setExportShare] = useState(
    factory ? String(Math.round(factory.exportShare * 100)) : '0',
  );
  const [materials, setMaterials] = useState<MaterialStream[]>(
    factory?.materials?.length ? factory.materials : [],
  );
  // Estimator inputs: what an operator can answer without a carbon audit.
  const [route, setRoute] = useState(factory?.profile?.route ?? '');
  const [fuel, setFuel] = useState(factory?.profile?.fuel ?? 'Coal');
  const [region, setRegion] = useState(factory?.profile?.region ?? 'West');
  const [age, setAge] = useState(String(factory?.profile?.ageYears ?? 15));
  const [headcount, setHeadcount] = useState(String(factory?.profile?.headcount ?? 150));
  const [spend, setSpend] = useState('');
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<HotspotPrediction | null>(null);
  const [predictError, setPredictError] = useState('');

  if (!factory) return <NotFound kind="Factory" to="/factories" label="Factory index" />;

  const prefilledFrom = intake.filter(r => r.factoryId === id).length;
  const derived = sources.map(s => {
    const cfg = SOURCE_FORM[s],
      q = num(rows[s].quantity),
      factor = num(rows[s].factor),
      rate = num(rows[s].rate);
    return {
      source: s,
      label: sourceLabels[s],
      unit: cfg.unit,
      quantity: q,
      emissions: q * factor,
      cost: q * rate,
    };
  });
  const baseline = derived.reduce((a, d) => a + d.emissions, 0);
  const covered = derived.filter(d => d.quantity > 0).length;
  const output = num(production);
  // The model was trained on energy spend = fuel bill + electricity bill (see ai/train.py). When the
  // operator has not typed a figure, derive it from the rows already on the form rather than sending
  // zero: a zero spend is outside anything the model has seen and drives the electricity share to 0.
  const derivedSpend = derived
    .filter(d => d.source === 'fuel' || d.source === 'electricity')
    .reduce((a, d) => a + d.cost, 0);
  const spendForModel = num(spend) || derivedSpend;
  const canEstimate = Boolean(output) && spendForModel > 0;
  const ready = baseline > 0 && output > 0;

  const addMaterial = () =>
    setMaterials(m => [...m, { name: '', tonnesPerYear: 0, costPerTonne: 0, recycledShare: 0 }]);
  const suggestMaterials = () => setMaterials(materialsFor(factory.sector, output || 1));

  const estimate = async () => {
    if (!factory || !output) return;
    setPredicting(true);
    setPredictError('');
    setPrediction(null);
    try {
      const p = await predictHotspots({
        sector: factory.sector,
        route: route || ROUTES[factory.sector][0],
        primary_fuel: fuel,
        region,
        production_t: output,
        energy_spend_inr: spendForModel,
        plant_age_years: num(age) || 15,
        headcount: num(headcount) || 150,
      });
      setPrediction(p);
      // Convert the predicted emissions back into the physical quantity each field expects.
      setRows(r => {
        const next = { ...r };
        sources.forEach(src => {
          const factor = num(next[src].factor) || SOURCE_FORM[src].factor;
          const tco2e = p.hotspots_tco2e_yr[src] ?? 0;
          next[src] = {
            ...next[src],
            quantity: factor > 0 ? String(Math.round(tco2e / factor)) : next[src].quantity,
          };
        });
        return next;
      });
      toast.success('Estimated split applied. Replace any field you can measure.');
    } catch (e) {
      setPredictError(e instanceof Error ? e.message : 'The estimator is unavailable.');
    } finally {
      setPredicting(false);
    }
  };

  const save = () => {
    if (!ready) return;
    const hotspots = Object.fromEntries(derived.map(d => [d.source, Math.round(d.emissions)])) as Record<
      Source,
      number
    >;
    const costs = Object.fromEntries(derived.map(d => [d.source, d.cost])) as Record<Source, number>;
    const total = Object.values(hotspots).reduce((a, b) => a + b, 0);
    updateFactory(factory.id, {
      baseline: total,
      production: output,
      hotspots,
      costs,
      wasteTonnes: Math.round(derived.find(d => d.source === 'waste')!.quantity),
      exportShare: Math.min(1, Math.max(0, num(exportShare) / 100)),
      coordinates: num(lat) && num(lng) ? [num(lat), num(lng)] : factory.coordinates,
      history: historyFor(total),
      materials: materials.filter(m => m.name.trim() && m.tonnesPerYear > 0),
      // Confidence is earned by source coverage, not by position in an array.
      confidence: covered === 4 ? 'High' : covered >= 2 ? 'Medium' : 'Low',
      readiness: { ...factory.readiness, baselineDocumented: covered === 4, monitoring: covered >= 2 },
      // Keep what the operator told the model, so the analysis page never has to assume it again.
      profile: {
        route: route || ROUTES[factory.sector][0],
        fuel,
        region,
        ageYears: num(age) || 15,
        headcount: num(headcount) || 150,
      },
    });
    toast.success(`Baseline set for ${factory.name}. Recommendations are now available.`);
    navigate(`/factories/${factory.id}`);
  };

  const setRow = (s: Source, key: keyof Row, value: string) =>
    setRows(r => ({ ...r, [s]: { ...r[s], [key]: value } }));

  return (
    <>
      <Link to={`/factories/${factory.id}`} className="back-link" data-testid="profile-back">
        <ArrowLeft size={15} />
        {factory.name}
      </Link>
      <PageHeading
        eyebrow={`${factory.sector.toUpperCase()} / PROCESS & BASELINE`}
        title="Describe this operation"
        description="Enter what this site consumes and produces in a year. The baseline, hotspots and every recommendation are calculated from these numbers."
        action={
          <Tag id="profile-status" tone={factory.baseline === null ? 'warning' : 'success'}>
            {factory.baseline === null ? 'Awaiting baseline' : 'Baseline set'}
          </Tag>
        }
      />

      {prefilledFrom > 0 && (
        <Notice id="profile-prefilled">
          Prefilled from{' '}
          <strong>
            {prefilledFrom} confirmed source {prefilledFrom === 1 ? 'record' : 'records'}
          </strong>
          . Monthly quantities have been annualised (× 12). Adjust anything that is not representative.
        </Notice>
      )}

      <section className="full-section">
        <SectionHeading title="Annual output" note="Used for emissions intensity and material estimates" />
        <div className="form-grid">
          <label>
            Annual production (tonnes)
            <input
              type="number"
              min="0"
              step="any"
              data-testid="profile-production"
              value={production}
              onChange={e => setProduction(e.target.value)}
            />
            <small>Saleable output per year</small>
          </label>
          <label>
            Export share (%)
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              data-testid="profile-export"
              value={exportShare}
              onChange={e => setExportShare(e.target.value)}
            />
            <small>Share sold into carbon-priced markets</small>
          </label>
          <label>
            Latitude
            <input
              type="number"
              step="any"
              data-testid="profile-lat"
              value={lat}
              onChange={e => setLat(e.target.value)}
            />
            <small>Optional · places the site on the map</small>
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              data-testid="profile-lng"
              value={lng}
              onChange={e => setLng(e.target.value)}
            />
            <small>Optional</small>
          </label>
        </div>
      </section>

      <section className="full-section">
        <SectionHeading
          title="Not sure of your split?"
          note="Answer what you know and the model estimates the breakdown for you"
          action={
            <Tag id="estimator-kind" tone="blue">
              Machine learning
            </Tag>
          }
        />
        <div className="form-grid">
          <label>
            Process route
            <select
              data-testid="profile-route"
              value={route || ROUTES[factory.sector][0]}
              onChange={e => setRoute(e.target.value)}
            >
              {ROUTES[factory.sector].map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Primary fuel
            <select data-testid="profile-fuel" value={fuel} onChange={e => setFuel(e.target.value)}>
              {FUELS.map(f => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Grid region
            <select data-testid="profile-region" value={region} onChange={e => setRegion(e.target.value)}>
              {REGIONS.map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Annual energy spend (₹)
            <input
              type="number"
              min="0"
              step="any"
              data-testid="profile-spend"
              value={spend}
              placeholder={derivedSpend > 0 ? String(Math.round(derivedSpend)) : ''}
              onChange={e => setSpend(e.target.value)}
            />
            <small>
              {!num(spend) && derivedSpend > 0
                ? `Using ${money(derivedSpend)} from your fuel and electricity rows`
                : 'Electricity plus fuel bills'}
            </small>
          </label>
          <label>
            Plant age (years)
            <input
              type="number"
              min="0"
              max="100"
              data-testid="profile-age"
              value={age}
              onChange={e => setAge(e.target.value)}
            />
          </label>
          <label>
            Headcount
            <input
              type="number"
              min="1"
              data-testid="profile-headcount"
              value={headcount}
              onChange={e => setHeadcount(e.target.value)}
            />
          </label>
        </div>
        <div className="form-bottom">
          <span className="muted">Fills the fields below. Anything you can measure should replace it.</span>
          <Btn
            variant="primary"
            data-testid="profile-estimate"
            disabled={!canEstimate || predicting}
            onClick={estimate}
          >
            <Sparkles size={15} />
            {predicting ? 'Estimating…' : 'Estimate my split'}
          </Btn>
        </div>
        {!canEstimate && (
          <p className="muted body-small" data-testid="profile-estimate-hint">
            {!output
              ? 'Enter annual production above to use the estimator.'
              : 'Enter your annual energy spend, or a fuel or electricity quantity below, to use the estimator.'}
          </p>
        )}
        {predictError && (
          <p className="field-error" role="alert" data-testid="profile-estimate-error">
            {predictError} You can still enter your figures by hand below.
          </p>
        )}
        {prediction && (
          <Notice id="profile-prediction-note">
            Estimated from a gradient-boosted model trained on a <strong>{prediction.training}</strong> cohort
            of plants. Held-out share error {prediction.model_share_mae.toFixed(3)} against{' '}
            {prediction.sector_table_share_mae.toFixed(3)} for a sector-average table — roughly{' '}
            {Math.round((1 - prediction.model_share_mae / prediction.sector_table_share_mae) * 100)}% closer.{' '}
            {prediction.note}
          </Notice>
        )}
      </section>

      <section className="full-section">
        <SectionHeading
          title="Emission sources"
          note="Quantity × emission factor gives the hotspot; quantity × unit cost gives the spend"
        />
        <div className="profile-sources" data-testid="profile-sources">
          {derived.map(d => (
            <div className="profile-source" key={d.source} data-testid={`profile-source-${d.source}`}>
              <div className="profile-source-head">
                <strong>{d.label}</strong>
                <span>{SOURCE_FORM[d.source].help}</span>
              </div>
              <div className="form-grid">
                <label>
                  Quantity ({d.unit})
                  <input
                    type="number"
                    min="0"
                    step="any"
                    data-testid={`profile-qty-${d.source}`}
                    value={rows[d.source].quantity}
                    onChange={e => setRow(d.source, 'quantity', e.target.value)}
                  />
                </label>
                <label>
                  Emission factor (tCO₂e / {d.unit})
                  <input
                    type="number"
                    min="0"
                    step="any"
                    data-testid={`profile-factor-${d.source}`}
                    value={rows[d.source].factor}
                    onChange={e => setRow(d.source, 'factor', e.target.value)}
                  />
                </label>
                <label>
                  Unit cost (₹ / {d.unit})
                  <input
                    type="number"
                    min="0"
                    step="any"
                    data-testid={`profile-rate-${d.source}`}
                    value={rows[d.source].rate}
                    onChange={e => setRow(d.source, 'rate', e.target.value)}
                  />
                </label>
              </div>
              <div className="profile-source-out" data-testid={`profile-out-${d.source}`}>
                <span>{fmt(d.emissions, 0)} tCO₂e/yr</span>
                <span>{money(d.cost)}/yr</span>
                <span>{baseline ? ((d.emissions / baseline) * 100).toFixed(1) : '0.0'}% of baseline</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="full-section">
        <SectionHeading
          title="Material streams"
          note="Circular measures are matched against what this site actually buys and recovers"
          action={
            <div className="button-row">
              <Btn data-testid="profile-suggest-materials" onClick={suggestMaterials}>
                Suggest for {factory.sector.toLowerCase()}
              </Btn>
              <Btn data-testid="profile-add-material" onClick={addMaterial}>
                <Plus size={15} />
                Add stream
              </Btn>
            </div>
          }
        />
        {materials.length === 0 ? (
          <p className="muted body-small" data-testid="profile-no-materials">
            No material streams recorded. Add the main inputs and recovered streams so circular
            recommendations can be matched.
          </p>
        ) : (
          <div className="profile-materials">
            {materials.map((m, i) => (
              <div className="profile-material" key={i} data-testid={`profile-material-${i}`}>
                <label className="sr-only" htmlFor={`mat-name-${i}`}>
                  Material name
                </label>
                <input
                  id={`mat-name-${i}`}
                  placeholder="Material"
                  data-testid={`profile-material-name-${i}`}
                  value={m.name}
                  onChange={e =>
                    setMaterials(list => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <label className="sr-only" htmlFor={`mat-t-${i}`}>
                  Tonnes per year
                </label>
                <input
                  id={`mat-t-${i}`}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="t/yr"
                  data-testid={`profile-material-tonnes-${i}`}
                  value={m.tonnesPerYear || ''}
                  onChange={e =>
                    setMaterials(list =>
                      list.map((x, j) => (j === i ? { ...x, tonnesPerYear: num(e.target.value) } : x)),
                    )
                  }
                />
                <label className="sr-only" htmlFor={`mat-c-${i}`}>
                  Cost per tonne
                </label>
                <input
                  id={`mat-c-${i}`}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="₹/t"
                  data-testid={`profile-material-cost-${i}`}
                  value={m.costPerTonne || ''}
                  onChange={e =>
                    setMaterials(list =>
                      list.map((x, j) => (j === i ? { ...x, costPerTonne: num(e.target.value) } : x)),
                    )
                  }
                />
                <label className="sr-only" htmlFor={`mat-r-${i}`}>
                  Recycled share percent
                </label>
                <input
                  id={`mat-r-${i}`}
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  placeholder="% recycled"
                  data-testid={`profile-material-recycled-${i}`}
                  value={m.recycledShare ? Math.round(m.recycledShare * 100) : ''}
                  onChange={e =>
                    setMaterials(list =>
                      list.map((x, j) =>
                        j === i ? { ...x, recycledShare: Math.min(1, num(e.target.value) / 100) } : x,
                      ),
                    )
                  }
                />
                <Btn
                  className="icon-btn"
                  aria-label={`Remove ${m.name || 'material'}`}
                  data-testid={`profile-material-remove-${i}`}
                  onClick={() => setMaterials(list => list.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Btn>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="full-section">
        <SectionHeading title="What this produces" note="Recalculated as you type" />
        <div className="stats-grid">
          <div className="stat accent" data-testid="profile-preview-baseline">
            <div className="stat-label">Annual baseline</div>
            <div className="stat-value" data-testid="profile-preview-baseline-value">
              {compact(baseline)}
              <span>tCO₂e</span>
            </div>
            <div className="stat-note">{covered} of 4 sources entered</div>
          </div>
          <div className="stat" data-testid="profile-preview-intensity">
            <div className="stat-label">Emissions intensity</div>
            <div className="stat-value">
              {output ? fmt(baseline / output, 2) : '—'}
              <span>tCO₂e/t</span>
            </div>
            <div className="stat-note">
              {output ? `${fmt(output)} tonnes output` : 'Enter annual production'}
            </div>
          </div>
          <div className="stat" data-testid="profile-preview-cost">
            <div className="stat-label">Annual energy & waste spend</div>
            <div className="stat-value">{money(derived.reduce((a, d) => a + d.cost, 0))}</div>
            <div className="stat-note">Drives every savings estimate</div>
          </div>
          <div className="stat" data-testid="profile-preview-confidence">
            <div className="stat-label">Data confidence</div>
            <div className="stat-value">{covered === 4 ? 'High' : covered >= 2 ? 'Medium' : 'Low'}</div>
            <div className="stat-note">Earned by source coverage</div>
          </div>
        </div>
      </section>

      <div className="record-band">
        <div>
          <span className="eyebrow">ONE DESCRIPTION. EVERY RECOMMENDATION.</span>
          <h2 data-testid="profile-save-title">
            Saving this unlocks hotspots, ranked measures, costs and credits.
          </h2>
          <p>Estimates computed from the values you entered; nothing is registry verified.</p>
        </div>
        <div className="button-row">
          <Btn variant="primary" data-testid="profile-save" disabled={!ready} onClick={save}>
            <Check size={16} />
            Save baseline
            <ArrowRight size={15} />
          </Btn>
        </div>
      </div>
      {!ready && (
        <p className="field-error" role="status" data-testid="profile-incomplete">
          Enter annual production and at least one emission source to calculate a baseline.
        </p>
      )}
    </>
  );
}
