import { Injectable, Logger } from '@nestjs/common';
import { SpreadData } from '../interfaces/spread-data.interface';
import { Strategy1Config, StrategyOpportunity } from '../interfaces/strategy-config.interface';

@Injectable()
export class Strategy1Service {
  private readonly logger = new Logger(Strategy1Service.name);

  private readonly defaultConfig: Strategy1Config = {
    minFundingDiff: 0.0015,        // 0.15% (было 0.2%)
    maxTimeDiff: 5,                // 5 минут
    minTimeToFunding: 3,           // 3 минуты (было 4)
    maxTimeToFunding: 15           // 15 минут
  };

  /**
   * Проверяет, подходит ли тикер для Strategy 1 (Rate Arbitrage)
   * @param tickerData Данные по тикеру со всех бирж
   * @param config Конфигурация стратегии (опционально)
   * @returns true если стратегия подходит, false если нет
   */
  isStrategy1Suitable(tickerData: SpreadData, config?: Partial<Strategy1Config>): boolean {
    const cfg = { ...this.defaultConfig, ...config };
    
    try {
      const opportunity = this.findBestOpportunity(tickerData, cfg);
      const result = opportunity !== null;
      
      if (result) {
        this.logger.debug(`✅ Strategy 1 подходит для ${tickerData.ticker}: ${opportunity.longExchange}/${opportunity.shortExchange}, спред: ${(opportunity.fundingDiff * 100).toFixed(4)}%`);
      } else {
        this.logger.debug(`❌ Strategy 1 не подходит для ${tickerData.ticker}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Ошибка анализа Strategy 1 для ${tickerData.ticker}:`, error.message);
      return false;
    }
  }

  /**
   * Находит лучшую возможность для Strategy 1
   * @param tickerData Данные по тикеру со всех бирж
   * @param config Конфигурация стратегии
   * @returns StrategyOpportunity или null если подходящей возможности нет
   */
  findBestOpportunity(tickerData: SpreadData, config?: Partial<Strategy1Config>): StrategyOpportunity | null {
    const cfg = { ...this.defaultConfig, ...config };
    const exchanges = ['binance', 'bybit', 'bitget', 'bingx', 'mexc', 'bitmex', 'okx'];
    const opportunities: StrategyOpportunity[] = [];

    // Собираем все доступные биржи с данными
    const availableExchanges: Array<{
      exchange: string;
      fundingRate: number;
      nextFundingTime: number;
    }> = [];

    exchanges.forEach(exchange => {
      const data = tickerData[exchange as keyof SpreadData] as any;
      if (data && data.fundingRate !== null && data.fundingRate !== undefined && data.nextFundingTime) {
        availableExchanges.push({
          exchange,
          fundingRate: data.fundingRate,
          nextFundingTime: data.nextFundingTime
        });
      }
    });

    if (availableExchanges.length < 2) {
      return null;
    }

    // Проверяем все пары бирж
    for (let i = 0; i < availableExchanges.length; i++) {
      for (let j = i + 1; j < availableExchanges.length; j++) {
        const exchange1 = availableExchanges[i];
        const exchange2 = availableExchanges[j];

        // Проверяем условие 1: Одинаковое время выплат (разница < maxTimeDiff минут)
        const timeDiff = Math.abs(exchange1.nextFundingTime - exchange2.nextFundingTime) / (1000 * 60);
        if (timeDiff > cfg.maxTimeDiff) {
          continue;
        }

        // Проверяем условие 2: Разность funding rates >= minFundingDiff
        const fundingDiff = Math.abs(exchange1.fundingRate - exchange2.fundingRate);
        if (fundingDiff < cfg.minFundingDiff) {
          continue;
        }

        // Проверяем условие 3: До выплаты от minTimeToFunding до maxTimeToFunding минут
        const now = Date.now();
        const timeToFunding1 = (exchange1.nextFundingTime - now) / (1000 * 60);
        const timeToFunding2 = (exchange2.nextFundingTime - now) / (1000 * 60);
        const minTimeToFunding = Math.min(timeToFunding1, timeToFunding2);

        if (minTimeToFunding < cfg.minTimeToFunding || minTimeToFunding > cfg.maxTimeToFunding) {
          continue;
        }

        // Определяем, кто лонг, кто шорт (лонг = меньший funding rate)
        const longExchange = exchange1.fundingRate < exchange2.fundingRate ? exchange1 : exchange2;
        const shortExchange = exchange1.fundingRate < exchange2.fundingRate ? exchange2 : exchange1;

        opportunities.push({
          ticker: tickerData.ticker,
          longExchange: longExchange.exchange,
          shortExchange: shortExchange.exchange,
          longFundingRate: longExchange.fundingRate,
          shortFundingRate: shortExchange.fundingRate,
          fundingDiff,
          nextFundingTime: Math.min(exchange1.nextFundingTime, exchange2.nextFundingTime),
          timeToFunding: minTimeToFunding,
          strategy: 'rate_arbitrage'
        });
      }
    }

    // Возвращаем лучшую возможность (с максимальным спредом)
    if (opportunities.length === 0) {
      return null;
    }

    return opportunities.reduce((best, current) => 
      current.fundingDiff > best.fundingDiff ? current : best
    );
  }

  /**
   * Анализирует все тикеры для Strategy 1
   * @param spreadsData Массив данных по всем тикерам
   * @param config Конфигурация стратегии
   * @returns Массив подходящих возможностей
   */
  analyzeAllTickers(spreadsData: SpreadData[], config?: Partial<Strategy1Config>): StrategyOpportunity[] {
    const cfg = { ...this.defaultConfig, ...config };
    const opportunities: StrategyOpportunity[] = [];

    for (const tickerData of spreadsData) {
      const opportunity = this.findBestOpportunity(tickerData, cfg);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Сортируем по убыванию спреда
    opportunities.sort((a, b) => b.fundingDiff - a.fundingDiff);

    this.logger.log(`Strategy 1 анализ завершен: найдено ${opportunities.length} возможностей из ${spreadsData.length} тикеров`);

    return opportunities;
  }

  /**
   * Получить текущую конфигурацию по умолчанию
   */
  getDefaultConfig(): Strategy1Config {
    return { ...this.defaultConfig };
  }

  /**
   * Логирует детали анализа для отладки
   */
  private logAnalysisDetails(tickerData: SpreadData, config: Strategy1Config): void {
    const exchanges = ['binance', 'bybit', 'bitget', 'bingx', 'mexc', 'bitmex', 'okx'];
    
    this.logger.debug(`\n=== Strategy 1 анализ для ${tickerData.ticker} ===`);
    this.logger.debug(`Конфигурация: minFundingDiff=${config.minFundingDiff}, maxTimeDiff=${config.maxTimeDiff}мин, timeWindow=${config.minTimeToFunding}-${config.maxTimeToFunding}мин`);
    
    exchanges.forEach(exchange => {
      const data = tickerData[exchange as keyof SpreadData] as any;
      if (data) {
        const timeToFunding = (data.nextFundingTime - Date.now()) / (1000 * 60);
        this.logger.debug(`${exchange}: rate=${(data.fundingRate * 100).toFixed(4)}%, time=${timeToFunding.toFixed(1)}мин`);
      }
    });
  }
}
