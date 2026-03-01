/**
 * Bot State Manager for GLM5Tradingbot
 * Singleton that manages global bot state, positions, and events
 */

import type { Position, Signal, TradingStats, SystemStatus, ActivityLogEntry } from './types';

// State types
export type BotStateStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'error' | 'shutting_down' | 'stopped';

// Alias for backward compatibility
export type BotStatus = BotStateStatus;

// Event types for state changes
export type BotEventType = 
  | 'status_changed'
  | 'position_opened'
  | 'position_closed'
  | 'signal_generated'
  | 'signal_executed'
  | 'error'
  | 'balance_updated';

export interface BotEvent {
  type: BotEventType;
  timestamp: number;
  data: unknown;
}

export type BotEventListener = (event: BotEvent) => void;

// Session statistics
export interface SessionStats {
  startTime: number | null;
  totalSignals: number;
  executedSignals: number;
  successfulTrades: number;
  failedTrades: number;
  totalPnl: number;
  totalFees: number;
  maxDrawdown: number;
  peakBalance: number;
}

// Bot state interface
export interface BotState {
  status: BotStateStatus;
  startTime: number | null;
  lastSignalTime: number | null;
  lastError: string | null;
  activePositions: Map<string, Position>;
  pendingSignals: Signal[];
  sessionStats: SessionStats;
  walletBalance: number;
  availableMargin: number;
}

/**
 * Bot State Manager
 * Singleton class that manages all bot state
 */
export class BotStateManager {
  private static instance: BotStateManager | null = null;
  
  private state: BotState = {
    status: 'idle',
    startTime: null,
    lastSignalTime: null,
    lastError: null,
    activePositions: new Map(),
    pendingSignals: [],
    sessionStats: {
      startTime: null,
      totalSignals: 0,
      executedSignals: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalPnl: 0,
      totalFees: 0,
      maxDrawdown: 0,
      peakBalance: 0,
    },
    walletBalance: 0,
    availableMargin: 0,
  };

  private eventListeners: Map<BotEventType, BotEventListener[]> = new Map();
  private activityLog: ActivityLogEntry[] = [];
  private maxActivityLogSize = 100;

  private constructor() {
    // Initialize event listener maps
    const eventTypes: BotEventType[] = [
      'status_changed',
      'position_opened',
      'position_closed',
      'signal_generated',
      'signal_executed',
      'error',
      'balance_updated',
    ];
    
    for (const type of eventTypes) {
      this.eventListeners.set(type, []);
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): BotStateManager {
    if (!BotStateManager.instance) {
      BotStateManager.instance = new BotStateManager();
    }
    return BotStateManager.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  public static resetInstance(): void {
    BotStateManager.instance = null;
  }

  // ==================== Status Management ====================

  /**
   * Get current bot status
   */
  public getStatus(): BotStateStatus {
    return this.state.status;
  }

  /**
   * Set bot status
   */
  public setStatus(status: BotStateStatus): void {
    const previousStatus = this.state.status;
    this.state.status = status;

    if (status === 'running' && !this.state.startTime) {
      this.state.startTime = Date.now();
      this.state.sessionStats.startTime = Date.now();
    }

    this.emitEvent('status_changed', {
      previousStatus,
      newStatus: status,
      timestamp: Date.now(),
    });

    this.logActivity('STATUS_CHANGED', { previousStatus, newStatus: status }, 'info');
  }

  /**
   * Check if bot is running
   */
  public isRunning(): boolean {
    return this.state.status === 'running';
  }

  /**
   * Check if bot is stopping
   */
  public isStopping(): boolean {
    return this.state.status === 'stopping';
  }

  /**
   * Check if bot is shutting down
   */
  public isShuttingDown(): boolean {
    return this.shutdownState.isShuttingDown;
  }

  // ==================== Position Management ====================

  /**
   * Get all active positions
   */
  public getActivePositions(): Position[] {
    return Array.from(this.state.activePositions.values());
  }

  /**
   * Get position count
   */
  public getPositionCount(): number {
    return this.state.activePositions.size;
  }

  /**
   * Add a position
   */
  public addPosition(position: Position): void {
    this.state.activePositions.set(position.id, position);
    
    this.emitEvent('position_opened', position);
    this.logActivity('POSITION_OPENED', {
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      entryPrice: position.entry_price,
    }, 'success');
  }

  /**
   * Remove a position
   */
  public removePosition(positionId: string): Position | undefined {
    const position = this.state.activePositions.get(positionId);
    
    if (position) {
      this.state.activePositions.delete(positionId);
      
      this.emitEvent('position_closed', position);
      this.logActivity('POSITION_CLOSED', {
        symbol: position.symbol,
        side: position.side,
        pnl: position.realized_pnl,
      }, position.realized_pnl && position.realized_pnl > 0 ? 'success' : 'warning');
    }
    
    return position;
  }

  /**
   * Update a position
   */
  public updatePosition(positionId: string, updates: Partial<Position>): Position | undefined {
    const position = this.state.activePositions.get(positionId);
    
    if (position) {
      Object.assign(position, updates);
      this.state.activePositions.set(positionId, position);
    }
    
    return position;
  }

  /**
   * Get position by symbol
   */
  public getPositionBySymbol(symbol: string): Position | undefined {
    for (const position of this.state.activePositions.values()) {
      if (position.symbol === symbol) {
        return position;
      }
    }
    return undefined;
  }

  // ==================== Signal Management ====================

  /**
   * Get pending signals
   */
  public getPendingSignals(): Signal[] {
    return [...this.state.pendingSignals];
  }

  /**
   * Add a signal
   */
  public addSignal(signal: Signal): void {
    this.state.pendingSignals.push(signal);
    this.state.lastSignalTime = Date.now();
    this.state.sessionStats.totalSignals++;

    this.emitEvent('signal_generated', signal);
    this.logActivity('SIGNAL_GENERATED', {
      symbol: signal.symbol,
      direction: signal.direction,
      strategy: signal.strategy,
      evScore: signal.ev_score,
    }, 'info');
  }

  /**
   * Add a pending signal (alias for addSignal)
   */
  public addPendingSignal(signal: Signal): void {
    this.addSignal(signal);
  }

  /**
   * Remove a signal
   */
  public removeSignal(signalId: string): Signal | undefined {
    const index = this.state.pendingSignals.findIndex(s => s.id === signalId);
    
    if (index !== -1) {
      const signal = this.state.pendingSignals.splice(index, 1)[0];
      return signal;
    }
    
    return undefined;
  }

  /**
   * Clear all pending signals
   */
  public clearSignals(): void {
    this.state.pendingSignals = [];
  }

  /**
   * Get last signal time
   */
  public getLastSignalTime(): number | null {
    return this.state.lastSignalTime;
  }

  // ==================== Session Statistics ====================

  /**
   * Get session statistics
   */
  public getSessionStats(): SessionStats {
    return { ...this.state.sessionStats };
  }

  /**
   * Record a trade result
   */
  public recordTradeResult(success: boolean, pnl: number, fees: number): void {
    if (success) {
      this.state.sessionStats.successfulTrades++;
    } else {
      this.state.sessionStats.failedTrades++;
    }
    
    this.state.sessionStats.executedSignals++;
    this.state.sessionStats.totalPnl += pnl;
    this.state.sessionStats.totalFees += fees;

    // Update peak balance
    const currentBalance = this.state.walletBalance + pnl;
    if (currentBalance > this.state.sessionStats.peakBalance) {
      this.state.sessionStats.peakBalance = currentBalance;
    }

    // Update max drawdown
    const drawdown = this.state.sessionStats.peakBalance - currentBalance;
    if (drawdown > this.state.sessionStats.maxDrawdown) {
      this.state.sessionStats.maxDrawdown = drawdown;
    }
  }

  /**
   * Get trading statistics
   */
  public getTradingStats(): TradingStats {
    const stats = this.state.sessionStats;
    const totalTrades = stats.successfulTrades + stats.failedTrades;
    const winRate = totalTrades > 0 ? (stats.successfulTrades / totalTrades) * 100 : 0;

    return {
      totalTrades,
      winningTrades: stats.successfulTrades,
      losingTrades: stats.failedTrades,
      winRate,
      totalPnl: stats.totalPnl,
      totalPnlPercent: 0, // Would need initial balance
      averageWin: stats.successfulTrades > 0 ? stats.totalPnl / stats.successfulTrades : 0,
      averageLoss: stats.failedTrades > 0 ? stats.totalPnl / stats.failedTrades : 0,
      profitFactor: stats.failedTrades > 0 ? stats.totalPnl / Math.abs(stats.totalPnl) : 0,
      maxDrawdown: stats.maxDrawdown,
      currentStreak: 0, // Would need tracking
      bestTrade: 0,
      worstTrade: 0,
    };
  }

  // ==================== Balance Management ====================

  /**
   * Get wallet balance
   */
  public getWalletBalance(): number {
    return this.state.walletBalance;
  }

  /**
   * Set wallet balance
   */
  public setWalletBalance(balance: number): void {
    const previousBalance = this.state.walletBalance;
    this.state.walletBalance = balance;

    this.emitEvent('balance_updated', {
      previousBalance,
      newBalance: balance,
      timestamp: Date.now(),
    });
  }

  /**
   * Get available margin
   */
  public getAvailableMargin(): number {
    return this.state.availableMargin;
  }

  /**
   * Set available margin
   */
  public setAvailableMargin(margin: number): void {
    this.state.availableMargin = margin;
  }

  // ==================== Error Management ====================

  /**
   * Get last error
   */
  public getLastError(): string | null {
    return this.state.lastError;
  }

  /**
   * Set error
   */
  public setError(error: string): void {
    this.state.lastError = error;
    
    this.emitEvent('error', { error, timestamp: Date.now() });
    this.logActivity('ERROR', { error }, 'error');
  }

  /**
   * Record an error (alias for setError with Error object support)
   */
  public recordError(error: Error, context?: string): void {
    const errorMessage = context ? `${context}: ${error.message}` : error.message;
    this.setError(errorMessage);
  }

  /**
   * Clear error
   */
  public clearError(): void {
    this.state.lastError = null;
  }

  // ==================== System Status ====================

  /**
   * Get system status
   */
  public getSystemStatus(): SystemStatus {
    return {
      isRunning: this.state.status === 'running',
      uptime: this.state.startTime ? Date.now() - this.state.startTime : 0,
      activePositions: this.state.activePositions.size,
      pendingOrders: this.state.pendingSignals.length,
      lastSignalTime: this.state.lastSignalTime,
      startTime: this.state.startTime,
    };
  }

  /**
   * Get uptime in milliseconds
   */
  public getUptime(): number {
    return this.state.startTime ? Date.now() - this.state.startTime : 0;
  }

  /**
   * Format uptime as human readable string
   */
  public getUptimeFormatted(): string {
    const uptime = this.getUptime();
    const seconds = Math.floor(uptime / 1000);
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

  // ==================== Event Management ====================

  /**
   * Subscribe to events
   */
  public subscribe(eventType: BotEventType, listener: BotEventListener): () => void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.push(listener);
    this.eventListeners.set(eventType, listeners);

    // Return unsubscribe function
    return () => {
      const currentListeners = this.eventListeners.get(eventType) || [];
      const index = currentListeners.indexOf(listener);
      if (index !== -1) {
        currentListeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event
   */
  private emitEvent(type: BotEventType, data: unknown): void {
    const listeners = this.eventListeners.get(type) || [];
    const event: BotEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    }
  }

  // ==================== Activity Logging ====================

  /**
   * Log activity
   */
  private logActivity(
    event: string,
    details: Record<string, unknown>,
    type: ActivityLogEntry['type'] = 'info'
  ): void {
    const entry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      event,
      details,
      type,
    };

    this.activityLog.unshift(entry);

    // Keep only recent entries
    if (this.activityLog.length > this.maxActivityLogSize) {
      this.activityLog = this.activityLog.slice(0, this.maxActivityLogSize);
    }
  }

  /**
   * Get activity log
   */
  public getActivityLog(count: number = 20): ActivityLogEntry[] {
    return this.activityLog.slice(0, Math.min(count, this.activityLog.length));
  }

  /**
   * Clear activity log
   */
  public clearActivityLog(): void {
    this.activityLog = [];
  }

  // ==================== Shutdown State Management ====================

  // Shutdown state tracking
  private shutdownState = {
    isShuttingDown: false,
    shutdownTimestamp: null as number | null,
    shutdownReason: null as string | null,
    positionsBeforeShutdown: [] as Position[],
    positionsUpdated: [] as Position[],
    errors: [] as string[],
    shutdownComplete: false,
  };

  /**
   * Initiate shutdown state
   */
  public initiateShutdown(reason: string): void {
    this.shutdownState.isShuttingDown = true;
    this.shutdownState.shutdownTimestamp = Date.now();
    this.shutdownState.shutdownReason = reason;
    this.shutdownState.positionsBeforeShutdown = this.getActivePositions();
    this.shutdownState.errors = [];
    this.shutdownState.shutdownComplete = false;
    this.setStatus('stopping' as BotStateStatus);
  }

  /**
   * Get shutdown state
   */
  public getShutdownState(): {
    isShuttingDown: boolean;
    shutdownTimestamp: number | null;
    shutdownReason: string | null;
    positionsBeforeShutdown: Position[];
    positionsUpdated: Position[];
    errors: string[];
    shutdownComplete: boolean;
  } {
    return { ...this.shutdownState };
  }

  /**
   * Set positions fetched during shutdown
   */
  public setShutdownPositionsFetched(positions: Position[]): void {
    this.shutdownState.positionsBeforeShutdown = positions;
  }

  /**
   * Add a position that was updated during shutdown
   */
  public addShutdownPositionUpdated(position: Position, newSL?: number, newTP?: number): void {
    const updatedPosition = {
      ...position,
      stop_loss: newSL ?? position.stop_loss,
      take_profit: newTP ?? position.take_profit,
    };
    this.shutdownState.positionsUpdated.push(updatedPosition);
  }

  /**
   * Add an error during shutdown
   */
  public addShutdownError(error: string): void {
    this.shutdownState.errors.push(error);
  }

  /**
   * Complete shutdown
   */
  public completeShutdown(): void {
    this.shutdownState.shutdownComplete = true;
    this.shutdownState.isShuttingDown = false;
    this.setStatus('idle' as BotStateStatus);
  }

  /**
   * Get open positions (alias for getActivePositions for compatibility)
   */
  public getOpenPositions(): Position[] {
    return this.getActivePositions();
  }

  // ==================== State Management ====================

  /**
   * Reset state
   */
  public reset(): void {
    this.state = {
      status: 'idle',
      startTime: null,
      lastSignalTime: null,
      lastError: null,
      activePositions: new Map(),
      pendingSignals: [],
      sessionStats: {
        startTime: null,
        totalSignals: 0,
        executedSignals: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalPnl: 0,
        totalFees: 0,
        maxDrawdown: 0,
        peakBalance: 0,
      },
      walletBalance: 0,
      availableMargin: 0,
    };
    this.activityLog = [];
  }

  /**
   * Get full state snapshot
   */
  public getSnapshot(): BotState {
    return {
      ...this.state,
      activePositions: new Map(this.state.activePositions),
      pendingSignals: [...this.state.pendingSignals],
      sessionStats: { ...this.state.sessionStats },
    };
  }

  /**
   * Get state summary for status reports
   */
  public getStateSummary(): {
    status: BotStateStatus;
    uptime: number;
    positionCount: number;
    pendingSignalCount: number;
    errorCount: number;
  } {
    return {
      status: this.state.status,
      uptime: this.getUptime(),
      positionCount: this.state.activePositions.size,
      pendingSignalCount: this.state.pendingSignals.length,
      errorCount: this.state.lastError ? 1 : 0,
    };
  }
}

// Export singleton instance and helper functions
export const botState = BotStateManager.getInstance();

export function getBotState(): BotStateManager {
  return BotStateManager.getInstance();
}

export function resetBotState(): void {
  BotStateManager.resetInstance();
}
