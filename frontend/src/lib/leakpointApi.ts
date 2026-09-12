// Client for the Leakpoint API. Every call is optional: the app computes its own arithmetic and
// degrades to it when the service is unreachable, so a demo never depends on the backend being up.
const BASE = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');

export type HotspotPrediction = {
  shares: Record<string, number>;
  hotspots_tco2e_yr: Record<string, number>;
  baseline_tco2e_yr: number;
  intensity_tco2e_per_t: number;
  training: string;
  model_share_mae: number;
  sector_table_share_mae: number;
  note: string;
};

export type HotspotRequest = {
  sector: string;
  route: string;
  primary_fuel: string;
  region: string;
  production_t: number;
  energy_spend_inr: number;
  plant_age_years: number;
  headcount: number;
};

export type ModelCard = {
  loaded: boolean;
  name?: string;
  predicts?: string;
  algorithm?: string;
  training?: string;
  n_samples?: number;
  model_share_mae?: number;
  sector_table_share_mae?: number;
  improvement_pct?: number;
  routes?: Record<string, string[]>;
  regions?: string[];
  hint?: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) throw new Error('No API URL configured.');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'omit',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as any);
    throw new Error(body?.detail || `The estimator returned ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

export const fetchModelCard = () => call<ModelCard>('/api/v1/model');
export const predictHotspots = (body: HotspotRequest) =>
  call<HotspotPrediction>('/api/v1/hotspots', { method: 'POST', body: JSON.stringify(body) });

// ---- System of record ---------------------------------------------------------------------------
export type SessionDoc = {
  factories: unknown[];
  ledger: unknown[];
  intake: unknown[];
  inbox: unknown[];
  savedAt?: string;
};
export const fetchState = () => call<SessionDoc>('/api/v1/state');
export const saveState = (doc: SessionDoc) =>
  call<{ saved: boolean; savedAt: string }>('/api/v1/state', { method: 'PUT', body: JSON.stringify(doc) });
export const deleteState = () => call<{ cleared: boolean }>('/api/v1/state', { method: 'DELETE' });
export const apiConfigured = () => Boolean(BASE);

// ---- Analysis -----------------------------------------------------------------------------------
export type AnalyseRequest = HotspotRequest & {
  declared_tco2e?: Record<string, number>;
  baseline_tco2e?: number;
};
export type Discrepancy = {
  source: string;
  declared_share: number | null;
  model_share: number;
  delta: number | null;
  flag: boolean;
};
export type WhatIf = {
  change: string;
  kind: 'fuel' | 'age';
  value: string | number;
  intensity: number;
  intensity_change_pct: number | null;
  shares: Record<string, number>;
};
export type AnalysisResult = {
  model: {
    training: string;
    n_samples: number | null;
    top_hotspot_accuracy: number | null;
    sector_table_top_hotspot_accuracy: number | null;
    share_mae: number | null;
  };
  predicted: {
    shares: Record<string, number>;
    intensity_tco2e_per_t: number;
    baseline_tco2e_yr: number;
    primary_hotspot: string;
  };
  declared: {
    shares: Record<string, number | null>;
    intensity_tco2e_per_t: number | null;
    primary_hotspot: string | null;
  };
  agreement: boolean;
  discrepancies: Discrepancy[];
  benchmark: {
    intensity_used: number;
    basis: 'declared' | 'model';
    sector_median: number;
    percentile: number;
    quantiles: Record<string, number>;
  } | null;
  what_ifs: WhatIf[];
  note: string;
};
export const analyseFactory = (body: AnalyseRequest) =>
  call<AnalysisResult>('/api/v1/analyse', { method: 'POST', body: JSON.stringify(body) });

// ---- Operator settings (persisted on the API, not in the browser session) -----------------------
export type OperatorSettings = {
  openrouter_key: string | null;
  default_model: string | null;
  tools_only: boolean | null;
  has_key: boolean;
};
export const fetchSettings = () => call<OperatorSettings>('/api/v1/settings');
export const saveSettings = (
  patch: Partial<Pick<OperatorSettings, 'openrouter_key' | 'default_model' | 'tools_only'>>,
) => call<{ saved: boolean }>('/api/v1/settings', { method: 'PUT', body: JSON.stringify(patch) });
export const deleteSettings = () => call<{ cleared: boolean }>('/api/v1/settings', { method: 'DELETE' });

// ---- Reference table and document extraction ------------------------------------------------------
export const fetchReference = () =>
  call<{ reference: Record<string, number>; updated: string; sources: Record<string, string> }>(
    '/api/v1/reference',
  );

export type Extraction = {
  filename: string;
  method: 'table' | 'pdf-text' | 'text';
  source_type: 'electricity' | 'fuel' | 'waste' | 'unknown';
  unit: string | null;
  quantity: number | null;
  cost_inr: number | null;
  period: string | null;
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string[];
  warnings: string[];
  rows?: number;
  pages?: number;
  chars?: number;
};
/** Multipart, so it does not go through call() — that helper forces a JSON content type. */
export async function extractDocument(
  file: File,
  hint: string | null,
  signal?: AbortSignal,
): Promise<Extraction> {
  if (!BASE) throw new Error('No API URL configured.');
  const form = new FormData();
  form.append('file', file, file.name);
  if (hint) form.append('hint', hint);
  const res = await fetch(`${BASE}/api/v1/intake/extract`, {
    method: 'POST',
    body: form,
    credentials: 'omit',
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { detail?: string });
    throw new Error(body?.detail || `The extractor returned ${res.status}.`);
  }
  return res.json() as Promise<Extraction>;
}
