import type { Factory, IntakeRecord, LedgerEntry, Sector } from '../domain/types';

/** A deep link from a figure to the screen that proves it. */
export type Ref = {
  kind: 'factory' | 'intervention' | 'ledger' | 'route';
  id: string;
  label: string;
  to: string;
};

export type ToolResult =
  | { ok: true; data: unknown; refs?: Ref[]; formula?: string }
  | { ok: false; error: string; hint?: string };

export type ToolRun = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  data?: unknown;
  error?: string;
  ms: number;
  refs: Ref[];
  formula?: string;
};

export type PendingAction = {
  token: string;
  kind: 'record_estimate';
  factoryId: string;
  factoryName: string;
  interventionIds: string[];
  interventionNames: string[];
  adoption: number;
  preview: Record<string, unknown>;
  createdAt: number;
};

export type ToolContext = {
  factories: Factory[];
  ledger: LedgerEntry[];
  intake: IntakeRecord[];
  actions: {
    navigate: (path: string) => void;
    selectFactory: (id: string) => void;
    setView: (v: { sector?: Sector | 'all'; ranking?: 'total' | 'intensity' }) => void;
    record: (factoryId: string, ids: string[], adoption: number) => { added: boolean; id: string };
  };
  proposeAction: (a: Omit<PendingAction, 'token' | 'createdAt'>) => { token: string };
  consumePending: (token: string) => PendingAction | null;
};

export type CopilotTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolRuns: ToolRun[];
  stopped?: boolean;
  error?: string;
  narrated?: boolean;
};
