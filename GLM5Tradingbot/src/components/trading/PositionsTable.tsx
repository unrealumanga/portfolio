'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { Position } from '@/lib/trading/types';
import { cn } from '@/lib/utils';

interface PositionsTableProps {
  positions: Position[];
  onClosePosition?: (positionId: string) => void;
  isLoading?: boolean;
}

export function PositionsTable({ positions, onClosePosition, isLoading }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <p className="text-sm">No open positions</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-800 hover:bg-slate-800/50">
          <TableHead className="text-slate-400">Symbol</TableHead>
          <TableHead className="text-slate-400">Side</TableHead>
          <TableHead className="text-slate-400">Size</TableHead>
          <TableHead className="text-slate-400">Entry</TableHead>
          <TableHead className="text-slate-400">Mark</TableHead>
          <TableHead className="text-slate-400">PnL</TableHead>
          <TableHead className="text-slate-400">TP/SL</TableHead>
          <TableHead className="text-slate-400 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => {
          const isLong = position.side === 'LONG';
          const pnlColor = (position.unrealized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
          
          return (
            <TableRow key={position.id} className="border-slate-800 hover:bg-slate-800/30">
              <TableCell className="font-medium text-white">
                {position.symbol}
              </TableCell>
              <TableCell>
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
                  {position.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-white">
                {position.size} ({position.leverage}x)
              </TableCell>
              <TableCell className="text-slate-300">
                ${position.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </TableCell>
              <TableCell className="text-white">
                ${position.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) || '-'}
              </TableCell>
              <TableCell className={cn('font-medium', pnlColor)}>
                {position.unrealized_pnl !== undefined && (
                  <>
                    {position.unrealized_pnl >= 0 ? '+' : ''}
                    {position.unrealized_pnl.toFixed(2)} USDT
                  </>
                )}
              </TableCell>
              <TableCell className="text-slate-300">
                <div className="flex flex-col gap-0.5 text-xs">
                  <span className="text-emerald-400">
                    TP: ${position.take_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) || '-'}
                  </span>
                  <span className="text-rose-400">
                    SL: ${position.stop_loss?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) || '-'}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onClosePosition?.(position.id)}
                  disabled={isLoading}
                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                >
                  <X className="w-4 h-4 mr-1" />
                  Close
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
