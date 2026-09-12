import { describe, it, expect } from 'vitest';
import { factories, interventions, processFlows, sources, reference } from './fixtures';
import { extractionSamples } from './extraction';
import { parseCommand } from './commands';
import {
  scenario,
  extractEstimate,
  portfolioTotals,
  csvExport,
  capexFor,
  eligibleFor,
  roiPercent,
} from './calculations';
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

  it('prices every source in its own physical unit', () => {
    // The screen shows wasteTonnes beside the waste cost, so the two must agree on the rate.
    factories.forEach(f => {
      expect(f.costs.waste).toBeCloseTo(f.wasteTonnes * reference.wasteRateINR, 0);
      expect(f.costs.fuel).toBeCloseTo((f.hotspots.fuel / reference.coalFactor) * reference.coalRateINR, 0);
      expect(f.costs.electricity).toBeCloseTo(
        (f.hotspots.electricity / reference.gridFactor) * reference.gridRateINR,
        0,
      );
    });
  });

  it('quotes the same unit prices on the intake screen as in the cost model', () => {
    const byId = Object.fromEntries(extractionSamples.map(s => [s.id, s]));
    expect(byId.electricity.rate).toBe(reference.gridRateINR);
    expect(byId.fuel.rate).toBe(reference.coalRateINR);
    expect(byId.waste.rate).toBe(reference.wasteRateINR);
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

  it('keeps capex fixed across adoption and 0 adoption gives no payback', () => {
    const r = scenario(bhilai, [wasteHeat], 0);
    const full = scenario(bhilai, [wasteHeat], 100);
    expect(r.capex).toBe(full.capex); // the invariant: capex never scales with adoption
    expect(r.capex).toBe(capexFor(bhilai, wasteHeat));
    expect(r.paybackMonths).toBeNull();
    expect(r.cashflow[0].value).toBe(-r.capex);
    expect(r.cashflow[36].value).toBe(-r.capex);
  });

  it('prices capex by the size of the opportunity, not per plant equally', () => {
    const small = factories.find(f => f.id === 'tiruppur-textiles')!;
    const solarMeasure = interventions.find(i => i.id === 'solar')!;
    const big = scenario(bhilai, [solarMeasure], 100).capex;
    const little = scenario(small, [solarMeasure], 100).capex;
    expect(big).toBeGreaterThan(little); // 842,000 tCO2e must not cost the same as 58,000
    // Sub-linear: ten times the opportunity costs far less than ten times the money.
    const ratio = bhilai.hotspots.electricity / small.hotspots.electricity;
    expect(big / little).toBeLessThan(ratio);
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

  it('offers circular material measures only to sites that declared a material stream', () => {
    const circular = interventions.find(i => i.id === 'material-substitution')!;
    expect(circular.requiresMaterial).toBe(true);
    const withStreams = factories.find(f => f.materials.length > 0)!;
    expect(eligibleFor(withStreams, circular)).toBe(true);
    const bare = { ...withStreams, materials: [] };
    expect(eligibleFor(bare, circular)).toBe(false);
    expect(() => scenario(bare, [circular], 100)).toThrow('This combination is not compatible.');
  });

  it('rejects non-eligible or overlapping bundle combinations', () => {
    expect(() => scenario(bhilai, [solar, motor], 100)).toThrow('This combination is not compatible.');
    expect(() => scenario(tiruppur, [wasteHeat], 100)).toThrow('This combination is not compatible.');
  });

  it('supports only approved compatible bundles on distinct sources', () => {
    const r = scenario(bhilai, [wasteHeat, solar], 100);
    expect(r.reduction).toBeGreaterThan(0);
    expect(() => scenario(bhilai, [wasteHeat, solar, motor], 100)).toThrow(
      'This combination is not compatible.',
    );
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
      {
        id: 'A',
        factoryId: bhilai.id,
        interventionIds: ['solar'],
        adoption: 100,
        reduction: s1.reduction,
        operatingSavings: s1.operatingSavings,
        capex: s1.capex,
        realisedSavings: 0,
        status: 'Estimated',
        createdAt: '2026-02-01T00:00:00Z',
        simulated: true,
      },
      {
        id: 'B',
        factoryId: bhilai.id,
        interventionIds: ['motor-efficiency'],
        adoption: 100,
        reduction: s2.reduction,
        operatingSavings: s2.operatingSavings,
        capex: s2.capex,
        realisedSavings: 0,
        status: 'Estimated',
        createdAt: '2026-02-01T00:00:00Z',
        simulated: true,
      },
      {
        id: 'C',
        factoryId: bhilai.id,
        interventionIds: ['solar'],
        adoption: 50,
        reduction: s3.reduction,
        operatingSavings: s3.operatingSavings,
        capex: s3.capex,
        realisedSavings: 0,
        status: 'Estimated',
        createdAt: '2026-02-01T00:00:00Z',
        simulated: true,
      },
      {
        id: 'D',
        factoryId: satna.id,
        interventionIds: ['waste-heat'],
        adoption: 75,
        reduction: s4.reduction,
        operatingSavings: s4.operatingSavings,
        capex: s4.capex,
        realisedSavings: 0,
        status: 'In review',
        createdAt: '2026-02-02T00:00:00Z',
        simulated: true,
      },
    ];
    const totals = portfolioTotals(entries, factories);
    expect(totals.reduction).toBeCloseTo(Math.max(s1.reduction, s2.reduction) + s4.reduction, 6);
    expect(totals.realisedSavings).toBe(0);
  });

  it('parses ambiguous Gujarat and unknown commands', () => {
    // A bare state name now filters by state rather than listing every plant in it.
    expect(parseCommand('Gujarat', factories)).toEqual({ type: 'state', state: 'Gujarat' });
    expect(parseCommand('teleport to moon', factories)).toEqual({ type: 'unknown' });
  });

  it('escapes csv formula injection and keeps headers', () => {
    const s = scenario(bhilai, [solar], 100);
    const entries: LedgerEntry[] = [
      {
        id: '=1+1',
        factoryId: bhilai.id,
        interventionIds: ['solar'],
        adoption: 100,
        reduction: s.reduction,
        operatingSavings: s.operatingSavings,
        capex: s.capex,
        realisedSavings: 0,
        status: 'Estimated',
        createdAt: '2026-02-01T00:00:00Z',
        simulated: true,
      },
    ];
    const csv = csvExport(entries, [
      { ...bhilai, name: '+Injected Factory' },
      ...factories.filter(f => f.id !== bhilai.id),
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Record ID"');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'+Injected Factory"');
  });

  it('handles extraction zeroes and rejects negative/non-finite values', () => {
    expect(extractEstimate(0, 0, 0)).toEqual({ emissions: 0, cost: 0 });
    expect(() => extractEstimate(-1, 1, 1)).toThrow('Enter non-negative, finite values.');
    expect(() => extractEstimate(Number.POSITIVE_INFINITY, 1, 1)).toThrow(
      'Enter non-negative, finite values.',
    );
    expect(() => extractEstimate(1e308, 1e308, 1e308)).toThrow('Values are too large.');
  });

  it('generates digest using current session-like values', () => {
    const bhilaiWasteHeat = scenario(bhilai, [wasteHeat], 75);
    const ledger: LedgerEntry[] = [
      {
        id: 'LP-2026-001',
        factoryId: bhilai.id,
        interventionIds: ['waste-heat'],
        adoption: 75,
        reduction: bhilaiWasteHeat.reduction,
        operatingSavings: bhilaiWasteHeat.operatingSavings,
        capex: bhilaiWasteHeat.capex,
        realisedSavings: 0,
        status: 'Estimated',
        createdAt: '2026-02-01T09:00:00Z',
        simulated: true,
      },
    ];
    const digest = generateDigest(factories, ledger, []);
    expect(digest).toContain('12 factories; 12 illustrative baselines; 0 awaiting baseline.');
    expect(digest).toContain('1 scenario record; 0 simulated Issued labels, none registry verified.');
    expect(digest).toContain('Realised savings: ₹0');
    expect(digest).toContain('Generated from the displayed session dataset using a fixed template, not AI.');
  });
});

describe('roiPercent', () => {
  it('expresses annual savings as a percentage of the capital that bought them', () => {
    expect(roiPercent(25_000_000, 100_000_000)).toBe(25);
    expect(roiPercent(200_000_000, 100_000_000)).toBe(200);
  });

  it('returns null when there is no capital to return, rather than Infinity', () => {
    // A no-capex measure pays back immediately; a ratio over zero is not a number to put on screen.
    expect(roiPercent(8_500_000, 0)).toBeNull();
  });

  it('returns null when the measure does not pay for itself', () => {
    expect(roiPercent(0, 100_000_000)).toBeNull();
    expect(roiPercent(-5_000_000, 100_000_000)).toBeNull();
  });

  it('agrees with the payback period scenario() reports for the same measure', () => {
    const factory = factories.find(f => f.baseline !== null)!;
    const item = interventions.find(i => eligibleFor(factory, i) && i.capex > 0)!;
    const result = scenario(factory, [item], 100);
    if (result.roiPercent === null || result.paybackMonths === null) return;
    // Payback in months and return per year are the same fact stated two ways.
    expect(result.roiPercent).toBeCloseTo(1200 / result.paybackMonths, 6);
  });
});
