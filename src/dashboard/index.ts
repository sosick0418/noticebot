/**
 * Dashboard Module
 *
 * Web dashboard for real-time trading monitoring.
 */

// Types
export type {
  DashboardConfig,
  CandleChartData,
  BollingerBandsData,
  PositionInfo,
  AccountInfo,
  SignalInfo,
  SystemStatus,
  DashboardState,
  WsMessage,
  WsMessageType,
} from './types.js';

// Classes
export { DashboardServer } from './DashboardServer.js';
