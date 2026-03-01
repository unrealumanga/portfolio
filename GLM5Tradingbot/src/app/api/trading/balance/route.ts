/**
 * Wallet Balance API Route
 * GET /api/trading/balance
 * Fetches USDT balance from active exchange with available margin
 */

import { NextRequest, NextResponse } from 'next/server';
import { ExecutionRouter } from '@/lib/trading/execution-router';
import { TradingConfig } from '@/lib/trading/config';
import { getBotState } from '@/lib/trading/bot-state';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import type { Exchange, PortfolioSummary } from '@/lib/trading/types';

// Get execution router
function getExecutionRouter(): ExecutionRouter | null {
  const config = TradingConfig.getInstance();
  const exchange: Exchange = 'bybit';
  const credentials = config.getBybitCredentials();

  if (!credentials.apiKey || !credentials.apiSecret) {
    return null;
  }

  return new ExecutionRouter({
    defaultExchange: exchange,
    bybitApiKey: credentials.apiKey,
    bybitApiSecret: credentials.apiSecret,
    testnet: false,
    defaultLeverage: config.LEVERAGE,
    defaultRiskPercent: 1,
    defaultRewardRiskRatio: 2,
    maxCapitalPerTrade: config.BASE_CAPITAL_USDT,
    minCapitalRequired: 15,
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exchange: Exchange = (searchParams.get('exchange') as Exchange) || 'bybit';

    const config = TradingConfig.getInstance();
    const botState = getBotState();
    const logger = getActivityLogger();
    const router = getExecutionRouter();

    // Initialize response data
    let walletBalance = 0;
    let availableBalance = 0;
    let usedMargin = 0;
    let unrealizedPnl = 0;
    let exchangeData: {
      connected: boolean;
      exchange: Exchange;
      lastUpdate?: number;
      error?: string;
    } | null = null;

    // Try to get live balance from exchange
    if (router) {
      try {
        walletBalance = await router.getBalance(exchange);
        availableBalance = walletBalance; // Simplified - would get actual available from exchange

        // Get positions to calculate used margin and unrealized PnL
        const positions = await router.getPositions(exchange);
        
        for (const pos of positions) {
          if (pos.size > 0) {
            usedMargin += (pos.size * pos.entryPrice) / config.LEVERAGE;
            unrealizedPnl += pos.unrealizedPnl;
          }
        }

        exchangeData = {
          connected: true,
          exchange,
          lastUpdate: Date.now(),
        };
      } catch (error) {
        logger.log('BALANCE_FETCH_ERROR', {
          error: error instanceof Error ? error.message : 'Unknown error',
          exchange,
        }, 'warning');

        // Fall back to cached values from bot state
        walletBalance = botState.getWalletBalance();
        availableBalance = botState.getAvailableMargin();

        exchangeData = {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          exchange,
        };
      }
    } else {
      // No router - use cached values
      walletBalance = botState.getWalletBalance();
      availableBalance = botState.getAvailableMargin();

      exchangeData = {
        connected: false,
        error: 'No exchange credentials configured',
        exchange,
      };
    }

    // Calculate derived values
    const totalEquity = walletBalance + unrealizedPnl;
    const marginUsage = usedMargin / walletBalance * 100;
    const availableForTrading = Math.max(0, availableBalance - usedMargin);

    // Get session statistics
    const sessionStats = botState.getSessionStats();
    const tradingStats = botState.getTradingStats();

    // Calculate daily PnL (simplified - would need to track by day)
    const dailyPnl = sessionStats.totalPnl;
    const dailyPnlPct = walletBalance > 0 ? (dailyPnl / walletBalance) * 100 : 0;

    // Build portfolio summary
    const portfolio: PortfolioSummary = {
      total_equity: totalEquity,
      available_balance: availableForTrading,
      used_margin: usedMargin,
      unrealized_pnl: unrealizedPnl,
      realized_pnl: sessionStats.totalPnl,
      total_positions: botState.getPositionCount(),
      total_exposure: usedMargin * config.LEVERAGE,
      daily_pnl: dailyPnl,
      daily_pnl_pct: dailyPnlPct,
      win_rate: tradingStats.winRate,
    };

    // Update bot state with latest balance
    botState.setWalletBalance(walletBalance);
    botState.setAvailableMargin(availableBalance);

    // Log balance fetch
    logger.log('BALANCE_FETCHED', {
      walletBalance,
      availableBalance,
      usedMargin,
      unrealizedPnl,
      exchange,
    }, 'info');

    return NextResponse.json({
      success: true,
      balance: {
        walletBalance,
        availableBalance: availableForTrading,
        usedMargin,
        unrealizedPnl,
        totalEquity,
        currency: 'USDT',
        marginUsage: marginUsage.toFixed(2) + '%',
      },
      portfolio,
      exchange: exchangeData,
      trading: {
        sessionPnl: sessionStats.totalPnl,
        sessionFees: sessionStats.totalFees,
        successfulTrades: sessionStats.successfulTrades,
        failedTrades: sessionStats.failedTrades,
        maxDrawdown: sessionStats.maxDrawdown,
        winRate: tradingStats.winRate.toFixed(2) + '%',
      },
      risk: {
        maxCapitalPerTrade: config.BASE_CAPITAL_USDT,
        leverage: config.LEVERAGE,
        maxPositions: config.MAX_OPEN_POSITIONS,
        currentPositions: botState.getPositionCount(),
        canOpenNewPosition: botState.getPositionCount() < config.MAX_OPEN_POSITIONS,
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to fetch balance: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// POST to update cached balance (for manual refresh or updates)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const botState = getBotState();
    const logger = getActivityLogger();

    // Allow manual balance update (useful for testing or manual override)
    if (body.walletBalance !== undefined) {
      botState.setWalletBalance(body.walletBalance);
    }
    if (body.availableMargin !== undefined) {
      botState.setAvailableMargin(body.availableMargin);
    }

    logger.log('BALANCE_MANUAL_UPDATE', {
      walletBalance: body.walletBalance,
      availableMargin: body.availableMargin,
    }, 'info');

    // Return fresh balance from exchange
    const getRequest = new Request(request.url, { method: 'GET' });
    return GET(getRequest as NextRequest);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to update balance: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
