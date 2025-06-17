export interface ExchangeFees {
  maker: number; // Лимитные ордера
  taker: number; // Рыночные ордера
}

export const EXCHANGE_FEES: Record<string, ExchangeFees> = {
  binance: { maker: 0.0002, taker: 0.0004 }, // 0.02%/0.04%
  bybit: { maker: 0.0002, taker: 0.00055 },  // 0.02%/0.055%
  bitget: { maker: 0.0002, taker: 0.0006 },  // 0.02%/0.06%
  bingx: { maker: 0.0002, taker: 0.0005 },   // 0.02%/0.05%
  bitmex: { maker: -0.0001, taker: 0.00075 }, // -0.01% (рибейт)/0.075%
  okx: { maker: 0.0002, taker: 0.0005 }      // 0.02%/0.05%
};

export interface CommissionCalculation {
  entryLongCommission: number;
  entryShortCommission: number;
  exitLongCommission: number;
  exitShortCommission: number;
  totalCommission: number;
  type: 'all_market' | 'limit_market';
}
