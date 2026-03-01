'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Signal, Position } from '@/lib/trading/types';

// Types for the hook
export interface BotStatus {
  isRunning: boolean;
  startTime: Date | null;
  uptime: number;
  exchange: 'mexc' | 'bybit';
  leverage: number;
  riskPercentage: number;
  targetSymbols: string[];
}

export interface Balance {
  total_balance: number;
  available_balance: number;
  used_margin: number;
  unrealized_pnl: number;
  realized_pnl: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  base_capital: number;
}

export interface Activity {
  id: string;
  timestamp: Date;
  type: 'signal' | 'trade' | 'position' | 'error' | 'info';
  message: string;
}

export interface Statistics {
  winRate: number;
  totalTrades: number;
  totalPnL: number;
  avgEvScore: number;
  bestTrade: number;
  worstTrade: number;
}

export interface TradingBotState {
  status: BotStatus | null;
  signals: Signal[];
  positions: Position[];
  balance: Balance | null;
  activities: Activity[];
  statistics: Statistics;
  isLoading: boolean;
  error: string | null;
}

export interface UseTradingBotReturn extends TradingBotState {
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  executeTrade: (signal: Signal) => Promise<void>;
  closePosition: (positionId: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Generate mock activities
function generateMockActivities(): Activity[] {
  const types: Activity['type'][] = ['signal', 'trade', 'position', 'info'];
  const messages = [
    { type: 'signal' as const, message: 'New signal generated: BTCUSDT LONG (EV: 0.045)' },
    { type: 'trade' as const, message: 'Trade executed: BUY 0.002 BTCUSDT @ 67250' },
    { type: 'position' as const, message: 'Position opened: ETHUSDT SHORT' },
    { type: 'info' as const, message: 'Bot started successfully' },
    { type: 'signal' as const, message: 'Signal expired: SOLUSDT' },
    { type: 'position' as const, message: 'Take profit hit: BTCUSDT +2.4%' },
  ];

  return Array.from({ length: 10 }, (_, i) => ({
    id: `act-${i}`,
    timestamp: new Date(Date.now() - i * 300000),
    type: messages[i % messages.length].type,
    message: messages[i % messages.length].message,
  }));
}

// Main hook
export function useTradingBot(): UseTradingBotReturn {
  const [state, setState] = useState<TradingBotState>({
    status: null,
    signals: [],
    positions: [],
    balance: null,
    activities: [],
    statistics: {
      winRate: 62.5,
      totalTrades: 24,
      totalPnL: 2.84,
      avgEvScore: 0.032,
      bestTrade: 1.45,
      worstTrade: -0.62,
    },
    isLoading: true,
    error: null,
  });

  // Fetch bot status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      return data as BotStatus;
    } catch (error) {
      console.error('Error fetching status:', error);
      return null;
    }
  }, []);

  // Fetch signals
  const fetchSignals = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/signals');
      if (!response.ok) throw new Error('Failed to fetch signals');
      const data = await response.json();
      return data.signals as Signal[];
    } catch (error) {
      console.error('Error fetching signals:', error);
      return [];
    }
  }, []);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/positions');
      if (!response.ok) throw new Error('Failed to fetch positions');
      const data = await response.json();
      return data.positions as Position[];
    } catch (error) {
      console.error('Error fetching positions:', error);
      return [];
    }
  }, []);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/balance');
      if (!response.ok) throw new Error('Failed to fetch balance');
      const data = await response.json();
      return data.balance as Balance;
    } catch (error) {
      console.error('Error fetching balance:', error);
      return null;
    }
  }, []);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const [status, signals, positions, balance] = await Promise.all([
        fetchStatus(),
        fetchSignals(),
        fetchPositions(),
        fetchBalance(),
      ]);

      const activities = generateMockActivities();

      setState(prev => ({
        ...prev,
        status,
        signals,
        positions,
        balance,
        activities,
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch data',
      }));
    }
  }, [fetchStatus, fetchSignals, fetchPositions, fetchBalance]);

  // Start bot
  const startBot = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/start', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to start bot');
      await refreshData();
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to start bot' }));
    }
  }, [refreshData]);

  // Stop bot
  const stopBot = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/stop', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to stop bot');
      await refreshData();
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to stop bot' }));
    }
  }, [refreshData]);

  // Execute trade
  const executeTrade = useCallback(async (signal: Signal) => {
    try {
      const response = await fetch('/api/trading/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalId: signal.id,
          symbol: signal.symbol,
          direction: signal.direction,
          size: 0.001, // Would be calculated based on risk
          leverage: state.status?.leverage || 10,
          exchange: state.status?.exchange || 'mexc',
        }),
      });
      if (!response.ok) throw new Error('Failed to execute trade');
      await refreshData();
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to execute trade' }));
    }
  }, [refreshData, state.status]);

  // Close position
  const closePosition = useCallback(async (positionId: string) => {
    try {
      const response = await fetch(`/api/trading/positions?id=${positionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to close position');
      await refreshData();
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to close position' }));
    }
  }, [refreshData]);

  // Initial fetch and auto-refresh every 5 seconds
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  return {
    ...state,
    startBot,
    stopBot,
    executeTrade,
    closePosition,
    refreshData,
  };
}

// Export helper
export { formatUptime };
