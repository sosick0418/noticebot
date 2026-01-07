/**
 * Tests for Technical Indicators
 */

import { describe, it, expect } from 'vitest';
import {
  calculateBollingerBands,
  isAtLowerBand,
  isAtUpperBand,
  isSqueezeActive,
} from '../../src/strategy/indicators.js';

describe('calculateBollingerBands', () => {
  it('should return null if insufficient data', () => {
    const prices = [100, 101, 102];
    const result = calculateBollingerBands(prices, 20, 2);
    expect(result).toBeNull();
  });

  it('should calculate bollinger bands correctly with sufficient data', () => {
    // Generate 25 price points
    const prices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = calculateBollingerBands(prices, 20, 2);

    expect(result).not.toBeNull();
    expect(result!.upper).toBeGreaterThan(result!.middle);
    expect(result!.middle).toBeGreaterThan(result!.lower);
    expect(result!.bandwidth).toBeGreaterThan(0);
  });

  it('should calculate bandwidth correctly', () => {
    // Generate stable price data
    const prices = Array.from({ length: 25 }, () => 100);
    const result = calculateBollingerBands(prices, 20, 2);

    expect(result).not.toBeNull();
    // With constant prices, bandwidth should be very small (near zero)
    expect(result!.bandwidth).toBeLessThan(0.01);
  });
});

describe('isAtLowerBand', () => {
  it('should return true when price is at lower band', () => {
    expect(isAtLowerBand(95, 95)).toBe(true);
  });

  it('should return true when price is below lower band', () => {
    expect(isAtLowerBand(94, 95)).toBe(true);
  });

  it('should return false when price is above lower band', () => {
    expect(isAtLowerBand(96, 95)).toBe(false);
  });
});

describe('isAtUpperBand', () => {
  it('should return true when price is at upper band', () => {
    expect(isAtUpperBand(105, 105)).toBe(true);
  });

  it('should return true when price is above upper band', () => {
    expect(isAtUpperBand(106, 105)).toBe(true);
  });

  it('should return false when price is below upper band', () => {
    expect(isAtUpperBand(104, 105)).toBe(false);
  });
});

describe('isSqueezeActive', () => {
  it('should return true when bandwidth is below threshold', () => {
    expect(isSqueezeActive(0.02, 0.04)).toBe(true);
  });

  it('should return false when bandwidth is at threshold', () => {
    expect(isSqueezeActive(0.04, 0.04)).toBe(false);
  });

  it('should return false when bandwidth is above threshold', () => {
    expect(isSqueezeActive(0.06, 0.04)).toBe(false);
  });
});
