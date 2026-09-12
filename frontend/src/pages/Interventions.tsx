import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Flame,
  Sun,
  Gauge,
  Settings2,
  Layers3,
  Recycle,
  Repeat,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { interventions } from '../domain/fixtures';
import { scenario, eligibleFor, roiPercent } from '../domain/calculations';
import { PageHeading, Tag, compact, money, Notice, Empty, Btn } from '../components/Primitives';
export const fallbackInterventionIcon = Repeat;
export const interventionIcons: Record<string, typeof Flame> = {
  'waste-heat': Flame,
  solar: Sun,
  'motor-efficiency': Gauge,
  boiler: Settings2,
  clinker: Layers3,
  'waste-recovery': Recycle,
  'material-substitution': Repeat,
};
export default function Interventions() {
  const { factories } = useSession(),
    [params, setParams] = useSearchParams();
  const factoryId = params.get('factory') || factories[0].id,
    f = factories.find(f => f.id === factoryId);
  const [sort, setSort] = useState('reduction'),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('all');
  const rows =
    f?.baseline !== null && f
      ? interventions
          .filter(
            i =>
              eligibleFor(f, i) &&
              i.name.toLowerCase().includes(search.toLowerCase()) &&
              (category === 'all' || i.category === category),
          )
          .map(i => ({ ...i, estimate: scenario(f, [i], 100) }))
          .sort((a, b) =>
            sort === 'capex'
              ? a.capex - b.capex
              : sort === 'payback'
                ? (a.estimate.paybackMonths ?? Infinity) - (b.estimate.paybackMonths ?? Infinity)
                : sort === 'savings'
                  ? b.estimate.operatingSavings - a.estimate.operatingSavings
                  : b.estimate.reduction - a.estimate.reduction,
          )
      : [];
  return (
    <>
      <PageHeading
        eyebrow="TURN INSIGHT INTO ACTION"
        title="Interventions"
        description="Practical levers for a lower footprint. Compare the impact before you commit."
        action={
          <Tag id="intervention-catalogue-count" tone="blue">
            6 measures · 4 sectors
          </Tag>
        }
      />
      <div className="factory-context">
        <div>
          <span className="eyebrow">PLANNING FOR</span>
          <label className="sr-only" htmlFor="intervention-factory">
            Planning factory
          </label>
          <select
            id="intervention-factory"
            data-testid="intervention-factory"
            value={factoryId}
            onChange={e => setParams({ factory: e.target.value })}
          >
            {!f && <option value={factoryId}>Unknown factory — select another</option>}
            {factories.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.baseline === null ? ' — Awaiting baseline' : ''}
              </option>
            ))}
          </select>
        </div>
        {f && (
          <>
            <div className="context-metric">
              <span>Annual emissions</span>
              <strong data-testid="planning-baseline">
                {f.baseline === null ? 'Awaiting baseline' : `${compact(f.baseline)} tCO₂e`}
              </strong>
            </div>
            <div className="context-metric">
              <span>Sector</span>
              <Tag id="planning-sector" tone={f.sector.toLowerCase()}>
                {f.sector}
              </Tag>
            </div>
          </>
        )}
      </div>
      <div className="index-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search interventions"
            data-testid="intervention-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find an intervention…"
          />
        </div>
        <div className="filter-controls">
          <select
            aria-label="Intervention category"
            data-testid="intervention-category"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {[...new Set(interventions.map(i => i.category))].map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Sort interventions"
            data-testid="intervention-sort"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            <option value="reduction">Highest reduction</option>
            <option value="savings">Highest operating savings</option>
            <option value="capex">Lowest capex</option>
            <option value="payback">Fastest payback</option>
          </select>
        </div>
      </div>
      {!f ? (
        <Empty title="Factory not found" description="Select an available factory to view measures." />
      ) : f.baseline === null ? (
        <Empty
          title="Awaiting baseline"
          description="Recommendations require an annual baseline and source costs. An intake record alone does not establish a complete baseline."
          action={
            <Link
              to={`/factories/${f.id}/profile`}
              className="app-btn primary"
              data-testid="interventions-awaiting-intake"
            >
              Add source data
            </Link>
          }
        />
      ) : rows.length ? (
        <>
          <div className="results-label" data-testid="intervention-results">
            {rows.length} relevant measures <span>· Ranked by this plant’s hotspots · at full adoption</span>
          </div>
          <div className="intervention-grid">
            {rows.map((i, index) => {
              const Icon = interventionIcons[i.id] ?? fallbackInterventionIcon;
              // Capex is plant-scaled (six-tenths rule), exactly as the scenario page prices it — never the
              // catalogue figure, or the same measure would carry two prices in the same session.
              const roi = roiPercent(i.estimate.operatingSavings, i.estimate.capex);
              return (
                <Link
                  to={`/interventions/${i.id}?factory=${f.id}`}
                  className="intervention-card"
                  key={i.id}
                  data-testid={`intervention-card-${i.id}`}
                >
                  <div className="intervention-card-top">
                    <span className="intervention-icon">
                      <Icon size={25} strokeWidth={1.5} />
                    </span>
                    <span className="tiny-label">{i.category}</span>
                    <ArrowUpRight size={18} />
                  </div>
                  <h2>{i.name}</h2>
                  <p>{i.description}</p>
                  <div className="intervention-impact">
                    <strong>
                      {compact(i.estimate.reduction)}
                      <small>tCO₂e/yr</small>
                    </strong>
                    <span>estimated reduction</span>
                  </div>
                  <div className="intervention-finance">
                    <div>
                      <span>Operating savings / yr</span>
                      <strong>{money(i.estimate.operatingSavings)}</strong>
                    </div>
                    <div className="intervention-roi">
                      <span>Return / yr</span>
                      <strong title="Annual operating savings as a percentage of the upfront capital.">
                        {roi === null
                          ? i.estimate.capex <= 0
                            ? 'No capex'
                            : '—'
                          : `${roi >= 1000 ? Math.round(roi / 100) * 100 : Math.round(roi)}%`}
                      </strong>
                    </div>
                    <div>
                      <span>Upfront capex</span>
                      <strong>{money(i.estimate.capex)}</strong>
                    </div>
                  </div>
                  <div className="intervention-card-foot">
                    <span>{i.duration}</span>
                    <Tag
                      id={`intervention-complexity-${i.id}`}
                      tone={i.complexity === 'Low' ? 'success' : 'neutral'}
                    >
                      {i.complexity} complexity
                    </Tag>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <Empty
          title="No matching interventions"
          description="Try another category or search term."
          action={
            <Btn
              data-testid="clear-intervention-filters"
              onClick={() => {
                setSearch('');
                setCategory('all');
              }}
            >
              Clear filters
            </Btn>
          }
        />
      )}
    </>
  );
}
