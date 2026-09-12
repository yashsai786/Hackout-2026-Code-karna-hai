import type { Factory, Intervention } from './types';
import { sourceLabels } from './fixtures';
import type { AnalysisResult } from '../lib/leakpointApi';

export type RankedMeasure = {
  item: Intervention;
  reduction: number;
  operatingSavings: number;
  capex: number;
  paybackMonths: number | null;
  roiPercent: number | null;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const months = (m: number | null) =>
  m === null
    ? 'no payback'
    : m === 0
      ? 'immediate payback'
      : m < 12
        ? `${Math.round(m)}-month payback`
        : `${(m / 12).toFixed(1)}-year payback`;

/**
 * The overall recommendation, assembled from the numbers on the page and nothing else. Every
 * sentence can be traced to a figure a judge can see; the Copilot may narrate it, never replace it.
 */
export function buildRecommendation(f: Factory, a: AnalysisResult, ranked: RankedMeasure[]): string[] {
  const out: string[] = [];
  const top = a.predicted.primary_hotspot;
  const topLabel = sourceLabels[top as keyof typeof sourceLabels] ?? top;
  const modelShare = a.predicted.shares[top];
  const declaredTop = a.declared.primary_hotspot;

  if (declaredTop && declaredTop !== top) {
    const decLabel = sourceLabels[declaredTop as keyof typeof sourceLabels] ?? declaredTop;
    out.push(
      `The declared baseline puts ${decLabel.toLowerCase()} first, but for a plant described like this the model expects ${topLabel.toLowerCase()} to dominate at about ${pct(modelShare)}. Confirm the metered split before committing capital: if the model is right, the top measure changes.`,
    );
  } else {
    out.push(
      `${topLabel} is the primary leak point at about ${pct(a.declared.shares[top] ?? modelShare)} of annual emissions${declaredTop ? ', and the model agrees' : ' by the model\u2019s estimate'}. Start there.`,
    );
  }

  const flagged = a.discrepancies.filter(d => d.flag);
  if (flagged.length && !(declaredTop && declaredTop !== top)) {
    out.push(
      `${flagged.length === 1 ? 'One source differs' : `${flagged.length} sources differ`} from the model by 15 points or more (${flagged
        .map(
          d =>
            `${(sourceLabels[d.source as keyof typeof sourceLabels] ?? d.source).toLowerCase()} ${d.delta! > 0 ? '+' : ''}${Math.round(d.delta! * 100)} pts`,
        )
        .join(', ')}). Treat those figures as the first things to meter.`,
    );
  }

  if (a.benchmark) {
    const p = Math.round(a.benchmark.percentile);
    out.push(
      p <= 40
        ? `At ${a.benchmark.intensity_used.toFixed(2)} tCO\u2082e per tonne the plant is cleaner than roughly ${100 - p}% of comparable ${f.sector.toLowerCase()} plants (sector median ${a.benchmark.sector_median.toFixed(2)}). Gains will come from the specific hotspot, not from catching up with peers.`
        : p >= 60
          ? `At ${a.benchmark.intensity_used.toFixed(2)} tCO\u2082e per tonne the plant sits in the more intensive ${100 - p}% of comparable ${f.sector.toLowerCase()} plants (sector median ${a.benchmark.sector_median.toFixed(2)}). There is headroom simply to reach the median.`
          : `At ${a.benchmark.intensity_used.toFixed(2)} tCO\u2082e per tonne the plant is close to the ${f.sector.toLowerCase()} median of ${a.benchmark.sector_median.toFixed(2)}.`,
    );
  }

  const bestWhatIf = a.what_ifs.find(w => (w.intensity_change_pct ?? 0) < -5);
  if (bestWhatIf)
    out.push(
      `Of the structural changes the model can reason about, "${bestWhatIf.change.toLowerCase()}" moves expected intensity most, by about ${Math.abs(Math.round(bestWhatIf.intensity_change_pct!))}%. That is a model expectation, not an engineering estimate.`,
    );

  const [first, second] = ranked;
  if (first) {
    out.push(
      `The best-value measure today is ${first.item.name.toLowerCase()}: about ${Math.round(first.reduction).toLocaleString('en-IN')} tCO\u2082e a year with ${months(first.paybackMonths)}${first.roiPercent !== null ? ` and a ${Math.round(first.roiPercent)}% annual return on capital` : ''}.${
        second
          ? ` ${second.item.name} follows at ${Math.round(second.reduction).toLocaleString('en-IN')} tCO\u2082e with ${months(second.paybackMonths)}.`
          : ''
      }`,
    );
  } else {
    out.push(
      'No measure is eligible yet: declare a material stream on the profile to unlock circular options.',
    );
  }
  return out;
}
