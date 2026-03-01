'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Signal, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Info,
  Clock
} from 'lucide-react';
import type { Activity } from '@/hooks/useTradingBot';
import { cn } from '@/lib/utils';

interface ActivityLogProps {
  activities: Activity[];
}

const activityIcons = {
  signal: Signal,
  trade: TrendingUp,
  position: TrendingDown,
  error: AlertTriangle,
  info: Info,
};

const activityColors = {
  signal: 'text-blue-400 bg-blue-500/10',
  trade: 'text-emerald-400 bg-emerald-500/10',
  position: 'text-purple-400 bg-purple-500/10',
  error: 'text-rose-400 bg-rose-500/10',
  info: 'text-slate-400 bg-slate-500/10',
};

const badgeVariants = {
  signal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  trade: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  position: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  error: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  info: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ActivityLog({ activities }: ActivityLogProps) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-64">
      <div className="space-y-2 pr-4">
        {activities.map((activity) => {
          const Icon = activityIcons[activity.type];
          
          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
            >
              <div className={cn('p-2 rounded-lg', activityColors[activity.type])}>
                <Icon className="w-4 h-4" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={cn('text-xs', badgeVariants[activity.type])}
                  >
                    {activity.type.toUpperCase()}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    {formatTime(activity.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-slate-300 truncate">
                  {activity.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
