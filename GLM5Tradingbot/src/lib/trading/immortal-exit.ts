/**
 * Immortal Exit Protocol for GLM5Tradingbot
 * Ensures all positions have valid TP/SL on exchange servers during shutdown
 * 
 * Protocol Flow:
 * 1. Detect termination signal (Ctrl+C, SIGTERM, etc.)
 * 2. Set isShuttingDown = true
 * 3. Stop accepting new signals
 * 4. Fetch all open positions from exchange
 * 5. For each position:
 *    - Fetch fresh market data (ATR, price)
 *    - Recalculate TP/SL using current volatility
 *    - Update TP/SL on exchange servers (exchange manages the exit)
 * 6. Send Telegram alert with all position updates
 * 7. Log shutdown event
 * 8. Exit cleanly
 */

import type { Position, Signal, Exchange } from './types';
import { ExecutionRouter } from './execution-router';
import { TelegramBot } from './telegram-bot';
import { ActivityLogger, getActivityLogger } from './activity-logger';
import { BotStateManager, getBotState } from './bot-state';
import { RiskPhysics } from './risk-physics';
import { BybitClient } from './bybit-client';
import { MexcClient } from './mexc-client';
import { calculate_atr } from './utils';

// ==================== Types ====================

export interface ImmortalExitConfig {
  exchange: Exchange;
  defaultAtrMultiplierSL: number;
  defaultAtrMultiplierTP: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface PositionWithMarket {
  position: Position;
  currentPrice: number;
  atr: number;
}

export interface ReevaluatedPosition {
  position: Position;
  newSL: number;
  newTP: number;
  oldSL?: number;
  oldTP?: number;
  updated: boolean;
  error?: string;
}

const DEFAULT_CONFIG: ImmortalExitConfig = {
  exchange: 'bybit',
  defaultAtrMultiplierSL: 1.5,
  defaultAtrMultiplierTP: 2.0,
  maxRetries: 3,
  retryDelayMs: 1000,
};

// ==================== Immortal Exit Protocol Class ====================

/**
 * Immortal Exit Protocol
 * Ensures graceful shutdown with all positions having valid TP/SL on exchange
 */
export class ImmortalExitProtocol {
  private isShuttingDown: boolean = false;
  private router: ExecutionRouter;
  private telegramBot: TelegramBot | null;
  private activityLogger: ActivityLogger;
  private botState: BotStateManager;
  private config: ImmortalExitConfig;
  private riskPhysics: RiskPhysics;

  constructor(
    router: ExecutionRouter,
    telegramBot: TelegramBot | null = null,
    config: Partial<ImmortalExitConfig> = {}
  ) {
    this.router = router;
    this.telegramBot = telegramBot;
    this.activityLogger = getActivityLogger();
    this.botState = getBotState();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.riskPhysics = new RiskPhysics();
  }

  /**
   * Bind termination signals (SIGINT, SIGTERM)
   * Attaches signal handlers for graceful shutdown
   */
  bindSignals(): void {
    // Handle Ctrl+C
    process.on('SIGINT', async () => {
      console.log('\n🛑 SIGINT received - Initiating Immortal Exit Protocol...');
      await this.execute('SIGINT (Ctrl+C)');
      process.exit(0);
    });

    // Handle kill command
    process.on('SIGTERM', async () => {
      console.log('\n🛑 SIGTERM received - Initiating Immortal Exit Protocol...');
      await this.execute('SIGTERM (kill command)');
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('\n❌ Uncaught Exception:', error);
      this.activityLogger.log('UNCAUGHT_EXCEPTION', {
        error: error.message,
        stack: error.stack,
      }, 'error');
      
      await this.execute(`Uncaught Exception: ${error.message}`);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      console.error('\n❌ Unhandled Rejection:', reason);
      this.activityLogger.log('UNHANDLED_REJECTION', {
        reason: String(reason),
      }, 'error');
      
      await this.execute(`Unhandled Rejection: ${String(reason)}`);
      process.exit(1);
    });

    console.log('✅ Immortal Exit Protocol signals bound');
  }

  /**
   * Main exit protocol execution
   * Coordinates the complete shutdown sequence
   */
  async execute(reason: string = 'Manual shutdown'): Promise<void> {
    // Prevent double execution
    if (this.isShuttingDown) {
      console.log('⚠️ Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    console.log('\n' + '='.repeat(50));
    console.log('🛡️ IMMORTAL EXIT PROTOCOL INITIATED');
    console.log('='.repeat(50));
    console.log(`📋 Reason: ${reason}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);

    // Initiate shutdown state in bot state manager
    this.botState.initiateShutdown(reason);

    this.activityLogger.log('IMMORTAL_EXIT_STARTED', {
      reason,
      timestamp: startTime,
    }, 'warning');

    try {
      // Step 1: Fetch all open positions from exchange
      console.log('\n📡 Step 1: Fetching open positions...');
      const positions = await this.fetchOpenPositions();
      console.log(`   Found ${positions.length} open positions`);
      
      this.botState.setShutdownPositionsFetched(positions);

      if (positions.length === 0) {
        console.log('✅ No open positions - clean shutdown');
        await this.sendFinalNotification([]);
        this.logShutdown([]);
        this.botState.completeShutdown();
        return;
      }

      // Step 2: Re-evaluate each position with fresh market data
      console.log('\n📊 Step 2: Re-evaluating positions with fresh market data...');
      const reevaluatedPositions: ReevaluatedPosition[] = [];

      for (const position of positions) {
        try {
          console.log(`\n   Processing ${position.symbol}...`);
          
          const reevaluated = await this.reevaluatePosition(position);
          reevaluatedPositions.push(reevaluated);
          
          if (reevaluated.updated) {
            console.log(`   ✅ Updated: SL ${reevaluated.oldSL?.toFixed(4)} → ${reevaluated.newSL.toFixed(4)}, TP ${reevaluated.oldTP?.toFixed(4)} → ${reevaluated.newTP.toFixed(4)}`);
          } else if (reevaluated.error) {
            console.log(`   ❌ Error: ${reevaluated.error}`);
          } else {
            console.log(`   ⏭️ Skipped (no update needed)`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(`   ❌ Failed: ${errorMessage}`);
          reevaluatedPositions.push({
            position,
            newSL: position.stop_loss || 0,
            newTP: position.take_profit || 0,
            updated: false,
            error: errorMessage,
          });
          this.botState.addShutdownError(errorMessage);
        }
      }

      // Step 3: Update positions on exchange
      console.log('\n🔄 Step 3: Updating positions on exchange...');
      for (const reevaluated of reevaluatedPositions) {
        if (reevaluated.updated) {
          try {
            await this.updatePositionOnExchange(
              reevaluated.position,
              reevaluated.newSL,
              reevaluated.newTP
            );
            this.botState.addShutdownPositionUpdated(
              reevaluated.position,
              reevaluated.newSL,
              reevaluated.newTP
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(`   ❌ Failed to update ${reevaluated.position.symbol}: ${errorMessage}`);
            reevaluated.error = errorMessage;
            this.botState.addShutdownError(errorMessage);
          }
        }
      }

      // Step 4: Send final Telegram notification
      console.log('\n📤 Step 4: Sending final notification...');
      await this.sendFinalNotification(
        reevaluatedPositions.filter(r => r.updated).map(r => r.position)
      );

      // Step 5: Log shutdown event
      this.logShutdown(positions);

      const duration = Date.now() - startTime;
      console.log('\n' + '='.repeat(50));
      console.log('✅ IMMORTAL EXIT PROTOCOL COMPLETE');
      console.log(`⏱️ Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log(`📊 Positions updated: ${reevaluatedPositions.filter(r => r.updated).length}`);
      console.log(`❌ Errors: ${reevaluatedPositions.filter(r => r.error).length}`);
      console.log('='.repeat(50) + '\n');

      this.botState.completeShutdown();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('\n❌ FATAL ERROR during Immortal Exit:', errorMessage);
      this.botState.addShutdownError(errorMessage);
      this.activityLogger.log('IMMORTAL_EXIT_ERROR', {
        error: errorMessage,
      }, 'error');
      
      // Still try to send notification
      await this.sendFinalNotification([]);
      this.botState.completeShutdown();
    }
  }

  /**
   * Fetch all open positions from exchange
   */
  async fetchOpenPositions(): Promise<Position[]> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.maxRetries) {
      try {
        const positions = await this.router.getPositions(this.config.exchange);
        
        // Convert to Position format
        return positions.map((p, index) => ({
          id: `${p.symbol}-${Date.now()}-${index}`,
          symbol: p.symbol,
          exchange: this.config.exchange,
          side: p.side.toUpperCase() === 'BUY' || p.side.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT',
          size: p.size,
          entry_price: p.entryPrice,
          current_price: p.entryPrice, // Will be updated with fresh price
          leverage: 1, // Default, will be updated if available
          margin: p.size * p.entryPrice,
          unrealized_pnl: p.unrealizedPnl,
          status: 'open' as const,
          opened_at: new Date(),
        }));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempts++;
        console.log(`   ⚠️ Attempt ${attempts}/${this.config.maxRetries} failed: ${lastError.message}`);
        
        if (attempts < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs);
        }
      }
    }

    // Return local positions as fallback
    console.log('   ⚠️ Using local cached positions as fallback');
    return this.botState.getOpenPositions();
  }

  /**
   * Re-evaluate position with fresh market data
   * Returns new TP/SL based on current volatility
   */
  async reevaluatePosition(position: Position): Promise<ReevaluatedPosition> {
    try {
      // Fetch fresh market data
      const marketData = await this.fetchMarketData(position.symbol);
      
      if (!marketData) {
        return {
          position,
          newSL: position.stop_loss || 0,
          newTP: position.take_profit || 0,
          updated: false,
          error: 'Failed to fetch market data',
        };
      }

      // Create a signal-like object for risk physics calculation
      const signalForCalc: Signal = {
        id: position.id,
        symbol: position.symbol,
        strategy: 'IMMORTAL_EXIT',
        direction: position.side === 'LONG' ? 'LONG' : 'SHORT',
        win_probability: 0.5,
        expected_move_pct: (marketData.atr / marketData.currentPrice) * 100,
        regime: 'RANGING',
        ev_score: 0,
        kelly_score: 0,
        confidence: 1,
        current_price: marketData.currentPrice,
        atr: marketData.atr,
        timestamp: Date.now(),
      };

      // Calculate new TP/SL using risk physics
      const riskLevels = this.riskPhysics.calculate_tp_sl(
        signalForCalc,
        this.config.defaultAtrMultiplierTP,
        this.config.defaultAtrMultiplierSL
      );

      const newSL = riskLevels.stopLossPrice;
      const newTP = riskLevels.takeProfitPrice;
      const oldSL = position.stop_loss;
      const oldTP = position.take_profit;

      // Check if update is needed
      const slChanged = !oldSL || Math.abs(oldSL - newSL) / oldSL > 0.01;
      const tpChanged = !oldTP || Math.abs(oldTP - newTP) / oldTP > 0.01;
      const needsUpdate = slChanged || tpChanged;

      return {
        position: {
          ...position,
          current_price: marketData.currentPrice,
        },
        newSL,
        newTP,
        oldSL,
        oldTP,
        updated: needsUpdate,
      };
    } catch (error) {
      return {
        position,
        newSL: position.stop_loss || 0,
        newTP: position.take_profit || 0,
        updated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update TP/SL on exchange servers
   */
  async updatePositionOnExchange(
    position: Position,
    newSL: number,
    newTP: number
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.maxRetries) {
      try {
        const result = await this.router.updateTpSl(
          position.symbol,
          newTP,
          newSL,
          this.config.exchange
        );

        if (result.success) {
          this.activityLogger.log('POSITION_TPSL_UPDATED', {
            symbol: position.symbol,
            newTP,
            newSL,
            exchange: this.config.exchange,
          });
          return;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempts++;
        console.log(`   ⚠️ Update attempt ${attempts}/${this.config.maxRetries} failed: ${lastError.message}`);
        
        if (attempts < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs);
        }
      }
    }

    throw lastError || new Error('Failed to update position');
  }

  /**
   * Send final Telegram notification
   */
  async sendFinalNotification(positions: Position[]): Promise<void> {
    if (!this.telegramBot) {
      console.log('   ⚠️ Telegram bot not configured - skipping notification');
      return;
    }

    try {
      const shutdownState = this.botState.getShutdownState();
      
      // Build notification message
      let message = `🛡️ IMMORTAL EXIT PROTOCOL COMPLETE\n`;
      message += `${'━'.repeat(30)}\n`;
      message += `📋 Reason: ${shutdownState.shutdownReason}\n`;
      message += `⏰ Time: ${new Date().toLocaleString()}\n`;
      message += `${'━'.repeat(30)}\n`;
      
      if (positions.length > 0) {
        message += `📊 POSITIONS UPDATED (${positions.length})\n`;
        message += `${'━'.repeat(30)}\n`;
        
        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          const state = shutdownState.positionsUpdated.find(s => s.id === p.id);
          message += `${i + 1}. ${p.symbol} ${p.side.toUpperCase()}\n`;
          message += `   Size: ${p.size.toFixed(4)}\n`;
          message += `   Entry: $${p.entry_price.toFixed(2)}\n`;
          if (state) {
            message += `   🎯 New TP: $${state.take_profit?.toFixed(2) || 'N/A'}\n`;
            message += `   🛡️ New SL: $${state.stop_loss?.toFixed(2) || 'N/A'}\n`;
          }
        }
      } else if (shutdownState.positionsBeforeShutdown.length === 0) {
        message += `✅ No open positions to update\n`;
      }
      
      if (shutdownState.errors.length > 0) {
        message += `${'━'.repeat(30)}\n`;
        message += `⚠️ ERRORS (${shutdownState.errors.length})\n`;
        for (const error of shutdownState.errors.slice(0, 5)) {
          message += `• ${error.substring(0, 50)}\n`;
        }
      }
      
      message += `${'━'.repeat(30)}\n`;
      message += `✅ Exchange servers managing exits`;

      await this.telegramBot.sendMessage(message);
      console.log('   ✅ Telegram notification sent');
    } catch (error) {
      console.log(`   ❌ Failed to send Telegram notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Log the shutdown event
   */
  logShutdown(positions: Position[]): void {
    const shutdownState = this.botState.getShutdownState();
    
    this.activityLogger.log('IMMORTAL_EXIT_COMPLETE', {
      reason: shutdownState.shutdownReason,
      positionsCount: positions.length,
      positionsUpdated: shutdownState.positionsUpdated.length,
      errors: shutdownState.errors.length,
      duration: shutdownState.shutdownTimestamp 
        ? Date.now() - shutdownState.shutdownTimestamp 
        : 0,
    }, 'warning');
  }

  // ==================== Helper Methods ====================

  /**
   * Fetch market data (price and ATR) for a symbol
   */
  private async fetchMarketData(symbol: string): Promise<{ currentPrice: number; atr: number } | null> {
    try {
      const bybitClient = this.router.getBybitClient();
      const mexcClient = this.router.getMexcClient();

      if (this.config.exchange === 'bybit' && bybitClient) {
        // Fetch klines for ATR calculation
        const klines = await bybitClient.getKlines('linear', symbol, '15', 50);
        
        if (klines.length < 15) {
          return null;
        }

        // Calculate ATR from klines
        const candles = klines.map(k => ({
          timestamp: k.startTime,
          open: parseFloat(k.openPrice),
          high: parseFloat(k.highPrice),
          low: parseFloat(k.lowPrice),
          close: parseFloat(k.closePrice),
          volume: parseFloat(k.volume),
        }));

        const atr = calculate_atr(candles, 14);
        const currentPrice = parseFloat(klines[0].closePrice); // Most recent close

        return { currentPrice, atr };
      } else if (this.config.exchange === 'mexc' && mexcClient) {
        // Fetch klines for MEXC
        const klines = await mexcClient.getKlines(symbol, '15m', 50);
        
        if (klines.length < 15) {
          return null;
        }

        const candles = klines.map(k => ({
          timestamp: k.openTime,
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
        }));

        const atr = calculate_atr(candles, 14);
        const currentPrice = parseFloat(klines[klines.length - 1].close);

        return { currentPrice, atr };
      }

      return null;
    } catch (error) {
      console.error(`Failed to fetch market data for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if currently shutting down
   */
  isActive(): boolean {
    return this.isShuttingDown;
  }
}

// ==================== Factory Function ====================

/**
 * Create an ImmortalExitProtocol instance
 */
export function createImmortalExit(
  router: ExecutionRouter,
  telegramBot: TelegramBot | null = null,
  config?: Partial<ImmortalExitConfig>
): ImmortalExitProtocol {
  return new ImmortalExitProtocol(router, telegramBot, config);
}

export default ImmortalExitProtocol;
