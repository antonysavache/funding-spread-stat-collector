export interface ExchangeFundingData {
  fundingRate: number;
  nextFundingTime: number;
}

export interface SpreadData {
  ticker: string;
  binance?: ExchangeFundingData;
  bybit?: ExchangeFundingData;
  bitget?: ExchangeFundingData;
  bingx?: ExchangeFundingData;
  mexc?: ExchangeFundingData;
  bitmex?: ExchangeFundingData;
  okx?: ExchangeFundingData;
  minFundingRate: number;
  maxFundingRate: number;
  spread: number;
}

export interface TradingPosition {
  id: string;
  ticker: string;
  longExchange: string;
  shortExchange: string;
  longFundingRate: number;
  shortFundingRate: number;
  spread: number;
  entryTime: Date;
  nextFundingTime: Date;
  status: 'waiting' | 'active' | 'closed';
  expectedFunding?: number;
  actualFunding?: number;
  commission?: TradeCommission;
  exitTime?: Date;
  result?: TradeResult;
}

export interface TradeCommission {
  // Комиссии за вход (лонг + шорт)
  entryCommissionLong: number;
  entryCommissionShort: number;
  // Комиссии за выход (лонг + шорт)
  exitCommissionLong: number;
  exitCommissionShort: number;
  // Общие комиссии
  totalCommission: number;
  // Тип комиссий (все маркет или 2 лимит + 2 маркет)
  commissionType: 'all_market' | 'limit_market';
}

export interface TradeResult {
  fundingReceived: number;
  commissionsTotal: number;
  netProfit: number;
  profitPercent: number;
  holdingTimeMinutes: number;
}

export interface TradingStatistics {
  totalTrades: number;
  activeTrades: number;
  totalFundingReceived: number;
  totalCommissionsPaid: number;
  netProfit: number;
  avgSpread: number;
  avgHoldingTime: number;
  profitableTrades: number;
  successRate: number;
  // Статистика по типам комиссий
  marketCommissionStats: {
    totalTrades: number;
    totalCommissions: number;
    netProfit: number;
  };
  limitMarketCommissionStats: {
    totalTrades: number;
    totalCommissions: number;
    netProfit: number;
  };
}
