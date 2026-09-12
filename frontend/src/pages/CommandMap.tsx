import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, RotateCcw, ArrowUpRight, X, Factory, Cloud, TrendingDown, Layers3 } from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { useMapPanel } from '../state/ui';
import { sectors, interventions, sources, sourceLabels } from '../domain/fixtures';
import { intensity, scenario, sum, eligibleFor } from '../domain/calculations';
import { compact, fmt, Tag, Empty, Btn } from '../components/Primitives';
import { FactoryMap } from '../components/FactoryMap';
import { CommandBar } from '../components/CommandBar';

const sectorColors: Record<string, string> = { Steel: '#2c5eea', Cement: '#098875', Textiles: '#bb861b', Chemicals: '#dd7150' };

export default function CommandMap() {
  const { factories } = useSession();
  const { panelOpen, setPanelOpen } = useMapPanel();
  const [params, setParams] = useSearchParams();
  const [sector, setSector] = useState('all'), [state, setState] = useState('all'), [ranking, setRanking] = useState<'total' | 'intensity'>('total');
  const id = params.get('factory'), selected = factories.find(f => f.id === id);
  // Sector and ranking are also honoured from the query string so the Copilot (and any deep
  // link) can drive the map without this state being lifted out of the page.
  const sectorParam = params.get('sector'), rankParam = params.get('rank');
  useEffect(() => { if (sectorParam && (sectors as string[]).includes(sectorParam)) setSector(sectorParam); }, [sectorParam]);
  useEffect(() => { if (rankParam === 'total' || rankParam === 'intensity') setRanking(rankParam); }, [rankParam]);
  const reset = () => { setSector('all'); setState('all'); };
  const openWith = (fid: string) => { setParams({ factory: fid }); setPanelOpen(true); };
  const select = (fid: string) => { reset(); openWith(fid); };
  const selectedCard = useRef<HTMLDivElement>(null);
  // Bring the selected card into view: the ranking list below it is long, so a pick made while scrolled down would otherwise give no visible feedback.
  useEffect(() => {
    if (!selected || !panelOpen) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    selectedCard.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [id, panelOpen, selected]);
  const filtered = useMemo(() => factories.filter(f => (sector === 'all' || f.sector === sector) && (state === 'all' || f.state === state)), [factories, sector, state]);
  const ranked = [...filtered].filter(f => f.baseline !== null).sort((a, b) => ranking === 'total' ? b.baseline! - a.baseline! : intensity(b)! - intensity(a)!);
  const potential = sum(filtered.filter(f => f.baseline !== null).map(f => Math.max(...interventions.filter(i => eligibleFor(f, i)).map(i => scenario(f, [i], 100).reduction))));
  const total = sum(filtered.map(f => f.baseline || 0));
  const hasFilters = sector !== 'all' || state !== 'all';

  return (
    <div className="map-page" data-testid="command-map">
      <FactoryMap full factories={filtered} selected={id} onSelect={openWith} />
      <aside className={`map-drawer ${panelOpen ? 'open' : ''}`} data-testid="map-panel" aria-hidden={!panelOpen} inert={!panelOpen || undefined}>
        <div className="map-drawer-head">
          <div className="drawer-head-main">
            <span className="drawer-head-badge"><MapPin size={16} /></span>
            <div><div className="eyebrow" data-testid="page-eyebrow">YOUR EMISSIONS, IN FOCUS</div><h1 data-testid="page-title">Command Map</h1></div>
          </div>
          <button className="drawer-close" aria-label="Hide controls" data-testid="close-map-panel" onClick={() => setPanelOpen(false)}><X size={17} /></button>
        </div>
        <div className="map-drawer-body">
          <div className="drawer-stats" data-testid="drawer-stats">
            <div className="drawer-stat" data-testid="stat-factories"><span className="drawer-stat-ic"><Factory size={14} /></span><span className="drawer-stat-label">Factories in view</span><strong data-testid="stat-factories-value">{String(filtered.length).padStart(2, '0')}</strong><small>{filtered.filter(f => f.baseline !== null).length} with baselines</small></div>
            <div className="drawer-stat" data-testid="stat-emissions"><span className="drawer-stat-ic"><Cloud size={14} /></span><span className="drawer-stat-label">Annual emissions</span><strong data-testid="stat-emissions-value">{compact(total)}<em>tCO₂e</em></strong><small>Scope 1 + 2 · FY 2025</small></div>
            <div className="drawer-stat accent" data-testid="stat-potential"><span className="drawer-stat-ic"><TrendingDown size={14} /></span><span className="drawer-stat-label">Reduction opportunity</span><strong data-testid="stat-potential-value">{compact(potential)}<em>tCO₂e/yr</em></strong><small>{total ? (potential / total * 100).toFixed(1) : '0'}% best per site</small></div>
            <div className="drawer-stat" data-testid="stat-sectors"><span className="drawer-stat-ic"><Layers3 size={14} /></span><span className="drawer-stat-label">Industrial sectors</span><strong data-testid="stat-sectors-value">{String(new Set(filtered.map(f => f.sector)).size).padStart(2, '0')}</strong><small>Steel · cement · textiles · chem</small></div>
          </div>

          <div className="drawer-section">
            <span className="drawer-section-label">Navigate</span>
            <CommandBar factories={factories} select={select} filter={s => { setSector(s); setState('all'); setParams({}); setPanelOpen(true); }} rank={r => { setRanking(r); reset(); }} reset={reset} />
          </div>

          <div className="drawer-section">
            <div className="drawer-section-row"><span className="drawer-section-label">Filter</span>{hasFilters && <button className="drawer-reset" data-testid="map-reset-filters" onClick={reset}><RotateCcw size={12} />Reset</button>}</div>
            <div className="drawer-filters" data-testid="drawer-filters">
              <label className="sr-only" htmlFor="map-sector">Filter by sector</label>
              <select id="map-sector" value={sector} data-testid="map-sector-filter" onChange={e => { setSector(e.target.value); setParams({}); }}><option value="all">All sectors</option>{sectors.map(s => <option key={s}>{s}</option>)}</select>
              <label className="sr-only" htmlFor="map-state">Filter by state</label>
              <select id="map-state" value={state} data-testid="map-state-filter" onChange={e => { setState(e.target.value); setParams({}); }}><option value="all">All states</option>{[...new Set(factories.map(f => f.state))].sort().map(s => <option key={s}>{s}</option>)}</select>
            </div>
          </div>

          {id && !selected && <div className="notice warning" role="alert" data-testid="invalid-map-selection">That factory is not in this session.<Btn data-testid="clear-invalid-selection" onClick={() => setParams({})}>Clear</Btn></div>}

          {selected && (
            <div className="drawer-selected" data-testid="selected-factory" ref={selectedCard}>
              <div className="drawer-selected-head"><div><div className="eyebrow">SELECTED FACTORY</div><h2 data-testid="selected-factory-name">{selected.name}</h2></div>{selected.baseline === null ? <Tag id="selected-awaiting" tone="warning">Awaiting baseline</Tag> : <Tag id="selected-sector" tone={selected.sector.toLowerCase()}>{selected.sector}</Tag>}</div>
              <p className="location"><MapPin size={13} />{selected.city}, {selected.state}</p>
              {selected.baseline !== null && (
                <div className="drawer-selected-stats">
                  <div><span>Annual emissions</span><strong data-testid="selected-emissions">{fmt(selected.baseline)} <em>tCO₂e</em></strong></div>
                  <div><span>Largest hotspot</span><strong data-testid="selected-hotspot">{sourceLabels[sources.reduce((a, b) => selected.hotspots[a] > selected.hotspots[b] ? a : b)]}</strong></div>
                </div>
              )}
              <Link to={`/factories/${selected.id}`} className={`app-btn ${selected.baseline !== null ? 'primary' : 'outline'}`} data-testid="selected-factory-detail">View factory<ArrowUpRight size={15} /></Link>
            </div>
          )}

          <div className="drawer-section" data-testid="ranking-panel">
            <div className="drawer-ranking-head"><div><span className="drawer-section-label">Ranking</span><p data-testid="ranking-baseline-count">Where to focus first · {ranked.length} ranked</p></div></div>
            <div className="segmented" role="group" aria-label="Ranking metric">
              <button data-testid="rank-total" aria-pressed={ranking === 'total'} className={ranking === 'total' ? 'active' : ''} onClick={() => setRanking('total')}>Total</button>
              <button data-testid="rank-intensity" aria-pressed={ranking === 'intensity'} className={ranking === 'intensity' ? 'active' : ''} onClick={() => setRanking('intensity')}>Intensity</button>
            </div>
            <div className="ranking-list">
              {ranked.length === 0 ? <Empty title="No matching baselines" description="Change filters or add baseline data." action={<Btn data-testid="ranking-clear-filters" onClick={reset}>Clear filters</Btn>} /> :
                ranked.map((f, i) => (
                  <button className={`rank-row ${id === f.id ? 'selected' : ''} ${i < 3 ? 'top' : ''}`} key={f.id} data-testid={`rank-factory-${f.id}`} onClick={() => openWith(f.id)}>
                    <span className="rank-number">{String(i + 1).padStart(2, '0')}</span>
                    <div className="rank-factory"><div className="rank-name"><span className="sector-dot" style={{ background: sectorColors[f.sector] }} /><strong>{f.name}</strong></div><span>{f.city} · {f.sector}</span><div className="rank-bar"><i style={{ width: `${ranking === 'total' ? f.baseline! / ranked[0].baseline! * 100 : intensity(f)! / intensity(ranked[0])! * 100}%` }} /></div></div>
                    <div className="rank-amount">{ranking === 'total' ? compact(f.baseline!) : fmt(intensity(f)!, 2)}<small>{ranking === 'total' ? 'tCO₂e/yr' : 'tCO₂e/t'}</small></div>
                  </button>
                ))}
            </div>
          </div>

          <div className="drawer-foot">
            <Link to={selected && selected.baseline === null ? `/factories/${selected.id}/profile` : id ? `/intake?factory=${id}` : '/intake'} className="app-btn primary" data-testid="map-add-data"><span>+</span>{selected && selected.baseline === null ? 'Set up baseline' : 'Add factory data'}</Link>
            <Link to="/factories" className="text-link" data-testid="view-all-factories">Factory index<ArrowUpRight size={14} /></Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
