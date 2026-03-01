/**
 * Open Positions API Route
 * GET /api/trading/positions
 * Fetches open positions from active exchange with PnL
 */

import { NextRequest, NextResponse } from 'next/server';
import { ExecutionRouter } from '@/lib/trading/execution-router';
import { TradingConfig } from '@/lib/trading/config';
import { getBotState } from '@/lib/trading/bot-state';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import type { Exchange, Position } from '@/lib/trading/types';

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

// Get current price for a symbol (mock implementation)
async function getCurrentPrice(symbol: string): Promise<number> {
  const basePrices: Record<string, number> = {
    'BTCUSDT': 95000,
    'ETHUSDT': 3500,
    'SOLUSDT': 180,
    'XRPUSDT': 2.5,
    'DOGEUSDT': 0.4,
    'ADAUSDT': 1.0,
    'AVAXUSDT': 40,
    'LINKUSDT': 20,
    'DOTUSDT': 8,
    'MATICUSDT': 0.9,
    'ATOMUSDT': 10,
    'LTCUSDT': 100,
    'BNBUSDT': 650,
    'ARBUSDT': 1.2,
    'OPUSDT': 2.5,
  };

  return basePrices[symbol] || 100;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const exchange: Exchange = (searchParams.get('exchange') as Exchange) || 'bybit';

    const config = TradingConfig.getInstance();
    const botState = getBotState();
    const logger = getActivityLogger();

    // Get router
    const router = getExecutionRouter();

    // First get positions from bot state (local tracking)
    const localPositions = botState.getActivePositions();

    // If we have exchange credentials, try to get live positions
    let exchangePositions: Array<{
      symbol: string;
      side: string;
      size: number;
      entryPrice: number;
      unrealizedPnl: number;
    }> = [];

    if (router) {
      try {
        exchangePositions = await router.getPositions(exchange);
      } catch (error) {
        logger.log('POSITIONS_FETCH_ERROR', {
          error: error instanceof Error ? error.message : 'Unknown error',
          exchange,
        }, 'warning');
      }
    }

    // Merge local and exchange positions
    const mergedPositions: Position[] = [];

    // Add local positions with updated PnL
    for (const pos of localPositions) {
      const currentPrice = await getCurrentPrice(pos.symbol);
      const pnl = pos.side === 'LONG'
        ? (currentPrice - pos.entry_price) * pos.size
        : (pos.entry_price - currentPrice) * pos.size;
      const pnlPct = pos.side === 'LONG'
        ? ((currentPrice - pos.entry_price) / pos.entry_price) * 100
        : ((pos.entry_price - currentPrice) / pos.entry_price) * 100;

      mergedPositions.push({
        ...pos,
        current_price: currentPrice,
        unrealized_pnl: pnl,
      });
    }

    // Add exchange positions that aren't in local
    for (const exPos of exchangePositions) {
      const existsLocal = localPositions.some(
        p => p.symbol === exPos.symbol && p.side === exPos.side.toUpperCase()
      );

      if (!existsLocal && exPos.size > 0) {
        const currentPrice = await getCurrentPrice(exPos.symbol);
        
        mergedPositions.push({
          id: `ex-${exPos.symbol}-${Date.now()}`,
          symbol: exPos.symbol,
          exchange,
          side: exPos.side.toUpperCase() as 'LONG' | 'SHORT',
          size: exPos.size,
          entry_price: exPos.entryPrice,
          current_price: currentPrice,
          leverage: config.LEVERAGE,
          margin: exPos.size * exPos.entryPrice / config.LEVERAGE,
          unrealized_pnl: exPos.unrealizedPnl,
          status: 'open',
          opened_at: new Date(),
        });
      }
    }

    // Filter by symbol if requested
    const filteredPositions = symbol
      ? mergedPositions.filter(p => p.symbol === symbol)
      : mergedPositions;

    // Calculate totals
    const totalPnl = filteredPositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    const totalExposure = filteredPositions.reduce(
      (sum, p) => sum + p.size * (p.current_price || p.entry_price),
      0
    );
    const winningPositions = filteredPositions.filter(p => (p.unrealized_pnl || 0) > 0).length;
    const losingPositions = filteredPositions.filter(p => (p.unrealized_pnl || 0) < 0).length;

    // Log positions fetch
    logger.log('POSITIONS_FETCHED', {
      count: filteredPositions.length,
      exchange,
      totalPnl,
      symbol: symbol || 'all',
    }, 'info');

    return NextResponse.json({
      success: true,
      positions: filteredPositions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        exchange: p.exchange,
        side: p.side,
        direction: p.side === 'LONG' ? 'LONG' : 'SHORT',
        size: p.size,
        entryPrice: p.entry_price,
        currentPrice: p.current_price,
        leverage: p.leverage,
        margin: p.margin,
        unrealizedPnl: p.unrealized_pnl,
        pnlPercent: ((p.current_price && p.entry_price) ? 
          (p.side === 'LONG' ? 
            ((p.current_price - p.entry_price) / p.entry_price) * 100 :
            ((p.entry_price - p.current_price) / p.entry_price) * 100) : 0),
        takeProfit: p.take_profit,
        stopLoss: p.stop_loss,
        status: p.status,
        openedAt: p.opened_at,
        liquidationPrice: p.liquidation_price,
      })),
      summary: {
        totalPositions: filteredPositions.length,
        winningPositions,
        losingPositions,
        totalPnl,
        totalExposure,
        totalMargin: filteredPositions.reduce((sum, p) => sum + p.margin, 0),
      },
      exchange: exchange,
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to fetch positions: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// DELETE to close a position
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { symbol, positionId, closeAll } = body;

    const botState = getBotState();
    const logger = getActivityLogger();
    const router = getExecutionRouter();

    if (closeAll) {
      // Close all positions
      const positions = botState.getActivePositions();
      const results = [];

      for (const position of positions) {
        if (router) {
          try {
            const result = await router.closePosition(position.symbol);
            results.push({
              symbol: position.symbol,
              success: result.success,
              message: result.message,
            });
          } catch (error) {
            results.push({
              symbol: position.symbol,
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
        
        botState.removePosition(position.id);
      }

      logger.log('ALL_POSITIONS_CLOSED', {
        count: positions.length,
        results,
      }, 'success');

      return NextResponse.json({
        success: true,
        message: `Closed ${positions.length} positions`,
        results,
      });
    }

    if (!symbol && !positionId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Either symbol or positionId is required, or set closeAll to true',
        },
        { status: 400 }
      );
    }

    // Find position to close
    let position: Position | undefined;
    
    if (positionId) {
      position = botState.removePosition(positionId);
    } else if (symbol) {
      position = botState.getPositionBySymbol(symbol);
      if (position) {
        botState.removePosition(position.id);
      }
    }

    if (!position) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Position not found${symbol ? ` for ${symbol}` : ''}`,
        },
        { status: 404 }
      );
    }

    // Close on exchange if router available
    let exchangeResult = null;
    if (router) {
      exchangeResult = await router.closePosition(position.symbol);
    }

    logger.log('POSITION_CLOSED', {
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      entryPrice: position.entry_price,
      pnl: position.realized_pnl,
      exchangeResult,
    }, 'success');

    return NextResponse.json({
      success: true,
      message: `Position closed for ${position.symbol}`,
      position: {
        symbol: position.symbol,
        side: position.side,
        size: position.size,
        entryPrice: position.entry_price,
        realizedPnl: position.realized_pnl,
      },
      exchangeResult,
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to close position: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
