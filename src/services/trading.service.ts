import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TradingPosition, TradeResult, TradingStatistics } from '../interfaces/spread-data.interface';
import { SpreadDataService } from './spread-data.service';
import { CommissionService } from './commission.service';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private positions: TradingPosition[] = [];
  private readonly MIN_SPREAD = 0.0015; // 0.15%
  private readonly POSITION_SIZE = 1000; // $1000
  private readonly ENTRY_TIME_MINUTES = 10; // Входим за 10 минут до выплаты
  private readonly EXIT_TIME_MINUTES = 4; // Выходим через 4 минуты после выплаты

  constructor(
    private readonly spreadDataService: SpreadDataService,
    private readonly commissionService: CommissionService
  ) {}

  async checkForTradingOpportunities(): Promise<void> {
    try {
      this.logger.log('🔍 Поиск торговых возможностей...');
      
      // Получаем данные спредов
      const spreadsData = await this.spreadDataService.fetchSpreadsData();
      
      // Фильтруем по минимальному спреду
      const opportunities = this.spreadDataService.findTradingOpportunities(spreadsData, this.MIN_SPREAD);
      
      for (const opportunity of opportunities) {
        await this.evaluateOpportunity(opportunity);
      }
      
      // Обновляем статус существующих позиций
      await this.updatePositions();
      
    } catch (error) {
      this.logger.error('Ошибка при поиске торговых возможностей:', error.message);
    }
  }

  private async evaluateOpportunity(spread: any): Promise<void> {
    // Находим лучшую пару бирж
    const exchangePair = this.spreadDataService.findBestExchangePair(spread);
    if (!exchangePair) {
      return;
    }

    // Проверяем время до следующей выплаты
    const longExchangeData = spread[exchangePair.longExchange];
    const shortExchangeData = spread[exchangePair.shortExchange];
    
    if (!longExchangeData || !shortExchangeData) {
      return;
    }

    const timeToFunding = Math.min(
      this.spreadDataService.getTimeToNextFunding(longExchangeData.nextFundingTime),
      this.spreadDataService.getTimeToNextFunding(shortExchangeData.nextFundingTime)
    );

    // Входим в сделку, если до выплаты осталось 10 минут
    if (timeToFunding <= this.ENTRY_TIME_MINUTES && timeToFunding > 0) {
      await this.enterPosition(spread, exchangePair, timeToFunding);
    }
  }

  private async enterPosition(spread: any, exchangePair: any, timeToFunding: number): Promise<void> {
    // Проверяем, нет ли уже позиции по этому тикеру
    const existingPosition = this.positions.find(
      pos => pos.ticker === spread.ticker && pos.status !== 'closed'
    );

    if (existingPosition) {
      this.logger.debug(`Позиция по ${spread.ticker} уже существует`);
      return;
    }

    // Рассчитываем комиссии для обоих типов
    const marketCommission = this.commissionService.calculateCommissions(
      exchangePair.longExchange,
      exchangePair.shortExchange,
      this.POSITION_SIZE,
      false
    );

    const limitMarketCommission = this.commissionService.calculateCommissions(
      exchangePair.longExchange,
      exchangePair.shortExchange,
      this.POSITION_SIZE,
      true
    );

    // Выбираем более выгодный тип комиссий
    const chosenCommission = limitMarketCommission.totalCommission < marketCommission.totalCommission 
      ? limitMarketCommission 
      : marketCommission;

    // Рассчитываем ожидаемую прибыль
    const expectedProfit = this.commissionService.calculateExpectedProfit(
      spread.spread,
      this.POSITION_SIZE,
      chosenCommission
    );

    // Создаем позицию
    const position: TradingPosition = {
      id: uuidv4(),
      ticker: spread.ticker,
      longExchange: exchangePair.longExchange,
      shortExchange: exchangePair.shortExchange,
      longFundingRate: exchangePair.longRate,
      shortFundingRate: exchangePair.shortRate,
      spread: spread.spread,
      entryTime: new Date(),
      nextFundingTime: new Date(Math.min(
        spread[exchangePair.longExchange].nextFundingTime,
        spread[exchangePair.shortExchange].nextFundingTime
      )),
      status: 'active',
      expectedFunding: spread.spread * this.POSITION_SIZE,
      commission: chosenCommission
    };

    this.positions.push(position);

    this.logger.log(`
🎯 Новая позиция открыта:
Тикер: ${position.ticker}
Лонг: ${position.longExchange} (${(position.longFundingRate * 100).toFixed(4)}%)
Шорт: ${position.shortExchange} (${(position.shortFundingRate * 100).toFixed(4)}%)
Спред: ${(position.spread * 100).toFixed(4)}%
Ожидаемый доход: $${position.expectedFunding?.toFixed(4)}
Комиссии: $${position.commission?.totalCommission.toFixed(4)} (${position.commission?.commissionType})
Ожидаемая прибыль: $${expectedProfit.toFixed(4)}
До выплаты: ${timeToFunding.toFixed(1)} минут
    `);
  }

  private async updatePositions(): Promise<void> {
    const now = new Date();

    for (const position of this.positions) {
      if (position.status === 'active') {
        // Проверяем, прошло ли время выплаты + 4 минуты
        const exitTime = new Date(position.nextFundingTime.getTime() + this.EXIT_TIME_MINUTES * 60 * 1000);
        
        if (now >= exitTime) {
          await this.closePosition(position);
        }
      }
    }
  }

  private async closePosition(position: TradingPosition): Promise<void> {
    // Имитируем получение фактического фандинга
    // В реальности здесь будет запрос к API бирж
    const actualFunding = position.expectedFunding || 0;
    
    const result: TradeResult = {
      fundingReceived: actualFunding,
      commissionsTotal: position.commission?.totalCommission || 0,
      netProfit: actualFunding - (position.commission?.totalCommission || 0),
      profitPercent: ((actualFunding - (position.commission?.totalCommission || 0)) / this.POSITION_SIZE) * 100,
      holdingTimeMinutes: Math.round((Date.now() - position.entryTime.getTime()) / (1000 * 60))
    };

    position.status = 'closed';
    position.exitTime = new Date();
    position.actualFunding = actualFunding;
    position.result = result;

    this.logger.log(`
✅ Позиция закрыта:
Тикер: ${position.ticker}
Время удержания: ${result.holdingTimeMinutes} минут
Получено фандинга: $${result.fundingReceived.toFixed(4)}
Уплачено комиссий: $${result.commissionsTotal.toFixed(4)}
Чистая прибыль: $${result.netProfit.toFixed(4)} (${result.profitPercent.toFixed(4)}%)
    `);
  }

  getActivePositions(): TradingPosition[] {
    return this.positions.filter(pos => pos.status === 'active');
  }

  getClosedPositions(): TradingPosition[] {
    return this.positions.filter(pos => pos.status === 'closed');
  }

  getTradingStatistics(): TradingStatistics {
    const closedPositions = this.getClosedPositions();
    const activePositions = this.getActivePositions();

    if (closedPositions.length === 0) {
      return {
        totalTrades: 0,
        activeTrades: activePositions.length,
        totalFundingReceived: 0,
        totalCommissionsPaid: 0,
        netProfit: 0,
        avgSpread: 0,
        avgHoldingTime: 0,
        profitableTrades: 0,
        successRate: 0,
        marketCommissionStats: { totalTrades: 0, totalCommissions: 0, netProfit: 0 },
        limitMarketCommissionStats: { totalTrades: 0, totalCommissions: 0, netProfit: 0 }
      };
    }

    const totalFundingReceived = closedPositions.reduce((sum, pos) => sum + (pos.result?.fundingReceived || 0), 0);
    const totalCommissionsPaid = closedPositions.reduce((sum, pos) => sum + (pos.result?.commissionsTotal || 0), 0);
    const netProfit = totalFundingReceived - totalCommissionsPaid;
    const avgSpread = closedPositions.reduce((sum, pos) => sum + pos.spread, 0) / closedPositions.length;
    const avgHoldingTime = closedPositions.reduce((sum, pos) => sum + (pos.result?.holdingTimeMinutes || 0), 0) / closedPositions.length;
    const profitableTrades = closedPositions.filter(pos => (pos.result?.netProfit || 0) > 0).length;

    // Статистика по типам комиссий
    const marketCommissionTrades = closedPositions.filter(pos => pos.commission?.commissionType === 'all_market');
    const limitMarketCommissionTrades = closedPositions.filter(pos => pos.commission?.commissionType === 'limit_market');

    const marketCommissionStats = {
      totalTrades: marketCommissionTrades.length,
      totalCommissions: marketCommissionTrades.reduce((sum, pos) => sum + (pos.result?.commissionsTotal || 0), 0),
      netProfit: marketCommissionTrades.reduce((sum, pos) => sum + (pos.result?.netProfit || 0), 0)
    };

    const limitMarketCommissionStats = {
      totalTrades: limitMarketCommissionTrades.length,
      totalCommissions: limitMarketCommissionTrades.reduce((sum, pos) => sum + (pos.result?.commissionsTotal || 0), 0),
      netProfit: limitMarketCommissionTrades.reduce((sum, pos) => sum + (pos.result?.netProfit || 0), 0)
    };

    return {
      totalTrades: closedPositions.length,
      activeTrades: activePositions.length,
      totalFundingReceived,
      totalCommissionsPaid,
      netProfit,
      avgSpread: avgSpread * 100, // В процентах
      avgHoldingTime,
      profitableTrades,
      successRate: (profitableTrades / closedPositions.length) * 100,
      marketCommissionStats,
      limitMarketCommissionStats
    };
  }

  getAllPositions(): TradingPosition[] {
    return [...this.positions];
  }

  clearHistory(): void {
    this.positions = this.positions.filter(pos => pos.status !== 'closed');
    this.logger.log('История торговли очищена');
  }
}
