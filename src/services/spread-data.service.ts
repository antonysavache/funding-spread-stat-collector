import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SpreadData } from '../interfaces/spread-data.interface';

@Injectable()
export class SpreadDataService {
  private readonly logger = new Logger(SpreadDataService.name);
  private readonly apiUrl = 'https://funding-spread-be-production.up.railway.app/api/funding/spreadsTable';

  constructor(private readonly httpService: HttpService) {}

  async fetchSpreadsData(): Promise<SpreadData[]> {
    try {
      this.logger.log('Получение данных спредов...');
      
      const response = await firstValueFrom(
        this.httpService.get<SpreadData[]>(this.apiUrl, {
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Trading-Stat-Bot/1.0'
          }
        })
      );

      const spreads = response.data;
      this.logger.log(`Получено ${spreads.length} спредов`);

      return spreads;
    } catch (error) {
      this.logger.error('Ошибка при получении данных спредов:', error.message);
      throw new Error(`Не удалось получить данные спредов: ${error.message}`);
    }
  }

  filterSpreadsByMinimum(spreads: SpreadData[], minSpread: number = 0.0015): SpreadData[] {
    const filtered = spreads.filter(spread => spread.spread >= minSpread);
    
    this.logger.log(`Отфильтровано ${filtered.length} спредов из ${spreads.length} (минимальный спред: ${(minSpread * 100).toFixed(2)}%)`);
    
    return filtered;
  }

  findTradingOpportunities(spreads: SpreadData[], minSpread: number = 0.0015): SpreadData[] {
    const opportunities = spreads
      .filter(spread => spread.spread >= minSpread)
      .filter(spread => this.hasValidFundingTimes(spread))
      .sort((a, b) => b.spread - a.spread); // Сортируем по убыванию спреда

    this.logger.log(`Найдено ${opportunities.length} торговых возможностей`);
    
    return opportunities;
  }

  private hasValidFundingTimes(spread: SpreadData): boolean {
    const exchanges = ['binance', 'bybit', 'bitget', 'bingx', 'mexc', 'bitmex', 'okx'];
    let validExchanges = 0;

    for (const exchange of exchanges) {
      const exchangeData = spread[exchange as keyof SpreadData] as any;
      if (exchangeData && exchangeData.nextFundingTime) {
        const timeToFunding = this.getTimeToNextFunding(exchangeData.nextFundingTime);
        if (timeToFunding > 0 && timeToFunding <= 60) { // До 60 минут
          validExchanges++;
        }
      }
    }

    return validExchanges >= 2; // Нужно минимум 2 биржи для арбитража
  }

  getTimeToNextFunding(nextFundingTime: number): number {
    const now = Date.now();
    const timeToFunding = (nextFundingTime - now) / (1000 * 60); // В минутах
    return timeToFunding;
  }

  findBestExchangePair(spread: SpreadData): { longExchange: string; shortExchange: string; longRate: number; shortRate: number } | null {
    const exchanges = ['binance', 'bybit', 'bitget', 'bingx', 'mexc', 'bitmex', 'okx'];
    const exchangeRates: Array<{ exchange: string; rate: number; time: number }> = [];

    // Собираем все доступные биржи с их rates
    for (const exchange of exchanges) {
      const exchangeData = spread[exchange as keyof SpreadData] as any;
      if (exchangeData && exchangeData.fundingRate !== null && exchangeData.fundingRate !== undefined) {
        exchangeRates.push({
          exchange,
          rate: exchangeData.fundingRate,
          time: exchangeData.nextFundingTime
        });
      }
    }

    if (exchangeRates.length < 2) {
      return null;
    }

    // Сортируем по funding rate
    exchangeRates.sort((a, b) => a.rate - b.rate);

    const longExchange = exchangeRates[0]; // Самый низкий rate (идем в лонг)
    const shortExchange = exchangeRates[exchangeRates.length - 1]; // Самый высокий rate (идем в шорт)

    return {
      longExchange: longExchange.exchange,
      shortExchange: shortExchange.exchange,
      longRate: longExchange.rate,
      shortRate: shortExchange.rate
    };
  }
}
