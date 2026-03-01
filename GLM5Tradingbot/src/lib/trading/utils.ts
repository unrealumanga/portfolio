/**
 * Trading Utilities for GLM5Tradingbot
 * Pure TypeScript implementations of common trading calculations
 */

import type { Candle } from './types';

// ==================== ATR Calculation ====================

/**
 * Calculate the Average True Range (ATR) for a given period
 * ATR = SMA of True Range over the specified period
 * 
 * True Range = max(high - low, abs(high - prev_close), abs(low - prev_close))
 * 
 * @param candles - Array of OHLCV candles (oldest first)
 * @param period - Number of periods for ATR calculation (default 14)
 * @returns ATR value, or 0 if insufficient data
 */
export function calculate_atr(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) {
    return 0;
  }

  // Calculate True Range for each candle
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    
    const highLow = current.high - current.low;
    const highPrevClose = Math.abs(current.high - previous.close);
    const lowPrevClose = Math.abs(current.low - previous.close);
    
    const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);
    trueRanges.push(trueRange);
  }

  // Calculate ATR using Wilder's Smoothing (similar to EMA)
  // First ATR = SMA of first 'period' true ranges
  if (trueRanges.length < period) {
    return 0;
  }

  // Calculate initial SMA
  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  
  // Apply Wilder's smoothing for remaining values
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Calculate ATR as a percentage of current price
 * Useful for normalizing volatility across different assets
 */
export function calculate_atr_pct(candles: Candle[], period: number = 14): number {
  const atr = calculate_atr(candles, period);
  if (atr === 0 || candles.length === 0) {
    return 0;
  }
  
  const currentPrice = candles[candles.length - 1].close;
  return (atr / currentPrice) * 100;
}

// ==================== Price Rounding ====================

/**
 * Round a price to the nearest valid tick size
 * 
 * @param price - The price to round
 * @param tickSize - The minimum price increment (e.g., 0.01 for BTCUSDT)
 * @param roundingMode - 'up', 'down', or 'nearest'
 * @returns Rounded price
 */
export function round_to_tick_size(
  price: number,
  tickSize: number,
  roundingMode: 'up' | 'down' | 'nearest' = 'nearest'
): number {
  if (tickSize <= 0) {
    throw new Error('Tick size must be positive');
  }
  
  const precision = Math.ceil(-Math.log10(tickSize));
  const multiplier = 1 / tickSize;
  
  let rounded: number;
  
  switch (roundingMode) {
    case 'up':
      rounded = Math.ceil(price * multiplier) / multiplier;
      break;
    case 'down':
      rounded = Math.floor(price * multiplier) / multiplier;
      break;
    case 'nearest':
    default:
      rounded = Math.round(price * multiplier) / multiplier;
      break;
  }
  
  // Handle floating point precision issues
  return Number(rounded.toFixed(precision));
}

/**
 * Round a quantity to the nearest valid step size
 * 
 * @param quantity - The quantity to round
 * @param qtyStep - The minimum quantity increment (e.g., 0.001)
 * @param roundingMode - 'up', 'down', or 'nearest'
 * @returns Rounded quantity
 */
export function round_to_qty_step(
  quantity: number,
  qtyStep: number,
  roundingMode: 'up' | 'down' | 'nearest' = 'down' // Default down for conservative sizing
): number {
  if (qtyStep <= 0) {
    throw new Error('Quantity step must be positive');
  }
  
  const precision = Math.max(0, Math.ceil(-Math.log10(qtyStep)));
  const multiplier = 1 / qtyStep;
  
  let rounded: number;
  
  switch (roundingMode) {
    case 'up':
      rounded = Math.ceil(quantity * multiplier) / multiplier;
      break;
    case 'down':
      rounded = Math.floor(quantity * multiplier) / multiplier;
      break;
    case 'nearest':
    default:
      rounded = Math.round(quantity * multiplier) / multiplier;
      break;
  }
  
  // Handle floating point precision issues
  return Number(rounded.toFixed(precision));
}

// ==================== Price Formatting ====================

/**
 * Format a price for display with appropriate precision
 * 
 * @param price - The price to format
 * @param tickSize - The tick size to determine precision
 * @returns Formatted price string
 */
export function format_price(price: number, tickSize: number): string {
  if (tickSize <= 0) {
    return price.toFixed(8);
  }
  
  const precision = Math.max(0, Math.ceil(-Math.log10(tickSize)));
  return price.toFixed(precision);
}

/**
 * Format a quantity for display with appropriate precision
 * 
 * @param quantity - The quantity to format
 * @param qtyStep - The step size to determine precision
 * @returns Formatted quantity string
 */
export function format_quantity(quantity: number, qtyStep: number): string {
  if (qtyStep <= 0) {
    return quantity.toFixed(8);
  }
  
  const precision = Math.max(0, Math.ceil(-Math.log10(qtyStep)));
  return quantity.toFixed(precision);
}

// ==================== Statistical Utilities ====================

/**
 * Calculate Simple Moving Average
 */
export function calculate_sma(values: number[], period: number): number {
  if (values.length < period) {
    return 0;
  }
  
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/**
 * Calculate Exponential Moving Average
 */
export function calculate_ema(values: number[], period: number): number {
  if (values.length === 0) {
    return 0;
  }
  
  const multiplier = 2 / (period + 1);
  let ema = values[0];
  
  for (let i = 1; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Calculate Standard Deviation
 */
export function calculate_std(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  
  return Math.sqrt(variance);
}

/**
 * Calculate the spread from orderbook
 * Spread = (Best Ask - Best Bid) / Mid Price
 */
export function calculate_spread_pct(bestBid: number, bestAsk: number): number {
  if (bestBid <= 0 || bestAsk <= 0) {
    return 0;
  }
  
  const midPrice = (bestBid + bestAsk) / 2;
  return ((bestAsk - bestBid) / midPrice) * 100;
}

/**
 * Calculate the mid price from orderbook
 */
export function calculate_mid_price(bestBid: number, bestAsk: number): number {
  return (bestBid + bestAsk) / 2;
}

// ==================== Time Utilities ====================

/**
 * Convert milliseconds to human-readable timeframe
 */
export function ms_to_timeframe(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}D`;
  if (hours > 0) return `${hours}H`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Get current timestamp in milliseconds
 */
export function get_timestamp_ms(): number {
  return Date.now();
}

/**
 * Get current timestamp in seconds
 */
export function get_timestamp_s(): number {
  return Math.floor(Date.now() / 1000);
}

// ==================== Percentage Calculations ====================

/**
 * Calculate percentage change between two values
 */
export function pct_change(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return 0;
  }
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Apply a percentage change to a value
 */
export function apply_pct_change(value: number, pct: number): number {
  return value * (1 + pct / 100);
}

// ==================== Validation Utilities ====================

/**
 * Check if a price is within a valid range
 */
export function is_valid_price(price: number, minPrice: number, maxPrice: number): boolean {
  return price > minPrice && price < maxPrice && Number.isFinite(price);
}

/**
 * Check if a quantity is valid (positive and within limits)
 */
export function is_valid_quantity(quantity: number, minQty: number, maxQty: number): boolean {
  return quantity >= minQty && quantity <= maxQty && Number.isFinite(quantity);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
