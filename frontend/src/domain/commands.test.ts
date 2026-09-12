import { describe, it, expect } from 'vitest';
import { factories } from './fixtures';
import { parseCommand, resultFromIntent, extractIntent, intentPrompt } from './commands';

const bhilai = factories.find(f => f.id === 'bhilai-steel')!;

describe('parseCommand — natural phrasings resolve offline', () => {
  it.each([
    'take me to Bhilai Steel Works',
    'Take me to bhilai',
    'where is Bhilai?',
    'show me Bhilai Steel Works, please',
    'can you open bhilai steel works',
    'zoom in on Bhilai',
  ])('%s → Bhilai', input => {
    expect(parseCommand(input, factories)).toEqual({ type: 'factory', id: bhilai.id });
  });

  it('still handles the documented short forms', () => {
    expect(parseCommand('Find Bhilai', factories)).toEqual({ type: 'factory', id: bhilai.id });
    expect(parseCommand('Show cement factories', factories)).toEqual({ type: 'sector', sector: 'Cement' });
    expect(parseCommand('Highest intensity', factories)).toEqual({ type: 'rank', rank: 'intensity' });
    expect(parseCommand('Go to ledger', factories)).toEqual({ type: 'route', path: '/ledger' });
    expect(parseCommand('take me to the ledger', factories)).toEqual({ type: 'route', path: '/ledger' });
    expect(parseCommand('which plants emit the most', factories)).toEqual({ type: 'rank', rank: 'total' });
  });

  it('finds a sector mentioned anywhere in the sentence', () => {
    expect(parseCommand('I want to look at the textile plants', factories)).toEqual({
      type: 'sector',
      sector: 'Textiles',
    });
  });

  it('is ambiguous, not wrong, when several plants match', () => {
    const r = parseCommand('take me to Gujarat', factories);
    expect(r.type).toBe('ambiguous');
  });

  it('gives up honestly on non-navigation requests', () => {
    expect(parseCommand('teleport to moon', factories)).toEqual({ type: 'unknown' });
    expect(parseCommand('what is the payback of solar', factories)).toEqual({ type: 'unknown' });
  });
});

describe('model fallback is constrained', () => {
  it('accepts only ids, sectors, ranks and routes we handed it', () => {
    expect(resultFromIntent({ action: 'factory', factory: 'bhilai-steel' }, factories)).toEqual({
      type: 'factory',
      id: 'bhilai-steel',
    });
    expect(resultFromIntent({ action: 'factory', factory: 'made-up-plant' }, factories)).toEqual({
      type: 'unknown',
    });
    expect(resultFromIntent({ action: 'route', route: 'ledger' }, factories)).toEqual({
      type: 'route',
      path: '/ledger',
    });
    expect(resultFromIntent({ action: 'route', route: '/etc/passwd' }, factories)).toEqual({
      type: 'unknown',
    });
    expect(resultFromIntent({ action: 'sector', sector: 'cement' }, factories)).toEqual({
      type: 'sector',
      sector: 'Cement',
    });
    expect(resultFromIntent({ action: 'rank', rank: 'bigly' }, factories)).toEqual({ type: 'unknown' });
    expect(resultFromIntent('garbage', factories)).toEqual({ type: 'unknown' });
    expect(resultFromIntent({ action: 'none' }, factories)).toEqual({ type: 'unknown' });
  });

  it('extracts JSON from a chatty or fenced reply', () => {
    expect(extractIntent('Sure! ```json\n{"action":"route","route":"credits"}\n```')).toEqual({
      action: 'route',
      route: 'credits',
    });
    expect(extractIntent('no json here')).toBeNull();
  });

  it('prompt lists every factory id so the model cannot need to invent one', () => {
    const p = intentPrompt(factories);
    for (const f of factories) expect(p).toContain(f.id);
    expect(p).toMatch(/Never invent an id/);
  });
});
