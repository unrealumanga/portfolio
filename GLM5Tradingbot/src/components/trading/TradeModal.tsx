'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap, 
  AlertTriangle,
  Loader2
} from 'lucide-react';
import type { Signal } from '@/lib/trading/types';
import { cn } from '@/lib/utils';

interface TradeModalProps {
  signal: Signal | null;
  isOpen: boolean;
  onClose: () => void;
  onExecute: (signal: Signal, size: number) => void;
  leverage: number;
  balance: number;
  isLoading?: boolean;
}

export function TradeModal({
  signal,
  isOpen,
  onClose,
  onExecute,
  leverage,
  balance,
  isLoading,
}: TradeModalProps) {
  const [size, setSize] = useState<string>('0.001');
  const [customTp, setCustomTp] = useState<string>('');
  const [customSl, setCustomSl] = useState<string>('');

  if (!signal) return null;

  const isLong = signal.direction === 'LONG';
  const numericSize = parseFloat(size) || 0;
  const estimatedMargin = (numericSize * (signal.entry_price || 0)) / leverage;

  const handleExecute = () => {
    onExecute(signal, numericSize);
    onClose();
    // Reset form
    setSize('0.001');
    setCustomTp('');
    setCustomSl('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Execute Trade
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Review and execute this trading signal
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Signal Summary */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-lg">{signal.symbol}</span>
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
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">Strategy:</span>
                <span className="ml-2 text-white">{signal.strategy}</span>
              </div>
              <div>
                <span className="text-slate-400">Win Prob:</span>
                <span className="ml-2 text-white">{(signal.win_probability * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-slate-400">EV Score:</span>
                <span className={cn(
                  'ml-2',
                  (signal.ev_score ?? 0) > 0.03 ? 'text-emerald-400' : 'text-yellow-400'
                )}>
                  {(signal.ev_score ?? 0).toFixed(3)}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Kelly:</span>
                <span className={cn(
                  'ml-2',
                  (signal.kelly_score ?? 0) > 0.1 ? 'text-emerald-400' : 
                  (signal.kelly_score ?? 0) > 0 ? 'text-yellow-400' : 'text-rose-400'
                )}>
                  {(signal.kelly_score ?? 0).toFixed(2)}
                </span>
              </div>
            </div>

            {signal.entry_price && (
              <div className="pt-2 border-t border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Entry Price:</span>
                  <span className="text-white font-medium">
                    ${signal.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Trade Parameters */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="size" className="text-slate-300">Position Size</Label>
              <Input
                id="size"
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                min={0.0001}
                step={0.0001}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Estimated margin: {estimatedMargin.toFixed(2)} USDT ({leverage}x leverage)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tp" className="text-slate-300">Take Profit (optional)</Label>
                <Input
                  id="tp"
                  type="number"
                  value={customTp}
                  onChange={(e) => setCustomTp(e.target.value)}
                  placeholder={signal.take_profit?.toFixed(2)}
                  className="bg-slate-800/50 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl" className="text-slate-300">Stop Loss (optional)</Label>
                <Input
                  id="sl"
                  type="number"
                  value={customSl}
                  onChange={(e) => setCustomSl(e.target.value)}
                  placeholder={signal.stop_loss?.toFixed(2)}
                  className="bg-slate-800/50 border-slate-700 text-white"
                />
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-yellow-400 font-medium">Risk Warning</p>
              <p className="text-yellow-400/70">
                Available balance: {balance.toFixed(2)} USDT. 
                Ensure position size is within your risk limits.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExecute}
            disabled={isLoading || numericSize <= 0}
            className={cn(
              'gap-2',
              isLong 
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                : 'bg-rose-500 hover:bg-rose-600 text-white'
            )}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Zap className="w-4 h-4" />
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
