export interface Strategy1Config {
  minFundingDiff: number;     // Минимальная разность funding rates (например, 0.0015 = 0.15%)
  maxTimeDiff: number;        // Максимальная разница во времени выплат в минутах (например, 5)
  minTimeToFunding: number;   // Минимальное время до выплаты в минутах (например, 4)
  maxTimeToFunding: number;   // Максимальное время до выплаты в минутах (например, 15)
}

export interface Strategy2Config {
  minTimeDiff: number;        // Минимальная разница во времени выплат в минутах (например, 30)
  minTimeToFunding: number;   // Минимальное время до ближайшей выплаты в минутах (например, 4)
  maxTimeToFunding: number;   // Максимальное время до ближайшей выплаты в минутах (например, 15)
  minAbsFundingRate: number;  // Минимальный абсолютный funding rate (например, 0.002 = 0.2%)
}

export interface StrategyOpportunity {
  ticker: string;
  longExchange: string;
  shortExchange: string;
  longFundingRate: number;
  shortFundingRate: number;
  fundingDiff: number;
  nextFundingTime: number;
  timeToFunding: number;
  strategy: 'rate_arbitrage' | 'timing_arbitrage';
}
