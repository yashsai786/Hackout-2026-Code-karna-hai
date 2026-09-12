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
