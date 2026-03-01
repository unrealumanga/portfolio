'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  AlertTriangle,
  Clock,
  DollarSign,
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  XCircle
} from 'lucide-react';
import { useTradingBot, formatUptime } from '@/hooks/useTradingBot';
import {
  StatusBadge,
  SignalCard,
  PositionsTable,
  ActivityLog,
  ControlPanel,
  StatsPanel,
  TradeModal,
} from '@/components/trading';
import type { Signal } from '@/lib/trading/types';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const {
    status,
    signals,
    positions,
    balance,
    activities,
    statistics,
    isLoading,
    error,
    startBot,
    stopBot,
    executeTrade,
    closePosition,
    refreshData,
  } = useTradingBot();

  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Control panel state
  const [exchange, setExchange] = useState<'mexc' | 'bybit'>('mexc');
  const [leverage, setLeverage] = useState(10);
  const [riskPercentage, setRiskPercentage] = useState(1);
  const [targetSymbols, setTargetSymbols] = useState(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);

  // Handle bot toggle
  const handleToggleBot = useCallback(async () => {
    if (status?.isRunning) {
      await stopBot();
    } else {
      await startBot();
    }
  }, [status?.isRunning, startBot, stopBot]);

  // Handle execute trade
  const handleExecuteTrade = useCallback(async (signal: Signal, size: number) => {
    setIsExecuting(true);
    try {
      await executeTrade(signal);
    } finally {
      setIsExecuting(false);
    }
  }, [executeTrade]);

  // Handle open trade modal
  const handleOpenTradeModal = useCallback((signal: Signal) => {
    setSelectedSignal(signal);
    setIsModalOpen(true);
  }, []);

  // Handle close position
  const handleClosePosition = useCallback(async (positionId: string) => {
    await closePosition(positionId);
  }, [closePosition]);

  // Emergency stop
  const handleEmergencyStop = useCallback(async () => {
    await stopBot();
    // In production, would also close all positions
  }, [stopBot]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Left: Title and Status */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="w-8 h-8 text-emerald-400" />
                <h1 className="text-xl font-bold">GLM5Tradingbot</h1>
              </div>
              <StatusBadge isRunning={status?.isRunning || false} />
            </div>

            {/* Center: Info */}
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span>Uptime: {formatUptime(status?.uptime || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-white font-medium">
                  {balance?.total_balance.toFixed(2) || '15.00'} USDT
                </span>
              </div>
              <div className="flex items-center gap-2">
                {status?.isRunning ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-slate-400">{exchange.toUpperCase()}</span>
              </div>
            </div>

            {/* Right: Emergency Stop */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                disabled={isLoading}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEmergencyStop}
                disabled={!status?.isRunning}
                className="gap-2 bg-rose-600 hover:bg-rose-700"
              >
                <XCircle className="w-4 h-4" />
                Emergency Stop
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-rose-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Control Panel */}
          <div className="lg:col-span-1 space-y-6">
            <ControlPanel
              isRunning={status?.isRunning || false}
              exchange={exchange}
              leverage={leverage}
              riskPercentage={riskPercentage}
              targetSymbols={targetSymbols}
              onToggleBot={handleToggleBot}
              onExchangeChange={setExchange}
              onLeverageChange={setLeverage}
              onRiskChange={setRiskPercentage}
              onSymbolsChange={setTargetSymbols}
              isLoading={isLoading}
            />

            {/* Statistics Panel */}
            <StatsPanel statistics={statistics} />
          </div>

          {/* Right Column: Main Dashboard */}
          <div className="lg:col-span-3 space-y-6">
            {/* Live Signals Section */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Radio className="w-5 h-5 text-emerald-400" />
                  Live Signals
                  <Badge variant="outline" className="ml-auto bg-slate-800 text-slate-300 border-slate-700">
                    {signals.length} signals
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
                  </div>
                ) : signals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <Radio className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No signals available</p>
                    <p className="text-xs text-slate-500">Waiting for trading opportunities...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {signals.map((signal) => (
                      <SignalCard
                        key={signal.id}
                        signal={signal}
                        onExecute={handleOpenTradeModal}
                        isLoading={isExecuting}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Open Positions Section */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Open Positions
                  <Badge variant="outline" className="ml-auto bg-slate-800 text-slate-300 border-slate-700">
                    {positions.length} positions
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PositionsTable
                  positions={positions}
                  onClosePosition={handleClosePosition}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>

            {/* Activity Log Section */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Activity className="w-5 h-5 text-purple-400" />
                  Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityLog activities={activities} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Trade Modal */}
      <TradeModal
        signal={selectedSignal}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onExecute={handleExecuteTrade}
        leverage={leverage}
        balance={balance?.available_balance || 15}
        isLoading={isExecuting}
      />
    </div>
  );
}
