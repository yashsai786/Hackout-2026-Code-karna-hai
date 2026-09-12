export const ORIGIN = 'https://openrouter.ai/api/v1';

export type KeyInfo = { label?: string; limit: number | null; limit_remaining: number | null; usage: number; is_free_tier?: boolean };
export type Model = { id: string; name: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] };

export const supportsTools = (m?: Model) => !!m?.supported_parameters?.includes('tools');

// Chat wire types. `arguments` is a JSON *string* on the wire, not an object.
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
export type StreamEvent = { type: 'text'; delta: string } | { type: 'done'; finish: string; usage?: Usage };
export type StreamResult = { text: string; toolCalls: ToolCall[]; finish: string; usage?: Usage };
export type StreamChatOptions = {
  apiKey: string; model: string; messages: ChatMessage[];
  tools?: ToolDef[]; toolChoice?: 'auto' | 'none'; temperature?: number; maxTokens?: number;
  signal?: AbortSignal; onEvent?: (e: StreamEvent) => void;
};

export const isAbort = (e: unknown) => (e as Error | null)?.name === 'AbortError';

// Typed as Record so it can be spread; HeadersInit is a union that includes string[][] and Headers,
// which tsc rejects in an object spread under strict.
function baseHeaders(apiKey?: string): Record<string, string> {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Leakpoint',
  };
}

function headers(apiKey?: string): HeadersInit {
  return { ...baseHeaders(apiKey), Accept: 'application/json' };
}

// Separate from headers() so `Accept: text/event-stream` can never leak into the two GETs.
function streamHeaders(apiKey: string): HeadersInit {
  return { ...baseHeaders(apiKey), Accept: 'text/event-stream', 'Content-Type': 'application/json' };
}

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || (res.status === 401 ? 'Invalid or revoked API key.' : `OpenRouter error ${res.status}.`));
  return body;
}

// jsonOrThrow consumes the body as JSON, so a gateway HTML page would silently become {}. The
// streaming path needs the text form and status-specific wording instead.
async function errorFromResponse(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  let message = '';
  try { message = JSON.parse(raw)?.error?.message ?? ''; } catch { /* non-JSON body */ }
  if (message) return message;
  if (res.status === 401) return 'Invalid or revoked API key.';
  if (res.status === 402) return 'This key has no remaining credit for that model.';
  if (res.status === 404) return 'That model is not available on OpenRouter.';
  if (res.status === 429) return 'OpenRouter rate limit reached. Wait a moment and retry.';
  return `OpenRouter error ${res.status}${raw ? `: ${raw.slice(0, 200)}` : '.'}`;
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
    .map(m => ({ id: m.id, name: m.name, context_length: m.context_length, pricing: m.pricing, supported_parameters: m.supported_parameters }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Consume complete SSE lines out of `buffer`, leaving any partial trailing line behind.
 * Splitting the whole buffer and processing every piece would corrupt a frame that straddles a
 * chunk boundary, which is the common failure in hand-rolled SSE readers.
 */
export function parseSseChunk(buffer: string, onFrame: (frame: any) => void): { rest: string; done: boolean } {
  let cut = buffer.indexOf('\n');
  while (cut !== -1) {
    const line = buffer.slice(0, cut).replace(/\r$/, '');
    buffer = buffer.slice(cut + 1);
    const payload = !line || line.startsWith(':') || !line.startsWith('data:') ? null : line.slice(5).trim();
    if (payload === '[DONE]') return { rest: '', done: true };
    // One malformed frame must never end the turn.
    if (payload) { try { onFrame(JSON.parse(payload)); } catch { /* ignore */ } }
    cut = buffer.indexOf('\n');
  }
  return { rest: buffer, done: false };
}

type PartialCall = { id: string; name: string; args: string };

// Tool calls stream in fragments addressed by `index`; ids, names and argument JSON all arrive in
// pieces, so everything is concatenated and only assembled once the stream ends.
function collectToolCalls(partials: Map<number, PartialCall>, delta: any) {
  for (const tc of delta?.tool_calls ?? []) {
    const index = typeof tc.index === 'number' ? tc.index : 0;
    const slot = partials.get(index) ?? { id: '', name: '', args: '' };
    if (tc.id) slot.id = tc.id;
    if (tc.function?.name) slot.name += tc.function.name;
    if (tc.function?.arguments) slot.args += tc.function.arguments;
    partials.set(index, slot);
  }
}

function finaliseToolCalls(partials: Map<number, PartialCall>): ToolCall[] {
  return [...partials.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, slot]) => slot.name)
    // A missing id makes the follow-up tool_call_id invalid and the next request a 400, so
    // synthesise one deterministically and echo the same value in the assistant message.
    .map(([index, slot]) => ({ id: slot.id || `call_${index}`, type: 'function' as const, function: { name: slot.name, arguments: slot.args || '{}' } }));
}

export async function streamChat(o: StreamChatOptions): Promise<StreamResult> {
  const res = await fetch(`${ORIGIN}/chat/completions`, {
    method: 'POST',
    headers: streamHeaders(o.apiKey),
    credentials: 'omit',
    signal: o.signal,
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      stream: true,
      // Low but non-zero: the same question must produce the same figures twice in a demo.
      temperature: o.temperature ?? 0.1,
      max_tokens: o.maxTokens ?? 1200,
      ...(o.tools?.length ? { tools: o.tools, tool_choice: o.toolChoice ?? 'auto' } : {}),
    }),
  });

  if (!res.ok) throw new Error(await errorFromResponse(res));
  if (!res.body) throw new Error('This browser cannot read a streaming response.');

  const partials = new Map<number, PartialCall>();
  let text = '', finish = '', usage: Usage | undefined;

  // Some providers ignore `stream: true` and return a single completion.
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const body = await res.json().catch(() => null);
    const choice = body?.choices?.[0];
    text = choice?.message?.content ?? '';
    finish = choice?.finish_reason ?? 'stop';
    usage = body?.usage;
    collectToolCalls(partials, choice?.message);
    if (text) o.onEvent?.({ type: 'text', delta: text });
    o.onEvent?.({ type: 'done', finish, usage });
    return { text, toolCalls: finaliseToolCalls(partials), finish, usage };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const cancel = () => { reader.cancel().catch(() => {}); };
  o.signal?.addEventListener('abort', cancel);
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const step = parseSseChunk(buffer, frame => {
        const choice = frame?.choices?.[0];
        if (frame?.usage) usage = frame.usage;
        if (choice?.finish_reason) finish = choice.finish_reason;
        const delta = choice?.delta;
        if (delta?.content) { text += delta.content; o.onEvent?.({ type: 'text', delta: delta.content }); }
        collectToolCalls(partials, delta);
      });
      buffer = step.rest;
      if (step.done) break;
    }
  } finally {
    o.signal?.removeEventListener('abort', cancel);
    try { reader.releaseLock(); } catch { /* already released by cancel */ }
  }

  const toolCalls = finaliseToolCalls(partials);
  // Trust the assembled array over finish_reason: some providers omit or mislabel it.
  if (toolCalls.length) finish = 'tool_calls';
  o.onEvent?.({ type: 'done', finish: finish || 'stop', usage });
  return { text, toolCalls, finish: finish || 'stop', usage };
}
