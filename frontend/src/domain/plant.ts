import type { Factory, PlantDescriptors } from './types';

/** Process routes the model was trained on, per sector. Mirrors ai/train.py ARCHETYPES. */
export const ROUTES: Record<string, string[]> = {
  Steel: ['BF-BOF', 'EAF'],
  Cement: ['Dry kiln', 'Wet kiln'],
  Textiles: ['Spinning', 'Wet processing'],
  Chemicals: ['Bulk', 'Specialty'],
};
export const FUELS = ['Coal', 'Natural gas', 'Biomass', 'Electric'];
export const REGIONS = ['North', 'West', 'South', 'East', 'Central'];

const REGION_BY_STATE: Record<string, string> = {
  Punjab: 'North',
  Haryana: 'North',
  Delhi: 'North',
  'Uttar Pradesh': 'North',
  Uttarakhand: 'North',
  Rajasthan: 'North',
  Gujarat: 'West',
  Maharashtra: 'West',
  Goa: 'West',
  Karnataka: 'South',
  'Tamil Nadu': 'South',
  Kerala: 'South',
  'Andhra Pradesh': 'South',
  Telangana: 'South',
  Odisha: 'East',
  'West Bengal': 'East',
  Jharkhand: 'East',
  Bihar: 'East',
  Chhattisgarh: 'Central',
  'Madhya Pradesh': 'Central',
};

/**
 * The descriptors the model needs, from what the plant has told us — or a sector default when it
 * has not. The analysis page shows exactly which were assumed so they can be corrected.
 */
export function defaultDescriptors(f: Factory): PlantDescriptors & { assumed: boolean } {
  if (f.profile) return { ...f.profile, assumed: false };
  return {
    route: ROUTES[f.sector]?.[0] ?? 'Bulk',
    fuel: f.sector === 'Textiles' ? 'Electric' : 'Coal',
    region: REGION_BY_STATE[f.state] ?? 'West',
    ageYears: 15,
    headcount: 150,
    assumed: true,
  };
}

/** The spend the model was trained on: fuel plus electricity bills. */
export const energySpendFor = (f: Factory) => (f.costs?.fuel ?? 0) + (f.costs?.electricity ?? 0);
