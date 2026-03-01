/**
 * Bybit V5 API Client
 * Implements Bybit V5 API with signature authentication
 * Base URL: https://api.bybit.com
 * API Docs: https://bybit-exchange.github.io/docs/v5/intro
 */

import crypto from 'crypto';

// Type definitions
export interface BybitConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  recvWindow?: number;
  testnet?: boolean;
}

export interface BybitOrderParams {
  category: 'spot' | 'linear' | 'inverse' | 'option';
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: 'Market' | 'Limit';
  qty: number;
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'PostOnly';
  orderLinkId?: string;
  takeProfit?: number;
  stopLoss?: number;
  tpTriggerBy?: 'LastPrice' | 'MarkPrice' | 'IndexPrice';
  slTriggerBy?: 'LastPrice' | 'MarkPrice' | 'IndexPrice';
  positionIdx?: number;
  reduceOnly?: boolean;
  closeOnTrigger?: boolean;
}

export interface BybitOrderResponse {
  orderId: string;
  orderLinkId: string;
  category: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  orderStatus: string;
  createdTime: string;
  updatedTime: string;
  takeProfit: string;
  stopLoss: string;
}

export interface BybitKline {
  startTime: number;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  turnover: string;
}

export interface BybitPosition {
  symbol: string;
  positionIdx: number;
  side: string;
  size: string;
  avgPrice: string;
  positionValue: string;
  unrealisedPnl: string;
  cumRealisedPnl: string;
  createdTime: string;
  updatedTime: string;
  tpTriggerBy: string;
  slTriggerBy: string;
  takeProfit: string;
  stopLoss: string;
  leverage: string;
  markPrice: string;
  liqPrice: string;
  bustPrice: string;
  positionMM: string;
  positionIM: string;
  positionStatus: string;
  traderStopLoss: string;
  tpslMode: string;
  riskId: number;
  riskLimitValue: string;
  stopOrderStatus: string;
  adlRankIndicator: number;
  autoAddMargin: number;
  positionBalance: string;
  lockReason: number;
}

export interface BybitBalance {
  accountType: string;
  accountIMRate: string;
  accountMMRate: string;
  totalEquity: string;
  totalWalletBalance: string;
  totalAvailableBalance: string;
  totalPerpUPL: string;
  totalInitialMargin: string;
  totalMaintenanceMargin: string;
  coin: Array<{
    coin: string;
    equity: string;
    usdValue: string;
    walletBalance: string;
    free: string;
    locked: string;
    spotHedgingQty: string;
    borrowAmount: string;
    accumRealisedPnl: string;
    unrealisedPnl: string;
    cumRealisedPnl: string;
    bonus: string;
    collateralSwitch: boolean;
    marginCollateral: boolean;
  }>;
}

export interface BybitOrderbookEntry {
  price: string;
  size: string;
}

export interface BybitOrderbook {
  s: string;
  b: BybitOrderbookEntry[];
  a: BybitOrderbookEntry[];
  ts: number;
  u: number;
}

export interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

export interface InstrumentInfo {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  tickSize: number;
  qtyStep: number;
  minOrderQty: number;
  maxOrderQty: number;
  minNotional: number;
  lotSizeFilter: {
    basePrecision: string;
    quotePrecision: string;
    minOrderQty: string;
    maxOrderQty: string;
    minOrderAmt: string;
    maxOrderAmt: string;
  };
  priceFilter: {
    tickSize: string;
  };
}

/**
 * Bybit V5 API Client
 * Provides methods for interacting with Bybit V5 API
 */
export class BybitClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private recvWindow: number;
  private instrumentCache: Map<string, InstrumentInfo> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();

  constructor(config: BybitConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.testnet 
      ? 'https://api-testnet.bybit.com' 
      : (config.baseUrl || 'https://api.bybit.com');
    this.recvWindow = config.recvWindow || 5000;
  }

  /**
   * Generate signature for Bybit V5 API
   * Signature = HMAC-SHA256(timestamp + apiKey + recvWindow + queryString)
   */
  private generateSignature(timestamp: number, queryString: string): string {
    const signString = `${timestamp}${this.apiKey}${this.recvWindow}${queryString}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('hex');
  }

  /**
   * Generate timestamp in milliseconds
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
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return filteredParams.join('&');
  }

  /**
   * Make HTTP request to Bybit V5 API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    isSigned: boolean = false
  ): Promise<T> {
    const timestamp = this.getTimestamp();
    const queryString = method === 'GET' ? this.buildQueryString(params) : '';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isSigned) {
      const signature = this.generateSignature(timestamp, queryString);
      headers['X-BAPI-API-KEY'] = this.apiKey;
      headers['X-BAPI-TIMESTAMP'] = timestamp.toString();
      headers['X-BAPI-RECV-WINDOW'] = this.recvWindow.toString();
      headers['X-BAPI-SIGN'] = signature;
    }

    let url = `${this.baseUrl}${endpoint}`;
    let body: string | undefined;

    if (method === 'GET') {
      url += `?${queryString}`;
    } else {
      body = JSON.stringify(params);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bybit API Error: ${response.status} - ${errorText}`);
    }

    const data: BybitApiResponse<T> = await response.json();

    // Handle Bybit API response format
    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return data.result;
  }

  /**
   * Get server time
   */
  async getServerTime(): Promise<{ timeSecond: string; timeNano: string }> {
    return this.request<{ timeSecond: string; timeNano: string }>('GET', '/v5/market/time');
  }

  /**
   * Get instruments info and cache tickSize, qtyStep
   */
  async getInstrumentsInfo(
    category: 'spot' | 'linear' | 'inverse' | 'option' = 'linear',
    symbol?: string
  ): Promise<InstrumentInfo[]> {
    const params: Record<string, string | undefined> = { category };
    if (symbol) params.symbol = symbol;

    const response = await this.request<{
      category: string;
      list: Array<{
        symbol: string;
        baseCoin: string;
        quoteCoin: string;
        lotSizeFilter: {
          basePrecision: string;
          quotePrecision: string;
          minOrderQty: string;
          maxOrderQty: string;
          minOrderAmt: string;
          maxOrderAmt: string;
        };
        priceFilter: {
          tickSize: string;
        };
        status: string;
      }>;
    }>('GET', '/v5/market/instruments-info', params);

    const instruments: InstrumentInfo[] = [];

    for (const item of response.list) {
      const tickSize = parseFloat(item.priceFilter.tickSize);
      const qtyStep = parseFloat(item.lotSizeFilter.basePrecision);
      
      const instrumentInfo: InstrumentInfo = {
        symbol: item.symbol,
        baseCoin: item.baseCoin,
        quoteCoin: item.quoteCoin,
        tickSize,
        qtyStep,
        minOrderQty: parseFloat(item.lotSizeFilter.minOrderQty),
        maxOrderQty: parseFloat(item.lotSizeFilter.maxOrderQty),
        minNotional: parseFloat(item.lotSizeFilter.minOrderAmt || '0'),
        lotSizeFilter: item.lotSizeFilter,
        priceFilter: item.priceFilter,
      };

      this.instrumentCache.set(item.symbol, instrumentInfo);
      instruments.push(instrumentInfo);
    }

    return instruments;
  }

  /**
   * Get cached instrument info
   */
  async getInstrumentInfo(symbol: string): Promise<InstrumentInfo | undefined> {
    if (this.instrumentCache.has(symbol)) {
      return this.instrumentCache.get(symbol);
    }

    // Try to fetch the instrument info
    await this.getInstrumentsInfo('linear', symbol);
    return this.instrumentCache.get(symbol);
  }

  /**
   * Round price to tick size
   */
  roundPrice(price: number, tickSize: number): number {
    const precision = Math.ceil(-Math.log10(tickSize));
    const multiplier = Math.pow(10, precision);
    return Math.floor(price * multiplier) / multiplier;
  }

  /**
   * Round quantity to qty step
   */
  roundQty(qty: number, qtyStep: number): number {
    const precision = Math.ceil(-Math.log10(qtyStep));
    const multiplier = Math.pow(10, precision);
    return Math.floor(qty * multiplier) / multiplier;
  }

  /**
   * Get orderbook for a symbol
   */
  async getOrderbook(
    category: 'spot' | 'linear' | 'inverse' | 'option' = 'linear',
    symbol: string,
    limit: number = 25
  ): Promise<BybitOrderbook> {
    const response = await this.request<{
      s: string;
      b: string[][];
      a: string[][];
      ts: number;
      u: number;
    }>('GET', '/v5/market/orderbook', { category, symbol, limit });

    return {
      s: response.s,
      b: response.b.map(([price, size]) => ({ price, size })),
      a: response.a.map(([price, size]) => ({ price, size })),
      ts: response.ts,
      u: response.u,
    };
  }

  /**
   * Get klines/candlesticks for a symbol
   */
  async getKlines(
    category: 'spot' | 'linear' | 'inverse' | 'option' = 'linear',
    symbol: string,
    interval: '1' | '3' | '5' | '15' | '30' | '60' | '120' | '240' | '360' | '720' | 'D' | 'W' | 'M',
    limit: number = 200
  ): Promise<BybitKline[]> {
    const response = await this.request<{
      category: string;
      symbol: string;
      list: string[][];
    }>('GET', '/v5/market/kline', { category, symbol, interval, limit });

    return response.list.map((kline) => ({
      startTime: parseInt(kline[0]),
      openPrice: kline[1],
      highPrice: kline[2],
      lowPrice: kline[3],
      closePrice: kline[4],
      volume: kline[5],
      turnover: kline[6],
    }));
  }

  /**
   * Place an order
   */
  async placeOrder(params: BybitOrderParams): Promise<BybitOrderResponse> {
    const orderParams: Record<string, string | number | boolean | undefined> = {
      category: params.category,
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      qty: params.qty,
    };

    if (params.price) orderParams.price = params.price.toString();
    if (params.timeInForce) orderParams.timeInForce = params.timeInForce;
    if (params.orderLinkId) orderParams.orderLinkId = params.orderLinkId;
    if (params.takeProfit) orderParams.takeProfit = params.takeProfit;
    if (params.stopLoss) orderParams.stopLoss = params.stopLoss;
    if (params.tpTriggerBy) orderParams.tpTriggerBy = params.tpTriggerBy;
    if (params.slTriggerBy) orderParams.slTriggerBy = params.slTriggerBy;
    if (params.positionIdx !== undefined) orderParams.positionIdx = params.positionIdx;
    if (params.reduceOnly) orderParams.reduceOnly = params.reduceOnly;
    if (params.closeOnTrigger) orderParams.closeOnTrigger = params.closeOnTrigger;

    const response = await this.request<{
      orderId: string;
      orderLinkId: string;
    }>('POST', '/v5/order/create', orderParams, true);

    return {
      orderId: response.orderId,
      orderLinkId: response.orderLinkId,
      category: params.category,
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      price: params.price?.toString() || '',
      qty: params.qty.toString(),
      orderStatus: 'Created',
      createdTime: Date.now().toString(),
      updatedTime: Date.now().toString(),
      takeProfit: params.takeProfit?.toString() || '',
      stopLoss: params.stopLoss?.toString() || '',
    };
  }

  /**
   * Amend an order (update TP/SL)
   */
  async amendOrder(
    category: 'spot' | 'linear' | 'inverse' | 'option',
    symbol: string,
    orderId: string,
    takeProfit?: number,
    stopLoss?: number,
    price?: number,
    qty?: number
  ): Promise<{ orderId: string; orderLinkId: string }> {
    const params: Record<string, string | number | undefined> = {
      category,
      symbol,
      orderId,
    };

    if (takeProfit) params.takeProfit = takeProfit;
    if (stopLoss) params.stopLoss = stopLoss;
    if (price) params.price = price;
    if (qty) params.qty = qty;

    return this.request<{ orderId: string; orderLinkId: string }>(
      'PUT',
      '/v5/order/amend',
      params,
      true
    );
  }

  /**
   * Set trading stop (TP/SL for position)
   */
  async setTradingStop(
    category: 'linear' | 'inverse',
    symbol: string,
    takeProfit?: number,
    stopLoss?: number,
    positionIdx?: number,
    tpTriggerBy?: 'LastPrice' | 'MarkPrice' | 'IndexPrice',
    slTriggerBy?: 'LastPrice' | 'MarkPrice' | 'IndexPrice',
    tpSize?: number,
    slSize?: number
  ): Promise<{ orderId: string; orderLinkId: string }> {
    const params: Record<string, string | number | undefined> = {
      category,
      symbol,
    };

    if (takeProfit !== undefined) params.takeProfit = takeProfit;
    if (stopLoss !== undefined) params.stopLoss = stopLoss;
    if (positionIdx !== undefined) params.positionIdx = positionIdx;
    if (tpTriggerBy) params.tpTriggerBy = tpTriggerBy;
    if (slTriggerBy) params.slTriggerBy = slTriggerBy;
    if (tpSize !== undefined) params.tpSize = tpSize;
    if (slSize !== undefined) params.slSize = slSize;

    return this.request<{ orderId: string; orderLinkId: string }>(
      'POST',
      '/v5/position/trading-stop',
      params,
      true
    );
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    category: 'spot' | 'linear' | 'inverse' | 'option',
    symbol: string,
    orderId?: string,
    orderLinkId?: string
  ): Promise<{ orderId: string; orderLinkId: string }> {
    const params: Record<string, string | undefined> = {
      category,
      symbol,
    };

    if (orderId) params.orderId = orderId;
    if (orderLinkId) params.orderLinkId = orderLinkId;

    return this.request<{ orderId: string; orderLinkId: string }>(
      'POST',
      '/v5/order/cancel',
      params,
      true
    );
  }

  /**
   * Get open orders
   */
  async getOpenOrders(
    category: 'spot' | 'linear' | 'inverse' | 'option',
    symbol?: string,
    settleCoin?: string,
    limit: number = 50
  ): Promise<BybitOrderResponse[]> {
    const params: Record<string, string | number | undefined> = {
      category,
      limit,
    };

    if (symbol) params.symbol = symbol;
    if (settleCoin) params.settleCoin = settleCoin;

    const response = await this.request<{
      category: string;
      list: Array<{
        orderId: string;
        orderLinkId: string;
        category: string;
        symbol: string;
        side: string;
        orderType: string;
        price: string;
        qty: string;
        orderStatus: string;
        createdTime: string;
        updatedTime: string;
        takeProfit: string;
        stopLoss: string;
      }>;
    }>('GET', '/v5/order/realtime', params, true);

    return response.list;
  }

  /**
   * Get positions
   */
  async getPositions(
    category: 'linear' | 'inverse' = 'linear',
    symbol?: string,
    settleCoin?: string
  ): Promise<BybitPosition[]> {
    const params: Record<string, string | undefined> = {
      category,
    };

    if (symbol) params.symbol = symbol;
    if (settleCoin) params.settleCoin = settleCoin;

    const response = await this.request<{
      category: string;
      list: BybitPosition[];
    }>('GET', '/v5/position/list', params, true);

    return response.list;
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(
    accountType: 'UNIFIED' | 'SPOT' | 'CONTRACT' | 'FUND' | 'OPTION'
  ): Promise<BybitBalance[]> {
    const response = await this.request<{
      list: BybitBalance[];
    }>('GET', '/v5/account/wallet-balance', { accountType }, true);

    return response.list;
  }

  /**
   * Get USDT balance from unified account
   */
  async getUsdtBalance(): Promise<number> {
    try {
      const balances = await this.getWalletBalance('UNIFIED');
      const unifiedBalance = balances.find(b => b.accountType === 'UNIFIED');
      
      if (unifiedBalance) {
        const usdtCoin = unifiedBalance.coin.find(c => c.coin === 'USDT');
        return usdtCoin ? parseFloat(usdtCoin.walletBalance) : 0;
      }

      // Fallback to SPOT account
      const spotBalances = await this.getWalletBalance('SPOT');
      const spotBalance = spotBalances.find(b => b.accountType === 'SPOT');
      
      if (spotBalance) {
        const usdtCoin = spotBalance.coin.find(c => c.coin === 'USDT');
        return usdtCoin ? parseFloat(usdtCoin.walletBalance) : 0;
      }

      return 0;
    } catch (error) {
      console.error('Error fetching USDT balance:', error);
      return 0;
    }
  }

  /**
   * Get available trading balance (for position sizing)
   */
  async getAvailableBalance(): Promise<number> {
    const balances = await this.getWalletBalance('UNIFIED');
    const unifiedBalance = balances.find(b => b.accountType === 'UNIFIED');
    
    if (unifiedBalance) {
      return parseFloat(unifiedBalance.totalAvailableBalance);
    }

    return 0;
  }

  /**
   * Set leverage for a symbol
   */
  async setLeverage(
    category: 'linear' | 'inverse',
    symbol: string,
    buyLeverage: number,
    sellLeverage: number
  ): Promise<{ buyLeverage: string; sellLeverage: string }> {
    return this.request<{ buyLeverage: string; sellLeverage: string }>(
      'POST',
      '/v5/position/set-leverage',
      {
        category,
        symbol,
        buyLeverage,
        sellLeverage,
      },
      true
    );
  }

  /**
   * WebSocket connection for real-time data (stub)
   */
  connectWebSocket(channel: string, onMessage: (data: unknown) => void): WebSocket {
    const wsUrl = `wss://stream.bybit.com/v5/public/linear`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      // Subscribe to channel
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [channel],
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
    const channel = `kline.${interval}.${symbol}`;
    return this.connectWebSocket(channel, onMessage);
  }

  /**
   * Subscribe to orderbook updates
   */
  subscribeToOrderbook(
    symbol: string,
    onMessage: (data: unknown) => void
  ): WebSocket {
    const channel = `orderbook.50.${symbol}`;
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
   * Get cached instrument info map
   */
  getCachedInstrumentInfo(): Map<string, InstrumentInfo> {
    return this.instrumentCache;
  }

  /**
   * Initialize instrument cache on startup
   */
  async initializeInstrumentCache(symbols?: string[]): Promise<void> {
    const instruments = await this.getInstrumentsInfo('linear');
    console.log(`Cached ${instruments.length} instruments`);
    
    // Cache specific symbols if provided
    if (symbols) {
      for (const symbol of symbols) {
        await this.getInstrumentInfo(symbol);
      }
    }
  }
}

export default BybitClient;
