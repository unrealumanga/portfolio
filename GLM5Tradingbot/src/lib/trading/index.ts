/**
 * Trading Module Exports
 * Exchange API Integration for GLM5Tradingbot
 */

// MEXC Exchange Client
export {
  MexcClient,
  type MexcConfig,
  type MexcOrderParams,
  type MexcOrderResponse,
  type MexcKline,
  type MexcBalance,
  type MexcPosition,
  type MexcOrderbook,
  type MexcOrderbookEntry,
  type InstrumentInfo as MexcInstrumentInfo,
} from './mexc-client';

// Bybit V5 API Client
export {
  BybitClient,
  type BybitConfig,
  type BybitOrderParams,
  type BybitOrderResponse,
  type BybitKline,
  type BybitPosition,
  type BybitBalance,
  type BybitOrderbook,
  type BybitOrderbookEntry,
  type InstrumentInfo as BybitInstrumentInfo,
} from './bybit-client';

// Execution Router
export {
  ExecutionRouter,
  type Exchange,
  type TradeSignal,
  type OrderSide as ExecutionOrderSide,
  type OrderType,
  type TradeParams,
  type RiskPhysics as ExecutionRiskPhysics,
  type TradeResult,
  type ExecutionRouterConfig,
} from './execution-router';

// Bot State Manager
export {
  BotStateManager,
  getBotState,
  resetBotState,
  type BotStatus,
  type BotStateStatus,
  type BotEvent,
  type BotEventType,
  type BotEventListener,
  type SessionStats,
  type BotState,
} from './bot-state';

// Immortal Exit Protocol
export {
  ImmortalExitProtocol,
  createImmortalExit,
  type ImmortalExitConfig,
  type PositionWithMarket,
  type ReevaluatedPosition,
} from './immortal-exit';

// Trading Engine
export {
  TradingEngine,
  createTradingEngine,
  type TradingEngineConfig,
  type EngineStatus,
} from './trading-engine';

// Risk Physics
export {
  RiskPhysics as RiskPhysicsClass,
  break_even_distance_pct,
  required_win_rate_with_fees,
  calculate_max_drawdown,
  risk_of_ruin,
  calculate_sharpe_ratio,
} from './risk-physics';

// Telegram Bot
export {
  TelegramBot,
  getTelegramBot,
  initializeTelegramBot,
  resetTelegramBot,
} from './telegram-bot';

// Activity Logger
export {
  ActivityLogger,
  getActivityLogger,
  resetActivityLogger,
} from './activity-logger';

// Alpha Ranker
export {
  AlphaRanker,
  calculate_ev,
  calculate_kelly,
  break_even_win_rate,
  calculate_optimal_leverage,
  type EvaluatedSignal,
} from './alpha-ranker';

// Sentinels (Signal Generation)
export {
  SignalFactory,
  OrderBlockBreakerFlow,
  WhaleFlowDetector,
  calculate_regime_stats,
  calculate_volume_profile,
} from './sentinels';

// Trading Configuration
export {
  TradingConfig,
  tradingConfig,
  getMexcCredentials,
  getBybitCredentials,
  getTelegramConfig,
  getRiskSettings,
  getTradingParams,
  getSignalThresholds,
  type SignalThresholds,
  type StrategyWeights,
} from './config';

// Types
export type {
  // Core Trading Types
  MarketRegime,
  SignalDirection,
  SignalStrategy,
  OrderSide,
  OrderStatus,
  PositionStatus,
  Exchange as ExchangeType,
  Signal,
  SignalMetadata,
  Position,
  OrderBookLevel,
  OrderBook,
  TradeResult as TradeResultType,
  MarketData,
  CandleData,
  RiskSettings,
  PortfolioSummary,
  APICredentials,
  ExchangeConfig,
  TelegramConfig,
  BotConfig,
  TradingParams,
  PerformanceMetrics,
  SignalPerformance,
  // Extended Types from sentinels
  Candle,
  OrderBlock,
  OrderFlowImbalance,
  RegimeStats,
  SentinelsConfig,
  Trade,
  VolumeProfile,
  WhaleOrder,
  // Extended Types from alpha-ranker
  AlphaRankerConfig,
  // Extended Types from risk-physics
  RiskPhysicsConfig,
  EvaluatedSignal as EvaluatedSignalType,
  PositionSizing,
  RiskLevels,
} from './types';

// Utilities
export {
  calculate_atr,
  calculate_atr_pct,
  round_to_tick_size,
  round_to_qty_step,
  format_price,
  format_quantity,
  calculate_sma,
  calculate_ema,
  calculate_std,
  calculate_spread_pct,
  calculate_mid_price,
  ms_to_timeframe,
  get_timestamp_ms,
  get_timestamp_s,
  pct_change,
  apply_pct_change,
  is_valid_price,
  is_valid_quantity,
  clamp,
} from './utils';
