import { describe, it, expect } from 'vitest';
import { factories, interventions, processFlows, sources } from './fixtures';
import { parseCommand } from './commands';
import { scenario, extractEstimate, portfolioTotals, csvExport } from './calculations';
import { validateFixtures } from './validation';
import { generateDigest } from './digest';
import type { LedgerEntry } from './types';

describe('fixtures and validation', () => {
  it('keeps 12 unique fixtures and expected baseline total', () => {
    expect(factories).toHaveLength(12);
    expect(new Set(factories.map(f => f.id)).size).toBe(12);
    const total = factories.reduce((acc, f) => acc + (f.baseline ?? 0), 0);
    expect(total).toBe(4_126_000);
  });

  it('reconciles hotspots and monthly history for every fixture', () => {
    factories.forEach(f => {
      expect(sources.reduce((acc, s) => acc + f.hotspots[s], 0)).toBe(f.baseline);
      expect(f.history).toHaveLength(12);
      expect(f.history.reduce((acc, row) => acc + row.emissions, 0)).toBe(f.baseline);
    });
  });

  it('keeps process flows and costs valid across sectors', () => {
    factories.forEach(f => {
      expect(processFlows[f.sector].length).toBeGreaterThan(0);
      sources.forEach(s => {
        expect(Number.isFinite(f.costs[s])).toBe(true);
        expect(f.costs[s]).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it('passes global fixture validation rules', () => {
    expect(validateFixtures()).toBe(true);
  });
});

describe('scenario math and guardrails', () => {
  const bhilai = factories.find(f => f.id === 'bhilai-steel')!;
  const suraat = factories.find(f => f.id === 'surat-textiles')!;
  const tiruppur = factories.find(f => f.id === 'tiruppur-textiles')!;
  const wasteHeat = interventions.find(i => i.id === 'waste-heat')!;
  const boiler = interventions.find(i => i.id === 'boiler')!;
  const solar = interventions.find(i => i.id === 'solar')!;
  const motor = interventions.find(i => i.id === 'motor-efficiency')!;
  const wasteRecovery = interventions.find(i => i.id === 'waste-recovery')!;

  it('uses gross=cost*rate*adoption, opex=annualOpex*adoption, net=gross-opex', () => {
    const r = scenario(bhilai, [wasteHeat], 50);
    const scale = 0.5;
    const expectedGross = bhilai.costs[wasteHeat.source] * wasteHeat.costSavingRate * scale;
    const expectedOpex = wasteHeat.annualOpex * scale;
    expect(r.grossSavings).toBeCloseTo(expectedGross, 6);
    expect(r.opex).toBeCloseTo(expectedOpex, 6);
    expect(r.operatingSavings).toBeCloseTo(expectedGross - expectedOpex, 6);
  });

  it('keeps capex fixed and 0 adoption gives negative capex cashflow with no payback', () => {
    const r = scenario(bhilai, [wasteHeat], 0);
    expect(r.capex).toBe(wasteHeat.capex);
    expect(r.paybackMonths).toBeNull();
    expect(r.cashflow[0].value).toBe(-wasteHeat.capex);
    expect(r.cashflow[36].value).toBe(-wasteHeat.capex);
  });

  it('returns immediate payback for zero-capex measure with positive savings', () => {
    const r = scenario(suraat, [boiler], 100);
    expect(r.capex).toBe(0);
    expect(r.operatingSavings).toBeGreaterThan(0);
    expect(r.paybackMonths).toBe(0);
  });

  it('keeps tiruppur waste-recovery payback beyond 36 months', () => {
    const r = scenario(tiruppur, [wasteRecovery], 100);
    expect(r.paybackMonths).not.toBeNull();
    expect(r.paybackMonths!).toBeGreaterThan(36);
  });

  it('rejects invalid adoption values', () => {
    expect(() => scenario(bhilai, [wasteHeat], Number.NaN)).toThrow('Adoption must be between 0 and 100.');
    expect(() => scenario(bhilai, [wasteHeat], -1)).toThrow('Adoption must be between 0 and 100.');
    expect(() => scenario(bhilai, [wasteHeat], 101)).toThrow('Adoption must be between 0 and 100.');
  });

  it('rejects non-eligible or overlapping bundle combinations', () => {
    expect(() => scenario(bhilai, [solar, motor], 100)).toThrow('This combination is not compatible.');
    expect(() => scenario(tiruppur, [wasteHeat], 100)).toThrow('This combination is not compatible.');
  });

  it('supports only approved compatible bundles on distinct sources', () => {
    const r = scenario(bhilai, [wasteHeat, solar], 100);
    expect(r.reduction).toBeGreaterThan(0);
    expect(() => scenario(bhilai, [wasteHeat, solar, motor], 100)).toThrow('This combination is not compatible.');
  });
});

describe('portfolio, parser, csv, extraction, digest', () => {
  const bhilai = factories.find(f => f.id === 'bhilai-steel')!;
  const satna = factories.find(f => f.id === 'satna-cement')!;
  const solar = interventions.find(i => i.id === 'solar')!;
  const motor = interventions.find(i => i.id === 'motor-efficiency')!;
  const wasteHeat = interventions.find(i => i.id === 'waste-heat')!;

  it('deduplicates same factory/source alternatives and repeated adoption in portfolio totals', () => {
    const s1 = scenario(bhilai, [solar], 100);
    const s2 = scenario(bhilai, [motor], 100);
    const s3 = scenario(bhilai, [solar], 50);
    const s4 = scenario(satna, [wasteHeat], 75);
    const entries: LedgerEntry[] = [
      { id: 'A', factoryId: bhilai.id, interventionIds: ['solar'], adoption: 100, reduction: s1.reduction, operatingSavings: s1.operatingSavings, capex: s1.capex, realisedSavings: 0, status: 'Estimated', createdAt: '2026-02-01T00:00:00Z', simulated: true },
      { id: 'B', factoryId: bhilai.id, interventionIds: ['motor-efficiency'], adoption: 100, reduction: s2.reduction, operatingSavings: s2.operatingSavings, capex: s2.capex, realisedSavings: 0, status: 'Estimated', createdAt: '2026-02-01T00:00:00Z', simulated: true },
      { id: 'C', factoryId: bhilai.id, interventionIds: ['solar'], adoption: 50, reduction: s3.reduction, operatingSavings: s3.operatingSavings, capex: s3.capex, realisedSavings: 0, status: 'Estimated', createdAt: '2026-02-01T00:00:00Z', simulated: true },
      { id: 'D', factoryId: satna.id, interventionIds: ['waste-heat'], adoption: 75, reduction: s4.reduction, operatingSavings: s4.operatingSavings, capex: s4.capex, realisedSavings: 0, status: 'In review', createdAt: '2026-02-02T00:00:00Z', simulated: true },
    ];
    const totals = portfolioTotals(entries, factories);
    expect(totals.reduction).toBeCloseTo(Math.max(s1.reduction, s2.reduction) + s4.reduction, 6);
    expect(totals.realisedSavings).toBe(0);
  });

  it('parses ambiguous Gujarat and unknown commands', () => {
    const ambiguous = parseCommand('Gujarat', factories);
    expect(ambiguous.type).toBe('ambiguous');
    if (ambiguous.type === 'ambiguous') expect(ambiguous.ids.length).toBeGreaterThan(1);
    expect(parseCommand('teleport to moon', factories)).toEqual({ type: 'unknown' });
  });

  it('escapes csv formula injection and keeps headers', () => {
    const s = scenario(bhilai, [solar], 100);
    const entries: LedgerEntry[] = [
      { id: '=1+1', factoryId: bhilai.id, interventionIds: ['solar'], adoption: 100, reduction: s.reduction, operatingSavings: s.operatingSavings, capex: s.capex, realisedSavings: 0, status: 'Estimated', createdAt: '2026-02-01T00:00:00Z', simulated: true },
    ];
    const csv = csvExport(entries, [{ ...bhilai, name: '+Injected Factory' }, ...factories.filter(f => f.id !== bhilai.id)]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Record ID"');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'+Injected Factory"');
  });

  it('handles extraction zeroes and rejects negative/non-finite values', () => {
    expect(extractEstimate(0, 0, 0)).toEqual({ emissions: 0, cost: 0 });
    expect(() => extractEstimate(-1, 1, 1)).toThrow('Enter non-negative, finite values.');
    expect(() => extractEstimate(Number.POSITIVE_INFINITY, 1, 1)).toThrow('Enter non-negative, finite values.');
    expect(() => extractEstimate(1e308, 1e308, 1e308)).toThrow('Values are too large.');
  });

  it('generates digest using current session-like values', () => {
    const bhilaiWasteHeat = scenario(bhilai, [wasteHeat], 75);
    const ledger: LedgerEntry[] = [
      { id: 'LP-2026-001', factoryId: bhilai.id, interventionIds: ['waste-heat'], adoption: 75, reduction: bhilaiWasteHeat.reduction, operatingSavings: bhilaiWasteHeat.operatingSavings, capex: bhilaiWasteHeat.capex, realisedSavings: 0, status: 'Estimated', createdAt: '2026-02-01T09:00:00Z', simulated: true },
    ];
    const digest = generateDigest(factories, ledger, []);
    expect(digest).toContain('12 factories; 12 illustrative baselines; 0 awaiting baseline.');
    expect(digest).toContain('1 scenario records; 0 simulated Issued labels, none registry verified.');
    expect(digest).toContain('Realised savings: ₹0');
    expect(digest).toContain('Generated from the displayed session dataset using a fixed template, not AI.');
  });
});