import { sources, interventions, reference } from './fixtures';
import type { Factory, Intervention, LedgerEntry } from './types';

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export const intensity = (f: Factory) => f.baseline !== null && f.production && f.production > 0 ? f.baseline / f.production : null;
export function compatible(items: Intervention[]) {
  return items.every((a, i) => items.every((b, j) => i === j || (a.id !== b.id && a.source !== b.source && a.compatibleWith.includes(b.id) && b.compatibleWith.includes(a.id))));
}
// Sector fit, plus: a circular measure needs a declared material stream to be honest about.
export const eligibleFor = (f: Factory, i: Intervention) =>
  i.sectors.includes(f.sector) && (!i.requiresMaterial || (f.materials?.length ?? 0) > 0);
export const CAPEX_SCALE_EXPONENT = .7;
/**
 * Capital cost scales with the size of the opportunity, not linearly with it — the six-tenths rule.
 * Without this a 58,000 tCO2e mill is quoted the same price as an 842,000 tCO2e steelworks.
 */
export const capexFor = (f: Factory, i: Intervention) => {
  const addressable = f.hotspots[i.source] * i.reductionRate;
  if (!i.addressableRef || addressable <= 0) return i.capex;
  return Math.round(i.capex * Math.pow(addressable / i.addressableRef, CAPEX_SCALE_EXPONENT));
};
export function scenario(f: Factory, items: Intervention[], adoption: number) {
  if (f.baseline === null) throw new Error('A validated baseline is required.');
  if (!Number.isFinite(adoption) || adoption < 0 || adoption > 100) throw new Error('Adoption must be between 0 and 100.');
  if (!items.length || !compatible(items) || items.some(i => !eligibleFor(f, i))) throw new Error('This combination is not compatible.');
  const scale = adoption / 100;
  const reduction = Math.min(f.baseline, sum(items.map(i => Math.min(f.hotspots[i.source], f.hotspots[i.source] * i.reductionRate * scale))));
  const grossSavings = sum(items.map(i => f.costs[i.source] * i.costSavingRate * scale));
  const opex = sum(items.map(i => i.annualOpex * scale));
  const operatingSavings = grossSavings - opex;
  const capex = sum(items.map(i => capexFor(f, i)));
  const paybackMonths = operatingSavings <= 0 ? null : capex === 0 ? 0 : capex / operatingSavings * 12;
  return { reduction, grossSavings, opex, operatingSavings, capex, paybackMonths,
    cashflow: Array.from({ length: 37 }, (_, month) => ({ month, value: -capex + operatingSavings / 12 * month })),
    remaining: Math.max(0, f.baseline - reduction) };
}
export const exposure = (f: Factory) => f.baseline === null || !['Steel', 'Cement'].includes(f.sector) ? null : f.baseline * f.exportShare * reference.carbonEUR * reference.eurINR;
export const readinessCount = (f: Factory) => Object.values(f.readiness).filter(Boolean).length;
export const CREDIT_FACTOR = .7;
// Best single measure at full adoption, discounted by the modelling factor. Shared by the Credits
// screen and the Copilot so the two can never quote a different volume for the same factory.
export function creditPotential(f: Factory) {
  const candidates = f.baseline === null ? [] : interventions.filter(i => eligibleFor(f, i)).map(i => ({ item: i, result: scenario(f, [i], 100) })).sort((a, b) => b.result.reduction - a.result.reduction);
  const best = candidates[0] ?? null, volume = Math.floor((best?.result.reduction || 0) * CREDIT_FACTOR);
  return { best, candidates, factor: CREDIT_FACTOR, volume, valueLowINR: volume * reference.creditLowINR, valueHighINR: volume * reference.creditHighINR };
}
export function extractEstimate(quantity: number, factor: number, costRate: number) {
  if ([quantity, factor, costRate].some(n => !Number.isFinite(n) || n < 0)) throw new Error('Enter non-negative, finite values.');
  const emissions = quantity * factor, cost = quantity * costRate;
  if (!Number.isFinite(emissions) || !Number.isFinite(cost)) throw new Error('Values are too large.');
  return { emissions, cost };
}
// Across scenarios, retain the largest estimate per factory/source. Alternatives never stack.
export function portfolioTotals(entries: LedgerEntry[], factories: Factory[]) {
  const grouped = new Map<string, { reduction: number; savings: number }>();
  entries.forEach(e => {
    const f = factories.find(f => f.id === e.factoryId);
    if (!f || f.baseline === null) return;
    e.interventionIds.forEach(id => {
      const item = interventions.find(i => i.id === id);
      if (!item) return;
      const s = scenario(f, [item], e.adoption), key = `${f.id}:${item.source}`, previous = grouped.get(key);
      if (!previous || s.reduction > previous.reduction) grouped.set(key, { reduction: s.reduction, savings: s.operatingSavings });
    });
  });
  return { reduction: sum([...grouped.values()].map(g => g.reduction)), operatingSavings: sum([...grouped.values()].map(g => g.savings)), realisedSavings: sum(entries.map(e => e.realisedSavings)) };
}
export function csvExport(entries: LedgerEntry[], factories: Factory[]) {
  const cell = (value: string | number) => '"' + String(value).replace(/^[=+@\-]/, "'$&").replace(/"/g, '""') + '"';
  const rows: (string | number)[][] = [['Record ID', 'Date', 'Factory', 'Interventions', 'Adoption %', 'Estimated tCO2e/year', 'Estimated operating savings INR/year', 'Upfront capex INR', 'Realised savings INR', 'Status', 'Registry verified', 'Simulation']];
  entries.forEach(e => rows.push([e.id, e.createdAt, factories.find(f => f.id === e.factoryId)?.name || 'Unknown', e.interventionIds.map(id => interventions.find(i => i.id === id)?.name).join(' + '), e.adoption, e.reduction.toFixed(2), e.operatingSavings.toFixed(2), e.capex, e.realisedSavings, e.status, 'No', 'Yes — illustrative estimate only']));
  return '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
export const downloadText = (content: string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};