/**
 * Risk Physics Module for GLM5Tradingbot
 * Position sizing and risk management with fee-aware calculations
 */

import type {
  EvaluatedSignal,
  PositionSizing,
  RiskLevels,
  RiskPhysicsConfig,
  Signal,
} from './types';
import { DEFAULT_RISK_PHYSICS_CONFIG } from './types';
import { round_to_tick_size, round_to_qty_step } from './utils';

// ==================== Risk Physics Class ====================

/**
 * Risk Physics Class
 * Manages position sizing, TP/SL calculations, and fee-aware risk management
 */
export class RiskPhysics {
  private config: RiskPhysicsConfig;

  constructor(config: Partial<RiskPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_RISK_PHYSICS_CONFIG, ...config };
  }

  /**
   * Calculate Take Profit and Stop Loss levels using ATR multipliers
   */
  calculate_tp_sl(
    signal: Signal,
    customTpMultiplier?: number,
    customSlMultiplier?: number
  ): RiskLevels {
    const entryPrice = signal.current_price ?? signal.entry_price ?? 0;
    const atr = signal.atr ?? 0;
    
    if (entryPrice === 0) {
      throw new Error('Signal must have current_price or entry_price for TP/SL calculation');
    }
    
    if (atr === 0) {
      throw new Error('Signal must have atr for TP/SL calculation');
    }
    
    // Use custom multipliers or defaults
    const tpMultiplier = customTpMultiplier ?? this.config.defaultAtrMultiplierTp;
    const slMultiplier = customSlMultiplier ?? this.config.defaultAtrMultiplierSl;
    
    // Calculate TP and SL distances from ATR
    const tpDistance = atr * tpMultiplier;
    const slDistance = atr * slMultiplier;
    
    // Calculate prices based on direction
    let takeProfitPrice: number;
    let stopLossPrice: number;
    
    if (signal.direction === 'LONG') {
      takeProfitPrice = entryPrice + tpDistance;
      stopLossPrice = entryPrice - slDistance;
    } else {
      takeProfitPrice = entryPrice - tpDistance;
      stopLossPrice = entryPrice + slDistance;
    }
    
    // Calculate break-even price (accounting for fees)
    const breakEvenPrice = this.calculate_break_even(entryPrice, signal.direction);
    
    // Risk-Reward Ratio
    const riskRewardRatio = slDistance > 0 ? tpDistance / slDistance : 0;
    
    return {
      entryPrice,
      takeProfitPrice,
      stopLossPrice,
      breakEvenPrice,
      riskRewardRatio,
      atrMultiplier: slMultiplier,
    };
  }

  /**
   * Calculate break-even price accounting for fees
   * For longs: need price to rise by 2x taker fee to break even
   * For shorts: need price to fall by 2x taker fee to break even
   */
  calculate_break_even(entryPrice: number, direction: 'LONG' | 'SHORT'): number {
    const totalFeePct = this.config.takerFee * 2; // Entry + Exit fees
    
    if (direction === 'LONG') {
      return entryPrice * (1 + totalFeePct);
    } else {
      return entryPrice * (1 - totalFeePct);
    }
  }

  /**
   * Calculate position size with 15 USDT capital constraint
   * Fee-aware calculation ensuring risk is within bounds
   */
  calculate_position_size(
    signal: Signal,
    riskLevels: RiskLevels,
    tickSize: number = 0.01,
    qtyStep: number = 0.001
  ): PositionSizing {
    // Maximum capital per trade (15 USDT constraint)
    const maxCapital = this.config.maxCapitalPerTrade;
    
    const currentPrice = signal.current_price ?? signal.entry_price ?? 0;
    if (currentPrice === 0) {
      throw new Error('Signal must have current_price or entry_price for position sizing');
    }
    
    // Calculate risk amount (how much we can lose on this trade)
    // Risk = (Entry - SL) for longs, (SL - Entry) for shorts
    const riskDistance = Math.abs(currentPrice - riskLevels.stopLossPrice);
    const riskPct = riskDistance / currentPrice;
    
    // Maximum we want to risk per trade (typically 1-2% of account)
    // For 15 USDT account, 2% = 0.30 USDT max risk
    const maxRiskPerTrade = maxCapital * 0.02;
    
    // Calculate position size based on risk
    // Position Size = Max Risk / Risk Distance
    let positionSize = maxRiskPerTrade / riskDistance;
    
    // But also respect capital constraint
    const maxPositionByCapital = maxCapital / currentPrice;
    positionSize = Math.min(positionSize, maxPositionByCapital);
    
    // Round to valid quantity step
    const quantity = round_to_qty_step(positionSize, qtyStep, 'down');
    
    // Calculate actual position value
    const positionValue = quantity * currentPrice;
    
    // Calculate leverage needed (if position value > capital)
    const leverage = positionValue > maxCapital 
      ? Math.ceil(positionValue / maxCapital) 
      : 1;
    
    return {
      capital: maxCapital,
      positionSize: positionValue,
      quantity,
      leverage: Math.min(leverage, this.config.maxLeverage),
    };
  }

  /**
   * Calculate the actual risk in USDT for a position
   */
  calculate_actual_risk(
    quantity: number,
    entryPrice: number,
    stopLossPrice: number
  ): number {
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
    return quantity * riskPerUnit;
  }

  /**
   * Calculate profit potential in USDT
   */
  calculate_profit_potential(
    quantity: number,
    entryPrice: number,
    takeProfitPrice: number
  ): number {
    const profitPerUnit = Math.abs(takeProfitPrice - entryPrice);
    return quantity * profitPerUnit;
  }

  /**
   * Calculate fees for a complete trade (entry + exit)
   */
  calculate_total_fees(positionValue: number, exitPrice?: number): {
    entryFee: number;
    exitFee: number;
    totalFees: number;
  } {
    const entryFee = positionValue * this.config.takerFee;
    const exitValue = exitPrice ? positionValue * (exitPrice / positionValue) : positionValue;
    const exitFee = exitValue * this.config.takerFee;
    
    return {
      entryFee,
      exitFee,
      totalFees: entryFee + exitFee,
    };
  }

  /**
   * Calculate net profit after fees
   */
  calculate_net_profit(
    quantity: number,
    entryPrice: number,
    exitPrice: number,
    direction: 'LONG' | 'SHORT'
  ): {
    grossProfit: number;
    totalFees: number;
    netProfit: number;
    roiPct: number;
  } {
    const positionValue = quantity * entryPrice;
    const fees = this.calculate_total_fees(positionValue, exitPrice);
    
    let grossProfit: number;
    if (direction === 'LONG') {
      grossProfit = quantity * (exitPrice - entryPrice);
    } else {
      grossProfit = quantity * (entryPrice - exitPrice);
    }
    
    const netProfit = grossProfit - fees.totalFees;
    const roiPct = (netProfit / positionValue) * 100;
    
    return {
      grossProfit,
      totalFees: fees.totalFees,
      netProfit,
      roiPct,
    };
  }

  /**
   * Validate risk parameters for a trade
   */
  validate_trade(
    signal: EvaluatedSignal,
    riskLevels: RiskLevels,
    positionSizing: PositionSizing
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check minimum risk-reward ratio
    if (riskLevels.riskRewardRatio < this.config.minRiskReward) {
      warnings.push(
        `Risk-Reward ratio (${riskLevels.riskRewardRatio.toFixed(2)}) below minimum (${this.config.minRiskReward})`
      );
    }
    
    // Check leverage
    if (positionSizing.leverage > this.config.maxLeverage) {
      errors.push(
        `Required leverage (${positionSizing.leverage}x) exceeds maximum (${this.config.maxLeverage}x)`
      );
    }
    
    // Check if stop loss would cause more than 100% loss
    const currentPrice = signal.current_price ?? signal.entry_price ?? 0;
    if (currentPrice > 0) {
      const lossPct = Math.abs(currentPrice - riskLevels.stopLossPrice) / currentPrice;
      if (lossPct > 0.5 && positionSizing.leverage > 1) {
        warnings.push(
          `Potential loss (${(lossPct * 100 * positionSizing.leverage).toFixed(1)}%) with ${positionSizing.leverage}x leverage`
        );
      }
    }
    
    // Check EV score
    if (signal.ev_score < 0) {
      warnings.push('Signal has negative expected value');
    }
    
    // Check Kelly score
    if (signal.kelly_score < 0.05) {
      warnings.push('Low Kelly score - position may be over-sized');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate dynamic TP levels for partial profit taking
   */
  calculate_partial_tp_levels(
    riskLevels: RiskLevels,
    levels: number[] = [0.5, 0.75, 1.0] // 50%, 75%, 100% of TP target
  ): Array<{
    targetPct: number;
    price: number;
    moveFromEntry: number;
  }> {
    const entryPrice = riskLevels.entryPrice;
    const tpDistance = Math.abs(riskLevels.takeProfitPrice - entryPrice);
    
    return levels.map(pct => {
      const partialDistance = tpDistance * pct;
      
      let price: number;
      if (riskLevels.takeProfitPrice > entryPrice) {
        // Long position
        price = entryPrice + partialDistance;
      } else {
        // Short position
        price = entryPrice - partialDistance;
      }
      
      return {
        targetPct: pct,
        price,
        moveFromEntry: partialDistance,
      };
    });
  }

  /**
   * Calculate trailing stop activation and distance
   */
  calculate_trailing_stop(
    entryPrice: number,
    direction: 'LONG' | 'SHORT',
    activationPct: number = 0.5, // Activate at 50% profit
    trailPct: number = 0.25 // Trail by 25% of profit
  ): {
    activationPrice: number;
    initialTrailDistance: number;
  } {
    // Activation price is where trailing stop kicks in
    const activationPrice = direction === 'LONG'
      ? entryPrice * (1 + activationPct)
      : entryPrice * (1 - activationPct);
    
    // Initial trail distance when activated
    const initialTrailDistance = activationPrice * trailPct;
    
    return {
      activationPrice,
      initialTrailDistance,
    };
  }
}

// ==================== Helper Functions ====================

/**
 * Calculate the distance to break-even as percentage
 */
export function break_even_distance_pct(
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  takerFee: number = 0.00055
): number {
  const totalFeePct = takerFee * 2 * 100; // Entry + exit as percentage
  return totalFeePct;
}

/**
 * Calculate required win rate for given R:R and fee structure
 */
export function required_win_rate_with_fees(
  rewardToRisk: number,
  takerFee: number = 0.00055
): number {
  // Adjust R:R for fees
  const totalFeePct = takerFee * 2;
  const adjustedRr = rewardToRisk * (1 - totalFeePct);
  
  // Break-even win rate
  return 1 / (1 + adjustedRr);
}

/**
 * Calculate maximum drawdown for a series of trades
 */
export function calculate_max_drawdown(tradeResults: number[]): number {
  if (tradeResults.length === 0) return 0;
  
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  
  for (const result of tradeResults) {
    cumulative += result;
    peak = Math.max(peak, cumulative);
    const drawdown = peak - cumulative;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return maxDrawdown;
}

/**
 * Calculate risk of ruin probability
 * Using a simplified formula for small capital accounts
 */
export function risk_of_ruin(
  winProbability: number,
  riskPerTrade: number,
  accountSize: number
): number {
  if (winProbability >= 0.5) {
    // Low risk of ruin for winning strategies
    return Math.pow(1 - winProbability, accountSize / riskPerTrade);
  } else {
    // Higher risk for losing strategies
    return 1 - Math.pow(winProbability, accountSize / riskPerTrade);
  }
}

/**
 * Calculate Sharpe Ratio for a strategy
 */
export function calculate_sharpe_ratio(
  returns: number[],
  riskFreeRate: number = 0
): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  
  // Calculate standard deviation
  const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  return (avgReturn - riskFreeRate) / stdDev;
}
