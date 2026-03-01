/**
 * Trading Bot Status API Route
 * GET /api/trading/status
 * Returns current bot status, uptime, positions count, balance, and last signal time
 */

import { NextResponse } from 'next/server';
import { getBotState } from '@/lib/trading/bot-state';
import { getActivityLogger } from '@/lib/trading/activity-logger';

export async function GET() {
  try {
    const botState = getBotState();
    const logger = getActivityLogger();

    // Get all status information
    const status = botState.getStatus();
    const systemStatus = botState.getSystemStatus();
    const sessionStats = botState.getSessionStats();
    const tradingStats = botState.getTradingStats();
    const walletBalance = botState.getWalletBalance();
    const availableMargin = botState.getAvailableMargin();
    const positionCount = botState.getPositionCount();
    const lastError = botState.getLastError();
    const recentActivity = logger.getRecentLogs(10);

    // Calculate health status
    let health: 'healthy' | 'warning' | 'error' = 'healthy';
    if (lastError) {
      health = 'error';
    } else if (positionCount > 3) {
      health = 'warning';
    }

    return NextResponse.json({
      success: true,
      status: {
        running: systemStatus.isRunning,
        botStatus: status,
        health,
      },
      uptime: {
        ms: systemStatus.uptime,
        formatted: botState.getUptimeFormatted(),
        startTime: systemStatus.startTime,
      },
      positions: {
        count: positionCount,
        active: systemStatus.activePositions,
      },
      balance: {
        walletBalance,
        availableMargin,
        currency: 'USDT',
      },
      signals: {
        lastSignalTime: systemStatus.lastSignalTime,
        pending: systemStatus.pendingOrders,
        totalGenerated: sessionStats.totalSignals,
        totalExecuted: sessionStats.executedSignals,
      },
      trading: {
        successfulTrades: sessionStats.successfulTrades,
        failedTrades: sessionStats.failedTrades,
        totalPnl: sessionStats.totalPnl,
        totalFees: sessionStats.totalFees,
        maxDrawdown: sessionStats.maxDrawdown,
        winRate: tradingStats.winRate,
      },
      lastError,
      recentActivity: recentActivity.map(log => ({
        timestamp: log.timestamp,
        event: log.event,
        type: log.type,
      })),
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to get bot status: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
