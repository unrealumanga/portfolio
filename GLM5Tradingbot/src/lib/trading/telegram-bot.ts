/**
 * Telegram Bot Module for GLM5Tradingbot
 * Handles all Telegram communications with markdown formatting
 */

import { TradingSignal, TradeResult, Position, TradingStats, TelegramBotConfig, SystemStatus } from './types';
import { ActivityLogger, getActivityLogger } from './activity-logger';

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_MESSAGES_PER_SECOND = 30;

export class TelegramBot {
  private botToken: string;
  private chatId: string;
  private baseUrl: string;
  private enabled: boolean;
  private activityLogger: ActivityLogger;
  private lastMessageTime: number = 0;
  private messageQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;

  constructor(config: TelegramBotConfig) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.enabled = config.enabled;
    this.activityLogger = getActivityLogger();
  }

  /**
   * Enable or disable the bot
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if bot is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send a simple text message
   */
  async sendMessage(message: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      await this.rateLimitedRequest(async () => {
        const response = await fetch(`${this.baseUrl}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: message,
            parse_mode: parseMode,
            disable_web_page_preview: true,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Telegram API error: ${error}`);
        }

        return response.json();
      });

      // Log the message
      this.activityLogger.log('TELEGRAM_MESSAGE_SENT', {
        message: message.substring(0, 100) + '...',
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      this.activityLogger.log('TELEGRAM_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        message: message.substring(0, 100),
      }, 'error');
      return false;
    }
  }

  /**
   * Send trade execution alert
   */
  async sendTradeAlert(signal: TradingSignal, result: TradeResult): Promise<boolean> {
    const status = result.success ? '🚀 TRADE EXECUTED' : '❌ TRADE FAILED';
    const directionEmoji = signal.direction === 'LONG' ? '📈' : '📉';
    
    const message = `${status}
━━━━━━━━━━━━━━━━
📊 Symbol: ${signal.symbol}
${directionEmoji} Direction: ${signal.direction}
💰 Entry: $${signal.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
🎯 TP: $${signal.takeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
🛡️ SL: $${signal.stopLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
⚡ EV Score: ${signal.evScore.toFixed(4)}
📊 Kelly: ${signal.kellyFraction.toFixed(2)}
${result.orderId ? `📝 Order ID: ${result.orderId}` : ''}
${result.executedPrice ? `✅ Executed: $${result.executedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
${result.error ? `⚠️ Error: ${result.error}` : ''}
━━━━━━━━━━━━━━━━`;

    return this.sendMessage(message);
  }

  /**
   * Send periodic system status update
   */
  async sendStatusUpdate(stats: TradingStats, status: SystemStatus): Promise<boolean> {
    const uptime = this.formatUptime(status.uptime);
    const winRateEmoji = stats.winRate >= 50 ? '✅' : '⚠️';
    const pnlEmoji = stats.totalPnl >= 0 ? '📈' : '📉';
    
    const message = `📊 SYSTEM STATUS
━━━━━━━━━━━━━━━━
🤖 Status: ${status.isRunning ? '🟢 Running' : '🔴 Stopped'}
⏱️ Uptime: ${uptime}
📍 Active Positions: ${status.activePositions}
⏳ Pending Orders: ${status.pendingOrders}
━━━━━━━━━━━━━━━━
📊 TRADING STATS
━━━━━━━━━━━━━━━━
📊 Total Trades: ${stats.totalTrades}
✅ Wins: ${stats.winningTrades} | ❌ Losses: ${stats.losingTrades}
${winRateEmoji} Win Rate: ${stats.winRate.toFixed(2)}%
${pnlEmoji} Total PnL: $${stats.totalPnl.toFixed(2)}
💰 Avg Win: $${stats.averageWin.toFixed(2)} | Avg Loss: $${stats.averageLoss.toFixed(2)}
📈 Profit Factor: ${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
📉 Max Drawdown: $${stats.maxDrawdown.toFixed(2)}
🔥 Current Streak: ${stats.currentStreak > 0 ? '+' : ''}${stats.currentStreak}
━━━━━━━━━━━━━━━━`;

    return this.sendMessage(message);
  }

  /**
   * Send shutdown alert with open positions
   */
  async sendShutdownAlert(positions: Position[]): Promise<boolean> {
    let positionsInfo = 'No open positions';
    
    if (positions.length > 0) {
      positionsInfo = positions.map((p, i) => 
        `${i + 1}. ${p.symbol} ${p.direction}
   Entry: $${p.entryPrice.toFixed(2)} | Size: ${p.size}
   PnL: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)} (${p.unrealizedPnlPercent >= 0 ? '+' : ''}${p.unrealizedPnlPercent.toFixed(2)}%)`
      ).join('\n');
    }

    const message = `⚠️ SYSTEM SHUTDOWN ALERT
━━━━━━━━━━━━━━━━
🛑 Trading bot is shutting down
⏰ Time: ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━
📋 OPEN POSITIONS (${positions.length})
━━━━━━━━━━━━━━━━
${positionsInfo}
━━━━━━━━━━━━━━━━
⚠️ Please check your exchange for open positions!`;

    return this.sendMessage(message);
  }

  /**
   * Send error notification
   */
  async sendErrorAlert(error: Error | string, context?: string): Promise<boolean> {
    const errorMessage = error instanceof Error ? error.message : error;
    const timestamp = new Date().toLocaleString();
    
    const message = `🚨 ERROR ALERT
━━━━━━━━━━━━━━━━
⏰ Time: ${timestamp}
${context ? `📍 Context: ${context}` : ''}
━━━━━━━━━━━━━━━━
❌ Error:
\`\`\`
${errorMessage.substring(0, 500)}
\`\`\`
━━━━━━━━━━━━━━━━
⚠️ Please check logs for details`;

    return this.sendMessage(message);
  }

  /**
   * Send signal detected alert
   */
  async sendSignalAlert(signal: TradingSignal): Promise<boolean> {
    const directionEmoji = signal.direction === 'LONG' ? '📈' : '📉';
    
    const message = `📡 SIGNAL DETECTED
━━━━━━━━━━━━━━━━
📊 Symbol: ${signal.symbol}
${directionEmoji} Direction: ${signal.direction}
💰 Entry: $${signal.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
🎯 TP: $${signal.takeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
🛡️ SL: $${signal.stopLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
⚡ EV Score: ${signal.evScore.toFixed(4)}
📊 Kelly: ${signal.kellyFraction.toFixed(2)}
━━━━━━━━━━━━━━━━`;

    return this.sendMessage(message);
  }

  /**
   * Send position closed alert
   */
  async sendPositionClosedAlert(
    position: Position,
    closePrice: number,
    pnl: number,
    reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'SIGNAL'
  ): Promise<boolean> {
    const pnlEmoji = pnl >= 0 ? '✅' : '❌';
    const reasonEmoji = {
      TAKE_PROFIT: '🎯',
      STOP_LOSS: '🛡️',
      MANUAL: '👤',
      SIGNAL: '📡',
    }[reason];

    const message = `${pnlEmoji} POSITION CLOSED
━━━━━━━━━━━━━━━━
📊 Symbol: ${position.symbol}
📈 Direction: ${position.direction}
💰 Entry: $${position.entryPrice.toFixed(2)}
🏁 Exit: $${closePrice.toFixed(2)}
${reasonEmoji} Reason: ${reason.replace('_', ' ')}
━━━━━━━━━━━━━━━━
💸 PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
📊 PnL %: ${pnl >= 0 ? '+' : ''}${((pnl / (position.entryPrice * position.size)) * 100).toFixed(2)}%
━━━━━━━━━━━━━━━━`;

    return this.sendMessage(message);
  }

  /**
   * Send wallet balance update
   */
  async sendBalanceAlert(
    balance: { totalBalance: number; availableBalance: number; unrealizedPnl: number },
    previousBalance?: number
  ): Promise<boolean> {
    const change = previousBalance ? balance.totalBalance - previousBalance : 0;
    const changeEmoji = change >= 0 ? '📈' : '📉';
    
    const message = `💰 WALLET UPDATE
━━━━━━━━━━━━━━━━
💵 Total Balance: $${balance.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
📊 Available: $${balance.availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${balance.unrealizedPnl >= 0 ? '📈' : '📉'} Unrealized PnL: ${balance.unrealizedPnl >= 0 ? '+' : ''}$${balance.unrealizedPnl.toFixed(2)}
${previousBalance ? `${changeEmoji} Change: ${change >= 0 ? '+' : ''}$${change.toFixed(2)}` : ''}
━━━━━━━━━━━━━━━━`;

    return this.sendMessage(message);
  }

  /**
   * Format uptime string
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Rate limited request handler
   */
  private async rateLimitedRequest(request: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.messageQueue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastMessage = now - this.lastMessageTime;
          
          if (timeSinceLastMessage < RATE_LIMIT_WINDOW) {
            await new Promise(r => setTimeout(r, RATE_LIMIT_WINDOW - timeSinceLastMessage));
          }
          
          this.lastMessageTime = Date.now();
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process message queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const task = this.messageQueue.shift();
      if (task) {
        await task();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Set bot webhook URL
   */
  async setWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/setWebhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message'],
        }),
      });

      const result = await response.json();
      return result.ok === true;
    } catch (error) {
      console.error('Failed to set webhook:', error);
      return false;
    }
  }

  /**
   * Delete bot webhook
   */
  async deleteWebhook(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/deleteWebhook`, {
        method: 'POST',
      });

      const result = await response.json();
      return result.ok === true;
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      return false;
    }
  }

  /**
   * Get bot information
   */
  async getMe(): Promise<{ ok: boolean; result?: { id: number; is_bot: boolean; first_name: string; username: string } }> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      return response.json();
    } catch (error) {
      console.error('Failed to get bot info:', error);
      return { ok: false };
    }
  }
}

// Singleton instance
let telegramBotInstance: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  return telegramBotInstance;
}

export function initializeTelegramBot(config: TelegramBotConfig): TelegramBot {
  telegramBotInstance = new TelegramBot(config);
  return telegramBotInstance;
}

export function resetTelegramBot(): void {
  telegramBotInstance = null;
}
