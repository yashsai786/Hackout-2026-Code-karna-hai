import { describe, it, expect } from 'vitest';
import served from '../../../backend/catalogue.json';
import { interventions } from './fixtures';

describe('intervention catalogue', () => {
  it('the backend serves exactly what the frontend falls back to', () => {
    // backend/catalogue.json is the served source; the fixture is the offline fallback. They must not drift.
    expect(served).toEqual(JSON.parse(JSON.stringify(interventions)));
  });
});
