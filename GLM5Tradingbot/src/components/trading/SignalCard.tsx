'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import type { Signal } from '@/lib/trading/types';
import { cn } from '@/lib/utils';

interface SignalCardProps {
  signal: Signal;
  onExecute?: (signal: Signal) => void;
  isLoading?: boolean;
}

export function SignalCard({ signal, onExecute, isLoading }: SignalCardProps) {
  const isLong = signal.direction === 'LONG';
  
  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-200 hover:shadow-lg',
        'bg-slate-900/50 border-slate-800',
        isLong ? 'hover:border-emerald-500/50' : 'hover:border-rose-500/50'
      )}
    >
      {/* Direction indicator bar */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-1',
          isLong ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-rose-500 to-rose-400'
        )}
      />
      
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white">{signal.symbol}</span>
            <Badge
              variant="outline"
              className={cn(
                'gap-1',
                isLong 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              )}
            >
              {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {signal.direction.toUpperCase()}
            </Badge>
          </div>
          <Badge variant="outline" className="text-xs text-slate-400">
            {signal.strategy}
          </Badge>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400 mb-1">EV Score</div>
            <div className={cn(
              'text-lg font-bold',
              (signal.ev_score ?? 0) > 0.03 ? 'text-emerald-400' : 'text-yellow-400'
            )}>
              {(signal.ev_score ?? 0).toFixed(3)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400 mb-1">Kelly Score</div>
            <div className={cn(
              'text-lg font-bold',
              (signal.kelly_score ?? 0) > 0.1 ? 'text-emerald-400' : 
              (signal.kelly_score ?? 0) > 0 ? 'text-yellow-400' : 'text-rose-400'
            )}>
              {(signal.kelly_score ?? 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Win Probability */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-slate-400">Win Probability</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  signal.win_probability >= 0.7 ? 'bg-emerald-500' :
                  signal.win_probability >= 0.55 ? 'bg-yellow-500' : 'bg-rose-500'
                )}
                style={{ width: `${signal.win_probability * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-white">
              {(signal.win_probability * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Entry Price */}
        {signal.entry_price && (
          <div className="flex items-center justify-between text-sm mb-4">
            <span className="text-slate-400">Entry Price</span>
            <span className="text-white font-medium">
              ${signal.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
          </div>
        )}

        {/* Execute Button */}
        <Button
          onClick={() => onExecute?.(signal)}
          disabled={isLoading}
          className={cn(
            'w-full gap-2',
            isLong 
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
              : 'bg-rose-500 hover:bg-rose-600 text-white'
          )}
        >
          <Zap className="w-4 h-4" />
          Execute Trade
        </Button>
      </CardContent>
    </Card>
  );
}
