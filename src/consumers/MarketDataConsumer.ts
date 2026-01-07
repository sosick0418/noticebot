/**
 * Market Data Consumer
 *
 * Manages Binance Futures WebSocket connection and emits
 * confirmed candle data to Strategy Engine.
 *
 * Based on: ADR-003-WebSocket Data Handling & Candle Confirmation Policy
 */

import { WebsocketClient, type WSClientConfigurableOptions } from 'binance';
import EventEmitter from 'eventemitter3';
import { logger } from '../logger.js';
import type { CandleClosedEvent } from '../types.js';
import type { MarketDataConsumerConfig, ParsedCandle } from './types.js';

interface MarketDataEventTypes {
  candleClosed: [CandleClosedEvent];
  error: [Error];
  connected: [];
  disconnected: [];
  reconnecting: [];
}

export class MarketDataConsumer extends EventEmitter<MarketDataEventTypes> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wsClient: any = null;
  private config: MarketDataConsumerConfig;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private lastMessageTime = 0;

  constructor(config: MarketDataConsumerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the WebSocket connection and subscribe to kline stream
   */
  public start(): void {
    logger.info('Starting Market Data Consumer', {
      symbol: this.config.symbol,
      interval: this.config.interval,
      testnet: this.config.testnet,
    });

    const wsOptions: WSClientConfigurableOptions = {
      beautify: true,
    };

    // Note: testnet is handled via wsUrl configuration in newer versions
    // For now, we use the default which connects to mainnet/testnet based on wsUrl
    this.wsClient = new WebsocketClient(wsOptions);

    this.attachEventHandlers();
    this.subscribeToKlines();
    this.startWatchdog();
  }

  /**
   * Stop the WebSocket connection
   */
  public stop(): void {
    logger.info('Stopping Market Data Consumer');

    this.stopWatchdog();

    if (this.wsClient) {
      this.wsClient.closeAll();
      this.wsClient = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if consumer is currently connected
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Attach event handlers to WebSocket client
   */
  private attachEventHandlers(): void {
    if (!this.wsClient) return;

    // Handle formatted messages (beautified kline data)
    this.wsClient.on('formattedMessage', (data: unknown) => {
      this.handleMessage(data);
    });

    // Connection opened
    this.wsClient.on('open', (data: { wsKey?: string }) => {
      logger.info('WebSocket connection opened', { wsKey: data.wsKey });
      this.isConnected = true;
      this.emit('connected');
    });

    // Connection closed
    this.wsClient.on('close', () => {
      logger.warn('WebSocket connection closed');
      this.isConnected = false;
      this.emit('disconnected');
    });

    // Reconnecting
    this.wsClient.on('reconnecting', (data: { wsKey?: string } | undefined) => {
      logger.info('WebSocket reconnecting...', { wsKey: data?.wsKey });
      this.emit('reconnecting');
    });

    // Reconnected
    this.wsClient.on('reconnected', (data: { wsKey?: string } | undefined) => {
      logger.info('WebSocket reconnected', { wsKey: data?.wsKey });
      this.isConnected = true;
      this.emit('connected');
    });

    // Exception/Error - using 'error' event as fallback
    this.wsClient.on('error', (data: unknown) => {
      logger.error('WebSocket error', { error: data });
      this.emit('error', new Error(`WebSocket error: ${JSON.stringify(data)}`));
    });
  }

  /**
   * Subscribe to kline stream for configured symbol and interval
   */
  private subscribeToKlines(): void {
    if (!this.wsClient) return;

    logger.info('Subscribing to kline stream', {
      symbol: this.config.symbol,
      interval: this.config.interval,
    });

    // Subscribe to USD-M Futures kline stream
    this.wsClient.subscribeKlines(
      this.config.symbol,
      this.config.interval,
      'usdm'
    );
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: unknown): void {
    this.lastMessageTime = Date.now();
    this.resetWatchdog();

    // Parse and validate kline data
    const candle = this.parseKlineData(data);
    if (!candle) return;

    // Only process confirmed candles (x = true)
    // ADR-003: Candle Confirmation Policy
    if (candle.isClosed) {
      logger.debug('Candle closed', {
        symbol: this.config.symbol,
        closePrice: candle.close,
        closeTime: new Date(candle.closeTime).toISOString(),
      });

      const event: CandleClosedEvent = {
        closePrice: candle.close,
        closeTime: candle.closeTime,
      };

      this.emit('candleClosed', event);
    }
  }

  /**
   * Parse raw kline data from WebSocket message
   */
  private parseKlineData(data: unknown): ParsedCandle | null {
    try {
      // Type guard for kline data
      if (!this.isKlineMessage(data)) {
        return null;
      }

      const kline = data.kline;

      return {
        openTime: kline.startTime,
        closeTime: kline.endTime,
        open: parseFloat(String(kline.open)),
        high: parseFloat(String(kline.high)),
        low: parseFloat(String(kline.low)),
        close: parseFloat(String(kline.close)),
        volume: parseFloat(String(kline.volume)),
        isClosed: kline.final,
      };
    } catch (error) {
      logger.warn('Failed to parse kline data', { error, data });
      return null;
    }
  }

  /**
   * Type guard to check if message is a kline message
   */
  private isKlineMessage(data: unknown): data is {
    eventType: string;
    kline: {
      startTime: number;
      endTime: number;
      open: string | number;
      high: string | number;
      low: string | number;
      close: string | number;
      volume: string | number;
      final: boolean;
    };
  } {
    if (typeof data !== 'object' || data === null) return false;

    const msg = data as Record<string, unknown>;

    // Check for kline event type
    if (msg['eventType'] !== 'kline' && msg['e'] !== 'kline') {
      return false;
    }

    // Check for kline data
    if (!msg['kline'] && !msg['k']) {
      return false;
    }

    return true;
  }

  /**
   * Start watchdog timer to detect stale connections
   * ADR-003: Connection Resilience Policy
   */
  private startWatchdog(): void {
    this.watchdogTimer = setInterval(() => {
      this.checkConnection();
    }, this.config.watchdogTimeoutMs / 2);
  }

  /**
   * Stop watchdog timer
   */
  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Reset watchdog timer on message received
   */
  private resetWatchdog(): void {
    // Watchdog is interval-based, just update lastMessageTime
  }

  /**
   * Check if connection is stale and reconnect if needed
   */
  private checkConnection(): void {
    if (!this.isConnected) return;

    const timeSinceLastMessage = Date.now() - this.lastMessageTime;

    if (timeSinceLastMessage > this.config.watchdogTimeoutMs) {
      logger.warn('Watchdog timeout - no message received', {
        timeoutMs: this.config.watchdogTimeoutMs,
        timeSinceLastMessage,
      });

      // Force reconnection
      this.reconnect();
    }
  }

  /**
   * Force reconnection to WebSocket
   */
  private reconnect(): void {
    logger.info('Forcing WebSocket reconnection');

    if (this.wsClient) {
      this.wsClient.closeAll();

      // Re-subscribe after a short delay
      setTimeout(() => {
        this.subscribeToKlines();
      }, 1000);
    }
  }
}
