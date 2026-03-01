/**
 * Trading Engine for GLM5Tradingbot
 * Main orchestrator that coordinates all trading operations
 * 
 * Components:
 * - Signal generation (Sentinels)
 * - Signal ranking (AlphaRanker)
 * - Trade execution (ExecutionRouter)
 * - Position monitoring
 * - Risk management (RiskPhysics)
 * - Telegram notifications
 * - Immortal Exit Protocol
 */

import type { 
  Position, 
  Signal, 
  Exchange, 
  MarketData,
  OrderBook,
  Candle,
  TradingParams,
  RiskSettings,
} from './types';
import { TradingConfig } from './config';
import { BybitClient } from './bybit-client';
import { MexcClient } from './mexc-client';
import { ExecutionRouter, TradeResult, TradeParams } from './execution-router';
import { SignalFactory } from './sentinels';
import { AlphaRanker, EvaluatedSignal } from './alpha-ranker';
import { RiskPhysics } from './risk-physics';
import { TelegramBot } from './telegram-bot';
import { ActivityLogger, getActivityLogger } from './activity-logger';
import { BotStateManager, getBotState, BotStatus } from './bot-state';
import { ImmortalExitProtocol } from './immortal-exit';
import { calculate_atr } from './utils';

// ==================== Types ====================

export interface TradingEngineConfig {
  exchange: Exchange;
  symbols: string[];
  leverage: number;
  riskPercent: number;
  rewardRiskRatio: number;
  maxOpenPositions: number;
  signalIntervalMs: number;
  minEvScore: number;
  minKellyScore: number;
  testnet?: boolean;
}

export interface EngineStatus {
  status: BotStatus;
  isRunning: boolean;
  uptime: number;
  positions: number;
  pendingSignals: number;
  lastSignal: string | null;
  lastTrade: string | null;
  errorCount: number;
}

export const DEFAULT_ENGINE_CONFIG: TradingEngineConfig = {
  exchange: 'bybit',
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  leverage: 10,
  riskPercent: 1,
  rewardRiskRatio: 2,
  maxOpenPositions: 3,
  signalIntervalMs: 60000,
  minEvScore: 0.02,
  minKellyScore: 0,
};

// ==================== Trading Engine Class ====================

/**
 * Trading Engine
 * Main orchestrator for all trading operations
 */
export class TradingEngine {
  private config: TradingEngineConfig;
  private tradingConfig: TradingConfig;
  private exchangeClient: BybitClient | MexcClient | null = null;
  private sentinels: SignalFactory[] = [];
  private ranker: AlphaRanker;
  private router: ExecutionRouter;
  private telegramBot: TelegramBot | null = null;
  private activityLogger: ActivityLogger;
  private botState: BotStateManager;
  private immortalExit: ImmortalExitProtocol;
  private riskPhysics: RiskPhysics;
  
  private isRunning: boolean = false;
  private mainLoopInterval: NodeJS.Timeout | null = null;
  private lastSignalTime: number = 0;
  private lastTradeTime: number = 0;

  constructor(
    router: ExecutionRouter,
    config: Partial<TradingEngineConfig> = {}
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.tradingConfig = TradingConfig.getInstance();
    this.router = router;
    this.ranker = new AlphaRanker({
      minEvScore: this.config.minEvScore,
      minKellyScore: this.config.minKellyScore,
    });
    this.riskPhysics = new RiskPhysics();
    this.activityLogger = getActivityLogger();
    this.botState = getBotState();
    this.immortalExit = new ImmortalExitProtocol(
      this.router,
      null, // Will be set later if telegram is available
      { exchange: this.config.exchange }
    );

    // Initialize sentinels for each strategy
    this.initializeSentinels();
  }

  /**
   * Set Telegram bot for notifications
   */
  setTelegramBot(bot: TelegramBot): void {
    this.telegramBot = bot;
    this.immortalExit = new ImmortalExitProtocol(
      this.router,
      bot,
      { exchange: this.config.exchange }
    );
  }

  /**
   * Initialize signal sentinels
   */
  private initializeSentinels(): void {
    // Create signal factories for different strategies
    this.sentinels = [
      new SignalFactory({ hurstLookback: 100 }),
    ];
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Trading Engine...');
    
    try {
      this.botState.setStatus('initializing');

      // Get exchange client
      this.exchangeClient = this.config.exchange === 'bybit'
        ? this.router.getBybitClient()
        : this.router.getMexcClient();

      if (!this.exchangeClient) {
        throw new Error(`Exchange client not available: ${this.config.exchange}`);
      }

      // Initialize instrument cache
      console.log('📦 Caching instrument info...');
      await this.router.initializeCache(this.config.symbols);

      // Bind immortal exit signals
      this.immortalExit.bindSignals();

      this.activityLogger.log('ENGINE_INITIALIZED', {
        exchange: this.config.exchange,
        symbols: this.config.symbols,
        config: this.config,
      });

      console.log('✅ Trading Engine initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to initialize Trading Engine:', errorMessage);
      this.botState.setStatus('error');
      this.botState.recordError(error instanceof Error ? error : new Error(errorMessage), 'initialize');
      throw error;
    }
  }

  /**
   * Main trading loop
   */
  async runLoop(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Trading loop already running');
      return;
    }

    this.isRunning = true;
    this.botState.setStatus('running');

    console.log('🔄 Starting trading loop...');
    this.activityLogger.log('TRADING_LOOP_STARTED', {
      symbols: this.config.symbols,
      interval: this.config.signalIntervalMs,
    });

    // Main loop
    while (this.isRunning && !this.botState.isShuttingDown()) {
      try {
        // Check position limit
        if (this.botState.getPositionCount() >= this.config.maxOpenPositions) {
          console.log('📊 Max positions reached, monitoring only...');
          await this.monitorPositions();
        } else {
          // Gather and process signals
          const signals = await this.gatherSignals();
          
          if (signals.length > 0) {
            const bestSignal = await this.processSignals(signals);
            
            if (bestSignal) {
              await this.executeTrade(bestSignal);
            }
          }
        }

        // Wait for next interval
        await this.sleep(this.config.signalIntervalMs);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Trading loop error:', errorMessage);
        this.botState.recordError(error instanceof Error ? error : new Error(errorMessage), 'runLoop');
        this.activityLogger.log('TRADING_LOOP_ERROR', { error: errorMessage }, 'error');
        
        // Wait before retrying
        await this.sleep(5000);
      }
    }

    console.log('🛑 Trading loop stopped');
  }

  /**
   * Gather signals from all sentinels
   */
  async gatherSignals(): Promise<Signal[]> {
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      try {
        // Fetch market data
        const marketData = await this.fetchMarketData(symbol);
        
        if (!marketData) {
          continue;
        }

        // Generate signals from each sentinel
        for (const sentinel of this.sentinels) {
          const signal = sentinel.generate_signal(
            symbol,
            marketData.candles,
            marketData.orderBook,
            'MOMENTUM', // Default strategy
            'LONG' // Will be evaluated by ranker
          );

          if (signal) {
            signals.push(signal);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.activityLogger.log('SIGNAL_GATHER_ERROR', {
          symbol,
          error: errorMessage,
        }, 'error');
      }
    }

    return signals;
  }

  /**
   * Process and rank signals
   */
  async processSignals(signals: Signal[]): Promise<EvaluatedSignal | null> {
    if (signals.length === 0) {
      return null;
    }

    // Evaluate signals using alpha ranker
    let orderBook: OrderBook = {
      symbol: signals[0].symbol,
      exchange: this.config.exchange,
      bids: [],
      asks: [],
      timestamp: new Date(),
    };

    // Try to get orderbook for first signal
    try {
      const marketData = await this.fetchMarketData(signals[0].symbol);
      if (marketData) {
        orderBook = marketData.orderBook;
      }
    } catch {
      // Use empty orderbook
    }

    // Evaluate and sort signals
    const evaluatedSignals = this.ranker.evaluate_and_sort(signals, orderBook);
    
    // Pick the best signal
    const bestSignal = this.ranker.pick_apex_signal(evaluatedSignals);
    
    if (bestSignal) {
      this.lastSignalTime = Date.now();
      this.botState.addPendingSignal(bestSignal);
      
      // Send telegram notification
      if (this.telegramBot) {
        await this.telegramBot.sendSignalAlert({
          symbol: bestSignal.symbol,
          direction: bestSignal.direction.toUpperCase() as 'LONG' | 'SHORT',
          entryPrice: bestSignal.current_price || 0,
          takeProfit: bestSignal.take_profit || 0,
          stopLoss: bestSignal.stop_loss || 0,
          evScore: bestSignal.ev_score,
          kellyFraction: bestSignal.kelly_score,
        });
      }
      
      this.activityLogger.log('SIGNAL_DETECTED', {
        symbol: bestSignal.symbol,
        direction: bestSignal.direction,
        evScore: bestSignal.ev_score,
        kellyScore: bestSignal.kelly_score,
      });
    }

    return bestSignal;
  }

  /**
   * Execute a trade based on signal
   */
  async executeTrade(signal: EvaluatedSignal): Promise<TradeResult> {
    console.log(`\n🎯 Executing trade: ${signal.symbol} ${signal.direction}`);

    // Calculate position sizing and risk
    const riskLevels = this.riskPhysics.calculate_tp_sl(signal);
    const positionSizing = this.riskPhysics.calculate_position_size(
      signal,
      riskLevels,
      0.01, // Default tick size
      0.001 // Default qty step
    );

    // Get wallet balance
    const balance = await this.router.getBalance(this.config.exchange);

    // Create trade params
    const tradeParams: TradeParams = {
      signal: signal.direction === 'LONG' ? 'LONG' : 'SHORT',
      symbol: signal.symbol,
      currentPrice: signal.current_price || riskLevels.entryPrice,
      atr: signal.atr || 0,
      walletBalance: balance,
      leverage: positionSizing.leverage,
      riskPercent: this.config.riskPercent,
      rewardRiskRatio: this.config.rewardRiskRatio,
    };

    // Execute trade
    const result = await this.router.executeTrade(tradeParams);

    if (result.success) {
      this.lastTradeTime = Date.now();
      
      // Add position to state
      const position: Position = {
        id: result.orderId || `pos-${Date.now()}`,
        symbol: result.symbol,
        exchange: this.config.exchange,
        side: (result.side.toLowerCase() === 'buy' || result.side.toLowerCase() === 'long') ? 'LONG' : 'SHORT',
        size: result.quantity,
        entry_price: result.price || tradeParams.currentPrice,
        leverage: positionSizing.leverage,
        margin: positionSizing.capital,
        stop_loss: result.stopLoss,
        take_profit: result.takeProfit,
        status: 'open',
        opened_at: new Date(),
        signal_id: signal.id,
      };
      
      this.botState.addPosition(position);
      
      // Send telegram notification
      if (this.telegramBot) {
        await this.telegramBot.sendTradeAlert(
          {
            symbol: result.symbol,
            direction: result.side === 'Buy' ? 'LONG' : 'SHORT',
            entryPrice: result.price || tradeParams.currentPrice,
            takeProfit: result.takeProfit || 0,
            stopLoss: result.stopLoss || 0,
            evScore: signal.ev_score,
            kellyFraction: signal.kelly_score,
          },
          result
        );
      }
      
      this.activityLogger.log('TRADE_EXECUTED', {
        orderId: result.orderId,
        symbol: result.symbol,
        side: result.side,
        quantity: result.quantity,
        price: result.price,
        takeProfit: result.takeProfit,
        stopLoss: result.stopLoss,
      });
    } else {
      this.activityLogger.log('TRADE_FAILED', {
        symbol: result.symbol,
        message: result.message,
      }, 'error');
    }

    return result;
  }

  /**
   * Monitor open positions
   */
  async monitorPositions(): Promise<void> {
    const positions = this.botState.getOpenPositions();
    
    if (positions.length === 0) {
      return;
    }

    for (const position of positions) {
      try {
        // Fetch current market data
        const marketData = await this.fetchMarketData(position.symbol);
        
        if (!marketData) {
          continue;
        }

        const currentPrice = marketData.orderBook.mid_price || 
          marketData.candles[marketData.candles.length - 1]?.close || 0;

        // Update position with current price
        this.botState.updatePosition(position.id, {
          current_price: currentPrice,
        });

        // Check if TP/SL hit
        if (position.take_profit && position.stop_loss) {
          const hitTP = position.side === 'long' 
            ? currentPrice >= position.take_profit
            : currentPrice <= position.take_profit;
          
          const hitSL = position.side === 'long'
            ? currentPrice <= position.stop_loss
            : currentPrice >= position.stop_loss;

          if (hitTP || hitSL) {
            // Position should be closed by exchange, update state
            const pnl = this.calculatePnl(position, currentPrice);
            
            this.botState.removePosition(position.id, pnl);
            
            if (this.telegramBot) {
              await this.telegramBot.sendPositionClosedAlert(
                {
                  ...position,
                  current_price: currentPrice,
                  unrealized_pnl: pnl,
                  unrealized_pnl_percent: (pnl / (position.entry_price * position.size)) * 100,
                  direction: position.side.toUpperCase() as 'LONG' | 'SHORT',
                },
                currentPrice,
                pnl,
                hitTP ? 'TAKE_PROFIT' : 'STOP_LOSS'
              );
            }
            
            this.activityLogger.log('POSITION_CLOSED', {
              positionId: position.id,
              symbol: position.symbol,
              closePrice: currentPrice,
              pnl,
              reason: hitTP ? 'TAKE_PROFIT' : 'STOP_LOSS',
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.activityLogger.log('POSITION_MONITOR_ERROR', {
          positionId: position.id,
          error: errorMessage,
        }, 'error');
      }
    }
  }

  /**
   * Start the engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Engine already running');
      return;
    }

    await this.initialize();
    await this.runLoop();
  }

  /**
   * Stop the engine (triggers immortal exit)
   */
  async stop(reason: string = 'Manual stop'): Promise<void> {
    console.log('🛑 Stopping Trading Engine...');
    
    this.isRunning = false;
    
    // Execute immortal exit protocol
    await this.immortalExit.execute(reason);
  }

  /**
   * Get current status
   */
  getStatus(): EngineStatus {
    const stateSummary = this.botState.getStateSummary();
    
    return {
      status: stateSummary.status,
      isRunning: stateSummary.status === 'running',
      uptime: stateSummary.uptime,
      positions: stateSummary.positionCount,
      pendingSignals: stateSummary.pendingSignalCount,
      lastSignal: this.lastSignalTime ? new Date(this.lastSignalTime).toISOString() : null,
      lastTrade: this.lastTradeTime ? new Date(this.lastTradeTime).toISOString() : null,
      errorCount: stateSummary.errorCount,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Fetch market data for a symbol
   */
  private async fetchMarketData(symbol: string): Promise<{
    candles: Candle[];
    orderBook: OrderBook;
  } | null> {
    try {
      if (this.config.exchange === 'bybit') {
        const client = this.router.getBybitClient();
        if (!client) return null;

        // Fetch klines
        const klines = await client.getKlines('linear', symbol, '15', 100);
        
        // Fetch orderbook
        const orderbookData = await client.getOrderbook('linear', symbol, 10);

        // Convert to Candle format
        const candles: Candle[] = klines.map(k => ({
          timestamp: k.startTime,
          open: parseFloat(k.openPrice),
          high: parseFloat(k.highPrice),
          low: parseFloat(k.lowPrice),
          close: parseFloat(k.closePrice),
          volume: parseFloat(k.volume),
        }));

        // Convert to OrderBook format
        const orderBook: OrderBook = {
          symbol,
          exchange: 'bybit',
          bids: orderbookData.b.map(b => ({
            price: parseFloat(b.price),
            quantity: parseFloat(b.size),
          })),
          asks: orderbookData.a.map(a => ({
            price: parseFloat(a.price),
            quantity: parseFloat(a.size),
          })),
          timestamp: new Date(orderbookData.ts),
        };

        return { candles, orderBook };
      } else if (this.config.exchange === 'mexc') {
        const client = this.router.getMexcClient();
        if (!client) return null;

        // Fetch klines
        const klines = await client.getKlines(symbol, '15m', 100);
        
        // Fetch orderbook
        const orderbookData = await client.getOrderbook(symbol, 10);

        // Convert to Candle format
        const candles: Candle[] = klines.map(k => ({
          timestamp: k.openTime,
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
        }));

        // Convert to OrderBook format
        const orderBook: OrderBook = {
          symbol,
          exchange: 'mexc',
          bids: orderbookData.bids.map(b => ({
            price: parseFloat(b.price),
            quantity: parseFloat(b.quantity),
          })),
          asks: orderbookData.asks.map(a => ({
            price: parseFloat(a.price),
            quantity: parseFloat(a.quantity),
          })),
          timestamp: new Date(orderbookData.lastUpdateId),
        };

        return { candles, orderBook };
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.activityLogger.log('MARKET_DATA_ERROR', {
        symbol,
        error: errorMessage,
      }, 'error');
      return null;
    }
  }

  /**
   * Calculate PnL for a position
   */
  private calculatePnl(position: Position, currentPrice: number): number {
    const priceDiff = position.side === 'LONG'
      ? currentPrice - position.entry_price
      : position.entry_price - currentPrice;
    
    return priceDiff * position.size * position.leverage;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== Factory Function ====================

/**
 * Create a TradingEngine instance
 */
export function createTradingEngine(
  router: ExecutionRouter,
  config?: Partial<TradingEngineConfig>
): TradingEngine {
  return new TradingEngine(router, config);
}

export default TradingEngine;
