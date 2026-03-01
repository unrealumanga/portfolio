'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  DollarSign,
  BarChart3,
  Trophy,
  AlertCircle
} from 'lucide-react';
import type { Statistics } from '@/hooks/useTradingBot';
import { cn } from '@/lib/utils';

interface StatsPanelProps {
  statistics: Statistics;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  suffix?: string;
}

function StatCard({ title, value, icon, trend = 'neutral', suffix }: StatCardProps) {
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-rose-400',
    neutral: 'text-white',
  };

  return (
    <div className="bg-slate-800/30 rounded-lg p-4 flex items-start gap-3">
      <div className={cn(
        'p-2 rounded-lg',
        trend === 'up' ? 'bg-emerald-500/10' : 
        trend === 'down' ? 'bg-rose-500/10' : 'bg-slate-700/50'
      )}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-400 mb-1">{title}</p>
        <p className={cn('text-xl font-bold', trendColors[trend])}>
          {value}{suffix && <span className="text-sm text-slate-400 ml-1">{suffix}</span>}
        </p>
      </div>
    </div>
  );
}

export function StatsPanel({ statistics }: StatsPanelProps) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white">
          <BarChart3 className="w-5 h-5" />
          Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            title="Win Rate"
            value={statistics.winRate.toFixed(1)}
            suffix="%"
            icon={<Target className="w-5 h-5 text-emerald-400" />}
            trend={statistics.winRate >= 60 ? 'up' : statistics.winRate >= 50 ? 'neutral' : 'down'}
          />
          
          <StatCard
            title="Total Trades"
            value={statistics.totalTrades}
            icon={<BarChart3 className="w-5 h-5 text-blue-400" />}
          />
          
          <StatCard
            title="Total PnL"
            value={`${statistics.totalPnL >= 0 ? '+' : ''}${statistics.totalPnL.toFixed(2)}`}
            suffix="USDT"
            icon={<DollarSign className="w-5 h-5 text-purple-400" />}
            trend={statistics.totalPnL >= 0 ? 'up' : 'down'}
          />
          
          <StatCard
            title="Avg EV Score"
            value={statistics.avgEvScore.toFixed(3)}
            icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}
            trend={statistics.avgEvScore >= 0.03 ? 'up' : 'neutral'}
          />
          
          <StatCard
            title="Best Trade"
            value={`+${statistics.bestTrade.toFixed(2)}`}
            suffix="USDT"
            icon={<Trophy className="w-5 h-5 text-yellow-400" />}
            trend="up"
          />
          
          <StatCard
            title="Worst Trade"
            value={statistics.worstTrade.toFixed(2)}
            suffix="USDT"
            icon={<AlertCircle className="w-5 h-5 text-orange-400" />}
            trend="down"
          />
        </div>
      </CardContent>
    </Card>
  );
}
