/**
 * Activity Logger for GLM5Tradingbot
 * Tracks trading activities and calculates statistics
 */

import { ActivityLogEntry, TradingStats } from './types';

export class ActivityLogger {
  private logs: ActivityLogEntry[] = [];
  private maxLogs: number = 100;
  private trades: Array<{
    pnl: number;
    timestamp: number;
    isWin: boolean;
  }> = [];

  /**
   * Log a trading activity
   */
  log(event: string, details: Record<string, unknown>, type: ActivityLogEntry['type'] = 'info'): void {
    const entry: ActivityLogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      event,
      details,
      type,
    };

    this.logs.unshift(entry);

    // Keep only the last 100 entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Track trade results for statistics
    if (event === 'TRADE_CLOSED' && typeof details.pnl === 'number') {
      this.trades.unshift({
        pnl: details.pnl as number,
        timestamp: entry.timestamp,
        isWin: (details.pnl as number) > 0,
      });
    }
  }

  /**
   * Get recent activity logs
   */
  getRecentLogs(count: number = 20): ActivityLogEntry[] {
    return this.logs.slice(0, Math.min(count, this.logs.length));
  }

  /**
   * Get all logs
   */
  getAllLogs(): ActivityLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get trading statistics
   */
  getStats(): TradingStats {
    const totalTrades = this.trades.length;
    
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        averageWin: 0,
        averageLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        currentStreak: 0,
        bestTrade: 0,
        worstTrade: 0,
      };
    }

    const winningTrades = this.trades.filter(t => t.isWin);
    const losingTrades = this.trades.filter(t => !t.isWin);
    
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    
    const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let currentPnl = 0;
    
    for (const trade of [...this.trades].reverse()) {
      currentPnl += trade.pnl;
      if (currentPnl > peak) {
        peak = currentPnl;
      }
      const drawdown = peak - currentPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate current streak
    let currentStreak = 0;
    for (const trade of this.trades) {
      if (currentStreak === 0) {
        currentStreak = trade.isWin ? 1 : -1;
      } else if ((currentStreak > 0 && trade.isWin) || (currentStreak < 0 && !trade.isWin)) {
        currentStreak += currentStreak > 0 ? 1 : -1;
      } else {
        break;
      }
    }

    const bestTrade = Math.max(...this.trades.map(t => t.pnl), 0);
    const worstTrade = Math.min(...this.trades.map(t => t.pnl), 0);

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
      totalPnl: this.trades.reduce((sum, t) => sum + t.pnl, 0),
      totalPnlPercent: 0, // Would need initial balance to calculate
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown,
      currentStreak,
      bestTrade,
      worstTrade,
    };
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    this.trades = [];
  }

  /**
   * Get logs count
   */
  getLogsCount(): number {
    return this.logs.length;
  }

  /**
   * Get trades count
   */
  getTradesCount(): number {
    return this.trades.length;
  }

  /**
   * Filter logs by type
   */
  getLogsByType(type: ActivityLogEntry['type']): ActivityLogEntry[] {
    return this.logs.filter(log => log.type === type);
  }

  /**
   * Filter logs by event
   */
  getLogsByEvent(event: string): ActivityLogEntry[] {
    return this.logs.filter(log => log.event === event);
  }

  /**
   * Get logs within time range
   */
  getLogsByTimeRange(startTime: number, endTime: number): ActivityLogEntry[] {
    return this.logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let activityLoggerInstance: ActivityLogger | null = null;

export function getActivityLogger(): ActivityLogger {
  if (!activityLoggerInstance) {
    activityLoggerInstance = new ActivityLogger();
  }
  return activityLoggerInstance;
}

export function resetActivityLogger(): void {
  activityLoggerInstance = null;
}
