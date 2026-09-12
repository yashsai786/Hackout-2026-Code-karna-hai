import { describe, it, expect } from 'vitest';
import { geoPoints, geoLayers, layerOffset } from './geo';
import { factories } from './fixtures';

const INDIA = { lat: [6, 37], lng: [68, 98] } as const;

describe('map context layers', () => {
  it('every point sits inside India and has a source a reader can check', () => {
    for (const p of geoPoints) {
      expect(p.coordinates[0]).toBeGreaterThanOrEqual(INDIA.lat[0]);
      expect(p.coordinates[0]).toBeLessThanOrEqual(INDIA.lat[1]);
      expect(p.coordinates[1]).toBeGreaterThanOrEqual(INDIA.lng[0]);
      expect(p.coordinates[1]).toBeLessThanOrEqual(INDIA.lng[1]);
      expect(p.source.length).toBeGreaterThan(10);
      expect(p.detail.length).toBeGreaterThan(5);
      expect(p.relevance.length).toBeGreaterThan(5);
    }
  });

  it('ids are unique and every layer is populated', () => {
    expect(new Set(geoPoints.map(p => p.id)).size).toBe(geoPoints.length);
    for (const layer of Object.keys(geoLayers) as (keyof typeof geoLayers)[]) {
      expect(geoPoints.filter(p => p.layer === layer).length).toBeGreaterThanOrEqual(8);
      expect(geoLayers[layer].emoji).toMatch(/\S/);
      expect(layerOffset[layer]).toHaveLength(2);
    }
  });

  it('state-level layers never claim site precision', () => {
    for (const p of geoPoints.filter(p => p.layer !== 'recyclers')) {
      expect(p.level).toBe('state');
      expect(p.source).toMatch(/state-level|Aqueduct|CGWB/);
    }
    for (const p of geoPoints.filter(p => p.layer === 'recyclers')) {
      expect(p.level).toBe('hub');
      expect(p.source).toMatch(/indicative/);
    }
  });

  it('no context badge lands exactly on a factory marker', () => {
    for (const f of factories) {
      for (const p of geoPoints) {
        const [dlat, dlng] = layerOffset[p.layer];
        const d = Math.hypot(
          f.coordinates![0] - (p.coordinates[0] + dlat),
          f.coordinates![1] - (p.coordinates[1] + dlng),
        );
        expect(d).toBeGreaterThan(0.05);
      }
    }
  });
});
