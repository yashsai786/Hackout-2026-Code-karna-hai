import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles, ArrowUpRight, RefreshCw, MessageSquareText, AlertTriangle } from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { useChrome } from '../state/ui';
import { useCopilot } from '../state/copilot';
import { interventions, sourceLabels, sources } from '../domain/fixtures';
import { scenario, eligibleFor } from '../domain/calculations';
import { ROUTES, FUELS, REGIONS, defaultDescriptors, energySpendFor } from '../domain/plant';
import { buildRecommendation, type RankedMeasure } from '../domain/analysis';
import { analyseFactory, fetchModelCard, type AnalysisResult, type ModelCard } from '../lib/leakpointApi';
import type { PlantDescriptors, Source } from '../domain/types';
import {
  PageHeading,
  Stat,
  SectionHeading,
  Tag,
  Notice,
  Btn,
  money,
  compact,
  fmt,
} from '../components/Primitives';

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
const shortName = (s: string) => s.replace(' generation', '').replace(' recovery', ' recov.');

export default function Analysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { factories, sync } = useSession();
  const { setCopilotOpen } = useChrome();
  const copilot = useCopilot();

  const withBaseline = factories.filter(f => f.baseline !== null);
  const factory = factories.find(f => f.id === id) ?? withBaseline[0] ?? factories[0];
  const [descriptors, setDescriptors] = useState<PlantDescriptors & { assumed: boolean }>(() =>
    defaultDescriptors(factory),
  );
  const [card, setCard] = useState<ModelCard | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchModelCard().then(setCard, () => setCard({ loaded: false }));
  }, []);
  useEffect(() => {
    setDescriptors(defaultDescriptors(factory));
    setResult(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory?.id]);

  const spend = factory ? energySpendFor(factory) : 0;

  const run = async (d = descriptors) => {
    if (!factory || factory.baseline === null || !factory.production) return;
    if (spend <= 0) {
      setError(
        'The model needs this plant’s fuel or electricity spend. Add either on the process & baseline page.',
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await analyseFactory({
        sector: factory.sector,
        route: d.route,
        primary_fuel: d.fuel,
        region: d.region,
        production_t: factory.production,
        energy_spend_inr: spend,
        plant_age_years: d.ageYears,
        headcount: d.headcount,
        declared_tco2e: factory.hotspots,
        baseline_tco2e: factory.baseline,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The analysis service is unavailable.');
    } finally {
      setLoading(false);
    }
  };
  // Run as soon as a plant with a baseline is chosen; the button re-runs with edited descriptors.
  useEffect(() => {
    if (factory && factory.baseline !== null) void run(defaultDescriptors(factory));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory?.id]);

  const ranked: RankedMeasure[] = useMemo(() => {
    if (!factory || factory.baseline === null) return [];
    return interventions
      .filter(i => eligibleFor(factory, i))
      .map(i => {
        const s = scenario(factory, [i], 100);
        return {
          item: i,
          reduction: s.reduction,
          operatingSavings: s.operatingSavings,
          capex: s.capex,
          paybackMonths: s.paybackMonths,
          roiPercent: s.roiPercent,
        };
      })
      .sort((a, b) => b.reduction - a.reduction);
  }, [factory]);

  const narrative = useMemo(
    () => (factory && result ? buildRecommendation(factory, result, ranked) : []),
    [factory, result, ranked],
  );

  if (!factory) return null;

  const narrate = () => {
    setCopilotOpen(true);
    copilot.send(
      `Narrate and challenge this analysis for ${factory.name}, checking every figure with your tools before you repeat it. ${narrative.join(' ')}`,
    );
  };

  return (
    <>
      <PageHeading
        eyebrow="MODEL AND ENGINE, ONE PLANT"
        title="AI analysis"
        description="The trained model on what this plant is; the calculation engine on what it can do. One recommendation from both."
        action={
          <Tag id="analysis-model-status" tone={card?.loaded ? 'success' : 'warning'}>
            {card === null
              ? 'Checking model…'
              : card.loaded
                ? `Model live · ${card.n_samples?.toLocaleString('en-IN')} plants`
                : 'Model offline'}
          </Tag>
        }
      />
      <div className="factory-context">
        <div>
          <span className="eyebrow">ANALYSING</span>
          <select
            aria-label="Choose a factory"
            data-testid="analysis-factory"
            value={factory.id}
            onChange={e => navigate(`/analysis/${e.target.value}`)}
          >
            {factories.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.baseline === null ? ' · no baseline' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="eyebrow">DATA SOURCE</span>
          <strong data-testid="analysis-data-source">
            {sync === 'api' ? 'Leakpoint API' : sync === 'checking' ? 'Connecting…' : 'This browser only'}
          </strong>
        </div>
      </div>

      {factory.baseline === null ? (
        <Notice id="analysis-no-baseline">
          {factory.name} has no baseline yet, so there is nothing to analyse.{' '}
          <Link to={`/factories/${factory.id}/profile`}>Describe its process and baseline</Link> first.
        </Notice>
      ) : (
        <>
          <section className="border-section analysis-descriptors" data-testid="analysis-descriptors">
            <SectionHeading
              title="What the model is told"
              note={
                descriptors.assumed
                  ? 'Assumed from the sector — correct anything you know'
                  : 'From this plant’s profile'
              }
              action={
                <Btn variant="primary" data-testid="analysis-run" disabled={loading} onClick={() => run()}>
                  {loading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
                  {loading ? 'Running…' : 'Run analysis'}
                </Btn>
              }
            />
            <div className="descriptor-grid">
              <label>
                Process route
                <select
                  value={descriptors.route}
                  onChange={e => setDescriptors(d => ({ ...d, route: e.target.value, assumed: false }))}
                >
                  {(ROUTES[factory.sector] ?? [descriptors.route]).map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Primary fuel
                <select
                  value={descriptors.fuel}
                  onChange={e => setDescriptors(d => ({ ...d, fuel: e.target.value, assumed: false }))}
                >
                  {FUELS.map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Grid region
                <select
                  value={descriptors.region}
                  onChange={e => setDescriptors(d => ({ ...d, region: e.target.value, assumed: false }))}
                >
                  {REGIONS.map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Plant age (years)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={descriptors.ageYears}
                  onChange={e =>
                    setDescriptors(d => ({ ...d, ageYears: Number(e.target.value) || 0, assumed: false }))
                  }
                />
              </label>
              <label>
                Headcount
                <input
                  type="number"
                  min={1}
                  value={descriptors.headcount}
                  onChange={e =>
                    setDescriptors(d => ({ ...d, headcount: Number(e.target.value) || 1, assumed: false }))
                  }
                />
              </label>
              <div className="descriptor-readonly">
                <span>Energy spend / yr</span>
                <strong>{money(spend)}</strong>
                <small>fuel + electricity, from the baseline</small>
              </div>
            </div>
          </section>

          {error && (
            <div className="notice warning" role="alert" data-testid="analysis-error">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {result && (
            <>
              <div className="stats-grid" data-testid="analysis-stats">
                <Stat
                  id="analysis-primary"
                  label="Primary leak point"
                  value={
                    sourceLabels[result.predicted.primary_hotspot as Source] ??
                    result.predicted.primary_hotspot
                  }
                  note={
                    result.agreement
                      ? 'Declared baseline and model agree'
                      : `Declared says ${(sourceLabels[result.declared.primary_hotspot as Source] ?? '').toLowerCase()}`
                  }
                />
                <Stat
                  id="analysis-benchmark"
                  label="Versus sector peers"
                  value={result.benchmark ? `${Math.round(result.benchmark.percentile)}th` : '—'}
                  unit="percentile"
                  note={
                    result.benchmark
                      ? `intensity ${result.benchmark.intensity_used.toFixed(2)} vs median ${result.benchmark.sector_median.toFixed(2)} tCO₂e/t`
                      : 'No benchmark for this sector'
                  }
                />
                <Stat
                  id="analysis-confidence"
                  label="Model confidence"
                  value={
                    result.model.top_hotspot_accuracy
                      ? `${Math.round(result.model.top_hotspot_accuracy * 100)}%`
                      : '—'
                  }
                  note={`names the right hotspot on held-out plants · sector table ${result.model.sector_table_top_hotspot_accuracy ? Math.round(result.model.sector_table_top_hotspot_accuracy * 100) : '—'}%`}
                />
                <Stat
                  id="analysis-best"
                  label="Best-value measure"
                  value={ranked[0] ? shortName(ranked[0].item.name) : '—'}
                  note={
                    ranked[0]
                      ? `${compact(ranked[0].reduction)} tCO₂e/yr · ${ranked[0].roiPercent !== null ? `${Math.round(ranked[0].roiPercent)}% return` : 'no capex'}`
                      : 'Declare a material stream to unlock measures'
                  }
                />
              </div>

              <div className="two-columns">
                <section className="border-section">
                  <SectionHeading
                    title="Declared vs model split"
                    note="Where the baseline says the carbon is, against where the model expects it"
                  />
                  <div className="split-rows" data-testid="analysis-split">
                    {[...sources]
                      .sort((a, b) => result.predicted.shares[b] - result.predicted.shares[a])
                      .map(s => {
                        const d = result.discrepancies.find(x => x.source === s)!;
                        return (
                          <div
                            className={`split-row ${d.flag ? 'flagged' : ''}`}
                            key={s}
                            data-testid={`split-${s}`}
                          >
                            <div className="split-head">
                              <span>{sourceLabels[s]}</span>
                              {d.flag && (
                                <Tag id={`flag-${s}`} tone="warning">
                                  {d.delta! > 0 ? '+' : ''}
                                  {Math.round(d.delta! * 100)} pts
                                </Tag>
                              )}
                            </div>
                            <div className="bar-track">
                              <i
                                className="bar-fill declared"
                                style={{ width: `${(d.declared_share ?? 0) * 100}%` }}
                              />
                            </div>
                            <div className="bar-track">
                              <i className="bar-fill model" style={{ width: `${d.model_share * 100}%` }} />
                            </div>
                            <div className="split-values">
                              <span>Declared {pct(d.declared_share)}</span>
                              <span>Model {pct(d.model_share)}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <p className="body-small muted">
                    A gap of 15 points or more is well outside the model’s held-out error and is flagged as
                    something to meter, not as a mistake.
                  </p>
                </section>

                <section className="border-section">
                  <SectionHeading
                    title="If the plant changed one thing"
                    note="What the model expects — not engineering estimates"
                  />
                  <ul className="whatif-list" data-testid="analysis-whatifs">
                    {result.what_ifs.map(w => (
                      <li key={w.change}>
                        <span>{w.change}</span>
                        <strong
                          className={
                            (w.intensity_change_pct ?? 0) < -0.5
                              ? 'down'
                              : (w.intensity_change_pct ?? 0) > 0.5
                                ? 'up'
                                : ''
                          }
                        >
                          {w.intensity_change_pct === null
                            ? '—'
                            : Math.abs(w.intensity_change_pct) < 0.5
                              ? 'no change'
                              : `${w.intensity_change_pct > 0 ? '+' : ''}${Math.round(w.intensity_change_pct)}%`}
                        </strong>
                        <small>{w.intensity.toFixed(2)} tCO₂e/t</small>
                      </li>
                    ))}
                  </ul>
                  <p className="body-small muted">
                    Expected intensity relative to the plant as described. The measures below are priced by
                    the calculation engine, not by the model.
                  </p>
                </section>
              </div>

              <section className="full-section">
                <SectionHeading
                  title="Ranked measures for this plant"
                  note="From the calculation engine, at full adoption — the same figures every other screen shows"
                  action={
                    <Link className="text-link" to={`/interventions?factory=${factory.id}`}>
                      All interventions <ArrowUpRight size={14} />
                    </Link>
                  }
                />
                <div className="ranked-list" data-testid="analysis-ranked">
                  {ranked.slice(0, 5).map((m, i) => (
                    <Link
                      key={m.item.id}
                      className="ranked-row"
                      to={`/interventions/${m.item.id}?factory=${factory.id}`}
                    >
                      <span className="rank-number">{String(i + 1).padStart(2, '0')}</span>
                      <span className="ranked-name">
                        <strong>{m.item.name}</strong>
                        <small>
                          {m.item.category} · {sourceLabels[m.item.source]}
                        </small>
                      </span>
                      <span className="ranked-metric">
                        <small>Reduction</small>
                        <strong>{compact(m.reduction)} tCO₂e</strong>
                      </span>
                      <span className="ranked-metric">
                        <small>Savings / yr</small>
                        <strong>{money(m.operatingSavings)}</strong>
                      </span>
                      <span className="ranked-metric">
                        <small>Return / yr</small>
                        <strong>
                          {m.roiPercent === null
                            ? m.capex <= 0
                              ? 'No capex'
                              : '—'
                            : `${Math.round(m.roiPercent)}%`}
                        </strong>
                      </span>
                      <span className="ranked-metric">
                        <small>Payback</small>
                        <strong>
                          {m.paybackMonths === null
                            ? '—'
                            : m.paybackMonths === 0
                              ? 'Immediate'
                              : m.paybackMonths < 12
                                ? `${fmt(m.paybackMonths, 1)} mo`
                                : `${fmt(m.paybackMonths / 12, 1)} yr`}
                        </strong>
                      </span>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))}
                </div>
              </section>

              <section className="full-section narrative-section" data-testid="analysis-recommendation">
                <SectionHeading
                  title="Overall recommendation"
                  note="Assembled from the figures above and nothing else"
                  action={
                    <div className="heading-actions">
                      <Btn data-testid="analysis-narrate" onClick={narrate}>
                        <MessageSquareText size={15} />
                        Narrate with the Copilot
                      </Btn>
                      {ranked[0] && (
                        <Link
                          className="app-btn primary"
                          to={`/interventions/${ranked[0].item.id}?factory=${factory.id}`}
                        >
                          Open the top scenario
                          <ArrowUpRight size={15} />
                        </Link>
                      )}
                    </div>
                  }
                />
                <div className="narrative">
                  {narrative.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </section>

              <Notice id="analysis-disclosure">
                {result.note} Trained on {result.model.n_samples?.toLocaleString('en-IN')}{' '}
                {result.model.training} plants; held-out share error {result.model.share_mae?.toFixed(3)}.
              </Notice>
            </>
          )}
          {loading && !result && (
            <p className="analysis-loading" role="status">
              Running the model on {factory.name}…
            </p>
          )}
        </>
      )}
    </>
  );
}
