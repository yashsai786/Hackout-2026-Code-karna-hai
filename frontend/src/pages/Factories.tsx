import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpRight, Factory as FactoryIcon, MapPin } from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { PageHeading, Tag, fmt, compact, Empty, Btn } from '../components/Primitives';
import { NewFactory } from '../components/NewFactory';
import { sectors, sources, sourceLabels } from '../domain/fixtures';
import { intensity } from '../domain/calculations';
export default function Factories() {
  const { factories } = useSession();
  const [search, setSearch] = useState(''),
    [sector, setSector] = useState('all'),
    [sort, setSort] = useState('emissions');
  const rows = factories
    .filter(
      f =>
        `${f.name} ${f.city} ${f.state}`.toLowerCase().includes(search.toLowerCase()) &&
        (sector === 'all' || f.sector === sector),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'intensity'
          ? (intensity(b) || 0) - (intensity(a) || 0)
          : (b.baseline || 0) - (a.baseline || 0),
    );
  return (
    <>
      <PageHeading
        eyebrow="THE INDUSTRIAL PORTFOLIO"
        title="Factories"
        description={`${factories.length} starting points. A complete picture of each operation.`}
        action={<NewFactory />}
      />
      <div className="index-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search factories"
            data-testid="factory-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search factories, cities, or states…"
          />
        </div>
        <div className="filter-controls">
          <select
            aria-label="Filter factories by sector"
            data-testid="factory-sector-filter"
            value={sector}
            onChange={e => setSector(e.target.value)}
          >
            <option value="all">All sectors</option>
            {sectors.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Sort factories"
            data-testid="factory-sort"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            <option value="emissions">Highest emissions</option>
            <option value="intensity">Highest intensity</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>
      <div className="results-label" data-testid="factory-results">
        {rows.length} factories <span>· Sample FY 2025 baseline</span>
      </div>
      {rows.length ? (
        <div className="factory-grid">
          {rows.map(f => (
            <Link
              to={`/factories/${f.id}`}
              key={f.id}
              className="factory-card"
              data-testid={`factory-card-${f.id}`}
            >
              <div className="factory-card-top">
                <span className={`factory-sector-icon ${f.sector.toLowerCase()}`}>
                  <FactoryIcon size={23} strokeWidth={1.4} />
                </span>
                <Tag id={`factory-tag-${f.id}`} tone={f.sector.toLowerCase()}>
                  {f.sector}
                </Tag>
                <ArrowUpRight size={17} className="card-arrow" />
              </div>
              <h2 data-testid={`factory-name-${f.id}`}>{f.name}</h2>
              <p className="location">
                <MapPin size={13} />
                {f.city}, {f.state}
              </p>
              <div className="factory-card-metrics">
                <div>
                  <span>Annual emissions</span>
                  <strong data-testid={`factory-emissions-${f.id}`}>
                    {f.baseline === null ? '—' : compact(f.baseline)}
                    <small>{f.baseline !== null && 'tCO₂e'}</small>
                  </strong>
                </div>
                <div>
                  <span>Intensity</span>
                  <strong>
                    {intensity(f) === null ? '—' : fmt(intensity(f)!, 2)}
                    <small>{intensity(f) !== null && 'tCO₂e/t'}</small>
                  </strong>
                </div>
              </div>
              <div className="factory-card-footer">
                <span className="tiny-label" data-testid={`factory-top-source-${f.id}`}>
                  {f.baseline === null
                    ? 'No baseline'
                    : (() => {
                        // The one fact a reader wants per plant: where most of its carbon comes from.
                        const top = [...sources].sort((a, b) => f.hotspots[b] - f.hotspots[a])[0];
                        return `${sourceLabels[top].split(' ')[0]} ${Math.round((f.hotspots[top] / f.baseline) * 100)}% of emissions`;
                      })()}
                </span>
                <Tag
                  id={`factory-confidence-${f.id}`}
                  tone={f.baseline === null || f.confidence === 'Medium' ? 'warning' : 'success'}
                >
                  {f.baseline === null ? 'Awaiting baseline' : `${f.confidence} confidence`}
                </Tag>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No factories found"
          description="Try another name, location, or sector."
          action={
            <Btn
              data-testid="factory-clear-filters"
              onClick={() => {
                setSector('all');
                setSearch('');
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
