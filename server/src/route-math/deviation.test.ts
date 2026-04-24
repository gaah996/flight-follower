import { describe, expect, it } from 'vitest';
import { crossTrackNm } from './deviation.js';

describe('crossTrackNm', () => {
  it('returns ~0 for a point directly on the segment', () => {
    const xt = crossTrackNm({ lat: 0, lon: 0.5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(Math.abs(xt)).toBeLessThan(0.01);
  });

  it('returns a positive number for a point offset from the segment', () => {
    const xt = crossTrackNm({ lat: 0.1, lon: 0.5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(xt).toBeGreaterThan(5);
  });
});
