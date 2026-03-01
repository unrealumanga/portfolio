/**
 * Trading Bot Start API Route
 * POST /api/trading/start
 * Starts the trading bot with specified configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBotState, BotStateStatus } from '@/lib/trading/bot-state';
import { ExecutionRouter } from '@/lib/trading/execution-router';
import { TradingConfig } from '@/lib/trading/config';
import { getTelegramBot, initializeTelegramBot } from '@/lib/trading/telegram-bot';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import type { Exchange } from '@/lib/trading/types';

// Store the trading loop interval
let tradingLoopInterval: NodeJS.Timeout | null = null;

// Store the execution router instance
let executionRouter: ExecutionRouter | null = null;

// Trading loop function
async function runTradingLoop(): Promise<void> {
  const botState = getBotState();
  const logger = getActivityLogger();
  const config = TradingConfig.getInstance();

  try {
    // Check if we should continue running
    if (!botState.isRunning() || botState.isStopping()) {
      return;
    }

    // Get current balance
    if (executionRouter) {
      const balance = await executionRouter.getBalance();
      botState.setWalletBalance(balance);
      botState.setAvailableMargin(balance);
    }

    // Log heartbeat
    logger.log('TRADING_LOOP', {
      status: botState.getStatus(),
      positions: botState.getPositionCount(),
      balance: botState.getWalletBalance(),
      uptime: botState.getUptime(),
    }, 'info');

    // The actual signal generation and execution logic would go here
    // For now, this is a simplified loop that just maintains state

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    botState.setError(errorMessage);
    logger.log('TRADING_LOOP_ERROR', { error: errorMessage }, 'error');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const botState = getBotState();
    const logger = getActivityLogger();
    const config = TradingConfig.getInstance();

    // Check current status
    if (botState.isRunning()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Bot is already running',
          status: botState.getStatus(),
        },
        { status: 400 }
      );
    }

    // Get exchange preference from request or config
    const exchange: Exchange = body.exchange || 'bybit';
    const testnet = body.testnet ?? false;

    // Get API credentials
    const credentials = exchange === 'mexc' 
      ? config.getMexcCredentials() 
      : config.getBybitCredentials();

    if (!credentials.apiKey || !credentials.apiSecret) {
      return NextResponse.json(
        { 
          success: false, 
          error: `No ${exchange.toUpperCase()} API credentials configured`,
        },
        { status: 400 }
      );
    }

    // Initialize execution router
    executionRouter = new ExecutionRouter({
      defaultExchange: exchange,
      mexcApiKey: exchange === 'mexc' ? credentials.apiKey : undefined,
      mexcApiSecret: exchange === 'mexc' ? credentials.apiSecret : undefined,
      bybitApiKey: exchange === 'bybit' ? credentials.apiKey : undefined,
      bybitApiSecret: exchange === 'bybit' ? credentials.apiSecret : undefined,
      testnet,
      defaultLeverage: config.LEVERAGE,
      defaultRiskPercent: 1,
      defaultRewardRiskRatio: 2,
      maxCapitalPerTrade: config.BASE_CAPITAL_USDT,
      minCapitalRequired: 15,
    });

    // Initialize Telegram bot if configured
    const telegramConfig = config.getTelegramConfig();
    if (telegramConfig.enabled) {
      initializeTelegramBot({
        botToken: telegramConfig.botToken,
        chatId: telegramConfig.chatId,
        enabled: telegramConfig.enabled,
      });
      const telegramBot = getTelegramBot();
      if (telegramBot) {
        await telegramBot.sendMessage(
          `🚀 *TRADING BOT STARTED*\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📊 Exchange: ${exchange.toUpperCase()}\n` +
          `💰 Capital: ${config.BASE_CAPITAL_USDT} USDT\n` +
          `⚡ Leverage: ${config.LEVERAGE}x\n` +
          `🎯 Symbols: ${config.TARGET_SYMBOLS.length} pairs\n` +
          `⏰ Time: ${new Date().toLocaleString()}\n` +
          `━━━━━━━━━━━━━━━━`
        );
      }
    }

    // Initialize instrument cache
    await executionRouter.initializeCache(config.TARGET_SYMBOLS);

    // Get initial balance
    const initialBalance = await executionRouter.getBalance();
    botState.setWalletBalance(initialBalance);
    botState.setAvailableMargin(initialBalance);

    // Set bot status to running
    botState.setStatus('running' as BotStateStatus);
    botState.clearError();

    // Start trading loop
    const intervalMs = body.intervalMs || config.SIGNAL_INTERVAL_MS;
    tradingLoopInterval = setInterval(runTradingLoop, intervalMs);

    // Log start
    logger.log('BOT_STARTED', {
      exchange,
      testnet,
      initialBalance,
      targetSymbols: config.TARGET_SYMBOLS.length,
      intervalMs,
    }, 'success');

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Trading bot started successfully',
      status: {
        running: true,
        exchange,
        testnet,
        initialBalance,
        targetSymbols: config.TARGET_SYMBOLS,
        leverage: config.LEVERAGE,
        capital: config.BASE_CAPITAL_USDT,
        intervalMs,
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to start trading bot: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check if bot can be started
export async function GET() {
  const config = TradingConfig.getInstance();
  const botState = getBotState();
  const validation = config.validateConfig();

  return NextResponse.json({
    canStart: validation.valid && !botState.isRunning(),
    currentStatus: botState.getStatus(),
    configErrors: validation.errors,
    hasMexcCredentials: !!config.getMexcCredentials().apiKey,
    hasBybitCredentials: !!config.getBybitCredentials().apiKey,
    telegramEnabled: config.getTelegramConfig().enabled,
  });
}
