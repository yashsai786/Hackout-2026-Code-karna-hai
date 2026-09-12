import { useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Check,
  Clock3,
  ArrowUpRight,
  Leaf,
  FileCheck2,
  ScanLine,
  ClipboardCheck,
  BadgeCheck,
} from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { FIXTURE_DATE } from '../domain/fixtures';
import { creditPotential, readinessCount } from '../domain/calculations';
import {
  PageHeading,
  Notice,
  Stat,
  Tag,
  SectionHeading,
  compact,
  fmt,
  money,
  NotFound,
  Empty,
} from '../components/Primitives';
const steps = [
  {
    key: 'baselineDocumented' as const,
    title: 'Baseline documentation',
    body: 'A complete inventory, reporting boundary, source records, and baseline period.',
    icon: FileCheck2,
  },
  {
    key: 'additionality' as const,
    title: 'Additionality assessment',
    body: 'Evidence that the activity exceeds business-as-usual and satisfies an applicable methodology.',
    icon: ScanLine,
  },
  {
    key: 'monitoring' as const,
    title: 'Monitoring plan',
    body: 'A documented measurement plan, quality controls, leakage assessment, and ownership records.',
    icon: ClipboardCheck,
  },
  {
    key: 'independentReview' as const,
    title: 'Independent verification',
    body: 'Review by an accredited verifier and acceptance by a suitable registry.',
    icon: BadgeCheck,
  },
];
export default function Credits() {
  const { factories } = useSession(),
    [params, setParams] = useSearchParams();
  const id = params.get('factory') || factories[0].id,
    f = factories.find(f => f.id === id);
  if (!f) return <NotFound kind="Factory" to="/credits" label="Reset credits factory" />;
  const { best, volume, valueLowINR, valueHighINR } = creditPotential(f);
  return (
    <>
      <PageHeading
        eyebrow="POTENTIAL IS NOT A PROMISE"
        title="Credits"
        description="Understand the opportunity. Keep the path to verification in perspective."
        action={
          <Tag id="credits-unverified" tone="warning">
            Not registry verified
          </Tag>
        }
      />
      <Notice id="credits-disclaimer">
        Technical reductions do not automatically become credits. Nothing here is issued, verified or sold.
      </Notice>
      <div className="factory-context">
        <div>
          <span className="eyebrow">ASSESSING</span>
          <select
            aria-label="Credits factory"
            data-testid="credits-factory"
            value={id}
            onChange={e => setParams({ factory: e.target.value })}
          >
            {factories.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.baseline === null ? ' \u2014 Awaiting baseline' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="context-metric">
          <span>Data confidence</span>
          <strong data-testid="credits-data-confidence">{f.confidence}</strong>
        </div>
        <div className="context-metric">
          <span>Documentation readiness</span>
          <strong data-testid="credits-readiness-count">{readinessCount(f)} of 4 checks</strong>
        </div>
      </div>
      {!best ? (
        <Empty
          title="Awaiting baseline"
          description="Credit potential cannot be illustrated without an annual emissions baseline."
          action={
            <Link
              to={`/factories/${f.id}/profile`}
              className="app-btn primary"
              data-testid="credits-add-baseline"
            >
              Add source data
            </Link>
          }
        />
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              id="credit-technical-potential"
              label="Technical reduction potential"
              value={compact(best.result.reduction)}
              unit="tCO₂e/yr"
              note="Best single measure · 100% adoption"
            />
            <Stat
              id="credit-illustrative-volume"
              label="Potential credit volume"
              value={compact(volume)}
              unit="units/yr"
              note="70% modelling factor · if eligible"
            />
            <Stat
              id="credit-reference-range"
              label="Reference price range"
              value="₹600–1,500"
              note={`Per unit · reference dated ${FIXTURE_DATE}`}
            />
            <Stat
              id="credit-realised-revenue"
              label="Realised credit revenue"
              value="₹0"
              note="No verified issuance or sales"
            />
          </div>
          <div className="two-columns credits-columns">
            <section className="border-section">
              <SectionHeading title="What sits behind the number" note="How the volume is derived" />
              <div className="credit-formula">
                <div>
                  <span>01</span>
                  <p>
                    Best single technical measure
                    <strong data-testid="credit-best-measure">{best.item.name}</strong>
                  </p>
                  <strong>{fmt(best.result.reduction)} tCO₂e</strong>
                </div>
                <div>
                  <span>02</span>
                  <p>
                    Modelling factor<strong>70% of technical reduction</strong>
                  </p>
                  <strong>× 0.70</strong>
                </div>
                <div>
                  <span>03</span>
                  <p>
                    Potential volume
                    <strong>If every eligibility requirement is met</strong>
                  </p>
                  <strong>{fmt(volume)} units</strong>
                </div>
              </div>
              <div className="conditional-value" data-testid="credit-conditional-value">
                <span>Indicative gross value, not revenue</span>
                <strong>
                  {money(valueLowINR)} – {money(valueHighINR)}
                </strong>
                <p>No transaction costs, buffer rules, methodology limits, or verification costs modelled.</p>
              </div>
              <Link
                to={`/interventions/${best.item.id}?factory=${f.id}`}
                className="text-link"
                data-testid="credits-view-measure"
              >
                Review the underlying intervention
                <ArrowUpRight size={16} />
              </Link>
            </section>
            <section className="border-section">
              <SectionHeading
                title="Readiness is more than confidence"
                note="Documentation checks are independent of data confidence"
              />
              <div className="readiness-meter" data-testid="readiness-meter">
                <strong>
                  {readinessCount(f)}
                  <span>/ 4</span>
                </strong>
                <div>
                  {steps.map(s => (
                    <i key={s.key} className={f.readiness[s.key] ? 'complete' : ''} />
                  ))}
                </div>
                <p>Documentation checks completed</p>
              </div>
              <Notice id="credits-readiness-disclaimer">
                High data confidence is not credit readiness; independent review is still required.
              </Notice>
              <p className="body-small muted">
                The reference range is dated, not a quote. No registry or sales channel is connected.
              </p>
            </section>
          </div>
        </>
      )}
      <section className="full-section">
        <SectionHeading title="The path to verification" note="Each step needs evidence beyond this tool" />
        <div className="verification-grid">
          {steps.map((s, i) => (
            <div className="verification-step" key={s.key} data-testid={`verification-step-${s.key}`}>
              <div className="verification-top">
                <s.icon size={24} strokeWidth={1.5} />
                <span>0{i + 1}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <Tag id={`verification-status-${s.key}`} tone={f.readiness[s.key] ? 'success' : 'warning'}>
                {f.readiness[s.key] ? 'Documented' : 'Evidence needed'}
              </Tag>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
