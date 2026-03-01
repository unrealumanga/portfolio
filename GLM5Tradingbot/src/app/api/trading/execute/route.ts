/**
 * Manual Trade Execution API Route
 * POST /api/trading/execute
 * Executes a specific trade manually with given parameters
 */

import { NextRequest, NextResponse } from 'next/server';
import { ExecutionRouter, type TradeSignal } from '@/lib/trading/execution-router';
import { TradingConfig } from '@/lib/trading/config';
import { getBotState } from '@/lib/trading/bot-state';
import { getTelegramBot } from '@/lib/trading/telegram-bot';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import type { Signal, SignalDirection, SignalStrategy, Exchange } from '@/lib/trading/types';

// Execution router instance (shared with start route)
let executionRouter: ExecutionRouter | null = null;

function getExecutionRouter(): ExecutionRouter | null {
  const config = TradingConfig.getInstance();
  const exchange: Exchange = 'bybit'; // Default to Bybit
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

// Get current market price (mock implementation)
async function getCurrentPrice(symbol: string): Promise<number> {
  // In production, this would fetch from exchange API
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

// Get ATR for a symbol (mock implementation)
async function getATR(symbol: string): Promise<number> {
  const price = await getCurrentPrice(symbol);
  return price * 0.02; // 2% ATR as mock
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, direction, strategy, size, leverage, dryRun } = body;

    // Validate required parameters
    if (!symbol || !direction) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameters: symbol and direction are required',
        },
        { status: 400 }
      );
    }

    // Validate direction
    const validDirections: SignalDirection[] = ['LONG', 'SHORT'];
    if (!validDirections.includes(direction.toUpperCase() as SignalDirection)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid direction: ${direction}. Must be 'LONG' or 'SHORT'`,
        },
        { status: 400 }
      );
    }

    const config = TradingConfig.getInstance();
    const botState = getBotState();
    const logger = getActivityLogger();

    // Get execution router
    const router = getExecutionRouter();
    if (!router) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No exchange credentials configured. Cannot execute trade.',
        },
        { status: 400 }
      );
    }

    // Get current market data
    const currentPrice = await getCurrentPrice(symbol);
    const atr = await getATR(symbol);

    // Check for open positions
    const existingPosition = botState.getPositionBySymbol(symbol);
    if (existingPosition) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Already have an open position for ${symbol}`,
          existingPosition: {
            side: existingPosition.side,
            size: existingPosition.size,
            entryPrice: existingPosition.entry_price,
          },
        },
        { status: 400 }
      );
    }

    // Check max positions
    const currentPositionCount = botState.getPositionCount();
    if (currentPositionCount >= config.MAX_OPEN_POSITIONS) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Maximum open positions reached (${config.MAX_OPEN_POSITIONS})`,
        },
        { status: 400 }
      );
    }

    // Get balance
    const walletBalance = await router.getBalance();
    botState.setWalletBalance(walletBalance);

    // Prepare trade parameters
    const tradeSignal: TradeSignal = direction.toLowerCase() === 'long' ? 'LONG' : 'SHORT';
    const tradeParams = {
      signal: tradeSignal,
      symbol,
      currentPrice,
      atr,
      walletBalance,
      leverage: leverage || config.LEVERAGE,
      riskPercent: 1,
      rewardRiskRatio: 2,
    };

    // Log trade attempt
    logger.log('TRADE_ATTEMPT', {
      symbol,
      direction,
      strategy,
      currentPrice,
      atr,
      walletBalance,
      leverage: tradeParams.leverage,
      dryRun: dryRun || false,
    }, 'info');

    // If dry run, return simulated result
    if (dryRun) {
      const riskPhysics = router.calculateRiskPhysics(
        tradeSignal,
        currentPrice,
        atr,
        walletBalance,
        tradeParams.leverage,
        1,
        2
      );

      return NextResponse.json({
        success: true,
        dryRun: true,
        message: 'Dry run completed - trade not executed',
        trade: {
          symbol,
          direction,
          side: tradeSignal === 'LONG' ? 'buy' : 'sell',
          orderType: 'market',
          currentPrice,
          takeProfit: riskPhysics.takeProfit,
          stopLoss: riskPhysics.stopLoss,
          positionSize: riskPhysics.positionSize,
          positionValue: riskPhysics.positionValue,
          leverage: riskPhysics.leverage,
          riskAmount: riskPhysics.riskAmount,
          rewardAmount: riskPhysics.rewardAmount,
          liquidationPrice: riskPhysics.liquidationPrice,
        },
        validation: {
          isValid: riskPhysics.isValid,
          errors: riskPhysics.validationErrors,
        },
        timestamp: Date.now(),
      });
    }

    // Execute the trade
    const result = await router.executeTrade(tradeParams);

    if (result.success) {
      // Create position record
      const position: Signal = {
        id: result.orderId || `pos-${Date.now()}`,
        symbol,
        strategy: (strategy as SignalStrategy) || 'MANUAL',
        direction: direction.toUpperCase() as SignalDirection,
        win_probability: 0.5,
        expected_move_pct: 2,
        regime: 'TRENDING',
        ev_score: 0,
        kelly_score: 0,
        confidence: 0.5,
        entry_price: currentPrice,
        stop_loss: result.stopLoss,
        take_profit: result.takeProfit,
        timestamp: new Date(),
      };

      // Send Telegram notification
      const telegramBot = getTelegramBot();
      if (telegramBot) {
        await telegramBot.sendMessage(
          `🎯 *MANUAL TRADE EXECUTED*\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📊 Symbol: ${symbol}\n` +
          `${direction.toUpperCase() === 'LONG' ? '📈' : '📉'} Direction: ${direction.toUpperCase()}\n` +
          `💰 Entry: $${currentPrice.toLocaleString()}\n` +
          `🎯 TP: $${result.takeProfit?.toLocaleString() || 'N/A'}\n` +
          `🛡️ SL: $${result.stopLoss?.toLocaleString() || 'N/A'}\n` +
          `📦 Size: ${result.quantity}\n` +
          `⚡ Leverage: ${tradeParams.leverage}x\n` +
          `📝 Order ID: ${result.orderId || 'N/A'}\n` +
          `━━━━━━━━━━━━━━━━`
        );
      }

      // Log successful trade
      logger.log('TRADE_EXECUTED', {
        orderId: result.orderId,
        symbol,
        direction,
        side: result.side,
        quantity: result.quantity,
        price: result.price,
        takeProfit: result.takeProfit,
        stopLoss: result.stopLoss,
        message: result.message,
      }, 'success');

      return NextResponse.json({
        success: true,
        message: result.message,
        trade: {
          orderId: result.orderId,
          orderLinkId: result.orderLinkId,
          symbol: result.symbol,
          side: result.side,
          type: result.type,
          quantity: result.quantity,
          price: result.price,
          takeProfit: result.takeProfit,
          stopLoss: result.stopLoss,
          status: result.status,
          exchange: result.exchange,
          riskPhysics: result.riskPhysics,
        },
        signal: position,
        timestamp: result.timestamp,
      });
    } else {
      // Log failed trade
      logger.log('TRADE_FAILED', {
        symbol,
        direction,
        error: result.message,
      }, 'error');

      return NextResponse.json(
        {
          success: false,
          error: result.message,
          trade: {
            symbol: result.symbol,
            side: result.side,
            quantity: result.quantity,
            status: result.status,
          },
        },
        { status: 400 }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to execute trade: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to preview trade without executing
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const direction = searchParams.get('direction') as 'long' | 'short' | null;

  if (!symbol) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Symbol parameter is required',
      },
      { status: 400 }
    );
  }

  const config = TradingConfig.getInstance();
  const router = getExecutionRouter();

  if (!router) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'No exchange credentials configured',
      },
      { status: 400 }
    );
  }

  const currentPrice = await getCurrentPrice(symbol);
  const atr = await getATR(symbol);
  const walletBalance = await router.getBalance();
  const tradeSignal: TradeSignal = direction === 'short' ? 'SHORT' : 'LONG';

  const riskPhysics = router.calculateRiskPhysics(
    tradeSignal,
    currentPrice,
    atr,
    walletBalance,
    config.LEVERAGE,
    1,
    2
  );

  return NextResponse.json({
    success: true,
    preview: {
      symbol,
      direction: direction || 'long',
      currentPrice,
      atr,
      walletBalance,
      leverage: config.LEVERAGE,
      takeProfit: riskPhysics.takeProfit,
      stopLoss: riskPhysics.stopLoss,
      positionSize: riskPhysics.positionSize,
      positionValue: riskPhysics.positionValue,
      riskAmount: riskPhysics.riskAmount,
      rewardAmount: riskPhysics.rewardAmount,
      liquidationPrice: riskPhysics.liquidationPrice,
      isValid: riskPhysics.isValid,
      validationErrors: riskPhysics.validationErrors,
    },
    timestamp: Date.now(),
  });
}
