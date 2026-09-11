const ORIGIN = 'https://openrouter.ai/api/v1';

export type KeyInfo = { label?: string; limit: number | null; limit_remaining: number | null; usage: number; is_free_tier?: boolean };
export type Model = { id: string; name: string; context_length?: number; pricing?: { prompt?: string; completion?: string } };

function headers(apiKey?: string): HeadersInit {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Leakpoint',
    Accept: 'application/json',
  };
}

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || (res.status === 401 ? 'Invalid or revoked API key.' : `OpenRouter error ${res.status}.`));
  return body;
}

export async function validateKey(apiKey: string): Promise<KeyInfo> {
  const key = apiKey.trim();
  if (!key) throw new Error('Enter an OpenRouter API key.');
  const res = await fetch(`${ORIGIN}/key`, { method: 'GET', headers: headers(key), credentials: 'omit' });
  const body = await jsonOrThrow(res);
  return body.data as KeyInfo;
}

export async function fetchModels(): Promise<Model[]> {
  const res = await fetch(`${ORIGIN}/models?limit=1000`, { method: 'GET', headers: headers(), credentials: 'omit' });
  const body = await jsonOrThrow(res);
  const list = (body.data ?? []) as Model[];
  return list
    .map(m => ({ id: m.id, name: m.name, context_length: m.context_length, pricing: m.pricing }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
