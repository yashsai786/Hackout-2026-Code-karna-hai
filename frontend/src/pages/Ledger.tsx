import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, ArrowRight, Check, BookOpen, Search } from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { interventions } from '../domain/fixtures';
import { portfolioTotals, csvExport, downloadText } from '../domain/calculations';
import {
  PageHeading,
  Stat,
  Notice,
  Btn,
  Tag,
  money,
  compact,
  fmt,
  SectionHeading,
  Empty,
} from '../components/Primitives';
import { ReductionChart } from '../components/Charts';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
export default function Ledger() {
  const { ledger, factories, advance } = useSession(),
    [params] = useSearchParams();
  const [factory, setFactory] = useState('all'),
    [status, setStatus] = useState('all'),
    [search, setSearch] = useState(''),
    [pending, setPending] = useState<string | null>(null),
    [exportMessage, setExportMessage] = useState('');
  const rows = ledger.filter(
    e =>
      (factory === 'all' || e.factoryId === factory) &&
      (status === 'all' || e.status === status) &&
      `${e.id} ${factories.find(f => f.id === e.factoryId)?.name} ${e.interventionIds.map(id => interventions.find(i => i.id === id)?.name).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const totals = portfolioTotals(rows, factories),
    pendingRow = ledger.find(e => e.id === pending);
  const chart = factories
    .filter(f => rows.some(e => e.factoryId === f.id))
    .map(f => ({
      name: f.city,
      reduction: portfolioTotals(
        rows.filter(e => e.factoryId === f.id),
        factories,
      ).reduction,
    }));
  const exportCSV = () => {
    downloadText(csvExport(rows, factories), 'leakpoint-ledger.csv', 'text/csv;charset=utf-8');
    setExportMessage(`Exported ${rows.length} visible records. All statuses are labelled as simulations.`);
  };
  return (
    <>
      <PageHeading
        eyebrow="A RECORD, NOT A CLAIM"
        title="Ledger"
        description="Keep your estimates together. Track the scenario without overstating the outcome."
        action={
          <Btn variant="primary" data-testid="export-ledger" onClick={exportCSV}>
            <Download size={16} />
            Export CSV
          </Btn>
        }
      />
      <Notice id="ledger-simulation-disclaimer">
        Records are planning estimates. “Issued” is a workflow stage, <strong>not</strong> registry
        verification, and creates no revenue.
      </Notice>
      <div className="stats-grid">
        <Stat
          id="ledger-record-count"
          label="Scenario records"
          value={String(rows.length).padStart(2, '0')}
          note="Under current filters"
        />
        <Stat
          id="ledger-reduction"
          label="Estimated reduction"
          value={compact(totals.reduction)}
          unit="tCO₂e/yr"
          note="Deduplicated by factory & source"
        />
        <Stat
          id="ledger-operating-savings"
          label="Estimated operating savings"
          value={money(totals.operatingSavings)}
          unit="/yr"
          note="Selected non-overlapping scenarios"
        />
        <Stat
          id="ledger-realised-savings"
          label="Realised savings"
          value={money(totals.realisedSavings)}
          note="No measured savings in this demo"
        />
      </div>
      <div className="two-columns ledger-charts">
        <section className="border-section">
          <SectionHeading
            title="Estimated reduction by factory"
            note="Largest scenario per source; alternatives are not added"
          />
          {chart.length ? (
            <ReductionChart data={chart} />
          ) : (
            <p className="muted" data-testid="ledger-empty-chart">
              No estimates match these filters.
            </p>
          )}
        </section>
        <section className="border-section">
          <SectionHeading title="Scenario progression" note="A workflow stage, not verification" />
          <div className="status-breakdown">
            {(['Estimated', 'In review', 'Issued'] as const).map((s, i) => (
              <div key={s} data-testid={`ledger-status-count-${s.toLowerCase().replace(' ', '-')}`}>
                <span className={`status-stage stage-${i}`}>
                  {i === 2 ? <Check size={17} /> : `0${i + 1}`}
                </span>
                <div>
                  <strong>{s === 'Issued' ? 'Issued' : s}</strong>
                  <div className="status-track">
                    <i
                      style={{
                        width: `${rows.length ? (rows.filter(e => e.status === s).length / rows.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <strong>{rows.filter(e => e.status === s).length}</strong>
              </div>
            ))}
          </div>
          <p className="section-footnote">All issued records remain unverified. Realised revenue: ₹0.</p>
        </section>
      </div>
      <section className="full-section">
        <SectionHeading title="All records" note="A session-only history of your planning decisions" />
        <div className="index-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search ledger"
              data-testid="ledger-search"
              placeholder="Search records or factories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-controls">
            <select
              aria-label="Ledger factory filter"
              data-testid="ledger-factory-filter"
              value={factory}
              onChange={e => setFactory(e.target.value)}
            >
              <option value="all">All factories</option>
              {factories.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Ledger status filter"
              data-testid="ledger-status-filter"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option>Estimated</option>
              <option>In review</option>
              <option value="Issued">Issued</option>
            </select>
          </div>
        </div>
        {exportMessage && (
          <p className="confirmation-message" role="status" data-testid="ledger-export-message">
            {exportMessage}
          </p>
        )}
        {params.get('record') && !ledger.some(e => e.id === params.get('record')) && (
          <Notice id="ledger-invalid-record">
            That record is not in the current session. Refreshing restores the sample dataset.
          </Notice>
        )}
        {rows.length ? (
          <div className="ledger-table-wrap">
            <table className="data-table ledger-table" data-testid="ledger-table">
              <thead>
                <tr>
                  <th>Factory / measure</th>
                  <th>Est. reduction</th>
                  <th>Operating savings</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(e => (
                  <tr
                    key={e.id}
                    className={params.get('record') === e.id ? 'highlighted' : ''}
                    data-testid={`ledger-row-${e.id}`}
                  >
                    <td>
                      <Link to={`/factories/${e.factoryId}`} data-testid={`ledger-factory-link-${e.id}`}>
                        <strong>{factories.find(f => f.id === e.factoryId)?.name}</strong>
                      </Link>
                      <span>
                        {e.interventionIds.map(id => interventions.find(i => i.id === id)?.name).join(' + ')}
                      </span>
                      <small>
                        {e.id} · {e.adoption}% adoption · {new Date(e.createdAt).toLocaleDateString('en-GB')}
                      </small>
                    </td>
                    <td>
                      <strong>{fmt(e.reduction, 0)}</strong>
                      <small>tCO₂e / year</small>
                    </td>
                    <td>
                      <strong>
                        {money(e.operatingSavings)}
                        <small> / year</small>
                      </strong>
                      <span>Capex {money(e.capex)}</span>
                      <small>Realised: {money(e.realisedSavings)}</small>
                    </td>
                    <td>
                      <Tag
                        id={`ledger-status-${e.id}`}
                        tone={
                          e.status === 'Estimated' ? 'blue' : e.status === 'In review' ? 'warning' : 'success'
                        }
                      >
                        {e.status === 'Issued' ? 'Issued' : e.status}
                      </Tag>
                    </td>
                    <td>
                      {e.status !== 'Issued' ? (
                        <Btn
                          className="icon-btn"
                          aria-label={`Advance status for ${e.id}`}
                          title="Advance status"
                          data-testid={`advance-${e.id}`}
                          onClick={() => setPending(e.id)}
                        >
                          <ArrowRight size={16} />
                        </Btn>
                      ) : (
                        <Check size={17} className="muted" aria-label="Simulation complete" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No matching records"
            description="Clear your filters or record a scenario from an intervention."
            action={
              <Btn
                data-testid="ledger-clear-filters"
                onClick={() => {
                  setFactory('all');
                  setStatus('all');
                  setSearch('');
                }}
              >
                Clear filters
              </Btn>
            }
          />
        )}
      </section>
      <Dialog
        open={!!pending}
        onOpenChange={open => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="app-dialog" data-testid="advance-status-dialog">
          <DialogTitle data-testid="advance-status-title">Advance status?</DialogTitle>
          <DialogDescription data-testid="advance-status-description">
            {pendingRow?.id}: {pendingRow?.status} →{' '}
            {pendingRow?.status === 'Estimated' ? 'In review' : 'Issued'}
          </DialogDescription>
          <Notice id="status-advance-warning">
            This changes a workflow stage only. No independent verification, registry issuance, measured
            savings, or financial revenue will occur.
          </Notice>
          <div className="dialog-actions">
            <Btn data-testid="cancel-status-advance" onClick={() => setPending(null)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              data-testid="confirm-status-advance"
              onClick={() => {
                if (pending) advance(pending);
                setPending(null);
              }}
            >
              Advance status
              <ArrowRight size={16} />
            </Btn>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
