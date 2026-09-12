import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, BookOpen, TrendingDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '../state/SessionContext';
import { interventions, sourceLabels } from '../domain/fixtures';
import { scenario, compatible, eligibleFor, roiPercent } from '../domain/calculations';
import {
  PageHeading,
  Notice,
  NotFound,
  Btn,
  Tag,
  fmt,
  money,
  compact,
  SectionHeading,
  Empty,
  ArrowLink,
} from '../components/Primitives';
import { CashFlowChart } from '../components/Charts';
export default function InterventionDetail() {
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    { factories, record, ledger } = useSession();
  const item = interventions.find(i => i.id === id),
    factoryId = params.get('factory') || factories[0].id,
    f = factories.find(f => f.id === factoryId);
  // A deep link may preset the slider ("solar at Bhilai at 60%"); clamp so a bad link cannot break the arithmetic.
  const presetAdoption = params.get('adoption');
  const [adoption, setAdoption] = useState(
      presetAdoption !== null && Number.isFinite(Number(presetAdoption))
        ? Math.max(0, Math.min(100, Math.round(Number(presetAdoption))))
        : 100,
    ),
    [addon, setAddon] = useState(''),
    [message, setMessage] = useState('');
  if (!item) return <NotFound kind="Intervention" to="/interventions" label="Intervention catalogue" />;
  if (!f) return <NotFound kind="Factory" to={`/interventions/${id}`} label="Reset factory selection" />;
  const eligible = f.baseline !== null && item.sectors.includes(f.sector),
    available = interventions.filter(i => eligibleFor(f, i) && compatible([item, i]));
  const extra = available.find(i => i.id === addon),
    items = extra ? [item, extra] : [item];
  const result = eligible ? scenario(f, items, adoption) : null;
  const existing = ledger.find(
    e =>
      e.factoryId === f.id &&
      e.adoption === adoption &&
      [...e.interventionIds].sort().join() ===
        items
          .map(i => i.id)
          .sort()
          .join(),
  );
  const recordEstimate = () => {
    try {
      const r = record(
        f.id,
        items.map(i => i.id),
        adoption,
      );
      const m = r.added
        ? `Estimate ${r.id} recorded. No realised savings or credit revenue created.`
        : `This exact estimate is already recorded as ${r.id}.`;
      setMessage(m);
      toast.success(m);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const payback =
    result?.paybackMonths === null
      ? 'No break-even'
      : result?.paybackMonths === 0
        ? 'Immediate'
        : result
          ? `${result.paybackMonths!.toFixed(1)} months`
          : '—';
  return (
    <>
      <Link to={`/interventions?factory=${f.id}`} className="back-link" data-testid="intervention-back">
        <ArrowLeft size={15} />
        Intervention catalogue
      </Link>
      <PageHeading
        eyebrow={`${item.category.toUpperCase()} / SCENARIO BUILDER`}
        title={item.name}
        description={item.description}
      />
      <div className="factory-context">
        <div>
          <span className="eyebrow">MODELLING FOR</span>
          <select
            aria-label="Scenario factory"
            data-testid="scenario-factory"
            value={factoryId}
            onChange={e => {
              setParams({ factory: e.target.value });
              setAddon('');
              setMessage('');
            }}
          >
            {factories.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.baseline === null ? ' — Awaiting baseline' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="context-metric">
          <span>Source addressed</span>
          <strong data-testid="scenario-source">{sourceLabels[item.source]}</strong>
        </div>
        <div className="context-metric">
          <span>Implementation</span>
          <strong>{item.duration}</strong>
        </div>
      </div>
      {!result ? (
        <Empty
          title={f.baseline === null ? 'Awaiting baseline' : 'Not a sector match'}
          description={
            f.baseline === null
              ? 'No recommendation or estimate can be calculated without a complete baseline.'
              : 'This intervention is not defined for this factory’s sector. Select another factory or measure.'
          }
          action={
            <Link
              to={`/interventions?factory=${f.id}`}
              className="app-btn primary"
              data-testid="scenario-choose-another"
            >
              Browse eligible measures
            </Link>
          }
        />
      ) : (
        <>
          <div className="scenario-layout">
            <section className="scenario-controls">
              <SectionHeading
                title="Your adoption scenario"
                note="A share of the full technical measure, not the whole factory"
              />
              <div className="adoption-label">
                <label htmlFor="adoption-slider">Adoption level</label>
                <strong data-testid="adoption-value">
                  {adoption}
                  <span>%</span>
                </strong>
              </div>
              <input
                type="range"
                id="adoption-slider"
                data-testid="adoption-slider"
                min="0"
                max="100"
                step="5"
                value={adoption}
                onChange={e => {
                  setAdoption(Number(e.target.value));
                  setMessage('');
                }}
              />
              <div className="range-labels">
                <span>0% · No operation</span>
                <span>100% · Full measure</span>
              </div>
              <label className="field-label">
                Compatible bundle
                <select
                  data-testid="scenario-bundle"
                  value={extra?.id || ''}
                  onChange={e => {
                    setAddon(e.target.value);
                    setMessage('');
                  }}
                >
                  <option value="">Single measure only</option>
                  {available.map(i => (
                    <option key={i.id} value={i.id}>
                      + {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="body-small muted" data-testid="compatibility-explanation">
                Only mutually compatible measures on different emission sources can be combined. Overlapping
                measures are excluded.
              </p>
              <dl className="assumptions-list scenario-assumptions">
                <div>
                  <dt>Gross operating savings / yr</dt>
                  <dd data-testid="scenario-gross-savings">{money(result.grossSavings)}</dd>
                </div>
                <div>
                  <dt>Additional operating cost / yr</dt>
                  <dd data-testid="scenario-opex">{money(result.opex)}</dd>
                </div>
                <div>
                  <dt>Net operating savings / yr</dt>
                  <dd data-testid="scenario-net-savings">{money(result.operatingSavings)}</dd>
                </div>
                <div>
                  <dt>Return on capital / yr</dt>
                  <dd data-testid="scenario-roi">
                    {result.roiPercent === null
                      ? result.capex <= 0
                        ? 'No capex'
                        : '—'
                      : `${Math.round(result.roiPercent)}%`}
                  </dd>
                </div>
                <div>
                  <dt>Upfront capex</dt>
                  <dd data-testid="scenario-capex">{money(result.capex)}</dd>
                </div>
                <div>
                  <dt>Simple payback</dt>
                  <dd data-testid="scenario-payback">{payback}</dd>
                </div>
              </dl>
              <Notice id="capex-assumption">
                Capex does not scale with adoption; savings and operating costs do.
              </Notice>
            </section>
            <section className="scenario-results">
              <SectionHeading title="A smaller footprint" note="Annual baseline versus this scenario" />
              <div className="reduction-hero">
                <TrendingDown size={27} />
                <strong data-testid="scenario-reduction">
                  {compact(result.reduction)}
                  <small>tCO₂e/yr estimated reduction</small>
                </strong>
                <span data-testid="scenario-reduction-percent">
                  {((result.reduction / f.baseline!) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="comparison-bars" data-testid="adoption-comparison">
                <div>
                  <span>Current baseline</span>
                  <strong>{fmt(f.baseline!)} tCO₂e</strong>
                  <i style={{ width: '100%' }} />
                </div>
                <div>
                  <span>After intervention</span>
                  <strong data-testid="scenario-remaining">{fmt(result.remaining)} tCO₂e</strong>
                  <i className="after" style={{ width: `${(result.remaining / f.baseline!) * 100}%` }} />
                </div>
              </div>
              <SectionHeading
                title="36-month cash flow"
                note="Cumulative operating savings less fixed upfront capex"
              />
              <CashFlowChart data={result.cashflow} />
              <div className="cashflow-footer">
                <span>
                  Net cash at month 36
                  <strong data-testid="cashflow-month-36">{money(result.cashflow[36].value)}</strong>
                </span>
                <Tag
                  id="break-even-status"
                  tone={result.paybackMonths !== null && result.paybackMonths <= 36 ? 'success' : 'warning'}
                >
                  {result.paybackMonths === null
                    ? 'No positive operating savings'
                    : result.paybackMonths > 36
                      ? 'Break-even beyond 36 months'
                      : result.paybackMonths === 0
                        ? 'Zero capex · immediate payback'
                        : `Break-even at month ${Math.ceil(result.paybackMonths)}`}
                </Tag>
              </div>
            </section>
          </div>
          <div className="record-band">
            <div>
              <span className="eyebrow">KEEP A RECORD OF THE POSSIBILITY</span>
              <h2 data-testid="record-band-title">An estimate today. A reference for tomorrow.</h2>
              <p>No realised savings, issued registry credits, or revenue will be created.</p>
            </div>
            <div className="button-row">
              {existing && (
                <ArrowLink to={`/ledger?record=${existing.id}`} id="scenario-view-ledger">
                  View in ledger
                </ArrowLink>
              )}
              <Btn
                variant="primary"
                data-testid="record-estimate"
                disabled={!!existing}
                onClick={recordEstimate}
              >
                {existing ? <Check size={17} /> : <BookOpen size={17} />}
                {existing ? 'Recorded to ledger' : 'Record estimate'}
              </Btn>
            </div>
          </div>
          {message && (
            <p className="confirmation-message" role="status" data-testid="record-confirmation">
              {message}
            </p>
          )}
          <section className="full-section">
            <SectionHeading title="Implementation pathway" note="Site-specific engineering required" />
            <div
              className="process-flow"
              tabIndex={0}
              role="group"
              aria-label={`Implementation pathway, ${item.steps.length} steps`}
            >
              {item.steps.map((step, i) => (
                <div className="process-step" key={step} data-testid={`implementation-step-${i}`}>
                  <span className="process-index">0{i + 1}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
