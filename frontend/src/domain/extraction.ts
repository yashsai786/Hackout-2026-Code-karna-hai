import { reference } from './fixtures';
export const extractionSamples = [
  {
    id: 'electricity',
    name: 'Electricity bill',
    kind: 'Utility statement',
    quantity: 185000,
    unit: 'kWh',
    get factor() {
      return reference.gridFactor;
    },
    get rate() {
      return reference.gridRateINR;
    },
    confidence: 'High',
    period: '2025-12',
    filename: 'sample-electricity-dec-2025.pdf',
    note: 'Quantity × 0.000716 tCO₂e/kWh. Illustrative grid factor; not a current official factor.',
  },
  {
    id: 'fuel',
    name: 'Fuel purchase log',
    kind: 'Coal purchase register',
    quantity: 420,
    unit: 'tonnes coal',
    get factor() {
      return reference.coalFactor;
    },
    get rate() {
      return reference.coalRateINR;
    },
    confidence: 'Medium',
    period: '2025-12',
    filename: 'sample-coal-register-dec-2025.csv',
    note: 'Quantity × 2.42 tCO₂e/tonne coal. Assumes a single coal grade; upstream emissions excluded.',
  },
  {
    id: 'waste',
    name: 'Waste manifest',
    kind: 'Waste disposal record',
    quantity: 85,
    unit: 'tonnes waste',
    get factor() {
      return reference.wasteFactor;
    },
    get rate() {
      return reference.wasteRateINR;
    },
    confidence: 'Low',
    period: '2025-12',
    filename: 'sample-waste-manifest-dec-2025.pdf',
    note: 'Quantity × 0.45 tCO₂e/tonne waste. Illustrative mixed-waste treatment factor.',
  },
] as const;
