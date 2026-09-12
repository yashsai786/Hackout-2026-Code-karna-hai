import { factories, interventions, bundles, sources, processFlows } from './fixtures';
import { compatible, sum } from './calculations';
import { extractionSamples } from './extraction';

export function validateFixtures() {
  const errors: string[] = [];
  const check = (valid: boolean, message: string) => {
    if (!valid) errors.push(message);
  };
  check(
    factories.length === 12 && new Set(factories.map(f => f.id)).size === 12,
    'Factory IDs must be unique; exactly 12 baseline fixtures.',
  );
  factories.forEach(f => {
    check(
      f.baseline !== null && f.baseline > 0 && f.production !== null && f.production > 0,
      `${f.id}: invalid baseline`,
    );
    check(sum(sources.map(s => f.hotspots[s])) === f.baseline, `${f.id}: hotspot totals`);
    check(
      sum(f.history.map(m => m.emissions)) === f.baseline && f.history.length === 12,
      `${f.id}: monthly total`,
    );
    check(
      f.coordinates !== null && Math.abs(f.coordinates[0]) <= 90 && Math.abs(f.coordinates[1]) <= 180,
      `${f.id}: coordinates`,
    );
    check(
      sources.every(s => Number.isFinite(f.costs[s]) && f.costs[s] >= 0 && f.hotspots[s] >= 0),
      `${f.id}: costs`,
    );
    check(
      f.exportShare >= 0 && f.exportShare <= 1 && f.wasteTonnes >= 0 && processFlows[f.sector].length > 0,
      `${f.id}: inputs`,
    );
  });
  check(new Set(interventions.map(i => i.id)).size === interventions.length, 'Duplicate intervention IDs');
  interventions.forEach(i => {
    check(
      i.reductionRate >= 0 &&
        i.reductionRate <= 1 &&
        i.costSavingRate >= 0 &&
        i.costSavingRate <= 1 &&
        i.capex >= 0 &&
        i.annualOpex >= 0,
      `${i.id}: financial inputs`,
    );
    i.compatibleWith.forEach(id =>
      check(
        interventions.some(j => j.id === id && j.compatibleWith.includes(i.id) && j.source !== i.source),
        `${i.id}: asymmetric compatibility`,
      ),
    );
  });
  bundles.forEach(b => {
    const items = b.interventionIds.map(id => interventions.find(i => i.id === id));
    check(
      b.compatible && items.every(Boolean) && compatible(items as typeof interventions),
      `${b.id}: invalid bundle`,
    );
  });
  check(
    new Set(extractionSamples.map(s => s.id)).size === 3,
    'Three unique sample extraction flows required',
  );
  extractionSamples.forEach(s => {
    check(
      [s.quantity, s.factor, s.rate].every(n => Number.isFinite(n) && n >= 0),
      `${s.id}: invalid extraction inputs`,
    );
    check(
      Number.isFinite(s.quantity * s.factor) && Number.isFinite(s.quantity * s.rate),
      `${s.id}: extraction overflow`,
    );
    check(/^\d{4}-(0[1-9]|1[0-2])$/.test(s.period) && !!s.unit, `${s.id}: reporting period and units`);
  });
  if (errors.length) throw new Error(`Fixture validation failed: ${errors.join('; ')}`);
  return true;
}
