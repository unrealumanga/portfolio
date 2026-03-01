'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  isRunning: boolean;
  className?: string;
}

export function StatusBadge({ isRunning, className }: StatusBadgeProps) {
  return (
    <Badge
      variant={isRunning ? 'default' : 'secondary'}
      className={cn(
        'px-3 py-1 text-sm font-medium gap-2',
        isRunning 
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
          : 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        className
      )}
    >
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
        )}
      />
      {isRunning ? 'Running' : 'Stopped'}
    </Badge>
  );
}
