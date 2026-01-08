/**
 * Dashboard Server
 *
 * Web server for real-time trading dashboard.
 * Provides REST API and WebSocket for live updates.
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';
import type {
  DashboardConfig,
  DashboardState,
  CandleChartData,
  BollingerBandsData,
  PositionInfo,
  AccountInfo,
  SignalInfo,
  SystemStatus,
  RiskInfo,
  WsMessage,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  private static readonly MAX_CANDLES = 500;
  private static readonly MAX_BOLLINGER_BANDS = 500;
  private static readonly MAX_SIGNALS = 100;

  private server: FastifyInstance;
  private config: DashboardConfig;
  private state: DashboardState;
  private clients: Set<WebSocket> = new Set();
  private startTime: number = Date.now();

  private get uptime(): number {
    return Date.now() - this.startTime;
  }

  constructor(config: DashboardConfig) {
    this.config = config;
    this.server = Fastify({ logger: false });
    this.state = this.createInitialState();
  }

  private createInitialState(): DashboardState {
    return {
      candles: [],
      bollingerBands: [],
      position: null,
      account: null,
      signals: [],
      status: {
        isRunning: false,
        isConnected: false,
        executionEnabled: false,
        executionReady: false,
        uptime: 0,
        lastUpdate: Date.now(),
      },
      risk: null,
    };
  }

  /**
   * Initialize and start the server
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Dashboard server is disabled');
      return;
    }

    await this.registerPlugins();
    this.registerRoutes();
    this.registerWebSocket();

    try {
      await this.server.listen({
        port: this.config.port,
        host: this.config.host,
      });
      logger.info('Dashboard server started', {
        url: `http://${this.config.host}:${this.config.port}`,
      });
    } catch (error) {
      logger.error('Failed to start dashboard server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    await this.server.close();
    logger.info('Dashboard server stopped');
  }

  /**
   * Register Fastify plugins
   */
  private async registerPlugins(): Promise<void> {
    // Static file serving
    await this.server.register(fastifyStatic, {
      root: path.join(__dirname, '../../public'),
      prefix: '/',
    });

    // WebSocket support
    await this.server.register(fastifyWebsocket);
  }

  /**
   * Register REST API routes
   */
  private registerRoutes(): void {
    // Health check
    this.server.get('/api/health', async () => {
      return { status: 'ok', uptime: this.uptime };
    });

    // Get current state
    this.server.get('/api/state', async () => {
      return {
        ...this.state,
        status: {
          ...this.state.status,
          uptime: this.uptime,
        },
      };
    });

    // Get candles (with limit)
    this.server.get<{ Querystring: { limit?: string } }>(
      '/api/candles',
      async (request) => {
        const limit = parseInt(request.query.limit || '100', 10);
        return this.state.candles.slice(-limit);
      }
    );

    // Get current position
    this.server.get('/api/position', async () => {
      return this.state.position;
    });

    // Get account info
    this.server.get('/api/account', async () => {
      return this.state.account;
    });

    // Get recent signals
    this.server.get<{ Querystring: { limit?: string } }>(
      '/api/signals',
      async (request) => {
        const limit = parseInt(request.query.limit || '50', 10);
        return this.state.signals.slice(-limit);
      }
    );

    // Get system status
    this.server.get('/api/status', async () => {
      return {
        ...this.state.status,
        uptime: this.uptime,
      };
    });
  }

  /**
   * Register WebSocket handler
   */
  private registerWebSocket(): void {
    this.server.get('/ws', { websocket: true }, (socket) => {
      this.clients.add(socket);
      logger.debug('WebSocket client connected', {
        totalClients: this.clients.size,
      });

      // Send initial state
      this.sendToClient(socket, {
        type: 'status',
        data: {
          ...this.state.status,
          uptime: this.uptime,
        },
        timestamp: Date.now(),
      });

      if (this.state.position) {
        this.sendToClient(socket, {
          type: 'position',
          data: this.state.position,
          timestamp: Date.now(),
        });
      }

      if (this.state.account) {
        this.sendToClient(socket, {
          type: 'account',
          data: this.state.account,
          timestamp: Date.now(),
        });
      }

      socket.on('close', () => {
        this.clients.delete(socket);
        logger.debug('WebSocket client disconnected', {
          totalClients: this.clients.size,
        });
      });

      socket.on('error', (error: Error) => {
        logger.error('WebSocket client error', { error: error.message });
        this.clients.delete(socket);
      });
    });
  }

  /**
   * Send message to single client
   */
  private sendToClient(client: WebSocket, message: WsMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // ==========================================
  // State Update Methods (called from App)
  // ==========================================

  /**
   * Update candle data
   */
  updateCandle(candle: CandleChartData): void {
    this.state.candles.push(candle);
    // Keep buffer at max capacity
    if (this.state.candles.length > DashboardServer.MAX_CANDLES) {
      this.state.candles = this.state.candles.slice(-DashboardServer.MAX_CANDLES);
    }

    this.broadcast({
      type: 'candle',
      data: candle,
      timestamp: Date.now(),
    });
  }

  /**
   * Update Bollinger Bands data
   */
  updateBollingerBands(bands: BollingerBandsData): void {
    this.state.bollingerBands.push(bands);
    if (this.state.bollingerBands.length > DashboardServer.MAX_BOLLINGER_BANDS) {
      this.state.bollingerBands = this.state.bollingerBands.slice(-DashboardServer.MAX_BOLLINGER_BANDS);
    }

    this.broadcast({
      type: 'bollingerBands',
      data: bands,
      timestamp: Date.now(),
    });
  }

  /**
   * Update position info
   */
  updatePosition(position: PositionInfo | null): void {
    this.state.position = position;

    this.broadcast({
      type: 'position',
      data: position,
      timestamp: Date.now(),
    });
  }

  /**
   * Update account info
   */
  updateAccount(account: AccountInfo): void {
    this.state.account = account;

    this.broadcast({
      type: 'account',
      data: account,
      timestamp: Date.now(),
    });
  }

  /**
   * Add new signal
   */
  addSignal(signal: SignalInfo): void {
    this.state.signals.push(signal);
    // Keep buffer at max capacity
    if (this.state.signals.length > DashboardServer.MAX_SIGNALS) {
      this.state.signals = this.state.signals.slice(-DashboardServer.MAX_SIGNALS);
    }

    this.broadcast({
      type: 'signal',
      data: signal,
      timestamp: Date.now(),
    });
  }

  /**
   * Update system status
   */
  updateStatus(status: Partial<SystemStatus>): void {
    this.state.status = {
      ...this.state.status,
      ...status,
      lastUpdate: Date.now(),
    };

    this.broadcast({
      type: 'status',
      data: {
        ...this.state.status,
        uptime: this.uptime,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Update risk information
   */
  updateRisk(risk: RiskInfo): void {
    this.state.risk = risk;

    this.broadcast({
      type: 'risk',
      data: risk,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current connection count
   */
  getConnectionCount(): number {
    return this.clients.size;
  }
}
