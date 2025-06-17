export interface PositionMonitoring {
  id: string;
  ticker: string;
  exchange: string;
  originalFundingRate: number;
  nextFundingTime: number;
  entryTime: number;
  strategy: 'rate_arbitrage' | 'timing_arbitrage';
  checkScheduled: boolean;
  timeoutId?: NodeJS.Timeout;
}

export interface FundingStabilityCheck {
  positionId: string;
  ticker: string;
  exchange: string;
  originalFundingRate: number;
  currentFundingRate: number;
  changePercent: number;
  isStable: boolean;
  checkTime: Date;
  nextFundingTime: Date;
  timeBeforeFunding: number; // минут до выплаты
}
