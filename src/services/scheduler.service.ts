import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TradingService } from './trading.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly tradingService: TradingService) {}

  @Cron('*/2 * * * *') // Каждые 2 минуты
  async handleTradingCron(): Promise<void> {
    this.logger.log('🕐 Запуск проверки торговых возможностей...');
    
    try {
      await this.tradingService.checkForTradingOpportunities();
    } catch (error) {
      this.logger.error('Ошибка в планировщике торговли:', error.message);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES) // Каждые 10 минут - статистика
  async handleStatsCron(): Promise<void> {
    try {
      const stats = this.tradingService.getTradingStatistics();
      
      if (stats.totalTrades > 0) {
        this.logger.log(`
📊 Статистика торговли:
Всего сделок: ${stats.totalTrades}
Активных: ${stats.activeTrades}
Прибыльных: ${stats.profitableTrades}/${stats.totalTrades} (${stats.successRate.toFixed(1)}%)
Получено фандинга: $${stats.totalFundingReceived.toFixed(2)}
Уплачено комиссий: $${stats.totalCommissionsPaid.toFixed(2)}
Чистая прибыль: $${stats.netProfit.toFixed(2)}
Средний спред: ${stats.avgSpread.toFixed(4)}%
Среднее время удержания: ${stats.avgHoldingTime.toFixed(1)} мин

Маркет ордера: ${stats.marketCommissionStats.totalTrades} сделок, прибыль: $${stats.marketCommissionStats.netProfit.toFixed(2)}
Лимит+Маркет: ${stats.limitMarketCommissionStats.totalTrades} сделок, прибыль: $${stats.limitMarketCommissionStats.netProfit.toFixed(2)}
        `);
      }
    } catch (error) {
      this.logger.error('Ошибка при выводе статистики:', error.message);
    }
  }
}
