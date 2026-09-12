import type { ToolDef } from '../lib/openrouter';
import type { Factory, Intervention, Sector, Source } from '../domain/types';
import type { Ref, ToolContext, ToolResult } from './types';
import { interventions, reference, sectors, sources, sourceLabels, processFlows, FIXTURE_DATE } from '../domain/fixtures';
import { intensity, scenario, exposure, readinessCount, creditPotential, portfolioTotals, compatible, eligibleFor, sum, capexFor, CREDIT_FACTOR } from '../domain/calculations';
import { generateDigest } from '../domain/digest';

// This module is imported by Vitest under `environment: 'node'`. It must never touch window or
// document, which is why the openrouter import above is type-only.

const INTERVENTION_IDS = interventions.map(i => i.id);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 1000) / 10;

const refFactory = (f: Factory): Ref => ({ kind: 'factory', id: f.id, label: f.name, to: `/factories/${f.id}` });
const refIntervention = (i: Intervention, factoryId?: string): Ref => ({ kind: 'intervention', id: i.id, label: i.name, to: `/interventions/${i.id}${factoryId ? `?factory=${factoryId}` : ''}` });

// Every numeric key names its unit. This is the cheapest defence against the model inventing units.
const factoryBrief = (f: Factory) => ({
  id: f.id, name: f.name, city: f.city, state: f.state, sector: f.sector,
  baseline_tco2e_yr: f.baseline, production_t_yr: f.production,
  intensity_tco2e_per_t: intensity(f) === null ? null : r2(intensity(f)!),
  confidence: f.confidence, readiness_count_of_4: readinessCount(f),
  awaiting_baseline: f.baseline === null,
});

const scenarioBrief = (s: ReturnType<typeof scenario>) => ({
  reduction_tco2e_yr: r2(s.reduction), gross_savings_inr_yr: r2(s.grossSavings),
  added_opex_inr_yr: r2(s.opex), net_operating_savings_inr_yr: r2(s.operatingSavings),
  capex_inr_one_off: s.capex, payback_months: s.paybackMonths === null ? null : r2(s.paybackMonths),
  remaining_baseline_tco2e_yr: r2(s.remaining), net_cash_month_36_inr: r2(s.cashflow[36].value),
});

const SCENARIO_HINTS: Record<string, string> = {
  'A validated baseline is required.': 'That factory is Awaiting baseline: no annual figure, so no scenario, rank, recommendation or credit potential exists. Say so plainly, then offer to take them there by calling navigate with path "/factory-profile" and that factory_id.',
  'Adoption must be between 0 and 100.': 'Pass adoption as a whole percentage between 0 and 100, for example 75 — not a fraction.',
  'This combination is not compatible.': 'Call list_interventions with that factory_id. Measures must be sector-eligible, sit on different emission sources, and be mutually compatible. At most two.',
};

const PAYBACK_NOTE = 'payback_months null means the measure produces no net positive annual savings; 0 means immediate (zero capex).';
const CAPEX_NOTE = 'Capex is fixed at every adoption level, including 0%. Only savings and added opex scale with adoption.';

type Tool = { def: ToolDef; run: (args: Record<string, any>, ctx: ToolContext) => ToolResult };

const def = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDef =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });

const SECTOR_ENUM = { type: 'string', enum: sectors };
const SOURCE_ENUM = { type: 'string', enum: sources };
const MEASURE_ARRAY = { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: INTERVENTION_IDS }, description: 'One measure, or two mutually compatible measures on different emission sources.' };

const findFactory = (ctx: ToolContext, id: unknown) => ctx.factories.find(f => f.id === String(id ?? ''));
const notFound = (id: unknown): ToolResult => ({ ok: false, error: `No factory with id "${id}" in this session.`, hint: 'Call list_factories for valid ids.' });

export const tools: Tool[] = [
  {
    def: def('list_factories', 'List factories in the current session with their stored figures. Use this to resolve names to ids.', {
      sector: SECTOR_ENUM, state: { type: 'string', description: 'Indian state name exactly as stored, e.g. Gujarat.' },
      search: { type: 'string', description: 'Case-insensitive substring over name, city and state.' },
      include_awaiting_baseline: { type: 'boolean', default: true },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 },
    }),
    run: (a, ctx) => {
      const q = String(a.search ?? '').toLowerCase();
      let list = ctx.factories.filter(f =>
        (!a.sector || f.sector === a.sector) && (!a.state || f.state.toLowerCase() === String(a.state).toLowerCase()) &&
        (!q || `${f.name} ${f.city} ${f.state}`.toLowerCase().includes(q)) &&
        (a.include_awaiting_baseline === false ? f.baseline !== null : true));
      list = list.slice(0, Number(a.limit ?? 15));
      return { ok: true, data: { count: list.length, total_in_session: ctx.factories.length, factories: list.map(factoryBrief) }, refs: list.map(refFactory) };
    },
  },
  {
    def: def('get_factory', 'Full stored profile for one factory: hotspots by source, annual costs, readiness and export share.', {
      factory_id: { type: 'string' }, include_history: { type: 'boolean', default: false },
    }, ['factory_id']),
    run: (a, ctx) => {
      const f = findFactory(ctx, a.factory_id);
      if (!f) return notFound(a.factory_id);
      const base = f.baseline ?? 0;
      return {
        ok: true,
        data: {
          ...factoryBrief(f),
          hotspots_tco2e_yr: Object.fromEntries(sources.map(s => [sourceLabels[s], f.hotspots[s]])),
          hotspot_share_pct: Object.fromEntries(sources.map(s => [sourceLabels[s], base ? pct(f.hotspots[s] / base) : 0])),
          annual_costs_inr_yr: Object.fromEntries(sources.map(s => [sourceLabels[s], r2(f.costs[s])])),
          waste_tonnes_yr: f.wasteTonnes, export_share_pct: pct(f.exportShare),
          material_streams: (f.materials ?? []).map(m => ({ name: m.name, tonnes_per_year: m.tonnesPerYear, cost_per_tonne_inr: m.costPerTonne, recycled_share_pct: pct(m.recycledShare) })),
          readiness: f.readiness, independent_review_complete: f.readiness.independentReview,
          coordinates: f.coordinates,
          ...(a.include_history ? { monthly_history_tco2e: f.history } : {}),
        },
        refs: [refFactory(f)],
      };
    },
  },
  {
    def: def('rank_factories', 'Rank factories by total annual emissions or by emissions intensity. Factories awaiting a baseline are excluded and listed separately.', {
      metric: { type: 'string', enum: ['total', 'intensity'], default: 'total' },
      sector: SECTOR_ENUM, state: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 12, default: 5 },
    }),
    run: (a, ctx) => {
      const metric = a.metric === 'intensity' ? 'intensity' : 'total';
      const pool = ctx.factories.filter(f => (!a.sector || f.sector === a.sector) && (!a.state || f.state.toLowerCase() === String(a.state).toLowerCase()));
      const excluded = pool.filter(f => f.baseline === null).map(f => f.name);
      const ranked = pool.filter(f => f.baseline !== null)
        .sort((x, y) => metric === 'total' ? y.baseline! - x.baseline! : intensity(y)! - intensity(x)!)
        .slice(0, Number(a.limit ?? 5));
      return {
        ok: true,
        data: {
          metric, unit: metric === 'total' ? 'tCO2e/yr' : 'tCO2e/t',
          ranked: ranked.map((f, i) => ({ rank: i + 1, ...factoryBrief(f), value: metric === 'total' ? f.baseline : r2(intensity(f)!) })),
          excluded_awaiting_baseline: excluded,
        },
        refs: ranked.map(refFactory),
      };
    },
  },
  {
    def: def('portfolio_summary', 'Session-wide totals: factory counts, combined baseline, and the best-single-measure reduction potential.', { sector: SECTOR_ENUM }),
    run: (a, ctx) => {
      const pool = ctx.factories.filter(f => !a.sector || f.sector === a.sector);
      const known = pool.filter(f => f.baseline !== null);
      const total = sum(known.map(f => f.baseline!));
      let potential = 0;
      try {
        potential = sum(known.map(f => Math.max(...interventions.filter(i => eligibleFor(f, i)).map(i => scenario(f, [i], 100).reduction))));
      } catch { potential = 0; }
      let totals = { reduction: 0, operatingSavings: 0, realisedSavings: 0 };
      try { totals = portfolioTotals(ctx.ledger, ctx.factories); } catch { /* an inconsistent entry must not fail the summary */ }
      return {
        ok: true,
        data: {
          factory_count: pool.length, with_baseline: known.length, awaiting_baseline: pool.length - known.length,
          combined_baseline_tco2e_yr: total,
          sectors_in_view: [...new Set(pool.map(f => f.sector))],
          best_single_measure_potential_tco2e_yr: r2(potential),
          potential_share_of_baseline_pct: total ? pct(potential / total) : 0,
          ledger_records: ctx.ledger.length,
          ledger_deduplicated_reduction_tco2e_yr: r2(totals.reduction),
          ledger_net_operating_savings_inr_yr: r2(totals.operatingSavings),
          realised_savings_inr: totals.realisedSavings,
          intake_records: ctx.intake.length,
        },
      };
    },
  },
  {
    def: def('list_interventions', 'List measures. With a factory_id, only sector-eligible measures are returned, each with an estimate at the given adoption.', {
      factory_id: { type: 'string' }, sector: SECTOR_ENUM, source: SOURCE_ENUM,
      adoption: { type: 'number', minimum: 0, maximum: 100, default: 100 },
      sort: { type: 'string', enum: ['reduction', 'savings', 'capex', 'payback'], default: 'reduction' },
    }),
    run: (a, ctx) => {
      const f = a.factory_id ? findFactory(ctx, a.factory_id) : undefined;
      if (a.factory_id && !f) return notFound(a.factory_id);
      const sector = (f?.sector ?? a.sector) as Sector | undefined;
      const pool = interventions.filter(i => (f ? eligibleFor(f, i) : !sector || i.sectors.includes(sector)) && (!a.source || i.source === a.source));
      const adoption = Number(a.adoption ?? 100);
      const rows = pool.map(i => {
        const common = { id: i.id, name: i.name, category: i.category, source: sourceLabels[i.source as Source], sectors: i.sectors, duration: i.duration, complexity: i.complexity, capex_inr_one_off: f ? capexFor(f, i) : i.capex, capex_is_reference_price: !f, annual_opex_inr_yr: i.annualOpex };
        if (!f || f.baseline === null) return { ...common, estimate: null };
        try { return { ...common, estimate: scenarioBrief(scenario(f, [i], adoption)) }; }
        catch (e) { return { ...common, estimate: null, not_applicable: (e as Error).message }; }
      });
      const key = a.sort ?? 'reduction';
      rows.sort((x: any, y: any) => {
        if (!x.estimate || !y.estimate) return x.estimate ? -1 : y.estimate ? 1 : 0;
        if (key === 'payback') return (x.estimate.payback_months ?? Infinity) - (y.estimate.payback_months ?? Infinity);
        if (key === 'capex') return x.estimate.capex_inr_one_off - y.estimate.capex_inr_one_off;
        if (key === 'savings') return y.estimate.net_operating_savings_inr_yr - x.estimate.net_operating_savings_inr_yr;
        return y.estimate.reduction_tco2e_yr - x.estimate.reduction_tco2e_yr;
      });
      return {
        ok: true,
        data: { factory: f ? f.name : null, adoption_pct: f ? adoption : null, sorted_by: key, note: f ? PAYBACK_NOTE : 'No factory selected, so no estimate was calculated.', interventions: rows },
        refs: pool.map(i => refIntervention(i, f?.id)),
      };
    },
  },
  {
    def: def('run_scenario', 'Calculate one scenario: reduction, savings, capex and payback for a factory, one or two measures, and an adoption level.', {
      factory_id: { type: 'string' }, intervention_ids: MEASURE_ARRAY,
      adoption: { type: 'number', minimum: 0, maximum: 100, description: 'Whole percentage of the full technical measure.' },
      include_cashflow: { type: 'boolean', default: false },
    }, ['factory_id', 'intervention_ids', 'adoption']),
    run: (a, ctx) => {
      const f = findFactory(ctx, a.factory_id);
      if (!f) return notFound(a.factory_id);
      const ids: string[] = Array.isArray(a.intervention_ids) ? a.intervention_ids.map(String) : [];
      const items = ids.map(id => interventions.find(i => i.id === id)).filter(Boolean) as Intervention[];
      if (items.length !== ids.length) return { ok: false, error: `Unknown measure id in ${JSON.stringify(ids)}.`, hint: `Valid ids: ${INTERVENTION_IDS.join(', ')}.` };
      const adoption = Number(a.adoption);
      const s = scenario(f, items, adoption); // throws are caught and mapped by runTool
      const hot = items.map(i => `${sourceLabels[i.source as Source]} ${f.hotspots[i.source]}`).join(' + ');
      return {
        ok: true,
        data: {
          factory: f.name, factory_id: f.id, interventions: items.map(i => i.name), adoption_pct: adoption,
          ...scenarioBrief(s),
          reduction_share_of_baseline_pct: f.baseline ? pct(s.reduction / f.baseline) : 0,
          capex_note: CAPEX_NOTE, payback_note: PAYBACK_NOTE,
          ...(a.include_cashflow ? { cashflow_inr_by_month: s.cashflow } : {}),
        },
        refs: [refFactory(f), ...items.map(i => refIntervention(i, f.id))],
        formula: `reduction = min(baseline, Σ min(hotspot, hotspot × rate × adoption/100)) · baseline ${f.baseline} · ${hot} · rates ${items.map(i => i.reductionRate).join(', ')} · adoption ${adoption}%`,
      };
    },
  },
  {
    def: def('compare_factories', 'Compare two to four factories side by side. A measure that is not eligible for one of them reports its reason rather than failing the call.', {
      factory_ids: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } },
      intervention_id: { type: 'string', enum: INTERVENTION_IDS },
      adoption: { type: 'number', minimum: 0, maximum: 100, default: 100 },
    }, ['factory_ids']),
    run: (a, ctx) => {
      const ids: string[] = Array.isArray(a.factory_ids) ? a.factory_ids.map(String) : [];
      const found = ids.map(id => ({ id, f: findFactory(ctx, id) }));
      const missing = found.filter(x => !x.f).map(x => x.id);
      if (missing.length) return { ok: false, error: `Unknown factory id(s): ${missing.join(', ')}.`, hint: 'Call list_factories for valid ids.' };
      const item = a.intervention_id ? interventions.find(i => i.id === a.intervention_id) : undefined;
      const adoption = Number(a.adoption ?? 100);
      const rows = found.map(({ f }) => {
        const base: any = { ...factoryBrief(f!), export_exposure_inr_yr: exposure(f!) === null ? null : r2(exposure(f!)!) };
        if (!item) return base;
        try { return { ...base, measure: item.name, adoption_pct: adoption, estimate: scenarioBrief(scenario(f!, [item], adoption)) }; }
        catch (e) { return { ...base, measure: item.name, estimate: null, not_applicable: (e as Error).message }; }
      });
      return { ok: true, data: { compared: rows.length, measure: item?.name ?? null, factories: rows }, refs: found.map(x => refFactory(x.f!)) };
    },
  },
  {
    def: def('best_measures', 'Rank the eligible measures for one factory by reduction, payback or savings. Optionally include compatible pairs.', {
      factory_id: { type: 'string' },
      rank_by: { type: 'string', enum: ['reduction', 'payback', 'savings'], default: 'reduction' },
      adoption: { type: 'number', minimum: 0, maximum: 100, default: 100 },
      limit: { type: 'integer', minimum: 1, maximum: 6, default: 3 },
      include_pairs: { type: 'boolean', default: false },
    }, ['factory_id']),
    run: (a, ctx) => {
      const f = findFactory(ctx, a.factory_id);
      if (!f) return notFound(a.factory_id);
      if (f.baseline === null) return { ok: false, error: 'A validated baseline is required.', hint: SCENARIO_HINTS['A validated baseline is required.'] };
      const adoption = Number(a.adoption ?? 100);
      const eligible = interventions.filter(i => eligibleFor(f, i));
      const excluded = interventions.filter(i => !eligibleFor(f, i)).map(i => ({ intervention_id: i.id, reason: i.sectors.includes(f.sector) ? 'Needs at least one declared material stream.' : `Not defined for ${f.sector}.` }));
      const combos: { items: Intervention[] }[] = eligible.map(i => ({ items: [i] }));
      if (a.include_pairs) {
        for (let x = 0; x < eligible.length; x++) for (let y = x + 1; y < eligible.length; y++) {
          if (compatible([eligible[x], eligible[y]])) combos.push({ items: [eligible[x], eligible[y]] });
        }
      }
      const scored = combos.map(c => ({ names: c.items.map(i => i.name), ids: c.items.map(i => i.id), ...scenarioBrief(scenario(f, c.items, adoption)) }));
      const key = a.rank_by ?? 'reduction';
      scored.sort((x, y) => key === 'payback' ? (x.payback_months ?? Infinity) - (y.payback_months ?? Infinity)
        : key === 'savings' ? y.net_operating_savings_inr_yr - x.net_operating_savings_inr_yr
        : y.reduction_tco2e_yr - x.reduction_tco2e_yr);
      return {
        ok: true,
        data: { factory: f.name, factory_id: f.id, adoption_pct: adoption, ranked_by: key, note: PAYBACK_NOTE, ranked: scored.slice(0, Number(a.limit ?? 3)), excluded },
        refs: [refFactory(f), ...eligible.map(i => refIntervention(i, f.id))],
      };
    },
  },
  {
    def: def('credit_potential', 'Conditional carbon-credit illustration for one factory: best single measure at full adoption, discounted by the 0.70 modelling factor.', { factory_id: { type: 'string' } }, ['factory_id']),
    run: (a, ctx) => {
      const f = findFactory(ctx, a.factory_id);
      if (!f) return notFound(a.factory_id);
      const c = creditPotential(f);
      if (!c.best) return { ok: false, error: 'A validated baseline is required.', hint: SCENARIO_HINTS['A validated baseline is required.'] };
      return {
        ok: true,
        data: {
          factory: f.name, best_measure: c.best.item.name, best_measure_id: c.best.item.id,
          technical_reduction_tco2e_yr: r2(c.best.result.reduction), modelling_factor: c.factor,
          illustrative_volume_units_yr: c.volume,
          price_band_inr_per_unit: [reference.creditLowINR, reference.creditHighINR],
          gross_value_band_inr_yr: [c.valueLowINR, c.valueHighINR],
          readiness_count_of_4: readinessCount(f), independent_review_complete: false,
          registry_verified: false, realised_credit_revenue_inr: 0,
          conditions: ['Technical reduction does not automatically create credits.', 'Eligibility, methodology and independent verification are not established here.', 'No transaction costs, buffer rules or verification costs are modelled.'],
        },
        refs: [refFactory(f), refIntervention(c.best.item, f.id), { kind: 'route', id: 'credits', label: 'Credits', to: `/credits?factory=${f.id}` }],
        formula: `volume = floor(best technical reduction × ${CREDIT_FACTOR}) = floor(${r2(c.best.result.reduction)} × ${CREDIT_FACTOR}) = ${c.volume} units/yr`,
      };
    },
  },
  {
    def: def('export_exposure', 'Gross export carbon-cost exposure. Defined for steel and cement only in this fixture scenario.', { factory_id: { type: 'string' }, sector: SECTOR_ENUM }),
    run: (a, ctx) => {
      const pool = a.factory_id ? [findFactory(ctx, a.factory_id)] : ctx.factories.filter(f => !a.sector || f.sector === a.sector);
      if (a.factory_id && !pool[0]) return notFound(a.factory_id);
      const rows = (pool as Factory[]).map(f => {
        const value = exposure(f);
        return value === null
          ? { factory: f.name, id: f.id, sector: f.sector, in_scope: false, reason: 'Only steel and cement are included in this simplified fixture scenario.' }
          : { factory: f.name, id: f.id, sector: f.sector, in_scope: true, export_share_pct: pct(f.exportShare), exposure_inr_yr: r2(value) };
      });
      return {
        ok: true,
        data: { rows, not_a_tax_liability: true, note: 'A gross scenario, not a CBAM tax liability, compliance calculation or legal assessment.' },
        refs: (pool as Factory[]).map(refFactory),
        formula: `exposure = baseline × export share × €${reference.carbonEUR}/tCO2 × ₹${reference.eurINR}/€`,
      };
    },
  },
  {
    def: def('list_ledger', 'Recorded scenario estimates in this session, as stored. These are records, not recomputations.', {
      factory_id: { type: 'string' }, status: { type: 'string', enum: ['Estimated', 'In review', 'Issued'] },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    }),
    run: (a, ctx) => {
      const rows = ctx.ledger
        .filter(e => (!a.factory_id || e.factoryId === a.factory_id) && (!a.status || e.status === a.status))
        .slice(0, Number(a.limit ?? 20))
        .map(e => ({
          record_id: e.id, factory: ctx.factories.find(f => f.id === e.factoryId)?.name ?? 'Unknown',
          measures: e.interventionIds.map(id => interventions.find(i => i.id === id)?.name ?? id),
          adoption_pct: e.adoption, reduction_tco2e_yr_as_recorded: r2(e.reduction),
          net_operating_savings_inr_yr_as_recorded: r2(e.operatingSavings), capex_inr_one_off: e.capex,
          realised_savings_inr: e.realisedSavings, status: e.status, created_at: e.createdAt,
          registry_verified: false, simulated: true,
        }));
      return { ok: true, data: { count: rows.length, records: rows, note: '"Issued" is a simulated label. It does not mean registry verification and creates no revenue.' }, refs: rows.map(r => ({ kind: 'ledger' as const, id: r.record_id, label: r.record_id, to: `/ledger?record=${r.record_id}` })) };
    },
  },
  {
    def: def('portfolio_totals', 'Deduplicated ledger totals. The largest reduction per factory and emission source is kept; alternatives never sum.', {}),
    run: (_a, ctx) => {
      try {
        const t = portfolioTotals(ctx.ledger, ctx.factories);
        return { ok: true, data: { records: ctx.ledger.length, deduplicated_reduction_tco2e_yr: r2(t.reduction), net_operating_savings_inr_yr: r2(t.operatingSavings), realised_savings_inr: t.realisedSavings, dedupe_rule: 'Largest reduction per factory and emission source; alternatives never sum.', registry_verified: false } };
      } catch (e) { return { ok: false, error: (e as Error).message, hint: 'A ledger entry is inconsistent with the current fixtures.' }; }
    },
  },
  {
    def: def('reference_constants', 'Every market assumption, emission factor and disclaimer this demonstration uses, with its fixture date.', {}),
    run: () => ({
      ok: true,
      data: {
        fixture_date: FIXTURE_DATE,
        carbon_price_eur_per_tco2e: reference.carbonEUR, eur_to_inr: reference.eurINR,
        credit_band_inr_per_unit: [reference.creditLowINR, reference.creditHighINR], credit_modelling_factor: CREDIT_FACTOR,
        grid_factor_tco2e_per_kwh: reference.gridFactor, coal_factor_tco2e_per_tonne: reference.coalFactor, waste_factor_tco2e_per_tonne: reference.wasteFactor,
        sectors, sources: Object.fromEntries(sources.map(s => [s, sourceLabels[s]])),
        units: { emissions: 'tCO2e/yr', intensity: 'tCO2e/t', money: 'INR/yr unless labelled capex, which is one-off', payback: 'months', adoption: 'percent 0-100' },
        disclaimers: ['Illustrative figures from typed fixtures, not live quotes.', 'Nothing is registry verified; no credits are issued or sold.', 'Realised savings are always zero in this demonstration.'],
      },
    }),
  },
  {
    def: def('get_process_flow', 'The schematic production stages for a sector.', { sector: SECTOR_ENUM }, ['sector']),
    run: a => {
      const s = a.sector as Sector;
      if (!processFlows[s]) return { ok: false, error: `Unknown sector "${a.sector}".`, hint: `Valid sectors: ${sectors.join(', ')}.` };
      return { ok: true, data: { sector: s, stages: processFlows[s], note: 'Schematic, not an engineering diagram.' } };
    },
  },
  {
    def: def('portfolio_digest', 'The full deterministic portfolio digest paragraph. Use only when the user asks for an overall summary.', {}),
    run: (_a, ctx) => {
      try { return { ok: true, data: { digest: generateDigest(ctx.factories, ctx.ledger, ctx.intake) } }; }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    },
  },
  {
    def: def('navigate', 'Open a screen in the application. Navigation is reversible and needs no confirmation.', {
      path: { type: 'string', enum: ['/', '/intake', '/factories', '/factory-profile', '/interventions', '/credits', '/ledger', '/alerts'], description: "Use '/factory-profile' with a factory_id to send the user to the page where a baseline is entered." },
      factory_id: { type: 'string', description: 'With /factories opens that factory; with / selects it on the map.' },
      intervention_id: { type: 'string', enum: INTERVENTION_IDS, description: 'With /interventions opens that measure.' },
    }, ['path']),
    run: (a, ctx) => {
      let to = String(a.path);
      if (a.factory_id && !findFactory(ctx, a.factory_id)) return notFound(a.factory_id);
      if (to === '/factory-profile') {
        if (!a.factory_id) return { ok: false, error: 'factory_id is required for the profile page.', hint: 'Call list_factories for valid ids.' };
        to = `/factories/${a.factory_id}/profile`;
      }
      else if (to === '/factories' && a.factory_id) to = `/factories/${a.factory_id}`;
      else if (to === '/' && a.factory_id) to = `/?factory=${a.factory_id}`;
      else if (to === '/interventions' && a.intervention_id) to = `/interventions/${a.intervention_id}${a.factory_id ? `?factory=${a.factory_id}` : ''}`;
      else if ((to === '/credits' || to === '/intake') && a.factory_id) to = `${to}?factory=${a.factory_id}`;
      ctx.actions.navigate(to);
      return { ok: true, data: { navigated_to: to, note: 'The user has been moved to this screen. Say so in one short clause.' }, refs: [{ kind: 'route', id: to, label: to, to }] };
    },
  },
  {
    def: def('select_factory', 'Select a factory on the Command Map and bring its card into view.', { factory_id: { type: 'string' } }, ['factory_id']),
    run: (a, ctx) => {
      const f = findFactory(ctx, a.factory_id);
      if (!f) return notFound(a.factory_id);
      ctx.actions.selectFactory(f.id);
      return { ok: true, data: { selected: f.name, on: '/' }, refs: [refFactory(f)] };
    },
  },
  {
    def: def('set_view', 'Filter the Command Map by sector and choose the ranking metric.', {
      sector: { type: 'string', enum: [...sectors, 'all'] },
      ranking: { type: 'string', enum: ['total', 'intensity'] },
    }),
    run: (a, ctx) => {
      ctx.actions.setView({ sector: a.sector as Sector | 'all' | undefined, ranking: a.ranking });
      return { ok: true, data: { sector: a.sector ?? 'unchanged', ranking: a.ranking ?? 'unchanged' } };
    },
  },
  {
    def: def('record_estimate', 'Record a scenario to the session ledger. Two phases: call without a token to propose it, then only after the user confirms in the interface, call again with the returned token.', {
      factory_id: { type: 'string' }, intervention_ids: MEASURE_ARRAY,
      adoption: { type: 'number', minimum: 0, maximum: 100 },
      confirmation_token: { type: 'string', description: 'Omit on the first call. Supply only the token returned by this tool after the user has confirmed.' },
    }, ['factory_id', 'intervention_ids', 'adoption']),
    run: (a, ctx) => {
      const f = findFactory(ctx, a.factory_id);
      if (!f) return notFound(a.factory_id);
      const ids: string[] = Array.isArray(a.intervention_ids) ? a.intervention_ids.map(String) : [];
      const items = ids.map(id => interventions.find(i => i.id === id)).filter(Boolean) as Intervention[];
      if (items.length !== ids.length) return { ok: false, error: `Unknown measure id in ${JSON.stringify(ids)}.`, hint: `Valid ids: ${INTERVENTION_IDS.join(', ')}.` };
      const adoption = Number(a.adoption);

      if (!a.confirmation_token) {
        const preview = scenarioBrief(scenario(f, items, adoption)); // throws map to a recoverable error; nothing is parked
        const { token } = ctx.proposeAction({ kind: 'record_estimate', factoryId: f.id, factoryName: f.name, interventionIds: ids, interventionNames: items.map(i => i.name), adoption, preview });
        return { ok: true, data: { status: 'awaiting_confirmation', confirmation_token: token, preview, instruction: 'Nothing has been recorded. Summarise the preview in one sentence and stop; the user confirms in the interface. Do not call this tool again in this turn.' } };
      }

      const pending = ctx.consumePending(String(a.confirmation_token));
      if (!pending) return { ok: false, error: 'That confirmation is not pending, has expired, or was declined.', hint: 'Nothing was recorded. Propose the estimate again without a token if the user still wants it.' };
      if (pending.factoryId !== f.id || pending.adoption !== adoption || [...pending.interventionIds].sort().join() !== [...ids].sort().join()) {
        return { ok: false, error: 'The confirmed proposal does not match these arguments.', hint: 'Propose again without a token.' };
      }
      const r = ctx.actions.record(pending.factoryId, pending.interventionIds, pending.adoption);
      return {
        ok: true,
        data: { recorded: r.added, record_id: r.id, status: 'Estimated', registry_verified: false, simulated: true, note: r.added ? 'Recorded to the session ledger. No realised savings or credit revenue was created.' : 'An identical estimate already existed; nothing new was recorded.' },
        refs: [{ kind: 'ledger', id: r.id, label: r.id, to: `/ledger?record=${r.id}` }],
      };
    },
  },
];

export const toolDefs: ToolDef[] = tools.map(t => t.def);

/** Never throws. Every failure becomes a tool message the model can recover from. */
export function runTool(name: string, rawArgs: string, ctx: ToolContext): ToolResult {
  const tool = tools.find(t => t.def.function.name === name);
  if (!tool) return { ok: false, error: `Unknown tool "${name}".`, hint: `Available: ${tools.map(t => t.def.function.name).join(', ')}` };
  let args: Record<string, unknown> = {};
  if (rawArgs?.trim()) {
    try { const parsed = JSON.parse(rawArgs); if (parsed && typeof parsed === 'object') args = parsed; }
    catch { return { ok: false, error: 'Arguments were not valid JSON.', hint: 'Send a single JSON object matching the schema.' }; }
  }
  try { return tool.run(args, ctx); }
  catch (e) {
    const message = e instanceof Error ? e.message : 'The calculation failed.';
    return { ok: false, error: message, hint: SCENARIO_HINTS[message] };
  }
}
