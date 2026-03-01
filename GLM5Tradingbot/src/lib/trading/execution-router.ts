/**
 * Unified Execution Router
 * Abstracts MEXC and Bybit exchanges for consistent trade execution
 * Implements risk physics calculation and position size validation
 */

import { MexcClient, InstrumentInfo as MexcInstrumentInfo, MexcOrderResponse } from './mexc-client';
import { BybitClient, InstrumentInfo as BybitInstrumentInfo, BybitOrderResponse } from './bybit-client';

// Type definitions
export type Exchange = 'mexc' | 'bybit';
export type TradeSignal = 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
export type OrderSide = 'BUY' | 'SELL' | 'Buy' | 'Sell';
export type OrderType = 'MARKET' | 'LIMIT' | 'Market' | 'Limit';

export interface TradeParams {
  signal: TradeSignal;
  symbol: string;
  currentPrice: number;
  atr: number; // Average True Range for risk calculation
  walletBalance: number;
  leverage?: number;
  riskPercent?: number; // Risk percentage per trade (default 1%)
  rewardRiskRatio?: number; // Reward to risk ratio (default 2:1)
}

export interface RiskPhysics {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  positionValue: number;
  riskAmount: number;
  rewardAmount: number;
  riskPercent: number;
  leverage: number;
  liquidationPrice: number;
  isValid: boolean;
  validationErrors: string[];
}

export interface TradeResult {
  success: boolean;
  exchange: Exchange;
  orderId?: string;
  orderLinkId?: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  takeProfit?: number;
  stopLoss?: number;
  status: string;
  message: string;
  riskPhysics?: RiskPhysics;
  timestamp: number;
}

export interface ExecutionRouterConfig {
  defaultExchange: Exchange;
  mexcApiKey?: string;
  mexcApiSecret?: string;
  bybitApiKey?: string;
  bybitApiSecret?: string;
  defaultLeverage: number;
  defaultRiskPercent: number;
  defaultRewardRiskRatio: number;
  maxCapitalPerTrade: number; // Maximum capital per trade in USDT
  minCapitalRequired: number; // Minimum capital required (15 USDT)
  testnet?: boolean;
}

/**
 * Execution Router
 * Unified interface for trade execution across multiple exchanges
 */
export class ExecutionRouter {
  private mexcClient: MexcClient | null = null;
  private bybitClient: BybitClient | null = null;
  private config: ExecutionRouterConfig;
  private instrumentCache: Map<string, { tickSize: number; qtyStep: number; minNotional: number }> = new Map();

  constructor(config: ExecutionRouterConfig) {
    // Apply defaults and merge with provided config
    this.config = {
      defaultExchange: config.defaultExchange,
      defaultLeverage: config.defaultLeverage ?? 10,
      defaultRiskPercent: config.defaultRiskPercent ?? 1,
      defaultRewardRiskRatio: config.defaultRewardRiskRatio ?? 2,
      maxCapitalPerTrade: config.maxCapitalPerTrade ?? 100,
      minCapitalRequired: config.minCapitalRequired ?? 15,
      mexcApiKey: config.mexcApiKey,
      mexcApiSecret: config.mexcApiSecret,
      bybitApiKey: config.bybitApiKey,
      bybitApiSecret: config.bybitApiSecret,
      testnet: config.testnet,
    };

    // Initialize exchange clients
    if (this.config.mexcApiKey && this.config.mexcApiSecret) {
      this.mexcClient = new MexcClient({
        apiKey: this.config.mexcApiKey,
        apiSecret: this.config.mexcApiSecret,
      });
    }

    if (this.config.bybitApiKey && this.config.bybitApiSecret) {
      this.bybitClient = new BybitClient({
        apiKey: this.config.bybitApiKey,
        apiSecret: this.config.bybitApiSecret,
        testnet: this.config.testnet,
      });
    }
  }

  /**
   * Get the appropriate client for an exchange
   */
  private getClient(exchange: Exchange): MexcClient | BybitClient {
    if (exchange === 'mexc') {
      if (!this.mexcClient) {
        throw new Error('MEXC client not configured. Please provide API credentials.');
      }
      return this.mexcClient;
    } else {
      if (!this.bybitClient) {
        throw new Error('Bybit client not configured. Please provide API credentials.');
      }
      return this.bybitClient;
    }
  }

  /**
   * Get instrument info from cache or fetch it
   */
  private async getInstrumentInfo(
    exchange: Exchange,
    symbol: string
  ): Promise<{ tickSize: number; qtyStep: number; minNotional: number }> {
    const cacheKey = `${exchange}:${symbol}`;
    
    if (this.instrumentCache.has(cacheKey)) {
      return this.instrumentCache.get(cacheKey)!;
    }

    let instrumentInfo: { tickSize: number; qtyStep: number; minNotional: number } | undefined;

    if (exchange === 'mexc' && this.mexcClient) {
      const info = await this.mexcClient.getInstrumentInfo(symbol);
      if (info) {
        instrumentInfo = {
          tickSize: info.tickSize,
          qtyStep: info.qtyStep,
          minNotional: info.minNotional,
        };
      }
    } else if (exchange === 'bybit' && this.bybitClient) {
      const info = await this.bybitClient.getInstrumentInfo(symbol);
      if (info) {
        instrumentInfo = {
          tickSize: info.tickSize,
          qtyStep: info.qtyStep,
          minNotional: info.minNotional,
        };
      }
    }

    if (instrumentInfo) {
      this.instrumentCache.set(cacheKey, instrumentInfo);
      return instrumentInfo;
    }

    // Default fallback values
    return {
      tickSize: 0.01,
      qtyStep: 0.001,
      minNotional: 5,
    };
  }

  /**
   * Calculate risk physics for a trade
   * Implements position sizing based on ATR and risk percentage
   */
  calculateRiskPhysics(
    signal: TradeSignal,
    currentPrice: number,
    atr: number,
    walletBalance: number,
    leverage: number = this.config.defaultLeverage,
    riskPercent: number = this.config.defaultRiskPercent,
    rewardRiskRatio: number = this.config.defaultRewardRiskRatio
  ): RiskPhysics {
    const validationErrors: string[] = [];

    // Calculate risk amount in USDT
    const riskAmount = walletBalance * (riskPercent / 100);

    // Calculate stop loss distance based on ATR (1.5x ATR is common)
    const atrMultiplier = 1.5;
    const stopLossDistance = atr * atrMultiplier;

    // Calculate stop loss and take profit prices
    let stopLoss: number;
    let takeProfit: number;

    if (signal === 'LONG' || signal === 'CLOSE_SHORT') {
      stopLoss = currentPrice - stopLossDistance;
      takeProfit = currentPrice + (stopLossDistance * rewardRiskRatio);
    } else {
      stopLoss = currentPrice + stopLossDistance;
      takeProfit = currentPrice - (stopLossDistance * rewardRiskRatio);
    }

    // Ensure stop loss is positive
    if (stopLoss <= 0) {
      stopLoss = currentPrice * 0.95; // 5% stop loss as fallback
      validationErrors.push('Stop loss calculated as negative, using 5% fallback');
    }

    // Calculate position size based on risk
    // Risk = Position Size * Stop Loss Distance
    // Position Size = Risk / Stop Loss Distance
    const stopLossPercent = Math.abs(currentPrice - stopLoss) / currentPrice;
    let positionSize = riskAmount / stopLossDistance;

    // Apply leverage
    const positionValue = positionSize * currentPrice;
    const marginRequired = positionValue / leverage;

    // Validate against minimum capital requirement (15 USDT)
    if (marginRequired < this.config.minCapitalRequired) {
      validationErrors.push(`Margin required (${marginRequired.toFixed(2)} USDT) is below minimum (${this.config.minCapitalRequired} USDT)`);
    }

    // Validate against maximum capital per trade
    if (positionValue > this.config.maxCapitalPerTrade) {
      // Scale down position size to match max capital
      positionSize = this.config.maxCapitalPerTrade / currentPrice;
      validationErrors.push(`Position size scaled down to ${this.config.maxCapitalPerTrade} USDT max`);
    }

    // Calculate liquidation price (simplified calculation)
    let liquidationPrice: number;
    if (signal === 'LONG') {
      // For long: liquidation when position value drops to margin
      liquidationPrice = currentPrice * (1 - 0.9 / leverage); // 90% maintenance margin
    } else {
      // For short: liquidation when price rises
      liquidationPrice = currentPrice * (1 + 0.9 / leverage);
    }

    // Calculate potential reward
    const rewardAmount = riskAmount * rewardRiskRatio;

    // Determine if trade is valid
    const isValid = validationErrors.length === 0 && 
                    marginRequired >= this.config.minCapitalRequired &&
                    positionSize > 0;

    return {
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      positionSize,
      positionValue: positionSize * currentPrice,
      riskAmount,
      rewardAmount,
      riskPercent,
      leverage,
      liquidationPrice,
      isValid,
      validationErrors,
    };
  }

  /**
   * Round price to tick size
   */
  private roundPrice(price: number, tickSize: number): number {
    const precision = Math.ceil(-Math.log10(tickSize));
    const multiplier = Math.pow(10, precision);
    return Math.round(price * multiplier) / multiplier;
  }

  /**
   * Round quantity to qty step
   */
  private roundQty(qty: number, qtyStep: number): number {
    const precision = Math.ceil(-Math.log10(qtyStep));
    const multiplier = Math.pow(10, precision);
    return Math.floor(qty * multiplier) / multiplier;
  }

  /**
   * Execute a trade
   */
  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const exchange = this.config.defaultExchange;
    const timestamp = Date.now();

    try {
      // Calculate risk physics
      const riskPhysics = this.calculateRiskPhysics(
        params.signal,
        params.currentPrice,
        params.atr,
        params.walletBalance,
        params.leverage,
        params.riskPercent,
        params.rewardRiskRatio
      );

      // Validate risk physics
      if (!riskPhysics.isValid) {
        return {
          success: false,
          exchange,
          symbol: params.symbol,
          side: params.signal === 'LONG' || params.signal === 'CLOSE_SHORT' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: riskPhysics.positionSize,
          status: 'REJECTED',
          message: `Risk validation failed: ${riskPhysics.validationErrors.join(', ')}`,
          riskPhysics,
          timestamp,
        };
      }

      // Get instrument info for rounding
      const instrumentInfo = await this.getInstrumentInfo(exchange, params.symbol);

      // Round values to exchange requirements
      const roundedQty = this.roundQty(riskPhysics.positionSize, instrumentInfo.qtyStep);
      const roundedPrice = this.roundPrice(params.currentPrice, instrumentInfo.tickSize);
      const roundedTP = this.roundPrice(riskPhysics.takeProfit, instrumentInfo.tickSize);
      const roundedSL = this.roundPrice(riskPhysics.stopLoss, instrumentInfo.tickSize);

      // Validate minimum notional
      const notionalValue = roundedQty * roundedPrice;
      if (notionalValue < instrumentInfo.minNotional) {
        return {
          success: false,
          exchange,
          symbol: params.symbol,
          side: params.signal === 'LONG' || params.signal === 'CLOSE_SHORT' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: roundedQty,
          status: 'REJECTED',
          message: `Notional value (${notionalValue.toFixed(2)} USDT) below minimum (${instrumentInfo.minNotional} USDT)`,
          riskPhysics,
          timestamp,
        };
      }

      // Validate against 15 USDT capital constraint
      if (notionalValue < this.config.minCapitalRequired) {
        return {
          success: false,
          exchange,
          symbol: params.symbol,
          side: params.signal === 'LONG' || params.signal === 'CLOSE_SHORT' ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: roundedQty,
          status: 'REJECTED',
          message: `Trade value (${notionalValue.toFixed(2)} USDT) below minimum capital requirement (${this.config.minCapitalRequired} USDT)`,
          riskPhysics,
          timestamp,
        };
      }

      // Execute on appropriate exchange
      if (exchange === 'mexc') {
        return this.executeMexcTrade(params, roundedQty, roundedPrice, roundedTP, roundedSL, riskPhysics);
      } else {
        return this.executeBybitTrade(params, roundedQty, roundedPrice, roundedTP, roundedSL, riskPhysics);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        exchange,
        symbol: params.symbol,
        side: params.signal === 'LONG' || params.signal === 'CLOSE_SHORT' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: 0,
        status: 'ERROR',
        message: `Trade execution error: ${errorMessage}`,
        timestamp,
      };
    }
  }

  /**
   * Execute trade on MEXC
   */
  private async executeMexcTrade(
    params: TradeParams,
    qty: number,
    price: number,
    takeProfit: number,
    stopLoss: number,
    riskPhysics: RiskPhysics
  ): Promise<TradeResult> {
    if (!this.mexcClient) {
      throw new Error('MEXC client not configured');
    }

    const side = params.signal === 'LONG' || params.signal === 'CLOSE_SHORT' ? 'BUY' : 'SELL';
    const timestamp = Date.now();

    try {
      const order = await this.mexcClient.placeOrder({
        symbol: params.symbol,
        side,
        type: 'MARKET',
        quantity: qty,
        takeProfit,
        stopLoss,
      });

      return {
        success: true,
        exchange: 'mexc',
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: parseFloat(order.origQty || String(qty)),
        price: order.price ? parseFloat(order.price) : price,
        takeProfit,
        stopLoss,
        status: order.status,
        message: 'Order placed successfully on MEXC',
        riskPhysics,
        timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        exchange: 'mexc',
        symbol: params.symbol,
        side,
        type: 'MARKET',
        quantity: qty,
        status: 'ERROR',
        message: `MEXC order error: ${errorMessage}`,
        riskPhysics,
        timestamp,
      };
    }
  }

  /**
   * Execute trade on Bybit
   */
  private async executeBybitTrade(
    params: TradeParams,
    qty: number,
    price: number,
    takeProfit: number,
    stopLoss: number,
    riskPhysics: RiskPhysics
  ): Promise<TradeResult> {
    if (!this.bybitClient) {
      throw new Error('Bybit client not configured');
    }

    const side = params.signal === 'LONG' || params.signal === 'CLOSE_SHORT' ? 'Buy' : 'Sell';
    const timestamp = Date.now();

    try {
      // Set leverage first
      await this.bybitClient.setLeverage('linear', params.symbol, riskPhysics.leverage, riskPhysics.leverage);

      const order = await this.bybitClient.placeOrder({
        category: 'linear',
        symbol: params.symbol,
        side: side as 'Buy' | 'Sell',
        orderType: 'Market',
        qty,
        takeProfit,
        stopLoss,
        tpTriggerBy: 'MarkPrice',
        slTriggerBy: 'MarkPrice',
      });

      return {
        success: true,
        exchange: 'bybit',
        orderId: order.orderId,
        orderLinkId: order.orderLinkId,
        symbol: order.symbol,
        side: order.side,
        type: order.orderType,
        quantity: parseFloat(order.qty || String(qty)),
        price: order.price ? parseFloat(order.price) : price,
        takeProfit: order.takeProfit ? parseFloat(order.takeProfit) : takeProfit,
        stopLoss: order.stopLoss ? parseFloat(order.stopLoss) : stopLoss,
        status: order.orderStatus,
        message: 'Order placed successfully on Bybit',
        riskPhysics,
        timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        exchange: 'bybit',
        symbol: params.symbol,
        side,
        type: 'Market',
        quantity: qty,
        status: 'ERROR',
        message: `Bybit order error: ${errorMessage}`,
        riskPhysics,
        timestamp,
      };
    }
  }

  /**
   * Close a position
   */
  async closePosition(
    symbol: string,
    exchange: Exchange = this.config.defaultExchange,
    qty?: number
  ): Promise<TradeResult> {
    const timestamp = Date.now();

    try {
      if (exchange === 'mexc' && this.mexcClient) {
        // Get current position
        const positions = await this.mexcClient.getPositions();
        const position = positions.find(p => p.symbol === symbol);

        if (!position) {
          return {
            success: false,
            exchange: 'mexc',
            symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: 0,
            status: 'REJECTED',
            message: 'No position found for symbol',
            timestamp,
          };
        }

        const closeQty = qty || Math.abs(parseFloat(position.positionAmt));
        const side = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY';

        const order = await this.mexcClient.placeOrder({
          symbol,
          side,
          type: 'MARKET',
          quantity: closeQty,
        });

        return {
          success: true,
          exchange: 'mexc',
          orderId: order.orderId,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          quantity: closeQty,
          status: order.status,
          message: 'Position closed successfully',
          timestamp,
        };
      } else if (exchange === 'bybit' && this.bybitClient) {
        // Get current position
        const positions = await this.bybitClient.getPositions('linear', symbol);
        const position = positions.find(p => p.symbol === symbol);

        if (!position || parseFloat(position.size) === 0) {
          return {
            success: false,
            exchange: 'bybit',
            symbol,
            side: 'Sell',
            type: 'Market',
            quantity: 0,
            status: 'REJECTED',
            message: 'No position found for symbol',
            timestamp,
          };
        }

        const closeQty = qty || Math.abs(parseFloat(position.size));
        const side = position.side === 'Buy' ? 'Sell' : 'Buy';

        const order = await this.bybitClient.placeOrder({
          category: 'linear',
          symbol,
          side,
          orderType: 'Market',
          qty: closeQty,
          reduceOnly: true,
        });

        return {
          success: true,
          exchange: 'bybit',
          orderId: order.orderId,
          orderLinkId: order.orderLinkId,
          symbol: order.symbol,
          side: order.side,
          type: order.orderType,
          quantity: closeQty,
          status: order.orderStatus,
          message: 'Position closed successfully',
          timestamp,
        };
      }

      throw new Error('Exchange client not configured');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        exchange,
        symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: 0,
        status: 'ERROR',
        message: `Position close error: ${errorMessage}`,
        timestamp,
      };
    }
  }

  /**
   * Get account balance
   */
  async getBalance(exchange: Exchange = this.config.defaultExchange): Promise<number> {
    if (exchange === 'mexc' && this.mexcClient) {
      return this.mexcClient.getUsdtBalance();
    } else if (exchange === 'bybit' && this.bybitClient) {
      return this.bybitClient.getUsdtBalance();
    }
    return 0;
  }

  /**
   * Get open positions
   */
  async getPositions(exchange: Exchange = this.config.defaultExchange): Promise<
    Array<{
      symbol: string;
      side: string;
      size: number;
      entryPrice: number;
      unrealizedPnl: number;
    }>
  > {
    const positions: Array<{
      symbol: string;
      side: string;
      size: number;
      entryPrice: number;
      unrealizedPnl: number;
    }> = [];

    try {
      if (exchange === 'mexc' && this.mexcClient) {
        const mexcPositions = await this.mexcClient.getPositions();
        for (const pos of mexcPositions) {
          if (parseFloat(pos.positionAmt) !== 0) {
            positions.push({
              symbol: pos.symbol,
              side: pos.positionSide,
              size: Math.abs(parseFloat(pos.positionAmt)),
              entryPrice: parseFloat(pos.entryPrice),
              unrealizedPnl: parseFloat(pos.unrealizedProfit),
            });
          }
        }
      } else if (exchange === 'bybit' && this.bybitClient) {
        const bybitPositions = await this.bybitClient.getPositions('linear');
        for (const pos of bybitPositions) {
          if (parseFloat(pos.size) !== 0) {
            positions.push({
              symbol: pos.symbol,
              side: pos.side,
              size: parseFloat(pos.size),
              entryPrice: parseFloat(pos.avgPrice),
              unrealizedPnl: parseFloat(pos.unrealisedPnl),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    }

    return positions;
  }

  /**
   * Initialize instrument cache for multiple symbols
   */
  async initializeCache(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      await this.getInstrumentInfo(this.config.defaultExchange, symbol);
    }
  }

  /**
   * Update TP/SL for existing position
   */
  async updateTpSl(
    symbol: string,
    takeProfit?: number,
    stopLoss?: number,
    exchange: Exchange = this.config.defaultExchange
  ): Promise<TradeResult> {
    const timestamp = Date.now();

    try {
      if (exchange === 'bybit' && this.bybitClient) {
        await this.bybitClient.setTradingStop('linear', symbol, takeProfit, stopLoss);
        
        return {
          success: true,
          exchange: 'bybit',
          symbol,
          side: '',
          type: '',
          quantity: 0,
          takeProfit,
          stopLoss,
          status: 'UPDATED',
          message: 'TP/SL updated successfully',
          timestamp,
        };
      } else if (exchange === 'mexc' && this.mexcClient) {
        // MEXC requires separate TP/SL orders
        return {
          success: false,
          exchange: 'mexc',
          symbol,
          side: '',
          type: '',
          quantity: 0,
          status: 'NOT_SUPPORTED',
          message: 'MEXC TP/SL update requires separate orders',
          timestamp,
        };
      }

      throw new Error('Exchange client not configured');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        exchange,
        symbol,
        side: '',
        type: '',
        quantity: 0,
        status: 'ERROR',
        message: `TP/SL update error: ${errorMessage}`,
        timestamp,
      };
    }
  }

  /**
   * Get cached instrument info
   */
  getCachedInstrumentInfo(): Map<string, { tickSize: number; qtyStep: number; minNotional: number }> {
    return this.instrumentCache;
  }

  /**
   * Get MEXC client (for advanced usage)
   */
  getMexcClient(): MexcClient | null {
    return this.mexcClient;
  }

  /**
   * Get Bybit client (for advanced usage)
   */
  getBybitClient(): BybitClient | null {
    return this.bybitClient;
  }
}

export default ExecutionRouter;
