import { sum, portfolioTotals } from './calculations';
import type { Factory, LedgerEntry, IntakeRecord } from './types';
import { FIXTURE_DATE, reference } from './fixtures';
export function generateDigest(factories: Factory[], ledger: LedgerEntry[], intake: IntakeRecord[]) {
  const known = factories.filter(f => f.baseline !== null), top = [...known].sort((a, b) => b.baseline! - a.baseline!)[0], totals = portfolioTotals(ledger, factories);
  const n = (v: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  // Mirrors Primitives.money() so the digest reads in the same units as the screens it summarises.
  const inr = (v: number) => {
    const abs = Math.abs(v), sign = v < 0 ? '\u2212' : '';
    if (abs >= 1e7) return `${sign}\u20b9${(abs / 1e7).toFixed(2)} cr`;
    if (abs >= 1e5) return `${sign}\u20b9${(abs / 1e5).toFixed(2)} L`;
    return `${sign}\u20b9${n(abs)}`;
  };
  return `LEAKPOINT / PORTFOLIO DIGEST\nGenerated ${new Date().toLocaleString('en-GB')} · Session snapshot\n\nTHE PORTFOLIO\n${factories.length} factories; ${known.length} illustrative baselines; ${factories.length - known.length} awaiting baseline.\nCombined annual emissions: ${n(sum(known.map(f => f.baseline!)))} tCO₂e (FY 2025).\n${top ? `Highest emitter: ${top.name}, ${n(top.baseline!)} tCO₂e/year.` : 'No annual baselines available.'}\n\nPLANNING SNAPSHOT\n${plural(ledger.length, 'scenario record')}; ${plural(ledger.filter(e => e.status === 'Issued').length, 'simulated Issued label')}, none registry verified.\nEstimated non-overlapping reduction: ${n(totals.reduction)} tCO₂e/year.\nEstimated annual net operating savings: ${inr(totals.operatingSavings)}.\nRealised savings: ${inr(totals.realisedSavings)}. Credit revenue: ₹0.\n${plural(intake.length, 'separate source intake record')}; no annual baselines replaced.\n\nASSUMPTIONS & LIMITS\nIllustrative market references dated ${FIXTURE_DATE}: €${reference.carbonEUR}/tCO₂, ₹${reference.eurINR}/€, conditional credits ₹${reference.creditLowINR}–${reference.creditHighINR}/unit. Not live quotes.\nAlternatives are deduplicated by factory/source; the largest reduction and its matching savings are retained. Upfront capex is not annual operating savings.\nCBAM figures are gross exposure scenarios, not tax liability. Data confidence is not credit readiness.\n\nSIMULATION ONLY\nGenerated from the displayed session dataset using a fixed template, not AI. No email sent, no registry issuance, no sales, and no verified real-world outcomes. Refreshing restores the demonstration dataset.`;
}