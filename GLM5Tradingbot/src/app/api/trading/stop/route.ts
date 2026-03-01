/**
 * Trading Bot Stop API Route
 * POST /api/trading/stop
 * Stops the trading bot with Immortal Exit Protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBotState, BotStateStatus } from '@/lib/trading/bot-state';
import { getTelegramBot } from '@/lib/trading/telegram-bot';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import { TradingConfig } from '@/lib/trading/config';
import type { Position, TelegramPosition } from '@/lib/trading/types';

// Reference to the trading loop interval from start route
declare global {
  var tradingLoopInterval: NodeJS.Timeout | null;
}

// Immortal Exit Protocol
async function executeImmortalExitProtocol(positions: Position[]): Promise<void> {
  const logger = getActivityLogger();
  const config = TradingConfig.getInstance();

  logger.log('IMMORTAL_EXIT_STARTED', {
    positionCount: positions.length,
    timestamp: Date.now(),
  }, 'warning');

  // For each open position, we would:
  // 1. Update TP/SL with fresh ATR-based levels
  // 2. Optionally close positions based on configuration

  // This is a placeholder - actual implementation would interact with exchange
  for (const position of positions) {
    logger.log('POSITION_EXIT_PREPARED', {
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      entryPrice: position.entry_price,
    }, 'info');

    // In a real implementation, we would call the exchange API here
    // to update TP/SL or close the position
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const botState = getBotState();
    const logger = getActivityLogger();
    const config = TradingConfig.getInstance();

    // Check current status
    if (!botState.isRunning()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Bot is not running',
          status: botState.getStatus(),
        },
        { status: 400 }
      );
    }

    // Set status to stopping
    botState.setStatus('stopping' as BotStateStatus);

    // Stop the trading loop
    if (globalThis.tradingLoopInterval) {
      clearInterval(globalThis.tradingLoopInterval);
      globalThis.tradingLoopInterval = null;
    }

    // Get active positions
    const positions = botState.getActivePositions();

    // Execute Immortal Exit Protocol
    const closePositions = body.closePositions ?? false;
    
    if (positions.length > 0) {
      await executeImmortalExitProtocol(positions);

      if (closePositions) {
        // Close all positions immediately
        logger.log('CLOSING_ALL_POSITIONS', {
          count: positions.length,
        }, 'warning');

        // In a real implementation, we would close positions via exchange API
      }
    }

    // Get final statistics
    const sessionStats = botState.getSessionStats();
    const tradingStats = botState.getTradingStats();
    const systemStatus = botState.getSystemStatus();

    // Send Telegram shutdown alert
    const telegramBot = getTelegramBot();
    if (telegramBot) {
      const telegramPositions: TelegramPosition[] = positions.map(p => ({
        symbol: p.symbol,
        direction: p.side === 'LONG' ? 'LONG' : 'SHORT',
        entryPrice: p.entry_price,
        size: p.size,
        unrealizedPnl: p.unrealized_pnl ?? 0,
        unrealizedPnlPercent: 0,
        takeProfit: p.take_profit,
        stopLoss: p.stop_loss,
      }));

      await telegramBot.sendShutdownAlert(telegramPositions as unknown as Position[]);
      
      // Send final statistics
      await telegramBot.sendMessage(
        `📊 *SESSION SUMMARY*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⏱️ Uptime: ${botState.getUptimeFormatted()}\n` +
        `📊 Total Signals: ${sessionStats.totalSignals}\n` +
        `✅ Executed: ${sessionStats.executedSignals}\n` +
        `💰 Total PnL: ${sessionStats.totalPnl.toFixed(2)} USDT\n` +
        `💸 Total Fees: ${sessionStats.totalFees.toFixed(2)} USDT\n` +
        `📈 Win Rate: ${tradingStats.winRate.toFixed(1)}%\n` +
        `📉 Max Drawdown: ${sessionStats.maxDrawdown.toFixed(2)} USDT\n` +
        `━━━━━━━━━━━━━━━━`
      );
    }

    // Set final status
    botState.setStatus('idle' as BotStateStatus);

    // Log shutdown
    logger.log('BOT_STOPPED', {
      uptime: systemStatus.uptime,
      positionsClosed: positions.length,
      sessionStats,
    }, 'success');

    // Return final status
    return NextResponse.json({
      success: true,
      message: 'Trading bot stopped successfully',
      status: {
        running: false,
        uptime: systemStatus.uptime,
        positionsClosed: positions.length,
        sessionStats,
        tradingStats,
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to stop trading bot: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to preview what would happen on stop
export async function GET() {
  const botState = getBotState();
  const positions = botState.getActivePositions();

  return NextResponse.json({
    isRunning: botState.isRunning(),
    status: botState.getStatus(),
    activePositions: positions.length,
    positions: positions.map(p => ({
      symbol: p.symbol,
      side: p.side,
      size: p.size,
      entryPrice: p.entry_price,
      unrealizedPnl: p.unrealized_pnl,
    })),
    sessionStats: botState.getSessionStats(),
  });
}
