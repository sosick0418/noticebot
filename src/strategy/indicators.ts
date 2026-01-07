/**
 * Technical Indicators Helper
 *
 * Provides Bollinger Bands calculation using technicalindicators library.
 * Based on: ADR-002-Trading Strategy
 */

import { BollingerBands } from 'technicalindicators';
import type { BollingerBandsResult } from '../types.js';

/**
 * Calculate Bollinger Bands for given price data
 *
 * @param closePrices - Array of close prices (most recent last)
 * @param period - Moving average period (default: 20)
 * @param stdDev - Standard deviation multiplier (default: 2)
 * @returns Bollinger Bands result or null if insufficient data
 */
export function calculateBollingerBands(
  closePrices: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerBandsResult | null {
  if (closePrices.length < period) {
    return null;
  }

  const result = BollingerBands.calculate({
    period,
    values: closePrices,
    stdDev,
  });

  // Get the most recent value
  const latest = result[result.length - 1];

  if (!latest) {
    return null;
  }

  const upper = latest.upper;
  const middle = latest.middle;
  const lower = latest.lower;

  // Calculate bandwidth: (Upper - Lower) / Middle
  // ADR-002: Volatility Filter
  const bandwidth = (upper - lower) / middle;

  return {
    upper,
    middle,
    lower,
    bandwidth,
  };
}

/**
 * Check if price is at or below lower band (Long signal condition)
 */
export function isAtLowerBand(closePrice: number, lowerBand: number): boolean {
  return closePrice <= lowerBand;
}

/**
 * Check if price is at or above upper band (Short signal condition)
 */
export function isAtUpperBand(closePrice: number, upperBand: number): boolean {
  return closePrice >= upperBand;
}

/**
 * Check if bandwidth indicates a squeeze (low volatility)
 * When squeeze is detected, Mean Reversion signals should be filtered out
 */
export function isSqueezeActive(
  bandwidth: number,
  threshold: number
): boolean {
  return bandwidth < threshold;
}
