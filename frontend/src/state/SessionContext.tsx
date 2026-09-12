import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import { factories as fixtureFactories, interventions, initialInbox } from '../domain/fixtures';
import { scenario } from '../domain/calculations';
import type { Factory, IntakeRecord, LedgerEntry, InboxItem, Sector } from '../domain/types';

function seedLedger(): LedgerEntry[] {
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
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* private mode */
  }
  window.location.reload();
}

type State = {
  factories: Factory[];
  ledger: LedgerEntry[];
  intake: IntakeRecord[];
  inbox: InboxItem[];
  settings: Record<string, boolean>;
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
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ factories, ledger, intake, inbox }));
    } catch {
      /* quota or private mode: the app still works, it just will not survive a reload */
    }
  }, [factories, ledger, intake, inbox]);
  const value: State = {
    factories,
    ledger,
    intake,
    inbox,
    settings,
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
