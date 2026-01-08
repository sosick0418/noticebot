/**
 * Strategy Engine
 *
 * Core logic layer that calculates Bollinger Bands and
 * determines Long/Short entry signals based on Mean Reversion strategy.
 *
 * Based on:
 * - ADR-002-Trading Strategy (Bollinger Bands Mean Reversion)
 * - ADR-003-WebSocket Data Handling (Candle Confirmation)
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../logger.js';
import type {
  CandleClosedEvent,
  TradingSignal,
  BollingerBandsResult,
} from '../types.js';
import type { StrategyEngineConfig, SignalEvaluation } from './types.js';
import {
  calculateBollingerBands,
  isAtLowerBand,
  isAtUpperBand,
  isSqueezeActive,
} from './indicators.js';

export interface BollingerCalculatedEvent {
  candle: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  };
  bands: BollingerBandsResult;
}

interface StrategyEventTypes {
  signalDetected: [TradingSignal];
  bollingerCalculated: [BollingerCalculatedEvent];
  error: [Error];
}

export class StrategyEngine extends EventEmitter<StrategyEventTypes> {
  private config: StrategyEngineConfig;
  private closePrices: number[] = [];
  private lastProcessedTimestamp = 0;

  constructor(config: StrategyEngineConfig) {
    super();
    this.config = config;

    logger.info('Strategy Engine initialized', {
      symbol: config.symbol,
      period: config.bollingerPeriod,
      stdDev: config.bollingerStdDev,
      bandwidthThreshold: config.bandwidthThreshold,
    });
  }

  /**
   * Process a confirmed candle close event
   * This is the main entry point from Market Data Consumer
   */
  public processCandle(event: CandleClosedEvent): void {
    const { open, high, low, close, closeTime, closePrice } = event;
    const price = close || closePrice; // Use close, fallback to closePrice for compatibility

    // Guard: Skip duplicate events
    if (closeTime === this.lastProcessedTimestamp) {
      logger.debug('Skipping duplicate candle', { closeTime });
      return;
    }

    this.lastProcessedTimestamp = closeTime;

    // Update price buffer (FIFO)
    this.updatePriceBuffer(price);

    // Guard: Need enough data for indicator calculation
    if (this.closePrices.length < this.config.bollingerPeriod) {
      logger.debug('Insufficient data for indicator calculation', {
        current: this.closePrices.length,
        required: this.config.bollingerPeriod,
      });
      return;
    }

    // Calculate Bollinger Bands
    const bands = this.calculateBands();
    if (!bands) {
      logger.warn('Failed to calculate Bollinger Bands');
      return;
    }

    // Emit bollingerCalculated event for dashboard
    this.emit('bollingerCalculated', {
      candle: {
        time: closeTime,
        open: open || price,
        high: high || price,
        low: low || price,
        close: price,
      },
      bands,
    });

    // Evaluate signal conditions
    const evaluation = this.evaluateSignal(price, bands);

    // Log current state
    logger.debug('Strategy evaluation', {
      closePrice: price,
      upper: bands.upper.toFixed(2),
      middle: bands.middle.toFixed(2),
      lower: bands.lower.toFixed(2),
      bandwidth: (bands.bandwidth * 100).toFixed(2) + '%',
      evaluation: evaluation.reason,
    });

    // Emit signal if conditions are met
    if (evaluation.shouldSignal && evaluation.type && evaluation.bandValue !== null) {
      const signal: TradingSignal = {
        type: evaluation.type,
        symbol: this.config.symbol,
        closePrice: price,
        bandValue: evaluation.bandValue,
        middleBand: bands.middle,
        bandwidth: bands.bandwidth,
        timestamp: closeTime,
      };

      logger.info('Trading signal detected', {
        type: signal.type,
        symbol: signal.symbol,
        closePrice: signal.closePrice,
        bandValue: signal.bandValue.toFixed(2),
        bandwidth: (signal.bandwidth * 100).toFixed(2) + '%',
      });

      this.emit('signalDetected', signal);
    }
  }

  /**
   * Update the rolling price buffer with FIFO strategy
   * ADR-003: Data Buffering Strategy
   */
  private updatePriceBuffer(closePrice: number): void {
    this.closePrices.push(closePrice);

    // Maintain only the required period + some buffer
    const maxLength = this.config.bollingerPeriod + 5;
    if (this.closePrices.length > maxLength) {
      this.closePrices.shift();
    }
  }

  /**
   * Calculate Bollinger Bands using current price buffer
   */
  private calculateBands(): BollingerBandsResult | null {
    return calculateBollingerBands(
      this.closePrices,
      this.config.bollingerPeriod,
      this.config.bollingerStdDev
    );
  }

  /**
   * Evaluate if current price triggers a trading signal
   * ADR-002: Signal Definition & Volatility Filter
   */
  private evaluateSignal(
    closePrice: number,
    bands: BollingerBandsResult
  ): SignalEvaluation {
    // Check for squeeze (low volatility filter)
    // ADR-002: When bandwidth is below threshold, skip Mean Reversion signals
    if (isSqueezeActive(bands.bandwidth, this.config.bandwidthThreshold)) {
      return {
        shouldSignal: false,
        type: null,
        reason: `Squeeze active (bandwidth ${(bands.bandwidth * 100).toFixed(2)}% < ${(this.config.bandwidthThreshold * 100).toFixed(2)}%)`,
        bandValue: null,
      };
    }

    // Check Long condition: Close <= Lower Band
    // ADR-002: Statistical oversold, mean reversion expected
    if (isAtLowerBand(closePrice, bands.lower)) {
      return {
        shouldSignal: true,
        type: 'LONG',
        reason: `Price ${closePrice} <= Lower Band ${bands.lower.toFixed(2)}`,
        bandValue: bands.lower,
      };
    }

    // Check Short condition: Close >= Upper Band
    // ADR-002: Statistical overbought, mean reversion expected
    if (isAtUpperBand(closePrice, bands.upper)) {
      return {
        shouldSignal: true,
        type: 'SHORT',
        reason: `Price ${closePrice} >= Upper Band ${bands.upper.toFixed(2)}`,
        bandValue: bands.upper,
      };
    }

    // No signal
    return {
      shouldSignal: false,
      type: null,
      reason: 'Price within bands',
      bandValue: null,
    };
  }

  /**
   * Get current price buffer length (for monitoring)
   */
  public getBufferLength(): number {
    return this.closePrices.length;
  }

  /**
   * Reset the strategy engine state
   * Used for testing or restart scenarios
   */
  public reset(): void {
    this.closePrices = [];
    this.lastProcessedTimestamp = 0;
    logger.info('Strategy Engine state reset');
  }
}
