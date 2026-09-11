import type { Factory, Intervention, Sector, Source, LedgerEntry, InboxItem } from './types';

export const FIXTURE_DATE = '01 Feb 2026';
export const sectors: Sector[] = ['Steel', 'Cement', 'Textiles', 'Chemicals'];
export const sources: Source[] = ['fuel', 'electricity', 'process', 'waste'];
export const sourceLabels: Record<Source, string> = { fuel: 'Thermal energy', electricity: 'Electricity', process: 'Process emissions', waste: 'Waste & effluent' };
export const reference = { carbonEUR: 75, eurINR: 90, creditLowINR: 600, creditHighINR: 1500, gridFactor: 0.000716, coalFactor: 2.42, wasteFactor: 0.45 };
export const processFlows: Record<Sector, string[]> = {
  Steel: ['Raw materials', 'Coke & sinter', 'Blast furnace', 'Steelmaking', 'Casting & rolling'],
  Cement: ['Limestone', 'Raw grinding', 'Preheater', 'Clinker kiln', 'Cement grinding'],
  Textiles: ['Fibre preparation', 'Spinning', 'Weaving', 'Dyeing & finishing', 'Effluent treatment'],
  Chemicals: ['Feedstock', 'Reaction', 'Separation', 'Purification', 'Waste treatment'],
};
const sectorSplit: Record<Sector, number[]> = { Steel: [0.50, 0.20, 0.27, 0.03], Cement: [0.27, 0.12, 0.59, 0.02], Textiles: [0.42, 0.43, 0.05, 0.10], Chemicals: [0.35, 0.30, 0.25, 0.10] };
type FactorySeed = [string, string, string, string, Sector, number, number, number, number, number];
const seeds: FactorySeed[] = [
  ['bhilai-steel', 'Bhilai Steel Works', 'Bhilai', 'Chhattisgarh', 'Steel', 21.21, 81.38, 842000, 410000, 0.18],
  ['angul-aluminium', 'Angul Metals & Alloys', 'Angul', 'Odisha', 'Steel', 20.84, 85.10, 685000, 350000, 0.25],
  ['chandrapur-cement', 'Chandrapur Cement', 'Chandrapur', 'Maharashtra', 'Cement', 19.96, 79.29, 524000, 690000, 0.12],
  ['jamshedpur-steel', 'Jamshedpur Ironworks', 'Jamshedpur', 'Jharkhand', 'Steel', 22.80, 86.20, 478000, 260000, 0.21],
  ['satna-cement', 'Satna Cement Works', 'Satna', 'Madhya Pradesh', 'Cement', 24.58, 80.83, 396000, 550000, 0.08],
  ['dahej-chemicals', 'Dahej Chemicals', 'Dahej', 'Gujarat', 'Chemicals', 21.70, 72.57, 287000, 145000, 0.30],
  ['ballari-steel', 'Ballari Steel Co.', 'Ballari', 'Karnataka', 'Steel', 15.14, 76.92, 263000, 150000, 0.15],
  ['chittorgarh-cement', 'Chittor Cement', 'Chittorgarh', 'Rajasthan', 'Cement', 24.89, 74.63, 241000, 340000, 0.10],
  ['vadodara-chemicals', 'Vadodara Chemical Works', 'Vadodara', 'Gujarat', 'Chemicals', 22.31, 73.18, 186000, 110000, 0.27],
  ['surat-textiles', 'Surat Textile Mills', 'Surat', 'Gujarat', 'Textiles', 21.17, 72.83, 94000, 38000, 0.35],
  ['ludhiana-textiles', 'Ludhiana Spinning Co.', 'Ludhiana', 'Punjab', 'Textiles', 30.90, 75.86, 72000, 31000, 0.20],
  ['tiruppur-textiles', 'Tiruppur Textiles', 'Tiruppur', 'Tamil Nadu', 'Textiles', 11.11, 77.34, 58000, 26000, 0.40],
];
const historyWeights = [0.09, 0.085, 0.09, 0.08, 0.085, 0.08, 0.08, 0.075, 0.08, 0.085, 0.085, 0.085];
export const factories: Factory[] = seeds.map(([id, name, city, state, sector, lat, lng, baseline, production, exportShare], index) => {
  const hotspots = Object.fromEntries(sources.map((s, i) => [s, Math.round(baseline * sectorSplit[sector][i])])) as Record<Source, number>;
  return { id, name, city, state, sector, coordinates: [lat, lng], baseline, production,
    exportShare, confidence: index % 4 === 2 ? 'Medium' : 'High', hotspots,
    costs: { fuel: hotspots.fuel * 3000, electricity: hotspots.electricity / reference.gridFactor * 7.5, process: hotspots.process * 600, waste: hotspots.waste * 1400 },
    wasteTonnes: Math.round(hotspots.waste / reference.wasteFactor),
    history: historyWeights.map((w, i) => ({ month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i], emissions: Math.round(baseline * w) })),
    readiness: { baselineDocumented: index % 4 !== 2, additionality: index % 3 === 0, monitoring: index % 2 === 0, independentReview: false },
  };
});
export const interventions: Intervention[] = [
  { id: 'waste-heat', name: 'Waste heat recovery', category: 'Energy efficiency', description: 'Recover process heat and displace purchased thermal energy with a heat-recovery system.', sectors: ['Steel', 'Cement', 'Chemicals'], source: 'fuel', reductionRate: .18, costSavingRate: .18, capex: 85000000, annualOpex: 2500000, duration: '6–9 months', complexity: 'Medium', compatibleWith: ['solar', 'motor-efficiency', 'waste-recovery', 'clinker'], steps: ['Complete a thermal energy audit', 'Size the recovery system', 'Install heat exchangers and metering', 'Commission and monitor displaced fuel'] },
  { id: 'solar', name: 'On-site solar generation', category: 'Renewable energy', description: 'Replace a portion of grid electricity with on-site solar generation.', sectors: sectors, source: 'electricity', reductionRate: .22, costSavingRate: .20, capex: 120000000, annualOpex: 1800000, duration: '4–6 months', complexity: 'Medium', compatibleWith: ['waste-heat', 'boiler', 'waste-recovery', 'clinker'], steps: ['Assess usable rooftop and land', 'Validate grid interconnection', 'Install and commission the array', 'Meter self-consumed generation'] },
  { id: 'motor-efficiency', name: 'High-efficiency drives', category: 'Energy efficiency', description: 'Upgrade motors and variable-speed drives to reduce electricity demand.', sectors: sectors, source: 'electricity', reductionRate: .12, costSavingRate: .12, capex: 28000000, annualOpex: 400000, duration: '2–4 months', complexity: 'Low', compatibleWith: ['waste-heat', 'boiler', 'waste-recovery', 'clinker'], steps: ['Log operating load profiles', 'Select high-efficiency motors', 'Upgrade drives during shutdown', 'Validate energy savings'] },
  { id: 'boiler', name: 'Boiler optimisation', category: 'Operational improvement', description: 'Improve combustion settings and maintenance practices with existing equipment.', sectors: ['Steel', 'Chemicals', 'Textiles'], source: 'fuel', reductionRate: .06, costSavingRate: .06, capex: 0, annualOpex: 600000, duration: '2–4 weeks', complexity: 'Low', compatibleWith: ['solar', 'motor-efficiency', 'waste-recovery'], steps: ['Measure excess oxygen', 'Tune air-to-fuel ratio', 'Repair insulation and steam leaks', 'Monitor fuel per unit of output'] },
  { id: 'clinker', name: 'Clinker substitution', category: 'Process innovation', description: 'Replace a share of clinker with suitable supplementary cementitious materials.', sectors: ['Cement'], source: 'process', reductionRate: .16, costSavingRate: .14, capex: 55000000, annualOpex: 1500000, duration: '6–12 months', complexity: 'High', compatibleWith: ['waste-heat', 'solar', 'motor-efficiency', 'waste-recovery'], steps: ['Qualify substitute materials', 'Validate product performance', 'Adapt blending and handling', 'Document the revised clinker ratio'] },
  { id: 'waste-recovery', name: 'Waste & water recovery', category: 'Circularity', description: 'Recover usable materials and improve effluent treatment to reduce waste-related emissions.', sectors: sectors, source: 'waste', reductionRate: .30, costSavingRate: .24, capex: 32000000, annualOpex: 950000, duration: '4–8 months', complexity: 'Medium', compatibleWith: ['waste-heat', 'solar', 'motor-efficiency', 'boiler', 'clinker'], steps: ['Characterise waste streams', 'Assess recovery opportunities', 'Install segregation and treatment', 'Track recovery and disposal volumes'] },
];
export const bundles = [{ id: 'thermal-solar', name: 'Thermal + solar', interventionIds: ['waste-heat', 'solar'], compatible: true as const }, { id: 'efficient-circular', name: 'Efficient + circular', interventionIds: ['motor-efficiency', 'waste-recovery'], compatible: true as const }];
export const initialInbox: InboxItem[] = [
  { id: 'alert-1', title: 'Bhilai leads the emissions ranking', body: 'Bhilai Steel Works accounts for 842,000 tCO₂e in the illustrative 2025 baseline. Thermal energy represents 50% of this total. Review the baseline and thermal interventions before recording an estimate.', date: '2026-02-01T09:00:00Z', read: false, type: 'baseline' },
  { id: 'alert-2', title: 'Export exposure needs a closer look', body: 'Steel and cement factory scenarios use a €75/tCO₂ reference and ₹90/€ fixture, dated 01 Feb 2026. These gross exposure scenarios are not a CBAM tax liability or legal assessment.', date: '2026-02-01T08:30:00Z', read: false, type: 'exposure' },
  { id: 'alert-3', title: 'Baseline documentation gaps', body: 'Chandrapur Cement, Ballari Steel Co. and Ludhiana Spinning Co. have incomplete baseline documentation in this demonstration. Confidence labels do not establish verification readiness.', date: '2026-01-31T14:00:00Z', read: true, type: 'baseline' },
];
export const initialLedger: LedgerEntry[] = [];