import type { Factory, Intervention, MaterialStream, Sector, Source, LedgerEntry, InboxItem } from './types';

export const FIXTURE_DATE = '01 Feb 2026';
export const sectors: Sector[] = ['Steel', 'Cement', 'Textiles', 'Chemicals'];
export const sources: Source[] = ['fuel', 'electricity', 'process', 'waste'];
export const sourceLabels: Record<Source, string> = {
  fuel: 'Thermal energy',
  electricity: 'Electricity',
  process: 'Process emissions',
  waste: 'Waste & effluent',
};
export const reference = {
  carbonEUR: 75,
  eurINR: 90,
  creditLowINR: 600,
  creditHighINR: 1500,
  gridFactor: 0.000716,
  coalFactor: 2.42,
  wasteFactor: 0.45,
  // Unit prices per PHYSICAL unit — kWh, tonne of coal, tonne of waste, tonne of CO2e for process.
  gridRateINR: 7.5,
  coalRateINR: 8200,
  wasteRateINR: 1400,
  processRateINR: 600,
};
export const processFlows: Record<Sector, string[]> = {
  Steel: ['Raw materials', 'Coke & sinter', 'Blast furnace', 'Steelmaking', 'Casting & rolling'],
  Cement: ['Limestone', 'Raw grinding', 'Preheater', 'Clinker kiln', 'Cement grinding'],
  Textiles: ['Fibre preparation', 'Spinning', 'Weaving', 'Dyeing & finishing', 'Effluent treatment'],
  Chemicals: ['Feedstock', 'Reaction', 'Separation', 'Purification', 'Waste treatment'],
};
const sectorSplit: Record<Sector, number[]> = {
  Steel: [0.5, 0.2, 0.27, 0.03],
  Cement: [0.27, 0.12, 0.59, 0.02],
  Textiles: [0.42, 0.43, 0.05, 0.1],
  Chemicals: [0.35, 0.3, 0.25, 0.1],
};
type FactorySeed = [string, string, string, string, Sector, number, number, number, number, number];
const seeds: FactorySeed[] = [
  [
    'bhilai-steel',
    'Bhilai Steel Works',
    'Bhilai',
    'Chhattisgarh',
    'Steel',
    21.21,
    81.38,
    842000,
    410000,
    0.18,
  ],
  ['angul-aluminium', 'Angul Metals & Alloys', 'Angul', 'Odisha', 'Steel', 20.84, 85.1, 685000, 350000, 0.25],
  [
    'chandrapur-cement',
    'Chandrapur Cement',
    'Chandrapur',
    'Maharashtra',
    'Cement',
    19.96,
    79.29,
    524000,
    690000,
    0.12,
  ],
  [
    'jamshedpur-steel',
    'Jamshedpur Ironworks',
    'Jamshedpur',
    'Jharkhand',
    'Steel',
    22.8,
    86.2,
    478000,
    260000,
    0.21,
  ],
  [
    'satna-cement',
    'Satna Cement Works',
    'Satna',
    'Madhya Pradesh',
    'Cement',
    24.58,
    80.83,
    396000,
    550000,
    0.08,
  ],
  ['dahej-chemicals', 'Dahej Chemicals', 'Dahej', 'Gujarat', 'Chemicals', 21.7, 72.57, 287000, 145000, 0.3],
  ['ballari-steel', 'Ballari Steel Co.', 'Ballari', 'Karnataka', 'Steel', 15.14, 76.92, 263000, 150000, 0.15],
  [
    'chittorgarh-cement',
    'Chittor Cement',
    'Chittorgarh',
    'Rajasthan',
    'Cement',
    24.89,
    74.63,
    241000,
    340000,
    0.1,
  ],
  [
    'vadodara-chemicals',
    'Vadodara Chemical Works',
    'Vadodara',
    'Gujarat',
    'Chemicals',
    22.31,
    73.18,
    186000,
    110000,
    0.27,
  ],
  ['surat-textiles', 'Surat Textile Mills', 'Surat', 'Gujarat', 'Textiles', 21.17, 72.83, 94000, 38000, 0.35],
  [
    'ludhiana-textiles',
    'Ludhiana Spinning Co.',
    'Ludhiana',
    'Punjab',
    'Textiles',
    30.9,
    75.86,
    72000,
    31000,
    0.2,
  ],
  [
    'tiruppur-textiles',
    'Tiruppur Textiles',
    'Tiruppur',
    'Tamil Nadu',
    'Textiles',
    11.11,
    77.34,
    58000,
    26000,
    0.4,
  ],
];
// Sector-typical input ratios (tonnes of material per tonne of product) and prices. These are
// reference constants like the emission factors; the TONNAGE is computed from each factory's own
// production, so no two factories carry the same material figures.
const materialTemplates: Record<
  Sector,
  { name: string; perTonneOfProduct: number; costPerTonne: number; recycledShare: number }[]
> = {
  Steel: [
    { name: 'Iron ore', perTonneOfProduct: 1.6, costPerTonne: 7400, recycledShare: 0 },
    { name: 'Coking coal', perTonneOfProduct: 0.63, costPerTonne: 12500, recycledShare: 0 },
    { name: 'Steel scrap', perTonneOfProduct: 0.22, costPerTonne: 32000, recycledShare: 1 },
    { name: 'Limestone flux', perTonneOfProduct: 0.27, costPerTonne: 1800, recycledShare: 0 },
  ],
  Cement: [
    { name: 'Limestone', perTonneOfProduct: 1.25, costPerTonne: 900, recycledShare: 0 },
    { name: 'Clinker', perTonneOfProduct: 0.72, costPerTonne: 4600, recycledShare: 0 },
    { name: 'Fly ash', perTonneOfProduct: 0.18, costPerTonne: 1200, recycledShare: 1 },
    { name: 'Gypsum', perTonneOfProduct: 0.05, costPerTonne: 2600, recycledShare: 0 },
  ],
  Textiles: [
    { name: 'Raw cotton', perTonneOfProduct: 1.12, costPerTonne: 145000, recycledShare: 0 },
    { name: 'Polyester staple', perTonneOfProduct: 0.34, costPerTonne: 98000, recycledShare: 0 },
    { name: 'Dyes and chemicals', perTonneOfProduct: 0.09, costPerTonne: 210000, recycledShare: 0 },
    { name: 'Recovered fibre', perTonneOfProduct: 0.08, costPerTonne: 46000, recycledShare: 1 },
  ],
  Chemicals: [
    { name: 'Naphtha feedstock', perTonneOfProduct: 1.15, costPerTonne: 62000, recycledShare: 0 },
    { name: 'Caustic soda', perTonneOfProduct: 0.21, costPerTonne: 38000, recycledShare: 0 },
    { name: 'Process solvents', perTonneOfProduct: 0.14, costPerTonne: 85000, recycledShare: 0.3 },
    { name: 'Recovered solvent', perTonneOfProduct: 0.06, costPerTonne: 41000, recycledShare: 1 },
  ],
};
export const materialsFor = (sector: Sector, production: number): MaterialStream[] =>
  materialTemplates[sector].map(m => ({
    name: m.name,
    tonnesPerYear: Math.round(production * m.perTonneOfProduct),
    costPerTonne: m.costPerTonne,
    recycledShare: m.recycledShare,
  }));
const historyWeights = [0.09, 0.085, 0.09, 0.08, 0.085, 0.08, 0.08, 0.075, 0.08, 0.085, 0.085, 0.085];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Spread an annual figure over the same seasonal shape the fixtures use, so a user-entered
// baseline renders a history chart instead of an empty panel.
export const historyFor = (baseline: number) =>
  historyWeights.map((w, i) => ({ month: MONTHS[i], emissions: Math.round(baseline * w) }));
export const factories: Factory[] = seeds.map(
  ([id, name, city, state, sector, lat, lng, baseline, production, exportShare], index) => {
    const hotspots = Object.fromEntries(
      sources.map((s, i) => [s, Math.round(baseline * sectorSplit[sector][i])]),
    ) as Record<Source, number>;
    // Physical quantities first, so the tonnage shown on screen and the cost beside it agree exactly.
    const coalTonnes = hotspots.fuel / reference.coalFactor,
      kWh = hotspots.electricity / reference.gridFactor;
    const wasteTonnes = Math.round(hotspots.waste / reference.wasteFactor);
    return {
      id,
      name,
      city,
      state,
      sector,
      coordinates: [lat, lng],
      baseline,
      production,
      exportShare,
      confidence: index % 4 === 2 ? 'Medium' : 'High',
      hotspots,
      costs: {
        fuel: coalTonnes * reference.coalRateINR,
        electricity: kWh * reference.gridRateINR,
        process: hotspots.process * reference.processRateINR,
        waste: wasteTonnes * reference.wasteRateINR,
      },
      wasteTonnes,
      history: historyFor(baseline),
      materials: materialsFor(sector, production),
      readiness: {
        baselineDocumented: index % 4 !== 2,
        additionality: index % 3 === 0,
        monitoring: index % 2 === 0,
        independentReview: false,
      },
    };
  },
);
export const interventions: Intervention[] = [
  {
    id: 'waste-heat',
    name: 'Waste heat recovery',
    category: 'Energy efficiency',
    description: 'Recover process heat and displace purchased thermal energy with a heat-recovery system.',
    sectors: ['Steel', 'Cement', 'Chemicals'],
    source: 'fuel',
    reductionRate: 0.18,
    costSavingRate: 0.18,
    capex: 85000000,
    annualOpex: 2500000,
    duration: '6–9 months',
    complexity: 'Medium',
    compatibleWith: ['solar', 'motor-efficiency', 'waste-recovery', 'clinker', 'material-substitution'],
    addressableRef: 0,
    steps: [
      'Complete a thermal energy audit',
      'Size the recovery system',
      'Install heat exchangers and metering',
      'Commission and monitor displaced fuel',
    ],
  },
  {
    id: 'solar',
    name: 'On-site solar generation',
    category: 'Renewable energy',
    description: 'Replace a portion of grid electricity with on-site solar generation.',
    sectors: sectors,
    source: 'electricity',
    reductionRate: 0.22,
    costSavingRate: 0.2,
    capex: 120000000,
    annualOpex: 1800000,
    duration: '4–6 months',
    complexity: 'Medium',
    compatibleWith: ['waste-heat', 'boiler', 'waste-recovery', 'clinker', 'material-substitution'],
    addressableRef: 0,
    steps: [
      'Assess usable rooftop and land',
      'Validate grid interconnection',
      'Install and commission the array',
      'Meter self-consumed generation',
    ],
  },
  {
    id: 'motor-efficiency',
    name: 'High-efficiency drives',
    category: 'Energy efficiency',
    description: 'Upgrade motors and variable-speed drives to reduce electricity demand.',
    sectors: sectors,
    source: 'electricity',
    reductionRate: 0.12,
    costSavingRate: 0.12,
    capex: 28000000,
    annualOpex: 400000,
    duration: '2–4 months',
    complexity: 'Low',
    compatibleWith: ['waste-heat', 'boiler', 'waste-recovery', 'clinker', 'material-substitution'],
    addressableRef: 0,
    steps: [
      'Log operating load profiles',
      'Select high-efficiency motors',
      'Upgrade drives during shutdown',
      'Validate energy savings',
    ],
  },
  {
    id: 'boiler',
    name: 'Boiler optimisation',
    category: 'Operational improvement',
    description: 'Improve combustion settings and maintenance practices with existing equipment.',
    sectors: ['Steel', 'Chemicals', 'Textiles'],
    source: 'fuel',
    reductionRate: 0.06,
    costSavingRate: 0.06,
    capex: 0,
    annualOpex: 600000,
    duration: '2–4 weeks',
    complexity: 'Low',
    compatibleWith: ['solar', 'motor-efficiency', 'waste-recovery', 'material-substitution'],
    addressableRef: 0,
    steps: [
      'Measure excess oxygen',
      'Tune air-to-fuel ratio',
      'Repair insulation and steam leaks',
      'Monitor fuel per unit of output',
    ],
  },
  {
    id: 'clinker',
    name: 'Clinker substitution',
    category: 'Process innovation',
    description: 'Replace a share of clinker with suitable supplementary cementitious materials.',
    sectors: ['Cement'],
    source: 'process',
    reductionRate: 0.16,
    costSavingRate: 0.14,
    capex: 55000000,
    annualOpex: 1500000,
    duration: '6–12 months',
    complexity: 'High',
    compatibleWith: ['waste-heat', 'solar', 'motor-efficiency', 'waste-recovery'],
    addressableRef: 0,
    steps: [
      'Qualify substitute materials',
      'Validate product performance',
      'Adapt blending and handling',
      'Document the revised clinker ratio',
    ],
  },
  {
    id: 'waste-recovery',
    name: 'Waste & water recovery',
    category: 'Circularity',
    description: 'Recover usable materials and improve effluent treatment to reduce waste-related emissions.',
    sectors: sectors,
    source: 'waste',
    reductionRate: 0.3,
    costSavingRate: 0.24,
    capex: 32000000,
    annualOpex: 950000,
    duration: '4–8 months',
    complexity: 'Medium',
    compatibleWith: ['waste-heat', 'solar', 'motor-efficiency', 'boiler', 'clinker', 'material-substitution'],
    addressableRef: 0,
    steps: [
      'Characterise waste streams',
      'Assess recovery opportunities',
      'Install segregation and treatment',
      'Track recovery and disposal volumes',
    ],
  },
  {
    id: 'material-substitution',
    name: 'Recycled feedstock substitution',
    category: 'Circularity',
    description:
      'Replace a share of virgin feedstock with recovered or secondary material from a declared stream.',
    sectors: sectors,
    source: 'process',
    reductionRate: 0.11,
    costSavingRate: 0.09,
    capex: 24000000,
    annualOpex: 700000,
    duration: '3\u20136 months',
    complexity: 'Medium',
    compatibleWith: ['waste-heat', 'solar', 'motor-efficiency', 'boiler', 'waste-recovery'],
    requiresMaterial: true,
    addressableRef: 0,
    steps: [
      'Map incoming material streams and recovered fractions',
      'Qualify a secondary source against product specification',
      'Trial a substitution rate on one line',
      'Track substituted tonnage and avoided virgin purchase',
    ],
  },
];
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b),
    m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
// Anchor the capex curve to the median eligible plant, so the published price stays the price for a
// typical factory and only genuinely large or small sites move away from it.
interventions.forEach(i => {
  const addressable = factories
    .filter(f => f.baseline !== null && i.sectors.includes(f.sector))
    .map(f => f.hotspots[i.source] * i.reductionRate);
  i.addressableRef = addressable.length ? median(addressable) : 0;
});
export const bundles = [
  {
    id: 'thermal-solar',
    name: 'Thermal + solar',
    interventionIds: ['waste-heat', 'solar'],
    compatible: true as const,
  },
  {
    id: 'efficient-circular',
    name: 'Efficient + circular',
    interventionIds: ['motor-efficiency', 'waste-recovery'],
    compatible: true as const,
  },
];
export const initialInbox: InboxItem[] = [
  {
    id: 'alert-1',
    title: 'Bhilai leads the emissions ranking',
    body: 'Bhilai Steel Works accounts for 8,42,000 tCO₂e in the illustrative 2025 baseline. Thermal energy represents 50% of this total. Review the baseline and thermal interventions before recording an estimate.',
    date: '2026-02-01T09:00:00Z',
    read: false,
    type: 'baseline',
  },
  {
    id: 'alert-2',
    title: 'Export exposure needs a closer look',
    body: 'Steel and cement factory scenarios use a €75/tCO₂ reference and ₹90/€ fixture, dated 01 Feb 2026. These gross exposure scenarios are not a CBAM tax liability or legal assessment.',
    date: '2026-02-01T08:30:00Z',
    read: false,
    type: 'exposure',
  },
  {
    id: 'alert-3',
    title: 'Baseline documentation gaps',
    body: 'Chandrapur Cement, Ballari Steel Co. and Ludhiana Spinning Co. have incomplete baseline documentation in this demonstration. Confidence labels do not establish verification readiness.',
    date: '2026-01-31T14:00:00Z',
    read: true,
    type: 'baseline',
  },
];
export const initialLedger: LedgerEntry[] = [];
