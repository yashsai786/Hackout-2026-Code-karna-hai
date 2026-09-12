import type { Factory, Sector } from './types';
import { sectors, interventions } from './fixtures';
import { geoLayers, type GeoLayerId } from './geo';

/**
 * Everything the command bar can do. The map page applies these; the model fallback may only
 * produce them through resultFromIntent, which validates every target against the lists below.
 */
export type CommandResult =
  | { type: 'route'; path: string }
  | { type: 'factory'; id: string }
  | { type: 'sector'; sector: Sector }
  | { type: 'state'; state: string }
  | { type: 'rank'; rank: 'total' | 'intensity' }
  | { type: 'layers'; layers: GeoLayerId[]; mode: 'set' | 'add' | 'remove' | 'clear' }
  | { type: 'panel'; open: boolean }
  | { type: 'map'; action: 'zoom-in' | 'zoom-out' | 'fit' }
  | { type: 'copilot'; question: string }
  | { type: 'ambiguous'; ids: string[] }
  | { type: 'clear' }
  | { type: 'unknown' };

export const commandRoutes: Record<string, string> = {
  ledger: '/ledger',
  intake: '/intake',
  alerts: '/alerts',
  digest: '/alerts?digest=true',
  credits: '/credits',
  interventions: '/interventions',
  factories: '/factories',
  map: '/',
  settings: '/?settings=1',
};

const LEAD =
  /^(?:(?:please|can you|could you|hey|ok|okay|now|then)\s+)*(?:take me to|navigate to|jump to|go to|head to|bring up|pull up|look at|look up|where is|where's|show me|show|find|locate|select|open|view|see|zoom to|zoom in on|focus on|fly to|centre on|center on)\s+(?:the\s+|a\s+)?/;
const ADOPTION = /(\d{1,3})\s*(?:%|percent|per cent)/;

const layerWords: Record<GeoLayerId, RegExp> = {
  solar: /\bsolar\b/,
  wind: /\bwind\b/,
  water: /\bwater\b|\bstress/,
  recyclers: /\brecycl|\bscrap\b|\bhubs?\b/,
};

const findFactory = (text: string, factories: Factory[]): Factory[] => {
  const scored = factories
    .map(f => {
      const keys = [f.name, f.city].map(k => k.toLowerCase());
      const hit = keys.filter(k => k.length >= 4 && text.includes(k)).sort((a, b) => b.length - a.length)[0];
      return hit ? { f, len: hit.length } : null;
    })
    .filter((m): m is { f: Factory; len: number } => m !== null)
    .sort((a, b) => b.len - a.len);
  if (!scored.length) return [];
  const best = scored[0].len;
  return scored.filter(m => m.len === best).map(m => m.f);
};

const findIntervention = (text: string) =>
  interventions.find(i => {
    const n = i.name.toLowerCase();
    return (
      text.includes(n) ||
      (i.id === 'waste-heat' && /waste heat/.test(text)) ||
      (i.id === 'solar' && /\bsolar\b/.test(text) && !/thermal/.test(text)) ||
      (i.id === 'motor-efficiency' && /(drives|motors?)\b/.test(text)) ||
      (i.id === 'boiler' && /boiler/.test(text)) ||
      (i.id === 'clinker' && /clinker/.test(text)) ||
      (i.id === 'waste-recovery' && /(water recovery|waste recovery|effluent)/.test(text)) ||
      (i.id === 'material-substitution' && /(recycled feedstock|feedstock|substitution)/.test(text))
    );
  });

/** Deterministic, offline. Answers most phrasings; only `unknown` reaches the model. */
export function parseCommand(input: string, factories: Factory[]): CommandResult {
  const text = input
    .toLowerCase()
    .trim()
    .replace(/[?.!,]/g, '')
    .replace(/\s+/g, ' ');
  if (!text) return { type: 'unknown' };

  // ---- whole-map controls ---------------------------------------------------------------------
  if (
    /^(reset|clear|show all|all factories|show all factories|clear (all )?filters?|reset (the )?map)$/.test(
      text,
    )
  )
    return { type: 'clear' };
  if (/^(zoom in|closer)$/.test(text)) return { type: 'map', action: 'zoom-in' };
  if (/^(zoom out|further|farther)$/.test(text)) return { type: 'map', action: 'zoom-out' };
  if (
    /^(fit|fit all|show everything|show the whole (map|country)|see all|zoom to fit|fit (the )?map)$/.test(
      text,
    )
  )
    return { type: 'map', action: 'fit' };
  if (/^(hide|close|collapse|minimi[sz]e)( the)? (panel|drawer|controls|sidebar)$/.test(text))
    return { type: 'panel', open: false };
  if (/^(show|open|expand)( the)? (panel|drawer|controls|sidebar)$/.test(text))
    return { type: 'panel', open: true };

  // ---- context layers ------------------------------------------------------------------------
  const mentionedLayers = (Object.keys(layerWords) as GeoLayerId[]).filter(l => layerWords[l].test(text));
  const layerish = mentionedLayers.length > 0 || /\blayers?\b/.test(text);
  if (layerish && !findFactory(text, factories).length) {
    if (/(hide|remove|turn off|switch off|clear|without|off)\b/.test(text))
      return mentionedLayers.length
        ? { type: 'layers', layers: mentionedLayers, mode: 'remove' }
        : { type: 'layers', layers: [], mode: 'clear' };
    if (/(all layers|every layer|everything)/.test(text))
      return { type: 'layers', layers: Object.keys(geoLayers) as GeoLayerId[], mode: 'set' };
    if (mentionedLayers.length)
      return {
        type: 'layers',
        layers: mentionedLayers,
        mode: /\b(also|add|and also|as well|too)\b/.test(text) ? 'add' : 'set',
      };
  }

  // ---- analytical questions belong to the Copilot ---------------------------------------------
  if (
    /^(what|why|how|which|should|compare|explain|is it|does|do|will|would|can i|tell me)\b/.test(text) &&
    !LEAD.test(text)
  ) {
    const nav =
      /^(which|what)\b.*(factory|factories|plant|plants)\b.*(most|highest|largest|biggest|worst)/.test(text);
    // "what can Bhilai do" is a screen, not a question: a named plant plus an action word wins.
    const screen =
      findFactory(text, factories).length === 1 &&
      /(what can .* do|intervention|measure|option|recommend|credit|cbam|profile|baseline|edit|update)/.test(
        text,
      );
    if (!nav && !screen) return { type: 'copilot', question: input.trim() };
  }

  const clean = text
    .replace(LEAD, '')
    .replace(/ (factories|factory|plant|plants|works|mill|mills|page|screen|view)$/, '')
    .trim();

  for (const [word, path] of Object.entries(commandRoutes))
    if (clean === word || clean === `the ${word}` || text === word) return { type: 'route', path };
  if (/^(add|create|new) (a )?(factory|plant)$/.test(text)) return { type: 'route', path: '/factories' };

  // ---- factory-scoped screens ------------------------------------------------------------------
  const plants = findFactory(text, factories);
  if (plants.length === 1) {
    const f = plants[0];
    const measure = findIntervention(text);
    const pct = text.match(ADOPTION)?.[1];
    if (measure) {
      const adoption = pct ? Math.max(0, Math.min(100, Number(pct))) : null;
      return {
        type: 'route',
        path: `/interventions/${measure.id}?factory=${f.id}${adoption !== null ? `&adoption=${adoption}` : ''}`,
      };
    }
    if (/(intervention|measure|option|what can .* do|recommend|fix|reduce|improve)/.test(text))
      return { type: 'route', path: `/interventions?factory=${f.id}` };
    if (/(credit|cbam|offset)/.test(text)) return { type: 'route', path: `/credits?factory=${f.id}` };
    if (/(edit|update|profile|baseline|describe|process)/.test(text))
      return { type: 'route', path: `/factories/${f.id}/profile` };
    if (/(detail|details|report|page)/.test(text)) return { type: 'route', path: `/factories/${f.id}` };
    return { type: 'factory', id: f.id };
  }
  if (plants.length > 1) return { type: 'ambiguous', ids: plants.map(f => f.id) };

  // ---- ranking / sector / state ----------------------------------------------------------------
  if (/intensity/.test(text) && /(highest|rank|sort|show|by|most)/.test(text))
    return { type: 'rank', rank: 'intensity' };
  if (
    /\b(highest|largest|biggest|top|worst|most)\b/.test(text) &&
    /(emission|emitter|emit|polluter|carbon|factory|factories|plant|plants)/.test(text)
  )
    return { type: 'rank', rank: 'total' };

  const sector = sectors.find(s => new RegExp(`\\b${s.toLowerCase().replace(/s$/, '')}s?\\b`).test(text));
  const state = [...new Set(factories.map(f => f.state))].find(s => text.includes(s.toLowerCase()));
  if (state && !sector) return { type: 'state', state };
  if (sector) return { type: 'sector', sector };

  // A measure on its own → its catalogue page for the current factory.
  const measure = findIntervention(text);
  if (measure) return { type: 'route', path: `/interventions/${measure.id}` };

  return { type: 'unknown' };
}

// ---------------------------------------------------------------------------------------------------
// Model fallback: constrained to targets we hand it.
// ---------------------------------------------------------------------------------------------------
export type CommandIntent = {
  action:
    | 'factory'
    | 'sector'
    | 'state'
    | 'rank'
    | 'route'
    | 'layers'
    | 'panel'
    | 'map'
    | 'interventions'
    | 'scenario'
    | 'credits'
    | 'profile'
    | 'copilot'
    | 'clear'
    | 'none';
  factory?: string;
  sector?: string;
  state?: string;
  rank?: string;
  route?: string;
  layers?: string[];
  mode?: string;
  open?: boolean;
  map?: string;
  intervention?: string;
  adoption?: number;
  question?: string;
};

export function resultFromIntent(raw: unknown, factories: Factory[]): CommandResult {
  if (!raw || typeof raw !== 'object') return { type: 'unknown' };
  const i = raw as CommandIntent;
  const factory = () => factories.find(x => x.id === i.factory);
  switch (i.action) {
    case 'factory': {
      const f = factory();
      return f ? { type: 'factory', id: f.id } : { type: 'unknown' };
    }
    case 'sector': {
      const s = sectors.find(x => x.toLowerCase() === String(i.sector).toLowerCase());
      return s ? { type: 'sector', sector: s } : { type: 'unknown' };
    }
    case 'state': {
      const s = [...new Set(factories.map(f => f.state))].find(
        x => x.toLowerCase() === String(i.state).toLowerCase(),
      );
      return s ? { type: 'state', state: s } : { type: 'unknown' };
    }
    case 'rank':
      return i.rank === 'intensity' || i.rank === 'total'
        ? { type: 'rank', rank: i.rank }
        : { type: 'unknown' };
    case 'route': {
      const path = commandRoutes[String(i.route)];
      return path ? { type: 'route', path } : { type: 'unknown' };
    }
    case 'layers': {
      const valid = (Array.isArray(i.layers) ? i.layers : []).filter((l): l is GeoLayerId => l in geoLayers);
      const mode = (['set', 'add', 'remove', 'clear'] as const).find(m => m === i.mode) ?? 'set';
      return mode === 'clear' || valid.length ? { type: 'layers', layers: valid, mode } : { type: 'unknown' };
    }
    case 'panel':
      return typeof i.open === 'boolean' ? { type: 'panel', open: i.open } : { type: 'unknown' };
    case 'map':
      return i.map === 'zoom-in' || i.map === 'zoom-out' || i.map === 'fit'
        ? { type: 'map', action: i.map }
        : { type: 'unknown' };
    case 'interventions': {
      const f = factory();
      return f ? { type: 'route', path: `/interventions?factory=${f.id}` } : { type: 'unknown' };
    }
    case 'scenario': {
      const f = factory(),
        m = interventions.find(x => x.id === i.intervention);
      if (!f || !m) return { type: 'unknown' };
      const a =
        typeof i.adoption === 'number' && Number.isFinite(i.adoption)
          ? Math.max(0, Math.min(100, Math.round(i.adoption)))
          : null;
      return {
        type: 'route',
        path: `/interventions/${m.id}?factory=${f.id}${a !== null ? `&adoption=${a}` : ''}`,
      };
    }
    case 'credits': {
      const f = factory();
      return f ? { type: 'route', path: `/credits?factory=${f.id}` } : { type: 'unknown' };
    }
    case 'profile': {
      const f = factory();
      return f ? { type: 'route', path: `/factories/${f.id}/profile` } : { type: 'unknown' };
    }
    case 'copilot':
      return typeof i.question === 'string' && i.question.trim()
        ? { type: 'copilot', question: i.question.trim().slice(0, 400) }
        : { type: 'unknown' };
    case 'clear':
      return { type: 'clear' };
    default:
      return { type: 'unknown' };
  }
}

export function intentPrompt(factories: Factory[]): string {
  const list = factories.map(f => `${f.id} — ${f.name}, ${f.city}, ${f.state} (${f.sector})`).join('\n');
  const measures = interventions.map(i => `${i.id} — ${i.name}`).join('\n');
  return [
    'You control an industrial emissions map and dashboard from one short request. Reply with JSON only.',
    'Schema: {"action": one of factory|sector|state|rank|route|layers|panel|map|interventions|scenario|credits|profile|copilot|clear|none,',
    ' "factory": id, "sector": name, "state": name, "rank": "total"|"intensity", "route": key,',
    ' "layers": [ids], "mode": "set"|"add"|"remove"|"clear", "open": boolean, "map": "zoom-in"|"zoom-out"|"fit",',
    ' "intervention": id, "adoption": 0-100, "question": text}.',
    'Factories (use ids exactly):',
    list,
    'Interventions:',
    measures,
    `Sectors: ${sectors.join(', ')}. States: ${[...new Set(factories.map(f => f.state))].join(', ')}.`,
    `Routes: ${Object.keys(commandRoutes).join(', ')}. Layers: ${Object.keys(geoLayers).join(', ')}.`,
    'rank=total is "who emits most"; rank=intensity is "most per tonne". scenario opens one measure for one factory.',
    'Any analytical or comparative question (why, how much, payback, compare, which first) → {"action":"copilot","question":<the request>}.',
    'If nothing fits → {"action":"none"}. Never invent an id.',
  ].join('\n');
}

export function extractIntent(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
