'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ControlPanelProps {
  isRunning: boolean;
  exchange: 'mexc' | 'bybit';
  leverage: number;
  riskPercentage: number;
  targetSymbols: string[];
  onToggleBot: () => void;
  onExchangeChange: (exchange: 'mexc' | 'bybit') => void;
  onLeverageChange: (leverage: number) => void;
  onRiskChange: (risk: number) => void;
  onSymbolsChange: (symbols: string[]) => void;
  isLoading?: boolean;
}

const AVAILABLE_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT',
  'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'MATICUSDT',
  'ATOMUSDT', 'LTCUSDT', 'BNBUSDT', 'ARBUSDT', 'OPUSDT'
];

export function ControlPanel({
  isRunning,
  exchange,
  leverage,
  riskPercentage,
  targetSymbols,
  onToggleBot,
  onExchangeChange,
  onLeverageChange,
  onRiskChange,
  onSymbolsChange,
  isLoading,
}: ControlPanelProps) {
  const toggleSymbol = (symbol: string) => {
    if (targetSymbols.includes(symbol)) {
      onSymbolsChange(targetSymbols.filter(s => s !== symbol));
    } else {
      onSymbolsChange([...targetSymbols, symbol]);
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white">
          <Settings className="w-5 h-5" />
          Control Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Start/Stop Button */}
        <div className="flex gap-2">
          <Button
            onClick={onToggleBot}
            disabled={isLoading}
            className={cn(
              'flex-1 gap-2 h-12 text-lg font-medium',
              isRunning
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            )}
          >
            {isRunning ? (
              <>
                <Square className="w-5 h-5" />
                Stop Bot
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Start Bot
              </>
            )}
          </Button>
        </div>

        {/* Exchange Selector */}
        <div className="space-y-2">
          <Label className="text-slate-300">Exchange</Label>
          <Select
            value={exchange}
            onValueChange={(value) => onExchangeChange(value as 'mexc' | 'bybit')}
            disabled={isRunning}
          >
            <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="mexc" className="text-white hover:bg-slate-700">MEXC</SelectItem>
              <SelectItem value="bybit" className="text-white hover:bg-slate-700">Bybit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Leverage Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-slate-300">Leverage</Label>
            <span className="text-lg font-bold text-white">{leverage}x</span>
          </div>
          <Slider
            value={[leverage]}
            onValueChange={([value]) => onLeverageChange(value)}
            min={1}
            max={20}
            step={1}
            disabled={isRunning}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>1x</span>
            <span>10x</span>
            <span>20x</span>
          </div>
        </div>

        {/* Risk Percentage */}
        <div className="space-y-2">
          <Label className="text-slate-300">Risk per Trade (%)</Label>
          <Input
            type="number"
            value={riskPercentage}
            onChange={(e) => onRiskChange(Number(e.target.value))}
            min={0.1}
            max={10}
            step={0.1}
            disabled={isRunning}
            className="bg-slate-800/50 border-slate-700 text-white"
          />
        </div>

        {/* Target Symbols */}
        <div className="space-y-2">
          <Label className="text-slate-300">Target Symbols</Label>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
            {AVAILABLE_SYMBOLS.map((symbol) => {
              const isSelected = targetSymbols.includes(symbol);
              return (
                <Badge
                  key={symbol}
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => !isRunning && toggleSymbol(symbol)}
                  className={cn(
                    'cursor-pointer transition-all text-xs',
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-700/50',
                    isRunning && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {symbol}
                </Badge>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            {targetSymbols.length} symbols selected
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
