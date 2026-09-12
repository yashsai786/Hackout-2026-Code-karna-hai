import type { Factory, Sector } from './types';
import { sectors } from './fixtures';

export type CommandResult =
  | { type: 'route'; path: string }
  | { type: 'factory'; id: string }
  | { type: 'sector'; sector: Sector }
  | { type: 'rank'; rank: 'total' | 'intensity' }
  | { type: 'ambiguous'; ids: string[] }
  | { type: 'clear' }
  | { type: 'unknown' };

/** Screens a command may open. The model fallback is constrained to this list too. */
export const commandRoutes: Record<string, string> = {
  ledger: '/ledger',
  intake: '/intake',
  alerts: '/alerts',
  digest: '/alerts?digest=true',
  credits: '/credits',
  interventions: '/interventions',
  factories: '/factories',
  map: '/',
};

// Leading phrases that carry intent but no target: "take me to", "show me the", "can you open"…
const LEAD =
  /^(?:(?:please|can you|could you|hey|ok|okay)\s+)*(?:take me to|navigate to|jump to|go to|head to|bring up|pull up|look at|look up|where is|where's|show me|show|find|locate|select|open|view|see|zoom to|zoom in on|focus on)\s+(?:the\s+|a\s+)?/;

/**
 * Deterministic, offline interpretation of a typed or spoken command. Runs first and answers most
 * phrasings a person actually uses; the model fallback in the command bar only sees what this
 * returns as `unknown`.
 */
export function parseCommand(input: string, factories: Factory[]): CommandResult {
  const text = input
    .toLowerCase()
    .trim()
    .replace(/[?.!,]/g, '')
    .replace(/\s+/g, ' ');
  if (!text) return { type: 'unknown' };
  if (/^(reset|clear|show all|all factories|show all factories|clear filters?)$/.test(text))
    return { type: 'clear' };

  const clean = text
    .replace(LEAD, '')
    .replace(/ (factories|factory|plant|plants|works|mill|mills|page|screen|view)$/, '')
    .trim();

  for (const [word, path] of Object.entries(commandRoutes))
    if (clean === word || clean === `the ${word}` || text === word) return { type: 'route', path };

  if (/intensity/.test(text) && /(highest|rank|sort|show|by)/.test(text))
    return { type: 'rank', rank: 'intensity' };
  if (
    /\b(highest|largest|biggest|top|worst|most)\b/.test(text) &&
    /(emission|emitter|emit|polluter|carbon|factory|factories|plant|plants)/.test(text)
  )
    return { type: 'rank', rank: 'total' };

  const sector = sectors.find(
    s =>
      s.toLowerCase() === clean ||
      (s === 'Textiles' && /^textiles?$/.test(clean)) ||
      (s === 'Chemicals' && clean === 'chemical'),
  );
  if (sector) return { type: 'sector', sector };

  // Exact-ish match on the cleaned phrase first, then a contains-scan of the whole sentence so
  // "take me to Bhilai Steel Works" and "where is bhilai" both resolve without a model.
  const byPhrase = factories.filter(
    f =>
      f.name.toLowerCase().includes(clean) ||
      f.city.toLowerCase().includes(clean) ||
      f.state.toLowerCase().includes(clean),
  );
  if (byPhrase.length === 1) return { type: 'factory', id: byPhrase[0].id };
  if (byPhrase.length > 1) return { type: 'ambiguous', ids: byPhrase.map(f => f.id) };

  const mentioned = factories
    .map(f => {
      const keys = [f.name, f.city, f.state].map(k => k.toLowerCase());
      const hit = keys.filter(k => k.length >= 4 && text.includes(k)).sort((a, b) => b.length - a.length)[0];
      return hit ? { f, len: hit.length } : null;
    })
    .filter((m): m is { f: Factory; len: number } => m !== null)
    .sort((a, b) => b.len - a.len);
  if (mentioned.length) {
    const best = mentioned[0].len,
      top = mentioned.filter(m => m.len === best);
    return top.length === 1
      ? { type: 'factory', id: top[0].f.id }
      : { type: 'ambiguous', ids: top.map(m => m.f.id) };
  }
  const sectorAnywhere = sectors.find(s =>
    new RegExp(`\\b${s.toLowerCase().replace(/s$/, '')}s?\\b`).test(text),
  );
  if (sectorAnywhere) return { type: 'sector', sector: sectorAnywhere };
  return { type: 'unknown' };
}

/**
 * What the model is allowed to answer with when the rules give up. It never receives free rein:
 * it picks one action and one target from lists we hand it, and this validator throws away
 * anything outside those lists.
 */
export type CommandIntent = {
  action: 'factory' | 'sector' | 'rank' | 'route' | 'clear' | 'none';
  factory?: string;
  sector?: string;
  rank?: string;
  route?: string;
};

export function resultFromIntent(raw: unknown, factories: Factory[]): CommandResult {
  if (!raw || typeof raw !== 'object') return { type: 'unknown' };
  const i = raw as CommandIntent;
  switch (i.action) {
    case 'factory': {
      const f = factories.find(x => x.id === i.factory);
      return f ? { type: 'factory', id: f.id } : { type: 'unknown' };
    }
    case 'sector': {
      const s = sectors.find(x => x.toLowerCase() === String(i.sector).toLowerCase());
      return s ? { type: 'sector', sector: s } : { type: 'unknown' };
    }
    case 'rank':
      return i.rank === 'intensity' || i.rank === 'total'
        ? { type: 'rank', rank: i.rank }
        : { type: 'unknown' };
    case 'route': {
      const path = commandRoutes[String(i.route)];
      return path ? { type: 'route', path } : { type: 'unknown' };
    }
    case 'clear':
      return { type: 'clear' };
    default:
      return { type: 'unknown' };
  }
}

/** The single prompt the command bar sends. Kept here so it is testable and reviewable as data. */
export function intentPrompt(factories: Factory[]): string {
  const list = factories.map(f => `${f.id} — ${f.name}, ${f.city}, ${f.state} (${f.sector})`).join('\n');
  return [
    'You translate one short navigation request for an industrial emissions dashboard into JSON.',
    'Reply with JSON only, no prose, exactly of the form',
    '{"action":"factory"|"sector"|"rank"|"route"|"clear"|"none","factory":id,"sector":name,"rank":"total"|"intensity","route":key}.',
    'Use only these factory ids:',
    list,
    `Sectors: ${sectors.join(', ')}. Route keys: ${Object.keys(commandRoutes).join(', ')}.`,
    'rank=total means "who emits the most"; rank=intensity means "most emissions per tonne of product".',
    'If the request is not a navigation request, answer {"action":"none"}. Never invent an id.',
  ].join('\n');
}

/** Pull a JSON object out of a model reply that may be wrapped in prose or a code fence. */
export function extractIntent(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
