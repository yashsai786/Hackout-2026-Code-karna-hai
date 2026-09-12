/**
 * Context layers for the Command Map: what surrounds a plant, not the plant itself.
 *
 * Every entry is either a STATE-LEVEL classification from a public assessment or a well-known
 * INDICATIVE hub. None is a facility directory, none is live, and each marker carries its own source
 * so a reader never has to guess where a figure came from. Positions are centroids or town centres,
 * never facility boundaries.
 */
export type GeoLayerId = 'recyclers' | 'water' | 'solar' | 'wind';

export type GeoPoint = {
  id: string;
  layer: GeoLayerId;
  name: string;
  coordinates: [number, number];
  /** One line a reader can act on. */
  detail: string;
  /** Why it matters to an emissions decision. */
  relevance: string;
  source: string;
  level: 'state' | 'hub';
};

export const geoLayers: Record<
  GeoLayerId,
  { label: string; emoji: string; colour: string; note: string; source: string }
> = {
  recyclers: {
    label: 'Recycling hubs',
    emoji: '♻️',
    colour: '#0f9d58',
    note: 'Indicative hubs where secondary material is traded at scale — the supply side of a circular measure.',
    source: 'Public record of established recycling clusters · indicative, not a facility directory',
  },
  water: {
    label: 'Water stress',
    emoji: '💧',
    colour: '#1f7ae0',
    note: 'States under high or extremely high baseline water stress; effluent recovery and dry processes pay twice here.',
    source: 'WRI Aqueduct 4.0 (2023) · CGWB Dynamic Ground Water Resources (2023)',
  },
  solar: {
    label: 'Solar resource',
    emoji: '☀️',
    colour: '#e8a317',
    note: 'States with the strongest solar resource; on-site solar ranks higher and pays back sooner.',
    source: 'MNRE / NISE solar resource assessment · state-level classification',
  },
  wind: {
    label: 'Wind resource',
    emoji: '🌬️',
    colour: '#4b7bb5',
    note: 'States with the largest assessed wind potential at 120 m hub height; open-access wind is realistic here.',
    source: 'NIWE wind potential assessment at 120 m (2019) · state-level classification',
  },
};

const S = (
  layer: GeoLayerId,
  id: string,
  name: string,
  coordinates: [number, number],
  detail: string,
  relevance: string,
): GeoPoint => ({
  id: `${layer}-${id}`,
  layer,
  name,
  coordinates,
  detail,
  relevance,
  source: geoLayers[layer].source,
  level: 'state',
});
const H = (
  id: string,
  name: string,
  coordinates: [number, number],
  detail: string,
  relevance: string,
): GeoPoint => ({
  id: `recyclers-${id}`,
  layer: 'recyclers',
  name,
  coordinates,
  detail,
  relevance,
  source: geoLayers.recyclers.source,
  level: 'hub',
});

export const geoPoints: GeoPoint[] = [
  // ---- Recycling hubs (indicative, town centres) --------------------------------------------------
  H(
    'alang',
    'Alang–Sosiya, Gujarat',
    [21.4, 72.18],
    'Ship recycling yards · rerollable steel plate and scrap',
    'Secondary steel feedstock for EAF and rerolling routes',
  ),
  H(
    'mandi-gobindgarh',
    'Mandi Gobindgarh, Punjab',
    [30.67, 76.3],
    'Steel scrap trading and rerolling cluster',
    'Scrap supply for recycled-feedstock substitution in steel',
  ),
  H(
    'jamnagar',
    'Jamnagar, Gujarat',
    [22.47, 70.06],
    'Brass and non-ferrous scrap cluster',
    'Secondary metal supply for chemicals and engineering',
  ),
  H(
    'korba',
    'Korba, Chhattisgarh',
    [22.35, 82.68],
    'Fly ash from thermal stations supplied to cement and brick makers',
    'Clinker substitution and blended cement',
  ),
  H(
    'muzaffarnagar',
    'Muzaffarnagar, Uttar Pradesh',
    [29.47, 77.7],
    'Recycled paper and board mills',
    'Secondary fibre and packaging loops',
  ),
  H(
    'panipat',
    'Panipat, Haryana',
    [29.39, 76.97],
    'Textile shoddy and yarn recycling cluster',
    'Recycled fibre for spinning and blended yarn',
  ),
  H(
    'tiruppur',
    'Tiruppur, Tamil Nadu',
    [11.14, 77.29],
    'Knitwear waste and effluent recovery cluster',
    'Recycled cotton and zero-liquid-discharge dyeing',
  ),
  H(
    'bhiwandi',
    'Bhiwandi, Maharashtra',
    [19.3, 73.06],
    'Textile and plastics recycling around the powerloom belt',
    'Recycled polyester and process waste recovery',
  ),
  H(
    'seelampur',
    'Delhi NCR (Seelampur)',
    [28.67, 77.27],
    'E-waste dismantling and metal recovery',
    'Recovered copper and aluminium for secondary smelting',
  ),
  H(
    'moradabad',
    'Moradabad, Uttar Pradesh',
    [28.84, 78.77],
    'Brassware and metal scrap recovery',
    'Secondary non-ferrous supply',
  ),

  // ---- Water stress (state-level) --------------------------------------------------------------------
  S(
    'water',
    'rj',
    'Rajasthan',
    [26.9, 73.8],
    'Extremely high baseline water stress',
    'Prioritise effluent recycling, dry processing and cooling-water recovery',
  ),
  S(
    'water',
    'pb',
    'Punjab',
    [31.0, 75.4],
    'Extremely high · most groundwater blocks over-exploited',
    'Water recovery measures carry regulatory as well as cost weight',
  ),
  S(
    'water',
    'hr',
    'Haryana',
    [29.1, 76.1],
    'Extremely high baseline water stress',
    'Cooling and process water reuse',
  ),
  S(
    'water',
    'gj',
    'Gujarat',
    [22.5, 71.5],
    'High baseline water stress',
    'Zero-liquid-discharge and treated-water reuse in chemicals and textiles',
  ),
  S(
    'water',
    'tn',
    'Tamil Nadu',
    [11.1, 78.7],
    'High baseline water stress',
    'Textile effluent recovery already mandated in dyeing clusters',
  ),
  S(
    'water',
    'ka',
    'Karnataka',
    [15.3, 75.7],
    'High baseline water stress',
    'Cooling-water recovery in steel and cement',
  ),
  S(
    'water',
    'mh',
    'Maharashtra',
    [19.6, 75.6],
    'High baseline water stress',
    'Process water reuse in chemicals and textiles',
  ),
  S(
    'water',
    'up',
    'Uttar Pradesh',
    [26.8, 80.9],
    'High baseline water stress',
    'Effluent treatment and reuse in paper and textiles',
  ),
  S(
    'water',
    'ts',
    'Telangana',
    [17.9, 79.5],
    'High baseline water stress',
    'Treated-water reuse in bulk chemicals',
  ),
  S(
    'water',
    'ap',
    'Andhra Pradesh',
    [15.9, 79.7],
    'High baseline water stress',
    'Cooling-water recovery in cement',
  ),
  S(
    'water',
    'mp',
    'Madhya Pradesh',
    [23.5, 78.5],
    'Medium–high baseline water stress',
    'Cement kiln cooling and dust-suppression water recovery',
  ),

  // ---- Solar resource (state-level) -----------------------------------------------------------------
  S(
    'solar',
    'rj',
    'Rajasthan',
    [26.9, 73.8],
    'Global horizontal irradiance ≈ 5.5–6.0 kWh/m²/day',
    'On-site solar displaces grid at the fastest payback in India',
  ),
  S(
    'solar',
    'gj',
    'Gujarat',
    [22.5, 71.5],
    'GHI ≈ 5.5 kWh/m²/day',
    'Rooftop and captive solar rank first for electricity-heavy plants',
  ),
  S(
    'solar',
    'mp',
    'Madhya Pradesh',
    [23.5, 78.5],
    'GHI ≈ 5.4 kWh/m²/day',
    'Captive solar for cement and steel',
  ),
  S('solar', 'ka', 'Karnataka', [15.3, 75.7], 'GHI ≈ 5.4 kWh/m²/day', 'Open-access solar widely available'),
  S(
    'solar',
    'ap',
    'Andhra Pradesh',
    [15.9, 79.7],
    'GHI ≈ 5.3 kWh/m²/day',
    'Solar parks with open-access supply',
  ),
  S('solar', 'ts', 'Telangana', [17.9, 79.5], 'GHI ≈ 5.3 kWh/m²/day', 'Captive solar for chemicals'),
  S(
    'solar',
    'mh',
    'Maharashtra',
    [19.6, 75.6],
    'GHI ≈ 5.2 kWh/m²/day',
    'Rooftop solar for textiles and engineering',
  ),
  S(
    'solar',
    'tn',
    'Tamil Nadu',
    [11.1, 78.7],
    'GHI ≈ 5.2 kWh/m²/day',
    'Solar complements the state’s wind supply',
  ),

  // ---- Wind resource (state-level) ------------------------------------------------------------------
  S(
    'wind',
    'gj',
    'Gujarat',
    [22.5, 71.5],
    'Assessed potential ≈ 143 GW at 120 m',
    'Open-access wind for round-the-clock industrial load',
  ),
  S(
    'wind',
    'rj',
    'Rajasthan',
    [26.9, 73.8],
    'Assessed potential ≈ 128 GW at 120 m',
    'Wind–solar hybrid supply for continuous processes',
  ),
  S(
    'wind',
    'ka',
    'Karnataka',
    [15.3, 75.7],
    'Assessed potential ≈ 124 GW at 120 m',
    'Established open-access wind market',
  ),
  S(
    'wind',
    'mh',
    'Maharashtra',
    [19.6, 75.6],
    'Assessed potential ≈ 98 GW at 120 m',
    'Group-captive wind for industry',
  ),
  S(
    'wind',
    'ap',
    'Andhra Pradesh',
    [15.9, 79.7],
    'Assessed potential ≈ 75 GW at 120 m',
    'Wind–solar hybrid parks',
  ),
  S(
    'wind',
    'tn',
    'Tamil Nadu',
    [11.1, 78.7],
    'Assessed potential ≈ 69 GW at 120 m',
    'Longest-running industrial wind market in India',
  ),
  S(
    'wind',
    'ts',
    'Telangana',
    [17.9, 79.5],
    'Assessed potential ≈ 25 GW at 120 m',
    'Emerging open-access wind',
  ),
  S(
    'wind',
    'mp',
    'Madhya Pradesh',
    [23.5, 78.5],
    'Assessed potential ≈ 15 GW at 120 m',
    'Wind for cement clusters in the west of the state',
  ),
];

/** Nudge state badges of different layers apart so four layers on one state do not stack. */
export const layerOffset: Record<GeoLayerId, [number, number]> = {
  recyclers: [0, 0],
  water: [-0.55, -0.55],
  solar: [0.55, -0.55],
  wind: [0.55, 0.65],
};
