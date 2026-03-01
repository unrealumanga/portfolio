/**
 * Signal Generation Module for GLM5Tradingbot
 * Sentinels for detecting trading signals using various strategies
 */

import type {
  Candle,
  MarketRegime,
  OrderBook,
  OrderBlock,
  OrderFlowImbalance,
  RegimeStats,
  SentinelsConfig,
  Signal,
  SignalDirection,
  Trade,
  VolumeProfile,
  WhaleOrder,
} from './types';
import { DEFAULT_SENTINELS_CONFIG } from './types';
import { calculate_atr, calculate_std, calculate_sma } from './utils';

// ==================== Hurst Exponent Calculation ====================

/**
 * Calculate the Hurst Exponent using Rescaled Range (R/S) Analysis
 * 
 * H < 0.5: Mean-reverting (ranging)
 * H = 0.5: Random walk
 * H > 0.5: Trending
 * 
 * This is used to determine the market regime
 */
function calculate_hurst_exponent(prices: number[]): number {
  if (prices.length < 20) {
    return 0.5; // Default to random walk if insufficient data
  }

  // Calculate log returns
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
  }

  // Rescaled Range calculation
  const n = logReturns.length;
  const mean = logReturns.reduce((sum, r) => sum + r, 0) / n;
  
  // Calculate cumulative deviation
  const deviations: number[] = [];
  let cumDev = 0;
  for (const ret of logReturns) {
    cumDev += ret - mean;
    deviations.push(cumDev);
  }

  // Range R = max(deviation) - min(deviation)
  const range = Math.max(...deviations) - Math.min(...deviations);
  
  // Standard deviation S
  const std = calculate_std(logReturns);
  
  if (std === 0) {
    return 0.5;
  }

  // R/S ratio
  const rs = range / std;
  
  // Hurst exponent approximation
  // H = log(R/S) / log(n)
  const hurst = Math.log(rs) / Math.log(n);
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, hurst));
}

// ==================== Regime Detection ====================

/**
 * Calculate market regime statistics using Hurst Exponent
 */
export function calculate_regime_stats(
  candles: Candle[],
  lookback: number = 100
): RegimeStats {
  if (candles.length < 20) {
    return {
      regime: 'RANGING',
      hurstExponent: 0.5,
      trendStrength: 0,
      volatilityState: 'NORMAL',
    };
  }

  // Get close prices for Hurst calculation
  const prices = candles.slice(-lookback).map(c => c.close);
  const hurstExponent = calculate_hurst_exponent(prices);
  
  // Determine regime based on Hurst
  let regime: MarketRegime;
  let trendStrength: number;
  
  if (hurstExponent > 0.55) {
    regime = 'TRENDING';
    trendStrength = (hurstExponent - 0.5) * 2; // 0 to 1
  } else if (hurstExponent < 0.45) {
    regime = 'RANGING';
    trendStrength = (0.5 - hurstExponent) * 2; // 0 to 1
  } else {
    regime = 'RANGING'; // Default to ranging in uncertain state
    trendStrength = 0;
  }

  // Calculate volatility state
  const atr = calculate_atr(candles.slice(-14), 14);
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  
  let volatilityState: 'LOW' | 'NORMAL' | 'HIGH';
  if (atrPct < 1) {
    volatilityState = 'LOW';
  } else if (atrPct > 3) {
    volatilityState = 'HIGH';
  } else {
    volatilityState = 'NORMAL';
  }

  return {
    regime,
    hurstExponent,
    trendStrength,
    volatilityState,
  };
}

// ==================== Volume Profile (VPOC) ====================

/**
 * Calculate Volume Profile and VPOC (Volume Point of Control)
 * 
 * VPOC = price level with the highest traded volume
 * Value Area = price range where ~70% of volume was traded
 */
export function calculate_volume_profile(
  candles: Candle[],
  buckets: number = 24
): VolumeProfile {
  if (candles.length === 0) {
    return {
      pocPrice: 0,
      pocVolume: 0,
      valueAreaHigh: 0,
      valueAreaLow: 0,
      totalVolume: 0,
    };
  }

  // Find price range
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  
  if (priceRange === 0) {
    const avgPrice = (minPrice + maxPrice) / 2;
    const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
    return {
      pocPrice: avgPrice,
      pocVolume: totalVolume,
      valueAreaHigh: avgPrice,
      valueAreaLow: avgPrice,
      totalVolume,
    };
  }

  // Create price buckets
  const bucketSize = priceRange / buckets;
  const volumeByBucket: Map<number, number> = new Map();
  
  // Initialize buckets
  for (let i = 0; i < buckets; i++) {
    volumeByBucket.set(i, 0);
  }

  // Distribute volume across buckets
  // Using tick volume approximation: volume distributed based on candle range
  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    if (candleRange === 0) {
      // Single price point - add to appropriate bucket
      const bucketIndex = Math.floor((candle.close - minPrice) / bucketSize);
      const clampedIndex = Math.max(0, Math.min(buckets - 1, bucketIndex));
      volumeByBucket.set(clampedIndex, (volumeByBucket.get(clampedIndex) ?? 0) + candle.volume);
    } else {
      // Distribute volume proportionally across the candle's range
      const lowBucket = Math.floor((candle.low - minPrice) / bucketSize);
      const highBucket = Math.floor((candle.high - minPrice) / bucketSize);
      
      for (let b = Math.max(0, lowBucket); b <= Math.min(buckets - 1, highBucket); b++) {
        volumeByBucket.set(b, (volumeByBucket.get(b) ?? 0) + candle.volume / (highBucket - lowBucket + 1));
      }
    }
  }

  // Find POC (highest volume bucket)
  let maxVolume = 0;
  let pocBucket = 0;
  
  for (const [bucket, volume] of volumeByBucket) {
    if (volume > maxVolume) {
      maxVolume = volume;
      pocBucket = bucket;
    }
  }

  const pocPrice = minPrice + (pocBucket + 0.5) * bucketSize;
  
  // Calculate total volume
  const totalVolume = Array.from(volumeByBucket.values()).reduce((sum, v) => sum + v, 0);
  
  // Calculate Value Area (70% of volume)
  const targetVolume = totalVolume * 0.7;
  let valueAreaLow = pocPrice;
  let valueAreaHigh = pocPrice;
  let accumulatedVolume = maxVolume;
  
  // Expand from POC until we capture 70% of volume
  let lowBucket = pocBucket;
  let highBucket = pocBucket;
  
  while (accumulatedVolume < targetVolume && (lowBucket > 0 || highBucket < buckets - 1)) {
    const lowVol = lowBucket > 0 ? (volumeByBucket.get(lowBucket - 1) ?? 0) : 0;
    const highVol = highBucket < buckets - 1 ? (volumeByBucket.get(highBucket + 1) ?? 0) : 0;
    
    if (lowVol >= highVol && lowBucket > 0) {
      lowBucket--;
      accumulatedVolume += lowVol;
      valueAreaLow = minPrice + (lowBucket + 0.5) * bucketSize;
    } else if (highBucket < buckets - 1) {
      highBucket++;
      accumulatedVolume += highVol;
      valueAreaHigh = minPrice + (highBucket + 0.5) * bucketSize;
    } else if (lowBucket > 0) {
      lowBucket--;
      accumulatedVolume += lowVol;
      valueAreaLow = minPrice + (lowBucket + 0.5) * bucketSize;
    }
  }

  return {
    pocPrice,
    pocVolume: maxVolume,
    valueAreaHigh,
    valueAreaLow,
    totalVolume,
  };
}

// ==================== Signal Factory ====================

/**
 * Signal Factory Class
 * Generates standardized signals based on multiple factors
 */
export class SignalFactory {
  private config: SentinelsConfig;

  constructor(config: Partial<SentinelsConfig> = {}) {
    this.config = { ...DEFAULT_SENTINELS_CONFIG, ...config };
  }

  /**
   * Generate a trading signal based on market data
   */
  generate_signal(
    symbol: string,
    candles: Candle[],
    orderBook: OrderBook,
    strategy: string,
    direction: SignalDirection
  ): Signal | null {
    if (candles.length < 20) {
      return null;
    }

    // Get regime statistics
    const regimeStats = calculate_regime_stats(candles, this.config.hurstLookback);
    
    // Calculate ATR
    const atr = calculate_atr(candles.slice(-14), 14);
    
    // Calculate volume profile
    const volumeProfile = calculate_volume_profile(candles.slice(-50), this.config.volumeProfileBuckets);
    
    // Get current price and spread
    const bestBid = orderBook.bids[0]?.price ?? candles[candles.length - 1].close;
    const bestAsk = orderBook.asks[0]?.price ?? candles[candles.length - 1].close;
    const currentPrice = (bestBid + bestAsk) / 2;
    const spreadPenalty = ((bestAsk - bestBid) / currentPrice) * 100;
    
    // Calculate win probability based on multiple factors
    const winProbability = this.calculate_win_probability(
      candles,
      direction,
      regimeStats,
      volumeProfile,
      currentPrice
    );
    
    // Calculate expected move percentage
    const expectedMovePct = this.calculate_expected_move(
      candles,
      direction,
      atr,
      currentPrice,
      regimeStats
    );
    
    // Calculate signal strength
    const signalStrength = this.calculate_signal_strength(
      winProbability,
      expectedMovePct,
      regimeStats,
      spreadPenalty
    );

    return {
      symbol,
      strategy,
      direction,
      win_probability: winProbability,
      expected_move_pct: expectedMovePct,
      regime: regimeStats.regime,
      timestamp: Date.now(),
      spread_penalty: spreadPenalty,
      current_price: currentPrice,
      atr,
      signal_strength: signalStrength,
      metadata: {
        hurstExponent: regimeStats.hurstExponent,
        trendStrength: regimeStats.trendStrength,
        volatilityState: regimeStats.volatilityState,
        vpoc: volumeProfile.pocPrice,
        valueAreaHigh: volumeProfile.valueAreaHigh,
        valueAreaLow: volumeProfile.valueAreaLow,
      },
    };
  }

  /**
   * Calculate win probability based on multiple factors
   */
  private calculate_win_probability(
    candles: Candle[],
    direction: SignalDirection,
    regimeStats: RegimeStats,
    volumeProfile: VolumeProfile,
    currentPrice: number
  ): number {
    // Base probability
    let probability = 0.5;
    
    // Trend alignment (trending markets favor trend continuation)
    if (regimeStats.regime === 'TRENDING') {
      const priceChange = candles[candles.length - 1].close - candles[0].close;
      const isTrendUp = priceChange > 0;
      
      if ((direction === 'LONG' && isTrendUp) || (direction === 'SHORT' && !isTrendUp)) {
        probability += regimeStats.trendStrength * 0.15;
      } else {
        probability -= regimeStats.trendStrength * 0.1;
      }
    }
    
    // VPOC proximity (price tends to revert to VPOC)
    const vpocDistance = Math.abs(currentPrice - volumeProfile.pocPrice) / currentPrice;
    if (vpocDistance > 0.02) {
      // Price is far from VPOC - potential mean reversion
      if ((direction === 'LONG' && currentPrice < volumeProfile.pocPrice) ||
          (direction === 'SHORT' && currentPrice > volumeProfile.pocPrice)) {
        probability += 0.05;
      }
    }
    
    // Value area position
    if (currentPrice > volumeProfile.valueAreaLow && currentPrice < volumeProfile.valueAreaHigh) {
      // Price is in value area - neutral
      probability += 0.02;
    }
    
    // RSI-like momentum check
    const recentCloses = candles.slice(-14).map(c => c.close);
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < recentCloses.length; i++) {
      const change = recentCloses[i] - recentCloses[i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }
    
    const avgGain = calculate_sma(gains, 14);
    const avgLoss = calculate_sma(losses, 14);
    const rs = avgLoss > 0 ? avgGain / avgLoss : 0;
    const rsi = 100 - (100 / (1 + rs));
    
    // RSI interpretation
    if (direction === 'LONG') {
      if (rsi < 30) probability += 0.08; // Oversold
      else if (rsi > 70) probability -= 0.08; // Overbought
    } else {
      if (rsi > 70) probability += 0.08; // Overbought
      else if (rsi < 30) probability -= 0.08; // Oversold
    }
    
    // Clamp probability between 0.3 and 0.8
    return Math.max(0.3, Math.min(0.8, probability));
  }

  /**
   * Calculate expected move percentage
   */
  private calculate_expected_move(
    candles: Candle[],
    _direction: SignalDirection,
    atr: number,
    currentPrice: number,
    regimeStats: RegimeStats
  ): number {
    // Base expected move from ATR
    const atrPct = (atr / currentPrice) * 100;
    
    // Adjust based on regime
    let multiplier = 1.0;
    if (regimeStats.regime === 'TRENDING') {
      multiplier = 1.2 + regimeStats.trendStrength * 0.3;
    } else {
      multiplier = 0.8;
    }
    
    // Calculate expected move (typically 1-2x ATR)
    return atrPct * multiplier;
  }

  /**
   * Calculate overall signal strength
   */
  private calculate_signal_strength(
    winProbability: number,
    expectedMovePct: number,
    regimeStats: RegimeStats,
    spreadPenalty: number
  ): number {
    // Weighted combination of factors
    const probScore = (winProbability - 0.5) * 2; // -1 to 1
    const moveScore = Math.min(1, expectedMovePct / 3); // Cap at 1 for moves > 3%
    const regimeScore = regimeStats.regime === 'TRENDING' ? regimeStats.trendStrength : 0.3;
    const spreadPenaltyScore = Math.max(0, 1 - spreadPenalty * 10); // Penalize high spreads
    
    // Weighted average
    const strength = (
      probScore * 0.4 +
      moveScore * 0.25 +
      regimeScore * 0.2 +
      spreadPenaltyScore * 0.15
    );
    
    return Math.max(0, Math.min(1, strength));
  }
}

// ==================== Order Block Breaker Flow ====================

/**
 * Order Block Breaker Flow Class
 * Detects Order Block Imbalance (OBI) for potential breakouts
 */
export class OrderBlockBreakerFlow {
  private lookback: number;
  private imbalanceThreshold: number;

  constructor(lookback: number = 20, imbalanceThreshold: number = 1.5) {
    this.lookback = lookback;
    this.imbalanceThreshold = imbalanceThreshold;
  }

  /**
   * Detect order blocks from recent candles
   */
  detect_order_blocks(candles: Candle[]): OrderBlock[] {
    if (candles.length < 5) {
      return [];
    }

    const orderBlocks: OrderBlock[] = [];
    
    // Look for order blocks in recent candles
    for (let i = 2; i < candles.length - 1; i++) {
      const prev = candles[i - 1];
      const current = candles[i];
      const next = candles[i + 1];
      
      // Bullish Order Block: Down candle followed by strong up move
      if (current.close < current.open && next.close > next.open) {
        const downBody = Math.abs(current.close - current.open);
        const upBody = Math.abs(next.close - next.open);
        
        if (upBody > downBody * 1.5) {
          orderBlocks.push({
            priceLow: current.low,
            priceHigh: current.high,
            volume: current.volume,
            side: 'BULLISH',
            timestamp: current.timestamp,
            broken: false,
          });
        }
      }
      
      // Bearish Order Block: Up candle followed by strong down move
      if (current.close > current.open && next.close < next.open) {
        const upBody = Math.abs(current.close - current.open);
        const downBody = Math.abs(next.close - next.open);
        
        if (downBody > upBody * 1.5) {
          orderBlocks.push({
            priceLow: current.low,
            priceHigh: current.high,
            volume: current.volume,
            side: 'BEARISH',
            timestamp: current.timestamp,
            broken: false,
          });
        }
      }
    }
    
    return orderBlocks;
  }

  /**
   * Calculate Order Flow Imbalance from trades
   */
  calculate_obi(trades: Trade[]): OrderFlowImbalance | null {
    if (trades.length === 0) {
      return null;
    }

    const recentTrades = trades.slice(-this.lookback);
    
    let bidVolume = 0;
    let askVolume = 0;
    
    for (const trade of recentTrades) {
      if (trade.side === 'BUY') {
        askVolume += trade.quantity;
      } else {
        bidVolume += trade.quantity;
      }
    }
    
    const totalVolume = bidVolume + askVolume;
    if (totalVolume === 0) {
      return null;
    }
    
    // Imbalance ratio: > 1 means buying pressure, < 1 means selling pressure
    const imbalanceRatio = askVolume / Math.max(bidVolume, 0.001);
    
    // Determine direction and strength
    let direction: SignalDirection;
    let strength: number;
    
    if (imbalanceRatio > this.imbalanceThreshold) {
      direction = 'LONG';
      strength = Math.min(1, (imbalanceRatio - 1) / 2);
    } else if (imbalanceRatio < 1 / this.imbalanceThreshold) {
      direction = 'SHORT';
      strength = Math.min(1, (1 / imbalanceRatio - 1) / 2);
    } else {
      direction = imbalanceRatio > 1 ? 'LONG' : 'SHORT';
      strength = 0.2; // Low confidence when below threshold
    }
    
    return {
      symbol: trades[0].symbol,
      timestamp: Date.now(),
      bidVolume,
      askVolume,
      imbalanceRatio,
      direction,
      strength,
    };
  }

  /**
   * Check if price has broken an order block
   */
  check_order_block_break(
    currentPrice: number,
    orderBlocks: OrderBlock[]
  ): { broken: OrderBlock; direction: SignalDirection } | null {
    for (const ob of orderBlocks) {
      if (!ob.broken) {
        // Bullish OB broken to the upside = long signal
        if (ob.side === 'BULLISH' && currentPrice > ob.priceHigh) {
          return { broken: ob, direction: 'LONG' };
        }
        // Bearish OB broken to the downside = short signal
        if (ob.side === 'BEARISH' && currentPrice < ob.priceLow) {
          return { broken: ob, direction: 'SHORT' };
        }
      }
    }
    
    return null;
  }
}

// ==================== Whale Flow Detector ====================

/**
 * Whale Flow Detector Class
 * Detects large orders (whale activity) in the market
 */
export class WhaleFlowDetector {
  private thresholdUsdt: number;
  private recentWhaleOrders: WhaleOrder[] = [];

  constructor(thresholdUsdt: number = 50000) {
    this.thresholdUsdt = thresholdUsdt;
  }

  /**
   * Detect whale orders from recent trades
   */
  detect_whale_orders(trades: Trade[]): WhaleOrder[] {
    const whaleOrders: WhaleOrder[] = [];
    
    for (const trade of trades) {
      const notionalValue = trade.price * trade.quantity;
      
      if (notionalValue >= this.thresholdUsdt) {
        whaleOrders.push({
          symbol: trade.symbol,
          price: trade.price,
          quantity: trade.quantity,
          notionalValue,
          side: trade.side,
          timestamp: trade.timestamp,
          detected: true,
        });
      }
    }
    
    // Store recent whale orders
    this.recentWhaleOrders = [
      ...this.recentWhaleOrders,
      ...whaleOrders,
    ].slice(-50); // Keep last 50
    
    return whaleOrders;
  }

  /**
   * Analyze whale flow direction
   */
  analyze_whale_flow(): {
    direction: SignalDirection;
    totalBuyNotional: number;
    totalSellNotional: number;
    whaleCount: number;
    strength: number;
  } {
    const now = Date.now();
    const recentWindow = 5 * 60 * 1000; // 5 minutes
    
    const recentWhales = this.recentWhaleOrders.filter(
      w => now - w.timestamp < recentWindow
    );
    
    let totalBuyNotional = 0;
    let totalSellNotional = 0;
    
    for (const whale of recentWhales) {
      if (whale.side === 'BUY') {
        totalBuyNotional += whale.notionalValue;
      } else {
        totalSellNotional += whale.notionalValue;
      }
    }
    
    const totalNotional = totalBuyNotional + totalSellNotional;
    const direction: SignalDirection = totalBuyNotional > totalSellNotional ? 'LONG' : 'SHORT';
    const imbalance = Math.abs(totalBuyNotional - totalSellNotional) / Math.max(totalNotional, 1);
    
    return {
      direction,
      totalBuyNotional,
      totalSellNotional,
      whaleCount: recentWhales.length,
      strength: imbalance,
    };
  }

  /**
   * Check orderbook for whale-sized orders
   */
  detect_whale_orders_in_orderbook(orderBook: OrderBook): {
    bidWhales: WhaleOrder[];
    askWhales: WhaleOrder[];
    totalBidWhaleNotional: number;
    totalAskWhaleNotional: number;
  } {
    const bidWhales: WhaleOrder[] = [];
    const askWhales: WhaleOrder[] = [];
    let totalBidWhaleNotional = 0;
    let totalAskWhaleNotional = 0;
    
    for (const bid of orderBook.bids) {
      const notional = bid.price * bid.quantity;
      if (notional >= this.thresholdUsdt) {
        bidWhales.push({
          symbol: orderBook.symbol,
          price: bid.price,
          quantity: bid.quantity,
          notionalValue: notional,
          side: 'BUY',
          timestamp: orderBook.timestamp,
          detected: true,
        });
        totalBidWhaleNotional += notional;
      }
    }
    
    for (const ask of orderBook.asks) {
      const notional = ask.price * ask.quantity;
      if (notional >= this.thresholdUsdt) {
        askWhales.push({
          symbol: orderBook.symbol,
          price: ask.price,
          quantity: ask.quantity,
          notionalValue: notional,
          side: 'SELL',
          timestamp: orderBook.timestamp,
          detected: true,
        });
        totalAskWhaleNotional += notional;
      }
    }
    
    return {
      bidWhales,
      askWhales,
      totalBidWhaleNotional,
      totalAskWhaleNotional,
    };
  }

  /**
   * Get whale activity signal
   */
  get_whale_signal(
    orderBook: OrderBook,
    trades: Trade[]
  ): Signal | null {
    // Detect whale orders in trades
    this.detect_whale_orders(trades);
    
    // Analyze recent whale flow
    const flow = this.analyze_whale_flow();
    
    // Detect whale orders in orderbook
    const orderbookWhales = this.detect_whale_orders_in_orderbook(orderBook);
    
    // Combine signals
    const totalBidPressure = flow.totalBuyNotional + orderbookWhales.totalBidWhaleNotional;
    const totalAskPressure = flow.totalSellNotional + orderbookWhales.totalAskWhaleNotional;
    const totalPressure = totalBidPressure + totalAskPressure;
    
    if (totalPressure < this.thresholdUsdt) {
      return null; // Not enough whale activity
    }
    
    const direction: SignalDirection = totalBidPressure > totalAskPressure ? 'LONG' : 'SHORT';
    const imbalance = Math.abs(totalBidPressure - totalAskPressure) / totalPressure;
    
    if (imbalance < 0.2) {
      return null; // No clear direction
    }
    
    const currentPrice = ((orderBook.bids[0]?.price ?? 0) + (orderBook.asks[0]?.price ?? 0)) / 2;
    
    return {
      symbol: orderBook.symbol,
      strategy: 'WHALE_FLOW',
      direction,
      win_probability: 0.5 + imbalance * 0.25,
      expected_move_pct: imbalance * 3,
      regime: 'TRENDING',
      timestamp: Date.now(),
      spread_penalty: 0,
      current_price: currentPrice || 0,
      atr: 0,
      signal_strength: imbalance,
      metadata: {
        flowAnalysis: flow,
        orderbookWhales: {
          bidCount: orderbookWhales.bidWhales.length,
          askCount: orderbookWhales.askWhales.length,
        },
      },
    };
  }
}
