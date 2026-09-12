import { describe, it, expect } from 'vitest';
import { factories, interventions } from './fixtures';
import { scenario, eligibleFor } from './calculations';
import { buildRecommendation } from './analysis';
import type { AnalysisResult } from '../lib/leakpointApi';

const bhilai = factories.find(f => f.id === 'bhilai-steel')!;
const ranked = interventions
  .filter(i => eligibleFor(bhilai, i))
  .map(i => {
    const s = scenario(bhilai, [i], 100);
    return {
      item: i,
      reduction: s.reduction,
      operatingSavings: s.operatingSavings,
      capex: s.capex,
      paybackMonths: s.paybackMonths,
      roiPercent: s.roiPercent,
    };
  })
  .sort((a, b) => b.reduction - a.reduction);

const base: AnalysisResult = {
  model: {
    training: 'synthetic',
    n_samples: 8000,
    top_hotspot_accuracy: 0.909,
    sector_table_top_hotspot_accuracy: 0.78,
    share_mae: 0.028,
  },
  predicted: {
    shares: { fuel: 0.54, electricity: 0.11, process: 0.29, waste: 0.06 },
    intensity_tco2e_per_t: 2.1,
    baseline_tco2e_yr: 861000,
    primary_hotspot: 'fuel',
  },
  declared: {
    shares: { fuel: 0.5, electricity: 0.2, process: 0.27, waste: 0.03 },
    intensity_tco2e_per_t: 2.05,
    primary_hotspot: 'fuel',
  },
  agreement: true,
  discrepancies: [
    { source: 'fuel', declared_share: 0.5, model_share: 0.54, delta: -0.04, flag: false },
    { source: 'electricity', declared_share: 0.2, model_share: 0.11, delta: 0.09, flag: false },
    { source: 'process', declared_share: 0.27, model_share: 0.29, delta: -0.02, flag: false },
    { source: 'waste', declared_share: 0.03, model_share: 0.06, delta: -0.03, flag: false },
  ],
  benchmark: { intensity_used: 2.05, basis: 'declared', sector_median: 1.9, percentile: 62, quantiles: {} },
  what_ifs: [
    {
      change: 'Switch primary fuel to natural gas',
      kind: 'fuel',
      value: 'Natural gas',
      intensity: 1.6,
      intensity_change_pct: -24,
      shares: {},
    },
  ],
  note: 'n',
};

describe('overall recommendation', () => {
  it('leads with the hotspot, benchmarks, names the best what-if and the top measure', () => {
    const out = buildRecommendation(bhilai, base, ranked);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out[0]).toMatch(/Thermal energy is the primary leak point/);
    expect(out.join(' ')).toMatch(/more intensive/);
    expect(out.join(' ')).toMatch(/natural gas/);
    expect(out.join(' ')).toContain(ranked[0].item.name.toLowerCase());
  });

  it('says so plainly when the declared baseline and the model disagree on the hotspot', () => {
    const disagree: AnalysisResult = {
      ...base,
      agreement: false,
      predicted: { ...base.predicted, primary_hotspot: 'electricity' },
    };
    const out = buildRecommendation(bhilai, disagree, ranked);
    expect(out[0]).toMatch(/declared baseline puts thermal energy first/i);
    expect(out[0]).toMatch(/electricity/);
  });

  it('flags sources that differ by 15 points or more', () => {
    const flagged: AnalysisResult = {
      ...base,
      discrepancies: base.discrepancies.map(d =>
        d.source === 'electricity' ? { ...d, delta: 0.2, flag: true } : d,
      ),
    };
    expect(buildRecommendation(bhilai, flagged, ranked).join(' ')).toMatch(
      /One source differs .*\(electricity \+20 pts\)/,
    );
  });
});
