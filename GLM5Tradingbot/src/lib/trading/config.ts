/**
 * Trading Configuration for GLM5Tradingbot
 * Loads configuration from .h2tkn file and provides trading parameters
 */

import * as fs from 'fs';
import * as path from 'path';
import type { 
  RiskSettings, 
  TradingParams, 
  APICredentials, 
  TelegramConfig,
  Exchange,
  MarketRegime 
} from './types';

/**
 * Signal Thresholds Configuration
 */
export interface SignalThresholds {
  MIN_EV_SCORE: number;
  MIN_KELLY_SCORE: number;
  MIN_WIN_PROBABILITY: number;
  MIN_CONFIDENCE: number;
  MIN_EXPECTED_MOVE_PCT: number;
}

/**
 * Strategy Weights Configuration
 */
export interface StrategyWeights {
  momentum: number;
  mean_reversion: number;
  breakout: number;
  scalping: number;
  swing: number;
  sentiment: number;
}

/**
 * TradingConfig Class
 * Manages all trading configuration and parameters
 */
export class TradingConfig {
  private static instance: TradingConfig | null = null;
  private configPath: string;
  private envVars: Record<string, string> = {};

  // Trading Parameters
  public readonly BASE_CAPITAL_USDT: number = 15;
  public readonly LEVERAGE: number = 10;
  public readonly MAX_OPEN_POSITIONS: number = 3;
  public readonly SIGNAL_INTERVAL_MS: number = 60000; // 1 minute

  // Signal Thresholds
  public readonly MIN_EV_SCORE: number = 0.02;
  public readonly MIN_KELLY_SCORE: number = 0;
  public readonly MIN_WIN_PROBABILITY: number = 0.55;
  public readonly MIN_CONFIDENCE: number = 0.6;
  public readonly MIN_EXPECTED_MOVE_PCT: number = 0.5;

  // Risk Management
  public readonly MAX_POSITION_SIZE_PCT: number = 0.33; // 33% of capital
  public readonly MAX_TOTAL_EXPOSURE_PCT: number = 0.9; // 90% of capital
  public readonly MAX_DRAWDOWN_PCT: number = 0.15; // 15% max drawdown
  public readonly STOP_LOSS_PCT: number = 0.02; // 2% stop loss
  public readonly TAKE_PROFIT_PCT: number = 0.04; // 4% take profit
  public readonly TRAILING_STOP_PCT: number = 0.015; // 1.5% trailing stop

  // Target Trading Symbols
  public readonly TARGET_SYMBOLS: string[] = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'DOGEUSDT',
    'ADAUSDT',
    'AVAXUSDT',
    'LINKUSDT',
    'DOTUSDT',
    'MATICUSDT',
    'ATOMUSDT',
    'LTCUSDT',
    'BNBUSDT',
    'ARBUSDT',
    'OPUSDT'
  ];

  // Supported Timeframes
  public readonly TIMEFRAMES: string[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

  // Market Regime Thresholds
  public readonly REGIME_THRESHOLDS = {
    trending_adx: 25,
    ranging_adx: 20,
    volatile_atr_mult: 1.5,
    calm_atr_mult: 0.5
  };

  // Strategy Weights
  public readonly STRATEGY_WEIGHTS: StrategyWeights = {
    momentum: 0.25,
    mean_reversion: 0.20,
    breakout: 0.20,
    scalping: 0.15,
    swing: 0.15,
    sentiment: 0.05
  };

  // Exchange Fees (maker/taker)
  public readonly EXCHANGE_FEES: Record<Exchange, { maker: number; taker: number }> = {
    mexc: { maker: 0.001, taker: 0.001 },
    bybit: { maker: 0.0002, taker: 0.00055 },
  };

  private constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.h2tkn');
    this.loadConfig();
  }

  /**
   * Get singleton instance of TradingConfig
   */
  public static getInstance(configPath?: string): TradingConfig {
    if (!TradingConfig.instance) {
      TradingConfig.instance = new TradingConfig(configPath);
    }
    return TradingConfig.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    TradingConfig.instance = null;
  }

  /**
   * Load configuration from .h2tkn file
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.parseEnvFile(content);
      } else {
        console.warn(`Config file not found at ${this.configPath}, using environment variables or defaults`);
      }
      // Also load from process.env to override file values
      this.loadFromProcessEnv();
    } catch (error) {
      console.error('Error loading config file:', error);
      this.loadFromProcessEnv();
    }
  }

  /**
   * Parse .h2tkn file content
   */
  private parseEnvFile(content: string): void {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        continue;
      }
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        this.envVars[key.trim()] = value;
      }
    }
  }

  /**
   * Load values from process.env
   */
  private loadFromProcessEnv(): void {
    const envKeys = [
      'MEXC_API_KEY',
      'MEXC_API_SECRET',
      'BYBIT_API_KEY',
      'BYBIT_API_SECRET',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ];

    for (const key of envKeys) {
      if (process.env[key]) {
        this.envVars[key] = process.env[key] as string;
      }
    }
  }

  /**
   * Get MEXC API credentials
   */
  public getMexcCredentials(): APICredentials {
    return {
      apiKey: this.envVars['MEXC_API_KEY'] || '',
      apiSecret: this.envVars['MEXC_API_SECRET'] || ''
    };
  }

  /**
   * Get Bybit API credentials
   */
  public getBybitCredentials(): APICredentials {
    return {
      apiKey: this.envVars['BYBIT_API_KEY'] || '',
      apiSecret: this.envVars['BYBIT_API_SECRET'] || ''
    };
  }

  /**
   * Get Telegram configuration
   */
  public getTelegramConfig(): TelegramConfig {
    return {
      botToken: this.envVars['TELEGRAM_BOT_TOKEN'] || '',
      chatId: this.envVars['TELEGRAM_CHAT_ID'] || '',
      enabled: !!(this.envVars['TELEGRAM_BOT_TOKEN'] && this.envVars['TELEGRAM_CHAT_ID']),
      notifyOnSignal: true,
      notifyOnTrade: true,
      notifyOnError: true
    };
  }

  /**
   * Get risk management settings
   */
  public getRiskSettings(): RiskSettings {
    return {
      max_position_size_usdt: this.BASE_CAPITAL_USDT * this.MAX_POSITION_SIZE_PCT,
      max_leverage: this.LEVERAGE,
      max_total_exposure_usdt: this.BASE_CAPITAL_USDT * this.MAX_TOTAL_EXPOSURE_PCT,
      max_drawdown_pct: this.MAX_DRAWDOWN_PCT,
      max_correlated_positions: 2,
      stop_loss_pct: this.STOP_LOSS_PCT,
      take_profit_pct: this.TAKE_PROFIT_PCT,
      trailing_stop_pct: this.TRAILING_STOP_PCT
    };
  }

  /**
   * Get trading parameters
   */
  public getTradingParams(): TradingParams {
    return {
      base_capital_usdt: this.BASE_CAPITAL_USDT,
      leverage: this.LEVERAGE,
      min_ev_score: this.MIN_EV_SCORE,
      min_kelly_score: this.MIN_KELLY_SCORE,
      min_win_probability: this.MIN_WIN_PROBABILITY,
      target_symbols: this.TARGET_SYMBOLS,
      signal_interval_ms: this.SIGNAL_INTERVAL_MS,
      max_open_positions: this.MAX_OPEN_POSITIONS
    };
  }

  /**
   * Get signal thresholds
   */
  public getSignalThresholds(): SignalThresholds {
    return {
      MIN_EV_SCORE: this.MIN_EV_SCORE,
      MIN_KELLY_SCORE: this.MIN_KELLY_SCORE,
      MIN_WIN_PROBABILITY: this.MIN_WIN_PROBABILITY,
      MIN_CONFIDENCE: this.MIN_CONFIDENCE,
      MIN_EXPECTED_MOVE_PCT: this.MIN_EXPECTED_MOVE_PCT
    };
  }

  /**
   * Calculate position size based on Kelly Criterion
   */
  public calculateKellyPositionSize(
    winProbability: number,
    winLossRatio: number,
    capital: number = this.BASE_CAPITAL_USDT
  ): number {
    // Kelly formula: K% = W - (1-W)/R
    // Where W = win probability, R = win/loss ratio
    const kellyFraction = winProbability - (1 - winProbability) / winLossRatio;
    
    // Apply half-Kelly for safety
    const halfKelly = kellyFraction / 2;
    
    // Limit to max position size
    const maxPositionSize = capital * this.MAX_POSITION_SIZE_PCT;
    const positionSize = Math.min(capital * Math.max(0, halfKelly), maxPositionSize);
    
    return Math.round(positionSize * 100) / 100;
  }

  /**
   * Calculate leverage-adjusted position size
   */
  public calculateLeveragedPositionSize(
    baseSize: number,
    leverage: number = this.LEVERAGE
  ): number {
    return baseSize * Math.min(leverage, this.LEVERAGE);
  }

  /**
   * Check if a signal meets the trading criteria
   */
  public meetsSignalCriteria(evScore: number, kellyScore: number, winProb: number): boolean {
    return (
      evScore >= this.MIN_EV_SCORE &&
      kellyScore >= this.MIN_KELLY_SCORE &&
      winProb >= this.MIN_WIN_PROBABILITY
    );
  }

  /**
   * Get market regime based on ADX and ATR
   */
  public determineMarketRegime(adx: number, atrRelative: number): MarketRegime {
    // Simplified regime detection: TRENDING when ADX is high, RANGING otherwise
    if (adx >= this.REGIME_THRESHOLDS.trending_adx) {
      return 'TRENDING';
    } else if (adx <= this.REGIME_THRESHOLDS.ranging_adx) {
      return 'RANGING';
    }
    // Default to ranging for uncertain conditions
    return 'RANGING';
  }

  /**
   * Get fee for exchange
   */
  public getExchangeFee(exchange: Exchange, isMaker: boolean = false): number {
    const fees = this.EXCHANGE_FEES[exchange];
    return isMaker ? fees.maker : fees.taker;
  }

  /**
   * Validate configuration
   */
  public validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check API credentials
    const mexc = this.getMexcCredentials();
    const bybit = this.getBybitCredentials();
    const telegram = this.getTelegramConfig();

    if (!mexc.apiKey && !bybit.apiKey) {
      errors.push('No exchange API credentials configured');
    }

    if (mexc.apiKey && !mexc.apiSecret) {
      errors.push('MEXC API key provided but secret is missing');
    }

    if (bybit.apiKey && !bybit.apiSecret) {
      errors.push('Bybit API key provided but secret is missing');
    }

    if (telegram.botToken && !telegram.chatId) {
      errors.push('Telegram bot token provided but chat ID is missing');
    }

    // Validate trading parameters
    if (this.BASE_CAPITAL_USDT <= 0) {
      errors.push('Base capital must be positive');
    }

    if (this.LEVERAGE <= 0 || this.LEVERAGE > 100) {
      errors.push('Leverage must be between 1 and 100');
    }

    if (this.TARGET_SYMBOLS.length === 0) {
      errors.push('No target symbols configured');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get all configuration as a plain object
   */
  public toObject(): Record<string, unknown> {
    return {
      trading: this.getTradingParams(),
      risk: this.getRiskSettings(),
      signalThresholds: this.getSignalThresholds(),
      targetSymbols: this.TARGET_SYMBOLS,
      timeframes: this.TIMEFRAMES,
      strategyWeights: this.STRATEGY_WEIGHTS,
      telegramEnabled: this.getTelegramConfig().enabled,
      hasMexcCredentials: !!(this.getMexcCredentials().apiKey),
      hasBybitCredentials: !!(this.getBybitCredentials().apiKey)
    };
  }
}

// Export default singleton instance
export const tradingConfig = TradingConfig.getInstance();

// Export convenience functions
export const getMexcCredentials = () => tradingConfig.getMexcCredentials();
export const getBybitCredentials = () => tradingConfig.getBybitCredentials();
export const getTelegramConfig = () => tradingConfig.getTelegramConfig();
export const getRiskSettings = () => tradingConfig.getRiskSettings();
export const getTradingParams = () => tradingConfig.getTradingParams();
export const getSignalThresholds = () => tradingConfig.getSignalThresholds();
