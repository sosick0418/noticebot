/**
 * Tests for PositionSizer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PositionSizer } from '../../src/execution/PositionSizer.js';
import type {
  ExecutionEngineConfig,
  AccountBalance,
  SymbolInfo,
} from '../../src/execution/types.js';

describe('PositionSizer', () => {
  let sizer: PositionSizer;
  let config: ExecutionEngineConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      testnet: true,
      symbol: 'BTCUSDT',
      leverage: 10,
      positionSizePercent: 0.1,
      takeProfitPercent: 0.02,
      stopLossPercent: 0.01,
      maxPositionSizeUsdt: 1000,
      minPositionSizeUsdt: 10,
      retryAttempts: 3,
      retryDelayMs: 1000,
    };
    sizer = new PositionSizer(config);
  });

  describe('calculatePositionSize', () => {
    const balance: AccountBalance = {
      asset: 'USDT',
      available: 1000,
      total: 1000,
    };

    const symbolInfo: SymbolInfo = {
      symbol: 'BTCUSDT',
      pricePrecision: 2,
      quantityPrecision: 3,
      minQty: 0.001,
      maxQty: 1000,
      stepSize: 0.001,
      minNotional: 5,
    };

    it('should calculate position size correctly', () => {
      const result = sizer.calculatePositionSize(balance, 50000, symbolInfo);

      expect(result.valid).toBe(true);
      // riskAmount = 1000 * 0.1 = 100
      // leveragedAmount = 100 * 10 = 1000
      // quantity = 1000 / 50000 = 0.02
      expect(result.quantity).toBe(0.02);
      expect(result.notionalValue).toBe(1000);
      expect(result.riskAmount).toBe(100);
    });

    it('should respect maxPositionSizeUsdt cap', () => {
      // High leverage would exceed max
      const highLeverageConfig: ExecutionEngineConfig = {
        ...config,
        leverage: 50,
        maxPositionSizeUsdt: 500,
      };
      const highLeverageSizer = new PositionSizer(highLeverageConfig);

      const result = highLeverageSizer.calculatePositionSize(
        balance,
        50000,
        symbolInfo
      );

      expect(result.valid).toBe(true);
      // leveragedAmount = 100 * 50 = 5000, but capped at 500
      expect(result.notionalValue).toBeLessThanOrEqual(500);
    });

    it('should return invalid when notional below minimum', () => {
      const lowBalanceConfig: ExecutionEngineConfig = {
        ...config,
        minPositionSizeUsdt: 10,
      };
      const lowBalanceSizer = new PositionSizer(lowBalanceConfig);

      const lowBalance: AccountBalance = {
        asset: 'USDT',
        available: 5,
        total: 5,
      };

      const result = lowBalanceSizer.calculatePositionSize(
        lowBalance,
        50000,
        symbolInfo
      );

      // riskAmount = 5 * 0.1 = 0.5
      // leveragedAmount = 0.5 * 10 = 5 USDT < minPositionSizeUsdt (10)
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below minimum');
    });

    it('should return invalid when quantity below symbol minimum', () => {
      const highMinQtyInfo: SymbolInfo = {
        ...symbolInfo,
        minQty: 1,
      };

      const result = sizer.calculatePositionSize(balance, 50000, highMinQtyInfo);

      // quantity = 0.02 < minQty (1)
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below symbol minimum');
    });

    it('should adjust quantity to step size', () => {
      const result = sizer.calculatePositionSize(balance, 33333, symbolInfo);

      // Raw quantity = 1000 / 33333 = 0.030000...
      // After step size adjustment (0.001): 0.030
      expect(result.quantity).toBe(0.03);
    });
  });

  describe('calculateTakeProfit', () => {
    it('should calculate take profit for LONG', () => {
      const tp = sizer.calculateTakeProfit(50000, 'LONG');
      // 50000 * 1.02 = 51000
      expect(tp).toBe(51000);
    });

    it('should calculate take profit for SHORT', () => {
      const tp = sizer.calculateTakeProfit(50000, 'SHORT');
      // 50000 * 0.98 = 49000
      expect(tp).toBe(49000);
    });
  });

  describe('calculateStopLoss', () => {
    it('should calculate stop loss for LONG', () => {
      const sl = sizer.calculateStopLoss(50000, 'LONG');
      // 50000 * 0.99 = 49500
      expect(sl).toBe(49500);
    });

    it('should calculate stop loss for SHORT', () => {
      const sl = sizer.calculateStopLoss(50000, 'SHORT');
      // 50000 * 1.01 = 50500
      expect(sl).toBe(50500);
    });
  });

  describe('adjustPricePrecision', () => {
    it('should adjust price to symbol precision', () => {
      const symbolInfo: SymbolInfo = {
        symbol: 'BTCUSDT',
        pricePrecision: 2,
        quantityPrecision: 3,
        minQty: 0.001,
        maxQty: 1000,
        stepSize: 0.001,
        minNotional: 5,
      };

      const adjusted = sizer.adjustPricePrecision(50123.456789, symbolInfo);
      expect(adjusted).toBe(50123.46);
    });
  });
});
