import { describe, it, expect } from 'vitest';
import { unattributedFigures } from './agent';
import type { ToolRun } from './types';

const runs: ToolRun[] = [
  {
    id: '1',
    name: 'run_scenario',
    ms: 1,
    ok: true,
    refs: [],
    args: { factoryId: 'bhilai-steel', interventionIds: ['waste-heat'], adoption: 40 },
    data: {
      reduction: 30312,
      operatingSavings: 101710082.64,
      capex: 191941271,
      paybackMonths: 22.65,
      full: 75780,
    },
  } as ToolRun,
];

describe('unattributedFigures — the arithmetic rule, checked structurally', () => {
  it('lets tool figures through in any reasonable spelling', () => {
    expect(
      unattributedFigures(
        'Reduction 30,312 tCO2e/yr, capex ₹191,941,271, payback 22.65 months, 40% adoption, 75,780 full.',
        runs,
      ),
    ).toEqual([]);
    expect(unattributedFigures('About ₹19.19 cr capex and 22.7 months payback.', runs)).toEqual([]); // crore spelling, rounded
  });
  it('ignores trailing punctuation on a figure', () => {
    expect(unattributedFigures('Capex ₹191,941,271, then payback.', runs)).toEqual([]);
  });
  it('flags a ratio the model computed itself', () => {
    expect(unattributedFigures('That is ~112% of the ledger total.', runs)).toEqual(['~112%']);
  });
  it('ignores counts and years, and honours the question', () => {
    expect(unattributedFigures('3 factories in FY 2025.', runs)).toEqual([]);
    expect(unattributedFigures('At 60% adoption you asked about', runs, 'what about 60% adoption')).toEqual(
      [],
    );
  });
});
