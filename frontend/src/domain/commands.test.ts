import { describe, it, expect } from 'vitest';
import { factories } from './fixtures';
import { parseCommand, resultFromIntent, extractIntent, intentPrompt } from './commands';

const bhilai = factories.find(f => f.id === 'bhilai-steel')!;
const P = (s: string) => parseCommand(s, factories);

describe('parseCommand — the whole map from one sentence', () => {
  it.each([
    'take me to Bhilai Steel Works',
    'where is Bhilai?',
    'show me Bhilai Steel Works, please',
    'fly to bhilai',
  ])('%s → selects Bhilai', s => expect(P(s)).toEqual({ type: 'factory', id: bhilai.id }));

  it('controls layers', () => {
    expect(P('show solar and wind')).toEqual({ type: 'layers', layers: ['solar', 'wind'], mode: 'set' });
    expect(P('also show water stress')).toEqual({ type: 'layers', layers: ['water'], mode: 'add' });
    expect(P('hide the wind layer')).toEqual({ type: 'layers', layers: ['wind'], mode: 'remove' });
    expect(P('clear layers')).toEqual({ type: 'layers', layers: [], mode: 'clear' });
    expect(P('show all layers').type).toBe('layers');
    expect(P('where are the recycling hubs')).toEqual({ type: 'layers', layers: ['recyclers'], mode: 'set' });
  });

  it('controls the viewport and the panel', () => {
    expect(P('zoom in')).toEqual({ type: 'map', action: 'zoom-in' });
    expect(P('fit all')).toEqual({ type: 'map', action: 'fit' });
    expect(P('hide the panel')).toEqual({ type: 'panel', open: false });
    expect(P('show controls')).toEqual({ type: 'panel', open: true });
    expect(P('reset the map')).toEqual({ type: 'clear' });
  });

  it('filters and ranks', () => {
    expect(P('Show cement factories')).toEqual({ type: 'sector', sector: 'Cement' });
    expect(P('factories in Gujarat')).toEqual({ type: 'state', state: 'Gujarat' });
    expect(P('Highest intensity')).toEqual({ type: 'rank', rank: 'intensity' });
    expect(P('which plants emit the most')).toEqual({ type: 'rank', rank: 'total' });
  });

  it('opens factory-scoped screens', () => {
    expect(P('what can Bhilai do')).toEqual({ type: 'route', path: '/interventions?factory=bhilai-steel' });
    expect(P('waste heat recovery at Bhilai at 60%')).toEqual({
      type: 'route',
      path: '/interventions/waste-heat?factory=bhilai-steel&adoption=60',
    });
    expect(P('solar for bhilai')).toEqual({
      type: 'route',
      path: '/interventions/solar?factory=bhilai-steel',
    });
    expect(P('credits for Satna')).toEqual({ type: 'route', path: '/credits?factory=satna-cement' });
    expect(P('edit Bhilai baseline')).toEqual({ type: 'route', path: '/factories/bhilai-steel/profile' });
    expect(P('go to ledger')).toEqual({ type: 'route', path: '/ledger' });
    expect(P('add a factory')).toEqual({ type: 'route', path: '/factories' });
  });

  it('hands analysis to the Copilot instead of dead-ending', () => {
    expect(P('which plant should I fix first?')).toEqual({
      type: 'copilot',
      question: 'which plant should I fix first?',
    });
    expect(P('compare Bhilai and Angul')).toEqual({ type: 'copilot', question: 'compare Bhilai and Angul' });
    expect(P('what is the payback of solar at Bhilai')).toEqual({
      type: 'copilot',
      question: 'what is the payback of solar at Bhilai',
    });
  });

  it('is ambiguous, not wrong, and gives up honestly', () => {
    expect(P('teleport to moon')).toEqual({ type: 'unknown' });
  });
});

describe('model fallback is constrained', () => {
  it('accepts only targets it was handed', () => {
    expect(resultFromIntent({ action: 'factory', factory: 'made-up' }, factories)).toEqual({
      type: 'unknown',
    });
    expect(resultFromIntent({ action: 'route', route: '/etc/passwd' }, factories)).toEqual({
      type: 'unknown',
    });
    expect(resultFromIntent({ action: 'layers', layers: ['solar', 'lava'], mode: 'add' }, factories)).toEqual(
      { type: 'layers', layers: ['solar'], mode: 'add' },
    );
    expect(resultFromIntent({ action: 'layers', layers: ['lava'] }, factories)).toEqual({ type: 'unknown' });
    expect(
      resultFromIntent(
        { action: 'scenario', factory: 'bhilai-steel', intervention: 'solar', adoption: 250 },
        factories,
      ),
    ).toEqual({ type: 'route', path: '/interventions/solar?factory=bhilai-steel&adoption=100' });
    expect(
      resultFromIntent({ action: 'scenario', factory: 'bhilai-steel', intervention: 'nope' }, factories),
    ).toEqual({ type: 'unknown' });
    expect(resultFromIntent({ action: 'map', map: 'barrel-roll' }, factories)).toEqual({ type: 'unknown' });
    expect(resultFromIntent({ action: 'copilot', question: '  ' }, factories)).toEqual({ type: 'unknown' });
    expect(resultFromIntent({ action: 'state', state: 'gujarat' }, factories)).toEqual({
      type: 'state',
      state: 'Gujarat',
    });
  });
  it('extracts JSON from a chatty reply and lists every id in the prompt', () => {
    expect(extractIntent('Sure! ```json\n{"action":"route","route":"credits"}\n```')).toEqual({
      action: 'route',
      route: 'credits',
    });
    const p = intentPrompt(factories);
    for (const f of factories) expect(p).toContain(f.id);
    expect(p).toContain('waste-heat');
    expect(p).toMatch(/Never invent an id/);
  });
});
