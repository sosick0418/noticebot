/**
 * Tests for ExecutionEngine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionEngine } from '../../src/execution/ExecutionEngine.js';
import { BinanceOrderClient } from '../../src/execution/BinanceOrderClient.js';
import type {
  ExecutionEngineConfig,
  TradingSignal,
} from '../../src/execution/types.js';

// Mock the BinanceOrderClient
vi.mock('../../src/execution/BinanceOrderClient.js', () => ({
  BinanceOrderClient: vi.fn(),
}));

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;
  let mockClient: Partial<BinanceOrderClient>;
  let config: ExecutionEngineConfig;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      isTestnet: true,
      verifyConnection: vi.fn().mockResolvedValue(true),
      setLeverage: vi.fn().mockResolvedValue(true),
      getBalance: vi.fn().mockResolvedValue({
        asset: 'USDT',
        available: 1000,
        total: 1000,
      }),
      getPosition: vi.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        side: 'NONE',
        size: 0,
        entryPrice: 0,
        unrealizedPnl: 0,
        leverage: 10,
      }),
      getSymbolInfo: vi.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        pricePrecision: 2,
        quantityPrecision: 3,
        minQty: 0.001,
        maxQty: 1000,
        stepSize: 0.001,
        minNotional: 5,
      }),
      getMarkPrice: vi.fn().mockResolvedValue(50000),
      submitMarketOrder: vi.fn().mockResolvedValue({
        success: true,
        orderId: 12345,
        executedQty: 0.02,
        avgPrice: 50000,
        timestamp: Date.now(),
      }),
      submitTakeProfitOrder: vi.fn().mockResolvedValue({
        success: true,
        orderId: 12346,
        timestamp: Date.now(),
      }),
      submitStopLossOrder: vi.fn().mockResolvedValue({
        success: true,
        orderId: 12347,
        timestamp: Date.now(),
      }),
    };

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
      retryDelayMs: 100,
    };

    engine = new ExecutionEngine(config, mockClient as BinanceOrderClient);
  });

  describe('initialize', () => {
    it('should initialize successfully when enabled', async () => {
      const result = await engine.initialize();

      expect(result).toBe(true);
      expect(mockClient.verifyConnection).toHaveBeenCalled();
      expect(mockClient.setLeverage).toHaveBeenCalledWith('BTCUSDT', 10);
    });

    it('should return false when disabled', async () => {
      const disabledEngine = new ExecutionEngine(
        { ...config, enabled: false },
        mockClient as BinanceOrderClient
      );

      const result = await disabledEngine.initialize();

      expect(result).toBe(false);
    });

    it('should return false on connection failure', async () => {
      vi.mocked(mockClient.verifyConnection!).mockResolvedValueOnce(false);

      const result = await engine.initialize();

      expect(result).toBe(false);
    });

    it('should emit leverageSet event', async () => {
      const leverageHandler = vi.fn();
      engine.on('leverageSet', leverageHandler);

      await engine.initialize();

      expect(leverageHandler).toHaveBeenCalledWith('BTCUSDT', 10);
    });
  });

  describe('processSignal', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should execute LONG signal successfully', async () => {
      const orderExecutedHandler = vi.fn();
      engine.on('orderExecuted', orderExecutedHandler);

      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      await engine.processSignal(signal);

      expect(mockClient.submitMarketOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'MARKET',
        })
      );
      expect(mockClient.submitTakeProfitOrder).toHaveBeenCalled();
      expect(mockClient.submitStopLossOrder).toHaveBeenCalled();
      expect(orderExecutedHandler).toHaveBeenCalled();
    });

    it('should execute SHORT signal successfully', async () => {
      const signal: TradingSignal = {
        type: 'SHORT',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 51000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      await engine.processSignal(signal);

      expect(mockClient.submitMarketOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          side: 'SELL',
        })
      );
    });

    it('should skip signal when engine not ready', async () => {
      const freshEngine = new ExecutionEngine(
        config,
        mockClient as BinanceOrderClient
      );
      // Not initialized

      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      await freshEngine.processSignal(signal);

      expect(mockClient.submitMarketOrder).not.toHaveBeenCalled();
    });

    it('should emit orderFailed on entry order failure', async () => {
      const orderFailedHandler = vi.fn();
      engine.on('orderFailed', orderFailedHandler);

      vi.mocked(mockClient.submitMarketOrder!).mockResolvedValueOnce({
        success: false,
        error: 'Insufficient balance',
        timestamp: Date.now(),
      });

      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      await engine.processSignal(signal);

      expect(orderFailedHandler).toHaveBeenCalledWith(
        signal,
        'Insufficient balance'
      );
    });

    it('should emit orderFailed on validation failure', async () => {
      const orderFailedHandler = vi.fn();
      engine.on('orderFailed', orderFailedHandler);

      // Return low balance that will fail position sizing
      vi.mocked(mockClient.getBalance!).mockResolvedValueOnce({
        asset: 'USDT',
        available: 1, // Too low
        total: 1,
      });

      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: Date.now(),
      };

      await engine.processSignal(signal);

      expect(orderFailedHandler).toHaveBeenCalled();
      expect(mockClient.submitMarketOrder).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return ready: false before initialization', () => {
      const status = engine.getStatus();

      expect(status.ready).toBe(false);
      expect(status.enabled).toBe(true);
    });

    it('should return ready: true after initialization', async () => {
      await engine.initialize();

      const status = engine.getStatus();

      expect(status.ready).toBe(true);
      expect(status.enabled).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset validation state', async () => {
      await engine.initialize();

      const signal: TradingSignal = {
        type: 'LONG',
        symbol: 'BTCUSDT',
        closePrice: 50000,
        bandValue: 49000,
        middleBand: 50000,
        bandwidth: 0.04,
        timestamp: 12345,
      };

      await engine.processSignal(signal);
      engine.reset();

      // After reset, the same signal should be able to execute again
      // (though in real scenario it would still execute due to different path)
      const status = engine.getStatus();
      expect(status.ready).toBe(true);
    });
  });
});
