/**
 * Telegram Webhook Route
 * Handles incoming Telegram messages and commands
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTelegramBot, initializeTelegramBot } from '@/lib/trading/telegram-bot';
import { getActivityLogger } from '@/lib/trading/activity-logger';
import { SystemStatus, TradingStats, TelegramBotConfig, Position } from '@/lib/trading/types';

// Bot configuration - In production, these should come from environment variables or database
function getBotConfig(): TelegramBotConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: true,
  };
}

// Mock data for demonstration - In production, these would come from the trading engine
// Using TelegramPosition type for display purposes
interface MockPosition {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  takeProfit?: number;
  stopLoss?: number;
  openedAt: number;
}

function getMockPositions(): MockPosition[] {
  return [
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: 67245.5,
      currentPrice: 67500.0,
      size: 0.1,
      leverage: 10,
      unrealizedPnl: 25.45,
      unrealizedPnlPercent: 0.38,
      takeProfit: 67890.0,
      stopLoss: 66800.0,
      openedAt: Date.now() - 3600000,
    },
    {
      symbol: 'ETHUSDT',
      direction: 'SHORT',
      entryPrice: 3450.0,
      currentPrice: 3420.0,
      size: 1.5,
      leverage: 5,
      unrealizedPnl: 45.0,
      unrealizedPnlPercent: 0.87,
      takeProfit: 3400.0,
      stopLoss: 3500.0,
      openedAt: Date.now() - 7200000,
    },
  ];
}

function getMockBalance(): { totalBalance: number; availableBalance: number; unrealizedPnl: number } {
  return {
    totalBalance: 10000.0,
    availableBalance: 8500.0,
    unrealizedPnl: 70.45,
  };
}

function getMockSystemStatus(): SystemStatus {
  return {
    isRunning: true,
    uptime: 86400000,
    activePositions: 2,
    pendingOrders: 0,
    lastSignalTime: Date.now() - 1800000,
    startTime: Date.now() - 86400000,
  };
}

// Trading engine state (would be managed by the trading engine in production)
let isTradingEnabled = true;
let emergencyStopTriggered = false;

/**
 * Handle incoming Telegram webhook
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    
    // Validate Telegram message structure
    if (!body.message || !body.message.text) {
      return NextResponse.json({ success: false, error: 'Invalid message format' }, { status: 400 });
    }

    const message = body.message;
    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    const userId = message.from?.id;

    // Verify chat ID matches configured chat
    const config = getBotConfig();
    if (chatId !== config.chatId && config.chatId !== '') {
      return NextResponse.json({ success: false, error: 'Unauthorized chat' }, { status: 403 });
    }

    // Parse command
    const [command, ...args] = text.split(' ');
    const normalizedCommand = command.toLowerCase();

    // Initialize bot if needed
    let bot = getTelegramBot();
    if (!bot && config.botToken) {
      bot = initializeTelegramBot(config);
    }

    // Route to command handler
    const response = await handleCommand(normalizedCommand, args, bot, userId);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Handle GET request for webhook verification
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getBotConfig();
  
  return NextResponse.json({
    status: 'ok',
    webhook: 'active',
    botConfigured: !!config.botToken,
    chatConfigured: !!config.chatId,
  });
}

/**
 * Command handlers
 */
async function handleCommand(
  command: string,
  args: string[],
  bot: ReturnType<typeof getTelegramBot>,
  userId?: number
): Promise<{ success: boolean; message: string; data?: unknown }> {
  const logger = getActivityLogger();

  switch (command) {
    case '/start':
      return handleStart(bot, userId);

    case '/status':
      return handleStatus(bot);

    case '/positions':
      return handlePositions(bot);

    case '/balance':
      return handleBalance(bot);

    case '/logs':
      return handleLogs(bot, args, logger);

    case '/stats':
      return handleStats(bot, logger);

    case '/stop':
      return handleEmergencyStop(bot, userId);

    case '/resume':
      return handleResume(bot, userId);

    case '/help':
      return handleHelp(bot);

    default:
      return {
        success: false,
        message: `Unknown command: ${command}. Use /help to see available commands.`,
      };
  }
}

/**
 * /start - Initialize bot interaction
 */
async function handleStart(
  bot: ReturnType<typeof getTelegramBot>,
  userId?: number
): Promise<{ success: boolean; message: string }> {
  const logger = getActivityLogger();
  
  const welcomeMessage = `🤖 GLM5 Trading Bot
━━━━━━━━━━━━━━━━
👋 Welcome! I'm your trading assistant.

📋 Available Commands:
/status - View bot status
/positions - View open positions
/balance - View wallet balance
/logs [count] - View recent activity
/stats - View trading statistics
/stop - Emergency stop trading
/resume - Resume trading
/help - Show this help message

⚠️ Use /stop for emergency only!`;

  if (bot) {
    await bot.sendMessage(welcomeMessage);
  }

  logger.log('BOT_START', { userId });

  return {
    success: true,
    message: 'Welcome message sent',
  };
}

/**
 * /status - Get current bot status
 */
async function handleStatus(
  bot: ReturnType<typeof getTelegramBot>
): Promise<{ success: boolean; message: string; data?: SystemStatus }> {
  const status = getMockSystemStatus();
  const logger = getActivityLogger();
  const stats = logger.getStats();

  if (bot) {
    await bot.sendStatusUpdate(stats, status);
  }

  return {
    success: true,
    message: 'Status sent',
    data: status,
  };
}

/**
 * /positions - Get open positions
 */
async function handlePositions(
  bot: ReturnType<typeof getTelegramBot>
): Promise<{ success: boolean; message: string; data?: MockPosition[] }> {
  const positions = getMockPositions();

  if (positions.length === 0) {
    const noPosMessage = `📋 POSITIONS
━━━━━━━━━━━━━━━━
No open positions`;

    if (bot) {
      await bot.sendMessage(noPosMessage);
    }

    return { success: true, message: 'No open positions', data: [] };
  }

  const positionsMessage = `📋 OPEN POSITIONS (${positions.length})
━━━━━━━━━━━━━━━━
${positions.map((p, i) => `${i + 1}. ${p.symbol} ${p.direction}
   Entry: $${p.entryPrice.toFixed(2)}
   Current: $${p.currentPrice.toFixed(2)}
   Size: ${p.size} | Leverage: ${p.leverage}x
   PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)} (${p.unrealizedPnlPercent >= 0 ? '+' : ''}${p.unrealizedPnlPercent.toFixed(2)}%)
   TP: $${p.takeProfit?.toFixed(2)} | SL: $${p.stopLoss?.toFixed(2)}`).join('\n━━━━━━━━━━━━━━━━\n')}
━━━━━━━━━━━━━━━━`;

  if (bot) {
    await bot.sendMessage(positionsMessage);
  }

  return {
    success: true,
    message: 'Positions sent',
    data: positions,
  };
}

/**
 * /balance - Get wallet balance
 */
async function handleBalance(
  bot: ReturnType<typeof getTelegramBot>
): Promise<{ success: boolean; message: string; data?: unknown }> {
  const balance = getMockBalance();

  const balanceMessage = `💰 WALLET BALANCE
━━━━━━━━━━━━━━━━
💵 Total: $${balance.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
📊 Available: $${balance.availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
${balance.unrealizedPnl >= 0 ? '📈' : '📉'} Unrealized PnL: ${balance.unrealizedPnl >= 0 ? '+' : ''}$${balance.unrealizedPnl.toFixed(2)}
━━━━━━━━━━━━━━━━`;

  if (bot) {
    await bot.sendMessage(balanceMessage);
  }

  return {
    success: true,
    message: 'Balance sent',
    data: balance,
  };
}

/**
 * /logs [count] - Get recent activity logs
 */
async function handleLogs(
  bot: ReturnType<typeof getTelegramBot>,
  args: string[],
  logger: ReturnType<typeof getActivityLogger>
): Promise<{ success: boolean; message: string; data?: unknown }> {
  const count = args[0] ? parseInt(args[0], 10) : 10;
  const validCount = Math.min(Math.max(count, 1), 50); // Limit to 50
  const logs = logger.getRecentLogs(validCount);

  if (logs.length === 0) {
    const noLogsMessage = `📜 ACTIVITY LOGS
━━━━━━━━━━━━━━━━
No activity logs available`;

    if (bot) {
      await bot.sendMessage(noLogsMessage);
    }

    return { success: true, message: 'No logs', data: [] };
  }

  const logsMessage = `📜 ACTIVITY LOGS (${logs.length})
━━━━━━━━━━━━━━━━
${logs.map(log => {
  const time = new Date(log.timestamp).toLocaleTimeString();
  const emoji = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' }[log.type];
  return `${emoji} [${time}] ${log.event}
   ${JSON.stringify(log.details).substring(0, 60)}...`;
}).join('\n━━━━━━━━━━━━━━━━\n')}
━━━━━━━━━━━━━━━━`;

  if (bot) {
    await bot.sendMessage(logsMessage);
  }

  return {
    success: true,
    message: 'Logs sent',
    data: logs,
  };
}

/**
 * /stats - Get trading statistics
 */
async function handleStats(
  bot: ReturnType<typeof getTelegramBot>,
  logger: ReturnType<typeof getActivityLogger>
): Promise<{ success: boolean; message: string; data?: TradingStats }> {
  const stats = logger.getStats();

  const statsMessage = `📊 TRADING STATISTICS
━━━━━━━━━━━━━━━━
📈 Total Trades: ${stats.totalTrades}
✅ Wins: ${stats.winningTrades} | ❌ Losses: ${stats.losingTrades}
📊 Win Rate: ${stats.winRate.toFixed(2)}%
💰 Total PnL: ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}
💵 Avg Win: $${stats.averageWin.toFixed(2)}
💸 Avg Loss: $${stats.averageLoss.toFixed(2)}
📈 Profit Factor: ${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
📉 Max Drawdown: $${stats.maxDrawdown.toFixed(2)}
🔥 Streak: ${stats.currentStreak > 0 ? '+' : ''}${stats.currentStreak}
🏆 Best: $${stats.bestTrade.toFixed(2)} | Worst: $${stats.worstTrade.toFixed(2)}
━━━━━━━━━━━━━━━━`;

  if (bot) {
    await bot.sendMessage(statsMessage);
  }

  return {
    success: true,
    message: 'Stats sent',
    data: stats,
  };
}

/**
 * /stop - Emergency stop trading
 */
async function handleEmergencyStop(
  bot: ReturnType<typeof getTelegramBot>,
  userId?: number
): Promise<{ success: boolean; message: string }> {
  const logger = getActivityLogger();

  if (emergencyStopTriggered) {
    return { success: false, message: 'Emergency stop already active' };
  }

  emergencyStopTriggered = true;
  isTradingEnabled = false;

  logger.log('EMERGENCY_STOP', { userId, timestamp: Date.now() }, 'warning');

  const positions = getMockPositions();

  const stopMessage = `🚨 EMERGENCY STOP ACTIVATED
━━━━━━━━━━━━━━━━
⚠️ Trading has been disabled
👤 Triggered by: User ${userId}
⏰ Time: ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━
📋 Open Positions: ${positions.length}

Use /resume to restart trading`;

  if (bot) {
    await bot.sendMessage(stopMessage);
    // Also send shutdown alert with positions (cast to match telegram-bot expectation)
    await bot.sendShutdownAlert(positions as unknown as Position[]);
  }

  return {
    success: true,
    message: 'Emergency stop activated',
  };
}

/**
 * /resume - Resume trading
 */
async function handleResume(
  bot: ReturnType<typeof getTelegramBot>,
  userId?: number
): Promise<{ success: boolean; message: string }> {
  const logger = getActivityLogger();

  if (!emergencyStopTriggered) {
    return { success: false, message: 'Trading is already active' };
  }

  emergencyStopTriggered = false;
  isTradingEnabled = true;

  logger.log('TRADING_RESUMED', { userId, timestamp: Date.now() }, 'success');

  const resumeMessage = `✅ TRADING RESUMED
━━━━━━━━━━━━━━━━
🟢 Trading has been re-enabled
👤 Triggered by: User ${userId}
⏰ Time: ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━`;

  if (bot) {
    await bot.sendMessage(resumeMessage);
  }

  return {
    success: true,
    message: 'Trading resumed',
  };
}

/**
 * /help - Show help message
 */
async function handleHelp(
  bot: ReturnType<typeof getTelegramBot>
): Promise<{ success: boolean; message: string }> {
  const helpMessage = `📖 GLM5 Trading Bot Help
━━━━━━━━━━━━━━━━
📋 Commands:

/start - Initialize bot interaction
/status - View current bot status
/positions - View open positions
/balance - View wallet balance
/logs [count] - View recent activity logs
  Example: /logs 20
/stats - View trading statistics
/stop - ⚠️ EMERGENCY STOP
/resume - Resume trading after stop
/help - Show this help message

━━━━━━━━━━━━━━━━
⚠️ Important:
• /stop will disable all trading
• Use /resume to re-enable
• Logs are limited to last 100 entries
━━━━━━━━━━━━━━━━`;

  if (bot) {
    await bot.sendMessage(helpMessage);
  }

  return {
    success: true,
    message: 'Help sent',
  };
}

// Export trading state for external use
export function getTradingState(): { isEnabled: boolean; isEmergencyStopped: boolean } {
  return {
    isEnabled: isTradingEnabled,
    isEmergencyStopped: emergencyStopTriggered,
  };
}

export function setTradingState(enabled: boolean): void {
  isTradingEnabled = enabled;
  if (enabled) {
    emergencyStopTriggered = false;
  }
}
