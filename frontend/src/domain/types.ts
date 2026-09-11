export type Sector = 'Steel' | 'Cement' | 'Textiles' | 'Chemicals';
export type Confidence = 'High' | 'Medium' | 'Low';
export type Source = 'fuel' | 'electricity' | 'process' | 'waste';
export type Factory = {
  id: string; name: string; city: string; state: string; sector: Sector;
  coordinates: [number, number] | null; baseline: number | null; production: number | null;
  confidence: Confidence; costs: Record<Source, number>; hotspots: Record<Source, number>;
  wasteTonnes: number; exportShare: number; history: { month: string; emissions: number }[];
  readiness: { baselineDocumented: boolean; additionality: boolean; monitoring: boolean; independentReview: boolean };
};
export type Intervention = {
  id: string; name: string; category: string; description: string; sectors: Sector[];
  source: Source; reductionRate: number; costSavingRate: number; capex: number;
  annualOpex: number; duration: string; complexity: 'Low' | 'Medium' | 'High';
  compatibleWith: string[]; steps: string[];
};
export type LedgerStatus = 'Estimated' | 'In review' | 'Issued';
export type LedgerEntry = {
  id: string; factoryId: string; interventionIds: string[]; adoption: number;
  reduction: number; operatingSavings: number; capex: number; realisedSavings: number;
  status: LedgerStatus; createdAt: string; simulated: true;
};
export type IntakeRecord = {
  id: string; factoryId: string; sample: string; fileName: string | null; fileSize: number | null;
  quantity: number; factor: number; unit: string; costRate: number; emissions: number; cost: number; period: string;
};
export type InboxItem = { id: string; title: string; body: string; date: string; read: boolean; type: 'digest' | 'exposure' | 'baseline' };