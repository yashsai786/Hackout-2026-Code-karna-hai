import type { ChatMessage, StreamResult, ToolDef } from '../lib/openrouter';
import type { ToolContext, ToolRun } from './types';
import { runTool, toolDefs } from './tools';

export const MAX_ITERATIONS = 6;
export const MAX_TOOL_CALLS_PER_TURN = 10;
export const TOOL_RESULT_CAP = 6000;
const HISTORY_LIMIT = 12;

export type AgentDeps = {
  chat: (
    messages: ChatMessage[],
    tools: ToolDef[] | undefined,
    signal?: AbortSignal,
  ) => Promise<StreamResult>;
  ctx: ToolContext;
  signal?: AbortSignal;
  toolsEnabled?: boolean;
  onText?: (delta: string) => void;
  onToolStart?: (run: { id: string; name: string; args: Record<string, unknown> }) => void;
  onToolEnd?: (run: ToolRun) => void;
};

export type AgentOutcome = { text: string; messages: ChatMessage[]; toolRuns: ToolRun[]; stopped: boolean };

const isAbortError = (e: unknown) => (e as Error | null)?.name === 'AbortError';

/**
 * Drop anything that would make the next request malformed: a tool message whose call was never
 * declared, and a trailing assistant turn whose tool_calls were never answered (which is what an
 * abort mid-loop leaves behind).
 */
export function sanitiseHistory(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      if (out.some(p => p.role === 'assistant' && p.tool_calls?.some(c => c.id === m.tool_call_id)))
        out.push(m);
      continue;
    }
    out.push(m);
  }
  for (;;) {
    const last = out[out.length - 1];
    if (
      last?.role === 'assistant' &&
      last.tool_calls?.length &&
      !last.tool_calls.every(c => out.some(m => m.role === 'tool' && m.tool_call_id === c.id))
    ) {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

/** Keep the system message plus a recent window, never splitting an assistant/tool pair. */
export function capHistory(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.filter(m => m.role === 'system');
  const rest = messages.filter(m => m.role !== 'system');
  if (rest.length <= HISTORY_LIMIT) return messages;
  let start = rest.length - HISTORY_LIMIT;
  while (start > 0 && rest[start].role === 'tool') start--; // never start on an orphan result
  const head = rest[start];
  if (head?.role === 'assistant' && head.tool_calls?.length) start++;
  return [...system, ...rest.slice(start)];
}

export async function runAgent(history: ChatMessage[], deps: AgentDeps): Promise<AgentOutcome> {
  const messages = capHistory([...history]);
  const toolRuns: ToolRun[] = [];
  const defs = deps.toolsEnabled === false ? undefined : toolDefs;
  let text = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const budgetSpent = iteration === MAX_ITERATIONS - 1;
    if (budgetSpent) {
      messages.push({
        role: 'user',
        content:
          'Tool budget reached. Answer now using only the figures already returned by tools. Do not request more tools.',
      });
    }

    let result: StreamResult;
    try {
      // On the last pass tools are withheld, so the user always receives prose rather than a
      // spinner that simply stops.
      result = await deps.chat(messages, budgetSpent ? undefined : defs, deps.signal);
    } catch (e) {
      if (isAbortError(e)) return { text, messages: sanitiseHistory(messages), toolRuns, stopped: true };
      throw e;
    }

    if (result.text) text = result.text;
    if (!result.toolCalls.length) {
      messages.push({ role: 'assistant', content: result.text });
      return { text: result.text, messages: sanitiseHistory(messages), toolRuns, stopped: false };
    }

    // The assistant turn must be appended verbatim, tool_calls included: OpenRouter rejects a tool
    // result whose preceding assistant message does not declare the matching id.
    messages.push({ role: 'assistant', content: result.text, tool_calls: result.toolCalls });

    const calls = result.toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
    const overflow = result.toolCalls.slice(MAX_TOOL_CALLS_PER_TURN);

    for (const call of calls) {
      if (deps.signal?.aborted) return { text, messages: sanitiseHistory(messages), toolRuns, stopped: true };
      const started = Date.now();
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* runTool reports it */
      }
      deps.onToolStart?.({ id: call.id, name: call.function.name, args });
      const outcome = runTool(call.function.name, call.function.arguments, deps.ctx);
      const run: ToolRun = {
        id: call.id,
        name: call.function.name,
        args,
        ms: Date.now() - started,
        ok: outcome.ok,
        ...(outcome.ok
          ? { data: outcome.data, refs: outcome.refs ?? [], formula: outcome.formula }
          : { error: outcome.error, refs: [] }),
      } as ToolRun;
      toolRuns.push(run);
      deps.onToolEnd?.(run);
      let content = JSON.stringify(outcome);
      if (content.length > TOOL_RESULT_CAP) content = `${content.slice(0, TOOL_RESULT_CAP)}…[truncated]`;
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }

    // Every declared call must be answered or the next request is a 400.
    for (const call of overflow) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: false,
          error: `Only ${MAX_TOOL_CALLS_PER_TURN} tool calls run per step.`,
        }),
      });
    }
  }

  return { text, messages: sanitiseHistory(messages), toolRuns, stopped: false };
}
