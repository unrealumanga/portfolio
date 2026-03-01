/**
 * Trading Types for GLM5Tradingbot
 * TypeScript interfaces for trading signals, positions, orders, and market data
 */

// Market Regime Types
export type MarketRegime = 'TRENDING' | 'RANGING';

// Signal Direction
export type SignalDirection = 'LONG' | 'SHORT';

// Signal Strategy Types
export type SignalStrategy = 
  | 'MOMENTUM'
  | 'MEAN_REVERSION'
  | 'BREAKOUT'
  | 'SCALPING'
  | 'SWING'
  | 'ARBITRAGE'
  | 'SENTIMENT'
  | 'TECHNICAL'
  | 'WHALE_FLOW'
  | 'ORDER_BLOCK'
  | 'IMMORTAL_EXIT'
  | string; // Allow any string for flexibility

// Order Side
export type OrderSide = 'buy' | 'sell';

// Order Status
export type OrderStatus = 'pending' | 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';

// Position Status
export type PositionStatus = 'open' | 'closed' | 'liquidated';

// Exchange Types
export type Exchange = 'mexc' | 'bybit';

/**
 * Trading Signal Interface
 * Represents a generated trading signal with all scoring metrics
 */
export interface Signal {
  id?: string;
  symbol: string;
  strategy: SignalStrategy | string;
  direction: SignalDirection;
  win_probability: number;
  expected_move_pct: number;
  regime: MarketRegime;
  ev_score?: number;
  kelly_score?: number;
  confidence?: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  current_price?: number;
  atr?: number;
  timestamp: Date | number;
  expiry?: Date;
  metadata?: SignalMetadata;
  spread_penalty?: number;
  signal_strength?: number;
}

/**
 * Signal Metadata
 * Additional information about the signal
 */
export interface SignalMetadata {
  indicators?: Record<string, number>;
  reasoning?: string;
  source?: string;
  model_version?: string;
  [key: string]: unknown; // Allow arbitrary properties
}

/**
 * Position Interface
 * Represents an open or closed trading position
 */
export interface Position {
  id: string;
  symbol: string;
  exchange: Exchange;
  side: SignalDirection;
  size: number;
  entry_price: number;
  current_price?: number;
  leverage: number;
  margin: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  stop_loss?: number;
  take_profit?: number;
  status: PositionStatus;
  opened_at: Date;
  closed_at?: Date;
  signal_id?: string;
  fees_paid?: number;
  liquidation_price?: number;
}

/**
 * OrderBook Level
 * Single price level in the order book
 */
export interface OrderBookLevel {
  price: number;
  quantity: number;
  total?: number;
}

/**
 * OrderBook Interface
 * Represents the order book for a trading pair
 */
export interface OrderBook {
  symbol: string;
  exchange: Exchange;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: Date | number;
  spread?: number;
  mid_price?: number;
}

/**
 * Trade Result Interface
 * Represents the result of an executed trade
 */
export interface TradeResult {
  id: string;
  symbol: string;
  exchange: Exchange;
  side: OrderSide;
  order_type: 'market' | 'limit' | 'stop' | 'stop_limit';
  size: number;
  price: number;
  executed_price?: number;
  executed_size?: number;
  status: OrderStatus;
  fee?: number;
  fee_currency?: string;
  timestamp: Date;
  position_id?: string;
  signal_id?: string;
  error?: string;
}

/**
 * Market Data Interface
 * Real-time market data for a trading pair
 */
export interface MarketData {
  symbol: string;
  exchange: Exchange;
  price: number;
  bid?: number;
  ask?: number;
  high_24h?: number;
  low_24h?: number;
  volume_24h?: number;
  change_24h?: number;
  change_pct_24h?: number;
  timestamp: Date;
}

/**
 * Candlestick/OHLCV Data
 */
export interface CandleData {
  symbol: string;
  exchange: Exchange;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Risk Management Settings
 */
export interface RiskSettings {
  max_position_size_usdt: number;
  max_leverage: number;
  max_total_exposure_usdt: number;
  max_drawdown_pct: number;
  max_correlated_positions: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  trailing_stop_pct?: number;
}

/**
 * Portfolio Summary
 */
export interface PortfolioSummary {
  total_equity: number;
  available_balance: number;
  used_margin: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_positions: number;
  total_exposure: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  win_rate: number;
  sharpe_ratio?: number;
}

/**
 * API Credentials
 */
export interface APICredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

/**
 * Exchange Configuration
 */
export interface ExchangeConfig {
  name: Exchange;
  credentials: APICredentials;
  testnet: boolean;
  rateLimit?: number;
  timeout?: number;
}

/**
 * Telegram Configuration
 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifyOnSignal?: boolean;
  notifyOnTrade?: boolean;
  notifyOnError?: boolean;
}

/**
 * Bot Configuration
 */
export interface BotConfig {
  exchanges: ExchangeConfig[];
  telegram: TelegramConfig;
  risk: RiskSettings;
  trading: TradingParams;
}

/**
 * Trading Parameters
 */
export interface TradingParams {
  base_capital_usdt: number;
  leverage: number;
  min_ev_score: number;
  min_kelly_score: number;
  min_win_probability: number;
  target_symbols: string[];
  signal_interval_ms: number;
  max_open_positions: number;
  position_hold_time_max_ms?: number;
}

/**
 * Performance Metrics
 */
export interface PerformanceMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio?: number;
  calmar_ratio?: number;
  expectancy: number;
}

/**
 * Signal Performance Record
 */
export interface SignalPerformance {
  signal_id: string;
  symbol: string;
  direction: SignalDirection;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  hold_time_ms: number;
  hit_target: boolean;
  hit_stop: boolean;
}

// ==================== Extended Types for Signal Generation ====================

/**
 * Candle/OHLCV Data for internal use
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Trade data for order flow analysis
 */
export interface Trade {
  symbol: string;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  timestamp: number;
}

/**
 * Order Block for SMC analysis
 */
export interface OrderBlock {
  priceLow: number;
  priceHigh: number;
  volume: number;
  side: 'BULLISH' | 'BEARISH';
  timestamp: number;
  broken: boolean;
}

/**
 * Order Flow Imbalance
 */
export interface OrderFlowImbalance {
  symbol: string;
  timestamp: number;
  bidVolume: number;
  askVolume: number;
  imbalanceRatio: number;
  direction: SignalDirection;
  strength: number;
}

/**
 * Volume Profile data
 */
export interface VolumeProfile {
  pocPrice: number;
  pocVolume: number;
  valueAreaHigh: number;
  valueAreaLow: number;
  totalVolume: number;
}

/**
 * Whale Order detection
 */
export interface WhaleOrder {
  symbol: string;
  price: number;
  quantity: number;
  notionalValue: number;
  side: 'BUY' | 'SELL';
  timestamp: number | Date;
  detected: boolean;
}

/**
 * Regime Statistics
 */
export interface RegimeStats {
  regime: MarketRegime | 'TRENDING' | 'RANGING';
  hurstExponent: number;
  trendStrength: number;
  volatilityState: 'LOW' | 'NORMAL' | 'HIGH';
}

/**
 * Sentinels Configuration
 */
export interface SentinelsConfig {
  hurstLookback: number;
  volumeProfileBuckets: number;
  whaleThresholdUsdt: number;
  obiLookback: number;
  obiImbalanceThreshold: number;
}

/**
 * Default Sentinels Configuration
 */
export const DEFAULT_SENTINELS_CONFIG: SentinelsConfig = {
  hurstLookback: 100,
  volumeProfileBuckets: 24,
  whaleThresholdUsdt: 50000,
  obiLookback: 20,
  obiImbalanceThreshold: 1.5,
};

// ==================== Alpha Ranker Types ====================

/**
 * Alpha Ranker Configuration
 */
export interface AlphaRankerConfig {
  minEvScore: number;
  minKellyScore: number;
  takerFee: number;
  slippageBuffer: number;
}

/**
 * Default Alpha Ranker Configuration
 */
export const DEFAULT_ALPHA_RANKER_CONFIG: AlphaRankerConfig = {
  minEvScore: 0.02,
  minKellyScore: 0,
  takerFee: 0.00055,
  slippageBuffer: 0.05,
};

/**
 * Evaluated Signal with all metrics
 */
export interface EvaluatedSignal extends Signal {
  spread_penalty: number;
  gross_roi: number;
  round_trip_fees: number;
  net_roi: number;
  ev_score: number;
  kelly_score: number;
  reward_to_risk: number;
  risk_pct: number;
}

// ==================== Risk Physics Types ====================

/**
 * Risk Physics Configuration
 */
export interface RiskPhysicsConfig {
  maxCapitalPerTrade: number;
  maxLeverage: number;
  minRiskReward: number;
  takerFee: number;
  defaultAtrMultiplierTp: number;
  defaultAtrMultiplierSl: number;
}

/**
 * Default Risk Physics Configuration
 */
export const DEFAULT_RISK_PHYSICS_CONFIG: RiskPhysicsConfig = {
  maxCapitalPerTrade: 15,
  maxLeverage: 10,
  minRiskReward: 1.5,
  takerFee: 0.00055,
  defaultAtrMultiplierTp: 2.0,
  defaultAtrMultiplierSl: 1.5,
};

/**
 * Risk Levels for TP/SL
 */
export interface RiskLevels {
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  breakEvenPrice: number;
  riskRewardRatio: number;
  atrMultiplier: number;
}

/**
 * Position Sizing result
 */
export interface PositionSizing {
  capital: number;
  positionSize: number;
  quantity: number;
  leverage: number;
}

// ==================== Telegram Bot Types ====================

/**
 * Trading Signal for Telegram notifications
 */
export interface TradingSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  evScore: number;
  kellyFraction: number;
  strategy?: string;
}

/**
 * Trading Statistics
 */
export interface TradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  currentStreak: number;
  bestTrade: number;
  worstTrade: number;
}

/**
 * System Status
 */
export interface SystemStatus {
  isRunning: boolean;
  uptime: number;
  activePositions: number;
  pendingOrders: number;
  lastSignalTime: number | null;
  startTime: number | null;
}

/**
 * Activity Log Entry
 */
export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  event: string;
  details: Record<string, unknown>;
  type: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Position for Telegram notifications
 */
export interface TelegramPosition {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  takeProfit?: number;
  stopLoss?: number;
}

/**
 * Bot Config for Telegram
 */
export interface TelegramBotConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}
