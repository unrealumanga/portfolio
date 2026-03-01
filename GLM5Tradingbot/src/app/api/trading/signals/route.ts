/**
 * Trading Signals API Route
 * GET /api/trading/signals
 * Scans all sentinels and runs Alpha Ranker to return top 5 ranked signals
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignalFactory, OrderBlockBreakerFlow, WhaleFlowDetector } from '@/lib/trading/sentinels';
import { AlphaRanker } from '@/lib/trading/alpha-ranker';
import { TradingConfig } from '@/lib/trading/config';
import { getBotState } from '@/lib/trading/bot-state';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import type { Signal, OrderBook, SignalDirection, Candle } from '@/lib/trading/types';

// In-memory cache for market data (in production, this would be real-time)
const marketDataCache = new Map<string, {
  orderBook: OrderBook;
  candles: Candle[];
  lastUpdate: number;
}>();

// Generate mock market data for demonstration
function generateMockMarketData(symbol: string): { orderBook: OrderBook; candles: Candle[] } {
  const basePrice = symbol.includes('BTC') ? 95000 : 
                    symbol.includes('ETH') ? 3500 :
                    symbol.includes('SOL') ? 180 : 
                    symbol.includes('XRP') ? 2.5 : 100;
  
  // Generate candles
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now();
  
  for (let i = 100; i >= 0; i--) {
    const change = (Math.random() - 0.5) * basePrice * 0.02;
    const open = price;
    price = price + change;
    const high = Math.max(open, price) * (1 + Math.random() * 0.01);
    const low = Math.min(open, price) * (1 - Math.random() * 0.01);
    const volume = Math.random() * 1000000 + 100000;
    
    candles.push({
      timestamp: now - i * 60000, // 1 minute candles
      open,
      high,
      low,
      close: price,
      volume,
    });
  }

  // Generate orderbook
  const spread = basePrice * 0.0001;
  const bids = [];
  const asks = [];
  
  for (let i = 0; i < 20; i++) {
    bids.push({
      price: basePrice - spread / 2 - i * basePrice * 0.0001,
      quantity: Math.random() * 10 + 0.1,
    });
    asks.push({
      price: basePrice + spread / 2 + i * basePrice * 0.0001,
      quantity: Math.random() * 10 + 0.1,
    });
  }

  const orderBook: OrderBook = {
    symbol,
    exchange: 'bybit',
    bids,
    asks,
    timestamp: new Date(),
    spread: spread,
    mid_price: basePrice,
  };

  return { orderBook, candles };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const symbol = searchParams.get('symbol');
    
    const config = TradingConfig.getInstance();
    const botState = getBotState();
    const logger = getActivityLogger();

    // Initialize signal generators
    const signalFactory = new SignalFactory();
    const orderBlockBreaker = new OrderBlockBreakerFlow();
    const whaleDetector = new WhaleFlowDetector(50000);
    const alphaRanker = new AlphaRanker();

    // Get target symbols
    const targetSymbols = symbol ? [symbol] : config.TARGET_SYMBOLS;
    
    // Generate signals for each symbol
    const allSignals: Signal[] = [];

    for (const sym of targetSymbols) {
      // Get market data (mock for now, would be real API call in production)
      const { orderBook, candles } = generateMockMarketData(sym);

      // Generate signals from different strategies
      const strategies = ['momentum', 'mean_reversion', 'breakout', 'scalping'] as const;
      
      for (const strategy of strategies) {
        // Determine direction based on recent price action
        const recentCloses = candles.slice(-20).map(c => c.close);
        const priceChange = recentCloses[recentCloses.length - 1] - recentCloses[0];
        const direction: SignalDirection = priceChange > 0 ? 'LONG' : 'SHORT';

        const signal = signalFactory.generate_signal(
          sym,
          candles,
          orderBook,
          strategy,
          direction
        );

        if (signal) {
          allSignals.push({
            id: `${sym}-${strategy}-${Date.now()}`,
            ...signal,
            timestamp: new Date(),
          });
        }
      }

      // Check for order block signals
      const orderBlocks = orderBlockBreaker.detect_order_blocks(candles);
      const currentPrice = candles[candles.length - 1]?.close ?? 0;
      
      const obBreak = orderBlockBreaker.check_order_block_break(currentPrice, orderBlocks);
      if (obBreak) {
        const obSignal = signalFactory.generate_signal(
          sym,
          candles,
          orderBook,
          'breakout',
          obBreak.direction
        );
        
        if (obSignal) {
          allSignals.push({
            id: `${sym}-ob-${Date.now()}`,
            ...obSignal,
            strategy: 'breakout',
            timestamp: new Date(),
          });
        }
      }
    }

    // Evaluate and rank signals using Alpha Ranker
    // We need an orderbook for ranking - use the first symbol's orderbook
    const { orderBook: rankingOrderBook } = generateMockMarketData(targetSymbols[0]);
    
    const rankedSignals = alphaRanker.evaluate_and_sort(allSignals, rankingOrderBook);

    // Get top N signals
    const topSignals = rankedSignals.slice(0, limit);

    // Log signal generation
    logger.log('SIGNALS_GENERATED', {
      totalSignals: allSignals.length,
      rankedSignals: rankedSignals.length,
      topSignals: topSignals.length,
      symbols: targetSymbols.length,
    }, 'info');

    // Update bot state with last signal time
    if (topSignals.length > 0) {
      // Could add signals to pending queue here
    }

    return NextResponse.json({
      success: true,
      signals: topSignals.map(s => ({
        id: s.id,
        symbol: s.symbol,
        strategy: s.strategy,
        direction: s.direction,
        winProbability: s.win_probability,
        expectedMovePct: s.expected_move_pct,
        regime: s.regime,
        evScore: s.ev_score,
        kellyScore: s.kelly_score,
        netRoi: s.net_roi,
        rewardToRisk: s.reward_to_risk,
        spreadPenalty: s.spread_penalty,
        currentPrice: s.current_price,
        entryPrice: s.entry_price,
        takeProfit: s.take_profit,
        stopLoss: s.stop_loss,
        timestamp: s.timestamp,
        metadata: s.metadata,
      })),
      summary: {
        totalGenerated: allSignals.length,
        totalRanked: rankedSignals.length,
        returned: topSignals.length,
        symbolsScanned: targetSymbols.length,
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to generate signals: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// POST to force signal refresh
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const botState = getBotState();

    // Force refresh signals
    const searchUrl = new URL(request.url);
    searchUrl.searchParams.set('limit', body.limit || '5');
    if (body.symbol) {
      searchUrl.searchParams.set('symbol', body.symbol);
    }

    // Create a new request with updated URL
    const getRequest = new Request(searchUrl, { method: 'GET' });
    return GET(getRequest as NextRequest);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to refresh signals: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
