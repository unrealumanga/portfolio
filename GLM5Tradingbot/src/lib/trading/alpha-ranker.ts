/**
 * Alpha Ranker Module for GLM5Tradingbot
 * Evaluates and ranks trading signals using Expected Value and Kelly Criterion
 */

import type {
  AlphaRankerConfig,
  EvaluatedSignal,
  OrderBook,
  Signal,
} from './types';
import { DEFAULT_ALPHA_RANKER_CONFIG } from './types';

// Re-export EvaluatedSignal type for convenience
export type { EvaluatedSignal };

// ==================== Alpha Ranker Class ====================

/**
 * Alpha Ranker Class
 * Evaluates trading signals and ranks them by Expected Value and Kelly Criterion
 */
export class AlphaRanker {
  private config: AlphaRankerConfig;

  constructor(config: Partial<AlphaRankerConfig> = {}) {
    this.config = { ...DEFAULT_ALPHA_RANKER_CONFIG, ...config };
  }

  /**
   * Calculate spread penalty from orderbook
   * Spread affects the actual entry price and profitability
   */
  calculate_spread_penalty(orderBook: OrderBook): number {
    const bestBid = orderBook.bids[0]?.price ?? 0;
    const bestAsk = orderBook.asks[0]?.price ?? 0;
    
    if (bestBid === 0 || bestAsk === 0) {
      return 0;
    }
    
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    
    // Spread as percentage of mid price
    return (spread / midPrice) * 100;
  }

  /**
   * Calculate effective entry price considering spread and slippage
   */
  calculate_effective_entry(
    direction: 'LONG' | 'SHORT',
    orderBook: OrderBook
  ): { entryPrice: number; spreadCost: number } {
    const bestBid = orderBook.bids[0]?.price ?? 0;
    const bestAsk = orderBook.asks[0]?.price ?? 0;
    
    if (bestBid === 0 || bestAsk === 0) {
      return { entryPrice: 0, spreadCost: 0 };
    }
    
    const midPrice = (bestBid + bestAsk) / 2;
    const halfSpread = (bestAsk - bestBid) / 2;
    
    // For longs, we buy at ask + slippage
    // For shorts, we sell at bid - slippage
    const slippagePct = this.config.slippageBuffer;
    
    let entryPrice: number;
    let spreadCost: number;
    
    if (direction === 'LONG') {
      entryPrice = bestAsk * (1 + slippagePct / 100);
      spreadCost = entryPrice - midPrice;
    } else {
      entryPrice = bestBid * (1 - slippagePct / 100);
      spreadCost = midPrice - entryPrice;
    }
    
    return { entryPrice, spreadCost };
  }

  /**
   * Calculate round trip fees
   * Entry fee + Exit fee (using taker fees for conservative estimate)
   */
  calculate_round_trip_fees(entryValue: number): number {
    const entryFee = entryValue * this.config.takerFee;
    const exitFee = entryValue * this.config.takerFee;
    return entryFee + exitFee;
  }

  /**
   * Evaluate a single signal
   */
  evaluate_signal(
    signal: Signal,
    orderBook: OrderBook
  ): EvaluatedSignal {
    const { entryPrice } = this.calculate_effective_entry(signal.direction, orderBook);
    const spreadPenalty = this.calculate_spread_penalty(orderBook);
    
    // Calculate expected profit target based on expected move
    const moveMultiplier = signal.expected_move_pct / 100;
    const targetPrice = signal.direction === 'LONG'
      ? entryPrice * (1 + moveMultiplier)
      : entryPrice * (1 - moveMultiplier);
    
    // Calculate position value (using 15 USDT as capital)
    const capital = 15; // USDT constraint
    const positionValue = capital;
    
    // Gross ROI = Expected move percentage
    const grossRoi = signal.expected_move_pct;
    
    // Calculate fees
    const roundTripFees = this.calculate_round_trip_fees(positionValue);
    const feesAsPct = (roundTripFees / positionValue) * 100;
    
    // Net ROI = Gross ROI - Spread penalty - Fees
    const netRoi = grossRoi - spreadPenalty - feesAsPct;
    
    // Risk percentage (typically 1x ATR as percentage)
    const atr = signal.atr ?? 0;
    const currentPrice = signal.current_price ?? 0;
    const riskPct = atr > 0 && currentPrice > 0
      ? (atr / currentPrice) * 100
      : signal.expected_move_pct / 2; // Default to half expected move if no ATR
    
    // Reward to Risk ratio
    const rewardToRisk = riskPct > 0 ? netRoi / riskPct : 0;
    
    // Calculate Expected Value (EV)
    // EV = (Win_Prob * Net_ROI) - (Loss_Prob * Risk_Pct)
    const winProb = signal.win_probability;
    const lossProb = 1 - winProb;
    const evScore = (winProb * netRoi) - (lossProb * riskPct);
    
    // Calculate Modified Kelly Score
    // Kelly = Win_Prob - (Loss_Prob / Reward_to_Risk)
    // Modified Kelly caps at 25% for risk management
    let kellyScore = 0;
    if (rewardToRisk > 0) {
      kellyScore = winProb - (lossProb / rewardToRisk);
      // Cap Kelly at reasonable level
      kellyScore = Math.max(0, Math.min(0.25, kellyScore));
    }
    
    return {
      ...signal,
      spread_penalty: spreadPenalty,
      gross_roi: grossRoi,
      round_trip_fees: feesAsPct,
      net_roi: netRoi,
      ev_score: evScore,
      kelly_score: kellyScore,
      reward_to_risk: rewardToRisk,
      risk_pct: riskPct,
    };
  }

  /**
   * Evaluate and sort signals by their quality metrics
   * Filters out signals below minimum thresholds
   */
  evaluate_and_sort(
    signals: Signal[],
    orderBook: OrderBook
  ): EvaluatedSignal[] {
    // Evaluate all signals
    const evaluatedSignals = signals.map(signal => 
      this.evaluate_signal(signal, orderBook)
    );
    
    // Filter by minimum thresholds
    const filteredSignals = evaluatedSignals.filter(signal => {
      const meetsMinEv = signal.ev_score >= this.config.minEvScore;
      const meetsMinKelly = signal.kelly_score >= this.config.minKellyScore;
      const positiveNetRoi = signal.net_roi > 0;
      
      return meetsMinEv && meetsMinKelly && positiveNetRoi;
    });
    
    // Sort by combined score (weighted combination)
    const sortedSignals = filteredSignals.sort((a, b) => {
      // Combined score: EV has more weight than Kelly
      const scoreA = a.ev_score * 0.6 + a.kelly_score * 100 * 0.4;
      const scoreB = b.ev_score * 0.6 + b.kelly_score * 100 * 0.4;
      return scoreB - scoreA;
    });
    
    return sortedSignals;
  }

  /**
   * Pick the apex (best) signal from evaluated signals
   */
  pick_apex_signal(evaluatedSignals: EvaluatedSignal[]): EvaluatedSignal | null {
    if (evaluatedSignals.length === 0) {
      return null;
    }
    
    // Return the top-ranked signal
    return evaluatedSignals[0];
  }

  /**
   * Calculate the Kelly optimal position size
   * Returns the fraction of capital to risk
   */
  calculate_kelly_fraction(
    winProbability: number,
    rewardToRisk: number
  ): number {
    if (rewardToRisk <= 0) {
      return 0;
    }
    
    // Full Kelly = W - (1-W)/R
    const fullKelly = winProbability - (1 - winProbability) / rewardToRisk;
    
    // Use half Kelly for more conservative sizing
    const halfKelly = fullKelly / 2;
    
    // Ensure non-negative and capped at 25%
    return Math.max(0, Math.min(0.25, halfKelly));
  }

  /**
   * Generate a signal quality report
   */
  generate_signal_report(signal: EvaluatedSignal): {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    metrics: {
      evScore: number;
      kellyScore: number;
      netRoi: number;
      rewardToRisk: number;
    };
    recommendation: string;
  } {
    // Calculate combined score
    const combinedScore = signal.ev_score * 0.6 + signal.kelly_score * 100 * 0.4;
    
    // Assign grade
    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (combinedScore >= 3) grade = 'A';
    else if (combinedScore >= 2) grade = 'B';
    else if (combinedScore >= 1) grade = 'C';
    else if (combinedScore >= 0.5) grade = 'D';
    else grade = 'F';
    
    // Generate recommendation
    let recommendation: string;
    if (grade === 'A') {
      recommendation = 'Strong buy signal. High confidence trade setup with favorable risk/reward.';
    } else if (grade === 'B') {
      recommendation = 'Good signal. Positive expected value with reasonable risk parameters.';
    } else if (grade === 'C') {
      recommendation = 'Moderate signal. Consider additional confirmation before entering.';
    } else if (grade === 'D') {
      recommendation = 'Weak signal. Risk/reward may not justify entry.';
    } else {
      recommendation = 'Poor signal. Negative expected value or excessive risk. Avoid.';
    }
    
    return {
      grade,
      metrics: {
        evScore: signal.ev_score,
        kellyScore: signal.kelly_score,
        netRoi: signal.net_roi,
        rewardToRisk: signal.reward_to_risk,
      },
      recommendation,
    };
  }
}

// ==================== Helper Functions ====================

/**
 * Quick EV calculation for a potential trade
 */
export function calculate_ev(
  winProbability: number,
  rewardPct: number,
  riskPct: number,
  feesPct: number = 0.11 // Default Bybit round trip
): number {
  const netReward = rewardPct - feesPct;
  const lossProb = 1 - winProbability;
  return (winProbability * netReward) - (lossProb * riskPct);
}

/**
 * Quick Kelly calculation
 */
export function calculate_kelly(
  winProbability: number,
  rewardToRisk: number
): number {
  if (rewardToRisk <= 0) return 0;
  return winProbability - (1 - winProbability) / rewardToRisk;
}

/**
 * Calculate the break-even win rate for a given R:R
 */
export function break_even_win_rate(rewardToRisk: number): number {
  if (rewardToRisk <= 0) return 1;
  return 1 / (1 + rewardToRisk);
}

/**
 * Calculate optimal leverage based on Kelly fraction and account risk
 */
export function calculate_optimal_leverage(
  kellyFraction: number,
  maxAccountRisk: number = 0.02 // 2% max account risk per trade
): number {
  // Leverage = Kelly / MaxRisk
  // Capped at reasonable levels
  const leverage = kellyFraction / maxAccountRisk;
  return Math.min(20, Math.max(1, leverage));
}
