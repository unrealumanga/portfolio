/**
 * Trading Bot Shutdown API Route
 * POST /api/trading/shutdown
 * Triggers the Immortal Exit Protocol for graceful shutdown
 * 
 * Protocol:
 * 1. Stops accepting new signals
 * 2. Fetches all open positions from exchange
 * 3. Re-evaluates each position with fresh market data
 * 4. Updates TP/SL on exchange servers
 * 5. Sends Telegram notification
 * 6. Returns shutdown status with positions updated
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBotState, BotStatus } from '@/lib/trading/bot-state';
import { getTelegramBot } from '@/lib/trading/telegram-bot';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import { TradingConfig } from '@/lib/trading/config';
import { ExecutionRouter } from '@/lib/trading/execution-router';
import { ImmortalExitProtocol, createImmortalExit } from '@/lib/trading/immortal-exit';
import type { Position, Exchange } from '@/lib/trading/types';

// Global reference to trading engine for shutdown
declare global {
  var tradingEngineInstance: {
    stop: (reason: string) => Promise<void>;
    getStatus: () => {
      status: BotStatus;
      isRunning: boolean;
      uptime: number;
      positions: number;
      pendingSignals: number;
      lastSignal: string | null;
      lastTrade: string | null;
      errorCount: number;
    };
  } | null;
}

export interface ShutdownRequest {
  reason?: string;
  closePositions?: boolean;
  exchange?: Exchange;
}

export interface ShutdownResponse {
  success: boolean;
  message: string;
  status: {
    running: boolean;
    shutdownTimestamp: number | null;
    positionsBeforeShutdown: number;
    positionsUpdated: number;
    errors: string[];
    shutdownComplete: boolean;
  };
  positions?: Position[];
  timestamp: number;
}

/**
 * POST /api/trading/shutdown
 * Triggers the Immortal Exit Protocol
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: ShutdownRequest = await request.json().catch(() => ({}));
    const botState = getBotState();
    const logger = getActivityLogger();
    const config = TradingConfig.getInstance();

    // Check current status
    const currentStatus = botState.getStatus();
    if (currentStatus === 'shutting_down') {
      return NextResponse.json(
        {
          success: false,
          message: 'Shutdown already in progress',
          status: {
            running: false,
            shutdownTimestamp: botState.getShutdownState().shutdownTimestamp,
            positionsBeforeShutdown: botState.getShutdownState().positionsBeforeShutdown.length,
            positionsUpdated: botState.getShutdownState().positionsUpdated.length,
            errors: botState.getShutdownState().errors,
            shutdownComplete: false,
          },
          timestamp: Date.now(),
        },
        { status: 409 } // Conflict
      );
    }

    if (currentStatus === 'stopped' || currentStatus === 'idle') {
      return NextResponse.json(
        {
          success: true,
          message: 'Bot is already stopped',
          status: {
            running: false,
            shutdownTimestamp: botState.getShutdownState().shutdownTimestamp,
            positionsBeforeShutdown: 0,
            positionsUpdated: 0,
            errors: [],
            shutdownComplete: true,
          },
          timestamp: Date.now(),
        }
      );
    }

    // Log shutdown initiation
    logger.log('SHUTDOWN_API_CALLED', {
      reason: body.reason || 'API request',
      closePositions: body.closePositions,
      currentStatus,
    }, 'warning');

    // Get exchange configuration
    const exchange: Exchange = body.exchange || 'bybit';
    const exchangeConfig = exchange === 'bybit'
      ? config.getBybitCredentials()
      : config.getMexcCredentials();

    // Create execution router
    const router = new ExecutionRouter({
      defaultExchange: exchange,
      bybitApiKey: config.getBybitCredentials().apiKey,
      bybitApiSecret: config.getBybitCredentials().apiSecret,
      mexcApiKey: config.getMexcCredentials().apiKey,
      mexcApiSecret: config.getMexcCredentials().apiSecret,
      defaultLeverage: 10,
      defaultRiskPercent: 1,
      defaultRewardRiskRatio: 2,
      maxCapitalPerTrade: 100,
      minCapitalRequired: 15,
    });

    // Get telegram bot
    const telegramBot = getTelegramBot();

    // Create immortal exit protocol
    const immortalExit = createImmortalExit(router, telegramBot, {
      exchange,
      defaultAtrMultiplierSL: 1.5,
      defaultAtrMultiplierTP: 2.0,
      maxRetries: 3,
      retryDelayMs: 1000,
    });

    // Stop trading engine if running
    if (globalThis.tradingEngineInstance) {
      try {
        await globalThis.tradingEngineInstance.stop(body.reason || 'API shutdown request');
      } catch (error) {
        logger.log('ENGINE_STOP_ERROR', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'error');
      }
    }

    // Execute immortal exit protocol
    const reason = body.reason || 'API shutdown request';
    await immortalExit.execute(reason);

    // Get final shutdown state
    const shutdownState = botState.getShutdownState();

    // Build response
    const response: ShutdownResponse = {
      success: true,
      message: 'Immortal Exit Protocol executed successfully',
      status: {
        running: false,
        shutdownTimestamp: shutdownState.shutdownTimestamp,
        positionsBeforeShutdown: shutdownState.positionsBeforeShutdown.length,
        positionsUpdated: shutdownState.positionsUpdated.length,
        errors: shutdownState.errors,
        shutdownComplete: shutdownState.shutdownComplete,
      },
      positions: shutdownState.positionsUpdated,
      timestamp: Date.now(),
    };

    const duration = Date.now() - startTime;

    logger.log('SHUTDOWN_API_COMPLETE', {
      duration,
      positionsUpdated: shutdownState.positionsUpdated.length,
      errors: shutdownState.errors.length,
    }, 'success');

    return NextResponse.json(response);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const logger = getActivityLogger();

    logger.log('SHUTDOWN_API_ERROR', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    }, 'error');

    return NextResponse.json(
      {
        success: false,
        message: `Shutdown failed: ${errorMessage}`,
        status: {
          running: true,
          shutdownTimestamp: null,
          positionsBeforeShutdown: 0,
          positionsUpdated: 0,
          errors: [errorMessage],
          shutdownComplete: false,
        },
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trading/shutdown
 * Preview shutdown status and positions that would be updated
 */
export async function GET() {
  const botState = getBotState();
  const shutdownState = botState.getShutdownState();
  const positions = botState.getOpenPositions();

  return NextResponse.json({
    isShuttingDown: shutdownState.isShuttingDown,
    shutdownComplete: shutdownState.shutdownComplete,
    currentStatus: botState.getStatus(),
    activePositions: positions.length,
    positions: positions.map(p => ({
      symbol: p.symbol,
      exchange: p.exchange,
      side: p.side,
      size: p.size,
      entryPrice: p.entry_price,
      currentPrice: p.current_price,
      unrealizedPnl: p.unrealized_pnl,
      stopLoss: p.stop_loss,
      takeProfit: p.take_profit,
    })),
    lastShutdown: shutdownState.shutdownTimestamp
      ? {
          timestamp: shutdownState.shutdownTimestamp,
          reason: shutdownState.shutdownReason,
          positionsBefore: shutdownState.positionsBeforeShutdown.length,
          positionsUpdated: shutdownState.positionsUpdated.length,
          errors: shutdownState.errors.length,
        }
      : null,
  });
}
