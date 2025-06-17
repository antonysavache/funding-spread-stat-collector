import { Injectable, Logger } from '@nestjs/common';
import { SpreadData } from '../interfaces/spread-data.interface';
import { Strategy2Config, StrategyOpportunity } from '../interfaces/strategy-config.interface';

@Injectable()
export class Strategy2Service {
  private readonly logger = new Logger(Strategy2Service.name);

  private readonly defaultConfig: Strategy2Config = {
    minTimeDiff: 30,           // 30 минут минимальная разница между выплатами
    minTimeToFunding: 4,       // 4 минуты минимум до ближайшей выплаты
    maxTimeToFunding: 15,      // 15 минут максимум до ближайшей выплаты
    minAbsFundingRate: 0.002   // 0.2% минимальный абсолютный funding rate
  };

  /**
   * Проверяет, подходит ли тикер для Strategy 2 (Timing Arbitrage)
   * @param tickerData Данные по тикеру со всех бирж
   * @param config Конфигурация стратегии (опционально)
   * @returns true если стратегия подходит, false если нет
   */
  isStrategy2Suitable(tickerData: SpreadData, config?: Partial<Strategy2Config>): boolean {
    const cfg = { ...this.defaultConfig, ...config };
    
    try {
      const opportunity = this.findBestOpportunity(tickerData, cfg);
      const result = opportunity !== null;
      
      if (result) {
        this.logger.debug(`✅ Strategy 2 подходит для ${tickerData.ticker}: ${opportunity.longExchange}(|${(Math.abs(opportunity.longFundingRate) * 100).toFixed(4)}%|)/${opportunity.shortExchange}(|${(Math.abs(opportunity.shortFundingRate) * 100).toFixed(4)}%|), временная разница: ${this.getTimeDiffMinutes(opportunity)}мин`);
      } else {
        this.logger.debug(`❌ Strategy 2 не подходит для ${tickerData.ticker}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Ошибка анализа Strategy 2 для ${tickerData.ticker}:`, error.message);
      return false;
    }
  }

  /**
   * Находит лучшую возможность для Strategy 2
   * @param tickerData Данные по тикеру со всех бирж
   * @param config Конфигурация стратегии
   * @returns StrategyOpportunity или null если подходящей возможности нет
   */
  findBestOpportunity(tickerData: SpreadData, config?: Partial<Strategy2Config>): StrategyOpportunity | null {
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

        // Проверяем условие 1: Разное время выплат (разница >= minTimeDiff минут)
        const timeDiff = Math.abs(exchange1.nextFundingTime - exchange2.nextFundingTime) / (1000 * 60);
        if (timeDiff < cfg.minTimeDiff) {
          continue;
        }

        // Проверяем условие 2: Абсолютный funding rate >= minAbsFundingRate на обеих биржах
        const absFundingRate1 = Math.abs(exchange1.fundingRate);
        const absFundingRate2 = Math.abs(exchange2.fundingRate);
        
        if (absFundingRate1 < cfg.minAbsFundingRate || absFundingRate2 < cfg.minAbsFundingRate) {
          continue;
        }

        // Проверяем условие 3: До ближайшей выплаты от minTimeToFunding до maxTimeToFunding минут
        const now = Date.now();
        const timeToFunding1 = (exchange1.nextFundingTime - now) / (1000 * 60);
        const timeToFunding2 = (exchange2.nextFundingTime - now) / (1000 * 60);
        const minTimeToFunding = Math.min(timeToFunding1, timeToFunding2);

        if (minTimeToFunding < cfg.minTimeToFunding || minTimeToFunding > cfg.maxTimeToFunding) {
          continue;
        }

        // Для Strategy 2 "спред" = сумма абсолютных значений funding rates
        // (потенциальный профит от обеих выплат независимо от знака)
        const totalFundingPotential = absFundingRate1 + absFundingRate2;

        // Определяем первую биржу (с ближайшей выплатой)
        const firstExchange = exchange1.nextFundingTime < exchange2.nextFundingTime ? exchange1 : exchange2;
        const secondExchange = exchange1.nextFundingTime < exchange2.nextFundingTime ? exchange2 : exchange1;

        opportunities.push({
          ticker: tickerData.ticker,
          longExchange: firstExchange.exchange,  // Первая по времени
          shortExchange: secondExchange.exchange, // Вторая по времени
          longFundingRate: firstExchange.fundingRate,
          shortFundingRate: secondExchange.fundingRate,
          fundingDiff: totalFundingPotential, // Используем как "спред" для сравнения
          nextFundingTime: firstExchange.nextFundingTime, // Время первой выплаты
          timeToFunding: minTimeToFunding,
          strategy: 'timing_arbitrage'
        });
      }
    }

    // Возвращаем лучшую возможность (с максимальным потенциальным профитом)
    if (opportunities.length === 0) {
      return null;
    }

    return opportunities.reduce((best, current) => 
      current.fundingDiff > best.fundingDiff ? current : best
    );
  }

  /**
   * Анализирует все тикеры для Strategy 2
   * @param spreadsData Массив данных по всем тикерам
   * @param config Конфигурация стратегии
   * @returns Массив подходящих возможностей
   */
  analyzeAllTickers(spreadsData: SpreadData[], config?: Partial<Strategy2Config>): StrategyOpportunity[] {
    const cfg = { ...this.defaultConfig, ...config };
    const opportunities: StrategyOpportunity[] = [];

    for (const tickerData of spreadsData) {
      const opportunity = this.findBestOpportunity(tickerData, cfg);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Сортируем по убыванию потенциального профита
    opportunities.sort((a, b) => b.fundingDiff - a.fundingDiff);

    this.logger.log(`Strategy 2 анализ завершен: найдено ${opportunities.length} возможностей из ${spreadsData.length} тикеров`);

    return opportunities;
  }

  /**
   * Получить текущую конфигурацию по умолчанию
   */
  getDefaultConfig(): Strategy2Config {
    return { ...this.defaultConfig };
  }

  /**
   * Получить разницу во времени между выплатами в минутах
   */
  private getTimeDiffMinutes(opportunity: StrategyOpportunity): number {
    // Для Strategy 2 нужно получить время второй выплаты из исходных данных
    // Пока возвращаем примерное значение
    return 60; // Примерное значение, можно доработать
  }
}
