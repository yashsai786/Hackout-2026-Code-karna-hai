import { describe, it, expect } from 'vitest';
import served from '../../../backend/seed.json';
import { factories } from './fixtures';
import { seedLedger } from '../state/SessionContext';

describe('seed dataset', () => {
  it('the backend serves exactly the seed the frontend falls back to', () => {
    // backend/seed.json is what GET /api/v1/state returns before anything is saved; the fixture is
    // the offline fallback. A drift here would mean two different portfolios depending on the API.
    expect(served.factories).toEqual(JSON.parse(JSON.stringify(factories)));
    expect(served.ledger).toEqual(JSON.parse(JSON.stringify(seedLedger())));
  });
});
