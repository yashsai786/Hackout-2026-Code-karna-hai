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
export function parseCommand(input: string, factories: Factory[]): CommandResult {
  const text = input.toLowerCase().trim().replace(/[?.!]/g, '');
  if (!text) return { type: 'unknown' };
  if (/^(reset|clear|show all|all factories|show all factories)$/.test(text)) return { type: 'clear' };
  const routes: Record<string, string> = {
    ledger: '/ledger',
    intake: '/intake',
    alerts: '/alerts',
    digest: '/alerts?digest=true',
    credits: '/credits',
    interventions: '/interventions',
    factories: '/factories',
    map: '/',
  };
  for (const [word, path] of Object.entries(routes))
    if (new RegExp(`^(go to |open |show )?(the )?${word}$`).test(text)) return { type: 'route', path };
  if (/intensity/.test(text) && /(highest|rank|sort|show)/.test(text))
    return { type: 'rank', rank: 'intensity' };
  if (/(highest|largest|top|rank).*(emissions|emitters|factory|factories)/.test(text))
    return { type: 'rank', rank: 'total' };
  const clean = text
    .replace(/^(find|locate|select|show|open) (me )?(the )?/, '')
    .replace(/ factories$| factory$/, '')
    .trim();
  const sector = sectors.find(s => s.toLowerCase() === clean || (s === 'Textiles' && clean === 'textile'));
  if (sector) return { type: 'sector', sector };
  const matches = factories.filter(
    f =>
      f.name.toLowerCase().includes(clean) ||
      f.city.toLowerCase().includes(clean) ||
      f.state.toLowerCase().includes(clean),
  );
  return matches.length === 1
    ? { type: 'factory', id: matches[0].id }
    : matches.length > 1
      ? { type: 'ambiguous', ids: matches.map(f => f.id) }
      : { type: 'unknown' };
}
