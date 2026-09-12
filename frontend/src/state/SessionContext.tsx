import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import { factories as fixtureFactories, interventions, initialInbox } from '../domain/fixtures';
import { scenario } from '../domain/calculations';
import type { Factory, IntakeRecord, LedgerEntry, InboxItem, Sector } from '../domain/types';
import { fetchState, saveState, deleteState, apiConfigured, fetchAlerts } from '../lib/leakpointApi';

/** The three seed ledger records. Exported so backend/seed.json can be proven identical. */
export function seedLedger(): LedgerEntry[] {
  return [
    { factoryId: 'bhilai-steel', interventionId: 'waste-heat', adoption: 75, status: 'Estimated' as const },
    { factoryId: 'surat-textiles', interventionId: 'solar', adoption: 60, status: 'In review' as const },
    {
      factoryId: 'satna-cement',
      interventionId: 'motor-efficiency',
      adoption: 100,
      status: 'Issued' as const,
    },
  ].map((e, index) => {
    const s = scenario(
      fixtureFactories.find(f => f.id === e.factoryId)!,
      [interventions.find(i => i.id === e.interventionId)!],
      e.adoption,
    );
    return {
      id: `LP-2026-00${index + 1}`,
      factoryId: e.factoryId,
      interventionIds: [e.interventionId],
      adoption: e.adoption,
      reduction: s.reduction,
      operatingSavings: s.operatingSavings,
      capex: s.capex,
      realisedSavings: 0,
      status: e.status,
      createdAt: `2026-02-0${index + 1}T09:00:00Z`,
      simulated: true,
    };
  });
}
const STORE_KEY = 'leakpoint.session.v1';

// The demonstration used to lose everything on refresh, which is the worst thing that can happen
// mid-judging. Reads are defensive: any corruption falls back to the seeded dataset.
function loadStored(): {
  factories?: Factory[];
  ledger?: LedgerEntry[];
  intake?: IntakeRecord[];
  inbox?: InboxItem[];
} | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.factories) && parsed.factories.length ? parsed : null;
  } catch {
    return null;
  }
}

export function resetSessionData() {
  const local = () => {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* private mode */
    }
    window.location.reload();
  };
  // The API is the system of record, so it is cleared first; local storage is only a cache.
  deleteState().then(local, local);
}

export type SyncState = 'checking' | 'api' | 'local';

type State = {
  factories: Factory[];
  ledger: LedgerEntry[];
  intake: IntakeRecord[];
  inbox: InboxItem[];
  settings: Record<string, boolean>;
  /** Where the data lives right now: the API (system of record) or this browser only. */
  sync: SyncState;
  savedAt: string | null;
  syncError: string;
  setSetting: (key: string, value: boolean) => void;
  addFactory: (name: string, city: string, state: string, sector: Sector) => string;
  updateFactory: (id: string, patch: Partial<Factory>) => void;
  record: (factoryId: string, ids: string[], adoption: number) => { added: boolean; id: string };
  advance: (id: string) => void;
  addIntake: (record: Omit<IntakeRecord, 'id'>) => void;
  markRead: (id: string) => void;
  addDigest: (body: string) => string;
};
const Session = createContext<State | null>(null);
export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const stored = loadStored();
  const [factories, setFactories] = useState<Factory[]>(
    () => stored?.factories ?? structuredClone(fixtureFactories),
  );
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => stored?.ledger ?? seedLedger());
  const ledgerRef = useRef(ledger);
  const [intake, setIntake] = useState<IntakeRecord[]>(() => stored?.intake ?? []);
  const [inbox, setInbox] = useState<InboxItem[]>(() => stored?.inbox ?? structuredClone(initialInbox));
  const [settings, setSettings] = useState({
    emissions: true,
    exposure: true,
    readiness: false,
    digest: true,
  });
  const [sync, setSync] = useState<SyncState>(apiConfigured() ? 'checking' : 'local');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState('');
  const hydrated = useRef(false);
  const lastSaved = useRef('');

  // Local storage stays as a cache so a reload is instant and an API outage loses nothing.
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ factories, ledger, intake, inbox }));
    } catch {
      /* quota or private mode: the app still works, it just will not survive a reload */
    }
  }, [factories, ledger, intake, inbox]);

  // Hydrate from the API once. A saved session replaces local state; an empty API is seeded from
  // what this browser has, so the very first visitor also ends up with a server-side record.
  useEffect(() => {
    if (!apiConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await fetchState();
        if (cancelled) return;
        if (Array.isArray(doc.factories) && doc.factories.length) {
          setFactories(doc.factories as Factory[]);
          const led = (Array.isArray(doc.ledger) ? doc.ledger : []) as LedgerEntry[];
          ledgerRef.current = led;
          setLedger(led);
          setIntake((Array.isArray(doc.intake) ? doc.intake : []) as IntakeRecord[]);
          setInbox((Array.isArray(doc.inbox) ? doc.inbox : []) as InboxItem[]);
          lastSaved.current = JSON.stringify({
            factories: doc.factories,
            ledger: led,
            intake: doc.intake ?? [],
            inbox: doc.inbox ?? [],
          });
          setSavedAt(doc.savedAt ?? null);
        }
        setSync('api');
      } catch (e) {
        if (cancelled) return;
        const notFound = e instanceof Error && /404|No session/.test(e.message);
        if (notFound) {
          setSync('api'); // nothing saved yet: the write-through below seeds it
        } else {
          setSync('local');
          setSyncError(e instanceof Error ? e.message : 'API unreachable');
        }
      } finally {
        hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alerts are computed by the API from the data. Merge them into the inbox, keeping read flags and
  // any digests the operator generated; drop computed alerts the data no longer produces.
  useEffect(() => {
    if (sync !== 'api' || !hydrated.current) return;
    const t = window.setTimeout(async () => {
      try {
        const { alerts } = await fetchAlerts();
        setInbox(cur => {
          const digests = cur.filter(m => m.type === 'digest');
          const merged: InboxItem[] = alerts.map(a => {
            const prev = cur.find(m => m.id === a.id);
            return {
              id: a.id,
              title: a.title,
              body: a.body,
              date: prev?.date ?? a.date,
              read: prev?.read ?? false,
              type: a.type,
              factoryId: a.factoryId,
            };
          });
          const next = [...merged, ...digests];
          const same =
            next.length === cur.length &&
            next.every(
              (m, i) =>
                m.id === cur[i].id &&
                m.title === cur[i].title &&
                m.body === cur[i].body &&
                m.read === cur[i].read,
            );
          return same ? cur : next;
        });
      } catch {
        /* the inbox keeps what it has */
      }
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factories, ledger, sync]);

  // Write through, debounced, once hydrated. Only what changed since the last successful save.
  useEffect(() => {
    if (sync !== 'api' || !hydrated.current) return;
    const doc = { factories, ledger, intake, inbox };
    const serialised = JSON.stringify(doc);
    if (serialised === lastSaved.current) return;
    const t = window.setTimeout(async () => {
      try {
        const res = await saveState(doc);
        lastSaved.current = serialised;
        setSavedAt(res.savedAt);
        setSyncError('');
      } catch (e) {
        setSync('local');
        setSyncError(e instanceof Error ? e.message : 'Save failed');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [factories, ledger, intake, inbox, sync]);
  const value: State = {
    factories,
    ledger,
    intake,
    inbox,
    settings,
    sync,
    savedAt,
    syncError,
    setSetting: (key, value) => setSettings(s => ({ ...s, [key]: value })),
    addFactory: (name, city, state, sector) => {
      const id = `new-${crypto.randomUUID()}`;
      setFactories(fs => [
        ...fs,
        {
          id,
          name: name.trim(),
          city: city.trim(),
          state: state.trim(),
          sector,
          baseline: null,
          production: null,
          coordinates: null,
          confidence: 'Low',
          wasteTonnes: 0,
          exportShare: 0,
          costs: { fuel: 0, electricity: 0, process: 0, waste: 0 },
          hotspots: { fuel: 0, electricity: 0, process: 0, waste: 0 },
          history: [],
          materials: [],
          readiness: {
            baselineDocumented: false,
            additionality: false,
            monitoring: false,
            independentReview: false,
          },
        },
      ]);
      return id;
    },
    // The write path a user-created factory needs to become analysable. Without it every
    // downstream screen dead-ends on 'A validated baseline is required.'
    updateFactory: (id, patch) => setFactories(fs => fs.map(f => (f.id === id ? { ...f, ...patch } : f))),
    record: (factoryId, ids, adoption) => {
      const existing = ledgerRef.current.find(
        e =>
          e.factoryId === factoryId &&
          [...e.interventionIds].sort().join() === [...ids].sort().join() &&
          e.adoption === adoption,
      );
      if (existing) return { added: false, id: existing.id };
      const f = factories.find(f => f.id === factoryId);
      if (!f) throw new Error('Factory not found.');
      const items = ids.map(id => interventions.find(i => i.id === id));
      if (items.some(i => !i)) throw new Error('Intervention not found.');
      const s = scenario(f, items as typeof interventions, adoption),
        id = `LP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const entry: LedgerEntry = {
        id,
        factoryId,
        interventionIds: ids,
        adoption,
        reduction: s.reduction,
        operatingSavings: s.operatingSavings,
        capex: s.capex,
        realisedSavings: 0,
        status: 'Estimated',
        createdAt: new Date().toISOString(),
        simulated: true,
      };
      ledgerRef.current = [entry, ...ledgerRef.current];
      setLedger(ledgerRef.current);
      return { added: true, id };
    },
    advance: id => {
      ledgerRef.current = ledgerRef.current.map(e =>
        e.id === id ? { ...e, status: e.status === 'Estimated' ? 'In review' : 'Issued' } : e,
      );
      setLedger(ledgerRef.current);
    },
    addIntake: record => setIntake(rows => [{ ...record, id: crypto.randomUUID() }, ...rows]),
    markRead: id => setInbox(rows => rows.map(r => (r.id === id ? { ...r, read: true } : r))),
    addDigest: body => {
      const id = crypto.randomUUID();
      setInbox(rows => [
        { id, title: 'Portfolio digest', body, date: new Date().toISOString(), read: false, type: 'digest' },
        ...rows,
      ]);
      return id;
    },
  };
  return <Session.Provider value={value}>{children}</Session.Provider>;
};
export const useSession = () => {
  const state = useContext(Session);
  if (!state) throw new Error('Session provider missing');
  return state;
};
