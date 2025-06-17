import { Injectable, Logger } from '@nestjs/common';
import { EXCHANGE_FEES, CommissionCalculation } from '../interfaces/exchange-fees.interface';
import { TradeCommission } from '../interfaces/spread-data.interface';

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  calculateCommissions(
    longExchange: string,
    shortExchange: string,
    positionSize: number = 1000, // $1000 по умолчанию
    useLimit: boolean = false // false = все маркет, true = 2 лимит + 2 маркет
  ): TradeCommission {
    const longFees = EXCHANGE_FEES[longExchange];
    const shortFees = EXCHANGE_FEES[shortExchange];

    if (!longFees || !shortFees) {
      throw new Error(`Не найдены комиссии для бирж: ${longExchange}, ${shortExchange}`);
    }

    let entryCommissionLong: number;
    let entryCommissionShort: number;
    let exitCommissionLong: number;
    let exitCommissionShort: number;

    if (useLimit) {
      // 2 лимитных ордера на вход + 2 рыночных на выход
      entryCommissionLong = positionSize * longFees.maker;
      entryCommissionShort = positionSize * shortFees.maker;
      exitCommissionLong = positionSize * longFees.taker;
      exitCommissionShort = positionSize * shortFees.taker;
    } else {
      // Все рыночные ордера
      entryCommissionLong = positionSize * longFees.taker;
      entryCommissionShort = positionSize * shortFees.taker;
      exitCommissionLong = positionSize * longFees.taker;
      exitCommissionShort = positionSize * shortFees.taker;
    }

    const totalCommission = entryCommissionLong + entryCommissionShort + exitCommissionLong + exitCommissionShort;

    const commission: TradeCommission = {
      entryCommissionLong,
      entryCommissionShort,
      exitCommissionLong,
      exitCommissionShort,
      totalCommission,
      commissionType: useLimit ? 'limit_market' : 'all_market'
    };

    this.logger.debug(`Рассчитаны комиссии для ${longExchange}/${shortExchange}: ${totalCommission.toFixed(4)}$ (${commission.commissionType})`);

    return commission;
  }

  calculateExpectedProfit(
    spread: number,
    positionSize: number = 1000,
    commission: TradeCommission
  ): number {
    // Ожидаемый доход от фандинга (спред * размер позиции)
    const fundingIncome = spread * positionSize;
    
    // Чистая прибыль = доход от фандинга - комиссии
    const netProfit = fundingIncome - commission.totalCommission;

    return netProfit;
  }

  getCommissionBreakdown(commission: TradeCommission): string {
    return `
Тип: ${commission.commissionType}
Вход лонг: $${commission.entryCommissionLong.toFixed(4)}
Вход шорт: $${commission.entryCommissionShort.toFixed(4)}
Выход лонг: $${commission.exitCommissionLong.toFixed(4)}
Выход шорт: $${commission.exitCommissionShort.toFixed(4)}
Итого: $${commission.totalCommission.toFixed(4)}
    `.trim();
  }

  compareCommissionTypes(
    longExchange: string,
    shortExchange: string,
    positionSize: number = 1000
  ): { market: TradeCommission; limitMarket: TradeCommission; savings: number } {
    const marketCommission = this.calculateCommissions(longExchange, shortExchange, positionSize, false);
    const limitMarketCommission = this.calculateCommissions(longExchange, shortExchange, positionSize, true);
    
    const savings = marketCommission.totalCommission - limitMarketCommission.totalCommission;

    this.logger.log(`Сравнение комиссий ${longExchange}/${shortExchange}: экономия ${savings.toFixed(4)}$ при использовании лимитных ордеров`);

    return {
      market: marketCommission,
      limitMarket: limitMarketCommission,
      savings
    };
  }
}
