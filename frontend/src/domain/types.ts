export type Sector = 'Steel' | 'Cement' | 'Textiles' | 'Chemicals';
export type Confidence = 'High' | 'Medium' | 'Low';
export type Source = 'fuel' | 'electricity' | 'process' | 'waste';
export type MaterialStream = {
  name: string;
  tonnesPerYear: number;
  costPerTonne: number;
  recycledShare: number;
};
/** What an operator can say about a plant without an audit — the model's inputs. */
export type PlantDescriptors = {
  route: string;
  fuel: string;
  region: string;
  ageYears: number;
  headcount: number;
};
export type Factory = {
  id: string;
  name: string;
  city: string;
  state: string;
  sector: Sector;
  coordinates: [number, number] | null;
  baseline: number | null;
  production: number | null;
  confidence: Confidence;
  costs: Record<Source, number>;
  hotspots: Record<Source, number>;
  wasteTonnes: number;
  exportShare: number;
  history: { month: string; emissions: number }[];
  materials: MaterialStream[];
  /** Captured on the profile page; absent for seeded plants until someone describes them. */
  profile?: PlantDescriptors;
  readiness: {
    baselineDocumented: boolean;
    additionality: boolean;
    monitoring: boolean;
    independentReview: boolean;
  };
};
export type Intervention = {
  id: string;
  name: string;
  category: string;
  description: string;
  sectors: Sector[];
  source: Source;
  reductionRate: number;
  costSavingRate: number;
  capex: number;
  annualOpex: number;
  duration: string;
  complexity: 'Low' | 'Medium' | 'High';
  compatibleWith: string[];
  steps: string[];
  /** Addressable tCO2e at the reference plant the published capex is priced for. */
  addressableRef: number;
  /** Circular measures only make sense once the site has declared what it buys and recovers. */
  requiresMaterial?: boolean;
};
export type LedgerStatus = 'Estimated' | 'In review' | 'Issued';
export type LedgerEntry = {
  id: string;
  factoryId: string;
  interventionIds: string[];
  adoption: number;
  reduction: number;
  operatingSavings: number;
  capex: number;
  realisedSavings: number;
  status: LedgerStatus;
  createdAt: string;
  simulated: true;
};
export type IntakeRecord = {
  id: string;
  factoryId: string;
  sample: string;
  fileName: string | null;
  fileSize: number | null;
  quantity: number;
  factor: number;
  unit: string;
  costRate: number;
  emissions: number;
  cost: number;
  period: string;
  /** How the figures were obtained: read from a document by the API, or a labelled sample. */
  method?: 'table' | 'pdf-text' | 'text' | 'sample' | 'manual';
  evidence?: string[];
};
export type InboxItem = {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  type: 'digest' | 'exposure' | 'baseline';
};
