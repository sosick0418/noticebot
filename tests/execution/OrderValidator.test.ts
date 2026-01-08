/**
 * Tests for OrderValidator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderValidator } from '../../src/execution/OrderValidator.js';
import type {
  TradingSignal,
  Position,
  SymbolInfo,
  PositionSizeResult,
} from '../../src/execution/types.js';

describe('OrderValidator', () => {
  let validator: OrderValidator;

  const symbolInfo: SymbolInfo = {
    symbol: 'BTCUSDT',
    pricePrecision: 2,
    quantityPrecision: 3,
    minQty: 0.001,
    maxQty: 1000,
    stepSize: 0.001,
    minNotional: 5,
  };

  const validPositionSize: PositionSizeResult = {
    quantity: 0.02,
    notionalValue: 1000,
    riskAmount: 100,
    valid: true,
  };

  const noPosition: Position = {
    symbol: 'BTCUSDT',
    side: 'NONE',
    size: 0,
    entryPrice: 0,
    unrealizedPnl: 0,
    leverage: 10,
  };

  beforeEach(() => {
    validator = new OrderValidator();
  });

  describe('validate', () => {
    it('should pass validation for valid order', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      const result = validator.validate(
        signal,
        noPosition,
        validPositionSize,
        symbolInfo
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for duplicate signal', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: 1000,
      };

      // First execution
      validator.recordExecution(signal);

      // Duplicate signal
      const result = validator.validate(
        signal,
        noPosition,
        validPositionSize,
        symbolInfo
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate signal detected for same candle');
    });

    it('should fail validation for invalid position size', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      const invalidPositionSize: PositionSizeResult = {
        quantity: 0,
        notionalValue: 0,
        riskAmount: 0,
        valid: false,
        reason: 'Insufficient balance',
      };

      const result = validator.validate(
        signal,
        noPosition,
        invalidPositionSize,
        symbolInfo
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid position size'))).toBe(
        true
      );
    });

    it('should warn on conflicting position', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      const shortPosition: Position = {
        symbol: 'BTCUSDT',
        side: 'SHORT',
        size: 0.01,
        entryPrice: 51000,
        unrealizedPnl: 100,
        leverage: 10,
      };

      const result = validator.validate(
        signal,
        shortPosition,
        validPositionSize,
        symbolInfo
      );

      expect(result.valid).toBe(true); // Still valid, just a warning
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Existing SHORT position');
    });

    it('should fail validation for notional below minimum', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      const lowNotionalSize: PositionSizeResult = {
        quantity: 0.0001,
        notionalValue: 3, // Below minNotional of 5
        riskAmount: 0.3,
        valid: true,
      };

      const result = validator.validate(
        signal,
        noPosition,
        lowNotionalSize,
        symbolInfo
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true);
    });

    it('should fail validation for quantity below minimum', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      const lowQtySize: PositionSizeResult = {
        quantity: 0.0001, // Below minQty of 0.001
        notionalValue: 10,
        riskAmount: 1,
        valid: true,
      };

      const result = validator.validate(
        signal,
        noPosition,
        lowQtySize,
        symbolInfo
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true);
    });
  });

  describe('recordExecution', () => {
    it('should track last execution', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: 12345,
      };

      validator.recordExecution(signal);
      const state = validator.getState();

      expect(state.lastTimestamp).toBe(12345);
      expect(state.lastType).toBe('LONG');
    });
  });

  describe('reset', () => {
    it('should clear validation state', () => {
      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: 12345,
      };

      validator.recordExecution(signal);
      validator.reset();

      const state = validator.getState();
      expect(state.lastTimestamp).toBe(0);
      expect(state.lastType).toBeNull();
    });
  });
});
