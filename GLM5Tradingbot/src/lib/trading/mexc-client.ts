/**
 * MEXC Exchange API Client
 * Implements MEXC V3 API with HMAC-SHA256 signature authentication
 * Base URL: https://api.mexc.com
 */

import crypto from 'crypto';

// Type definitions
export interface MexcConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  recvWindow?: number;
}

export interface MexcOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';
  quantity: number;
  price?: number;
  quoteOrderQty?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX';
  newClientOrderId?: string;
  stopPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
}

export interface MexcOrderResponse {
  orderId: string;
  symbol: string;
  status: string;
  clientOrderId: string;
  transactTime: number;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  type: string;
  side: string;
}

export interface MexcKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
}

export interface MexcBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface MexcPosition {
  symbol: string;
  positionId: number;
  positionAmt: string;
  unrealizedProfit: string;
  marginAsset: string;
  positionSide: string;
  entryPrice: string;
  leverage: string;
  isolatedMargin: string;
  positionInitialMargin: string;
  positionMaintMargin: string;
  updateTime: number;
}

export interface MexcOrderbookEntry {
  price: string;
  quantity: string;
}

export interface MexcOrderbook {
  lastUpdateId: number;
  bids: MexcOrderbookEntry[];
  asks: MexcOrderbookEntry[];
}

export interface MexcApiResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

export interface InstrumentInfo {
  symbol: string;
  tickSize: number;
  qtyStep: number;
  minQty: number;
  maxQty: number;
  minNotional: number;
}

/**
 * MEXC Exchange Client
 * Provides methods for interacting with MEXC API
 */
export class MexcClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private recvWindow: number;
  private instrumentCache: Map<string, InstrumentInfo> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();

  constructor(config: MexcConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || 'https://api.mexc.com';
    this.recvWindow = config.recvWindow || 5000;
  }

  /**
   * Generate HMAC-SHA256 signature for MEXC API
   */
  private generateSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Generate timestamp for API requests
   */
  private getTimestamp(): number {
    return Date.now();
  }

  /**
   * Build query string from parameters
   */
  private buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
    const filteredParams = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    return filteredParams.join('&');
  }

  /**
   * Make HTTP request to MEXC API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    isSigned: boolean = false
  ): Promise<T> {
    const timestamp = this.getTimestamp();
    
    if (isSigned) {
      params.timestamp = timestamp;
      params.recvWindow = this.recvWindow;
    }

    const queryString = this.buildQueryString(params);
    const signature = this.generateSignature(queryString);
    
    const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isSigned) {
      headers['X-MEXC-APIKEY'] = this.apiKey;
    }

    const response = await fetch(url, {
      method,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MEXC API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Handle MEXC API response format
    if (data.code && data.code !== 200 && data.code !== 0) {
      throw new Error(`MEXC API Error: ${data.msg || 'Unknown error'} (Code: ${data.code})`);
    }

    return data;
  }

  /**
   * Get server time
   */
  async getServerTime(): Promise<number> {
    const response = await this.request<{ serverTime: number }>('GET', '/api/v3/time');
    return response.serverTime;
  }

  /**
   * Get exchange info including instrument specifications
   */
  async getExchangeInfo(symbols?: string[]): Promise<{
    timezone: string;
    serverTime: number;
    symbols: Array<{
      symbol: string;
      status: string;
      baseAsset: string;
      quoteAsset: string;
      baseAssetPrecision: number;
      quotePrecision: number;
      orderTypes: string[];
      filters: Array<{ filterType: string; [key: string]: string | number }>;
    }>;
  }> {
    const params: Record<string, string> = {};
    if (symbols && symbols.length > 0) {
      params.symbols = JSON.stringify(symbols);
    }
    
    const response = await this.request<{
      timezone: string;
      serverTime: number;
      symbols: Array<{
        symbol: string;
        status: string;
        baseAsset: string;
        quoteAsset: string;
        baseAssetPrecision: number;
        quotePrecision: number;
        orderTypes: string[];
        filters: Array<{ filterType: string; [key: string]: string | number }>;
      }>;
    }>('GET', '/api/v3/exchangeInfo', params);

    // Cache instrument info
    for (const symbol of response.symbols) {
      const priceFilter = symbol.filters.find(f => f.filterType === 'PRICE_FILTER');
      const lotSizeFilter = symbol.filters.find(f => f.filterType === 'LOT_SIZE');
      const minNotionalFilter = symbol.filters.find(f => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');

      this.instrumentCache.set(symbol.symbol, {
        symbol: symbol.symbol,
        tickSize: priceFilter ? parseFloat(String(priceFilter.tickSize || '0.00000001')) : 0.00000001,
        qtyStep: lotSizeFilter ? parseFloat(String(lotSizeFilter.stepSize || '0.00000001')) : 0.00000001,
        minQty: lotSizeFilter ? parseFloat(String(lotSizeFilter.minQty || '0')) : 0,
        maxQty: lotSizeFilter ? parseFloat(String(lotSizeFilter.maxQty || '999999999')) : 999999999,
        minNotional: minNotionalFilter ? parseFloat(String((minNotionalFilter as Record<string, string | number>).minNotional || '0')) : 0,
      });
    }

    return response;
  }

  /**
   * Get instrument info from cache or fetch it
   */
  async getInstrumentInfo(symbol: string): Promise<InstrumentInfo | undefined> {
    if (this.instrumentCache.has(symbol)) {
      return this.instrumentCache.get(symbol);
    }

    await this.getExchangeInfo([symbol]);
    return this.instrumentCache.get(symbol);
  }

  /**
   * Round price to tick size
   */
  roundPrice(price: number, tickSize: number): number {
    const precision = Math.ceil(-Math.log10(tickSize));
    return Math.round(price / tickSize) * tickSize;
  }

  /**
   * Round quantity to qty step
   */
  roundQty(qty: number, qtyStep: number): number {
    const precision = Math.ceil(-Math.log10(qtyStep));
    return Math.round(qty / qtyStep) * qtyStep;
  }

  /**
   * Get orderbook for a symbol
   */
  async getOrderbook(symbol: string, limit: number = 100): Promise<MexcOrderbook> {
    const response = await this.request<{
      lastUpdateId: number;
      bids: string[][];
      asks: string[][];
    }>('GET', '/api/v3/depth', { symbol, limit });

    return {
      lastUpdateId: response.lastUpdateId,
      bids: response.bids.map(([price, quantity]) => ({ price, quantity })),
      asks: response.asks.map(([price, quantity]) => ({ price, quantity })),
    };
  }

  /**
   * Get klines/candlesticks for a symbol
   */
  async getKlines(
    symbol: string,
    interval: '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M',
    limit: number = 500
  ): Promise<MexcKline[]> {
    const response = await this.request<string[][]>('GET', '/api/v3/klines', {
      symbol,
      interval,
      limit,
    });

    return response.map((kline) => ({
      openTime: parseInt(kline[0]),
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
      closeTime: parseInt(kline[6]),
      quoteAssetVolume: kline[7],
      numberOfTrades: parseInt(kline[8]),
      takerBuyBaseAssetVolume: kline[9],
      takerBuyQuoteAssetVolume: kline[10],
    }));
  }

  /**
   * Place an order
   */
  async placeOrder(params: MexcOrderParams): Promise<MexcOrderResponse> {
    const orderParams: Record<string, string | number | undefined> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };

    if (params.price) orderParams.price = params.price;
    if (params.quoteOrderQty) orderParams.quoteOrderQty = params.quoteOrderQty;
    if (params.timeInForce) orderParams.timeInForce = params.timeInForce;
    if (params.newClientOrderId) orderParams.newClientOrderId = params.newClientOrderId;
    if (params.stopPrice) orderParams.stopPrice = params.stopPrice;

    // Handle TP/SL for futures
    if (params.takeProfit || params.stopLoss) {
      // For MEXC futures, TP/SL are separate orders
      // This is a simplified implementation
      if (params.takeProfit) {
        orderParams.takeProfitPrice = params.takeProfit;
      }
      if (params.stopLoss) {
        orderParams.stopLossPrice = params.stopLoss;
      }
    }

    return this.request<MexcOrderResponse>('POST', '/api/v3/order', orderParams, true);
  }

  /**
   * Place order with TP/SL
   */
  async placeOrderWithTpSl(
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'LIMIT' | 'MARKET',
    quantity: number,
    price?: number,
    takeProfit?: number,
    stopLoss?: number
  ): Promise<MexcOrderResponse> {
    // First place the main order
    const mainOrder = await this.placeOrder({
      symbol,
      side,
      type,
      quantity,
      price,
      timeInForce: type === 'LIMIT' ? 'GTC' : undefined,
    });

    // For MEXC, we need to place separate TP/SL orders
    // This would require additional API calls for OCO or conditional orders
    // Simplified implementation for now

    return mainOrder;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<MexcOrderResponse> {
    return this.request<MexcOrderResponse>('DELETE', '/api/v3/order', { symbol, orderId }, true);
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol?: string): Promise<MexcOrderResponse[]> {
    const params: Record<string, string | undefined> = {};
    if (symbol) params.symbol = symbol;
    
    return this.request<MexcOrderResponse[]>('GET', '/api/v3/openOrders', params, true);
  }

  /**
   * Get positions (for futures)
   */
  async getPositions(): Promise<MexcPosition[]> {
    // MEXC futures endpoint
    const response = await this.request<{ positions: MexcPosition[] }>(
      'GET',
      '/api/v3/positionRisk',
      {},
      true
    );
    
    return response.positions || [];
  }

  /**
   * Get account balance
   */
  async getAccountBalance(): Promise<MexcBalance[]> {
    const response = await this.request<{ balances: MexcBalance[] }>(
      'GET',
      '/api/v3/account',
      {},
      true
    );

    return response.balances || [];
  }

  /**
   * Get USDT balance specifically
   */
  async getUsdtBalance(): Promise<number> {
    const balances = await this.getAccountBalance();
    const usdtBalance = balances.find(b => b.asset === 'USDT');
    return usdtBalance ? parseFloat(usdtBalance.free) : 0;
  }

  /**
   * WebSocket connection for real-time data (stub)
   */
  connectWebSocket(channel: string, onMessage: (data: unknown) => void): WebSocket {
    const wsUrl = `wss://wbs.mexc.com/ws`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      // Subscribe to channel
      ws.send(JSON.stringify({
        method: 'SUBSCRIPTION',
        params: [channel],
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.wsConnections.set(channel, ws);
    return ws;
  }

  /**
   * Subscribe to kline updates
   */
  subscribeToKlines(
    symbol: string,
    interval: string,
    onMessage: (data: unknown) => void
  ): WebSocket {
    const channel = `${symbol.toLowerCase()}@kline_${interval}`;
    return this.connectWebSocket(channel, onMessage);
  }

  /**
   * Subscribe to orderbook updates
   */
  subscribeToOrderbook(
    symbol: string,
    onMessage: (data: unknown) => void
  ): WebSocket {
    const channel = `${symbol.toLowerCase()}@depth`;
    return this.connectWebSocket(channel, onMessage);
  }

  /**
   * Close all WebSocket connections
   */
  closeAllConnections(): void {
    for (const [channel, ws] of this.wsConnections) {
      ws.close();
      this.wsConnections.delete(channel);
    }
  }

  /**
   * Get cached instrument info
   */
  getCachedInstrumentInfo(): Map<string, InstrumentInfo> {
    return this.instrumentCache;
  }
}

export default MexcClient;
