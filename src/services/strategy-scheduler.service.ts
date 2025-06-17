import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SpreadDataService } from './spread-data.service';
import { Strategy1Service } from './strategy1.service';
import { Strategy2Service } from './strategy2.service';
import { StrategyAllocatorService, StrategyDecision } from './strategy-allocator.service';
import { CommissionService } from './commission.service';
import { FundingMonitoringService } from './funding-monitoring.service';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable()
export class StrategySchedulerService {
  private readonly logger = new Logger(StrategySchedulerService.name);
  private decisions: StrategyDecision[] = [];

  constructor(
    private readonly spreadDataService: SpreadDataService,
    private readonly strategy1Service: Strategy1Service,
    private readonly strategy2Service: Strategy2Service,
    private readonly strategyAllocator: StrategyAllocatorService,
    private readonly commissionService: CommissionService,
    private readonly fundingMonitoring: FundingMonitoringService,
    private readonly googleSheetsService: GoogleSheetsService
  ) {}

  @Cron('*/2 * * * *') // Каждые 2 минуты
  async analyzeStrategies(): Promise<void> {
    this.logger.log('🕐 Запуск полного анализа стратегий...');
    
    try {
      // 1. Получаем данные с endpoint
      const spreadsData = await this.spreadDataService.fetchSpreadsData();
      
      if (!spreadsData || spreadsData.length === 0) {
        this.logger.warn('Нет данных для анализа стратегий');
        return;
      }

      this.logger.log(`📊 Получено ${spreadsData.length} тикеров для анализа`);

      // 2. Анализ Strategy 1 (Rate Arbitrage)
      const strategy1Opportunities = this.strategy1Service.analyzeAllTickers(spreadsData);
      
      // 3. Анализ Strategy 2 (Timing Arbitrage)
      const strategy2Opportunities = this.strategy2Service.analyzeAllTickers(spreadsData);

      // 4. Strategy Allocator принимает решение
      const decision = this.strategyAllocator.analyzeAndDecide(
        strategy1Opportunities, 
        strategy2Opportunities
      );

      // 5. Сохраняем решение для статистики
      this.decisions.push(decision);

      // 6. Записываем решение в Google Sheets
      await this.googleSheetsService.addTradeToSheet(decision);

      // 7. Выполняем действие на основе решения
      await this.executeDecision(decision);

      // 7. Ограничиваем историю решений (последние 100)
      if (this.decisions.length > 100) {
        this.decisions = this.decisions.slice(-100);
      }

      // 8. Очищаем старые проверки мониторинга
      this.fundingMonitoring.cleanupOldChecks();

    } catch (error) {
      this.logger.error('❌ Ошибка при анализе стратегий:', error.message);
    }
  }

  /**
   * Выполняет действие на основе решения Strategy Allocator
   */
  private async executeDecision(decision: StrategyDecision): Promise<void> {
    switch (decision.action) {
      case 'enter_strategy1':
        this.logger.log(`🚀 ВХОД В STRATEGY 1: ${decision.selectedOpportunities[0].ticker}`);
        this.simulateTradeEntry(decision.selectedOpportunities[0], 'Strategy 1');
        break;

      case 'enter_strategy2':
        this.logger.log(`🚀 ВХОД В STRATEGY 2: ${decision.selectedOpportunities[0].ticker}`);
        this.simulateTradeEntry(decision.selectedOpportunities[0], 'Strategy 2');
        break;

      case 'enter_both':
        this.logger.log(`🚀 ВХОД В ОБЕ СТРАТЕГИИ: ${decision.selectedOpportunities.map(o => o.ticker).join(', ')}`);
        decision.selectedOpportunities.forEach((opp, index) => {
          const strategyName = opp.strategy === 'rate_arbitrage' ? 'Strategy 1' : 'Strategy 2';
          this.simulateTradeEntry(opp, strategyName);
        });
        break;

      case 'skip':
        this.logger.log(`⏭️ ПРОПУСК: ${decision.reason}`);
        break;
    }
  }

  /**
   * Имитирует вход в сделку
   */
  private simulateTradeEntry(opportunity: any, strategyName: string): void {
    const positionSize = 1000; // $1000
    
    // Рассчитываем комиссии
    const marketCommissions = this.commissionService.calculateCommissions(
      opportunity.longExchange,
      opportunity.shortExchange,
      positionSize,
      false
    );
    
    const limitMarketCommissions = this.commissionService.calculateCommissions(
      opportunity.longExchange,
      opportunity.shortExchange,
      positionSize,
      true
    );

    const bestCommissions = limitMarketCommissions.totalCommission < marketCommissions.totalCommission 
      ? limitMarketCommissions 
      : marketCommissions;

    const grossProfit = opportunity.fundingDiff * positionSize;
    const netProfit = grossProfit - bestCommissions.totalCommission;
    
    this.logger.log(`
💰 ИМИТАЦИЯ ВХОДА В СДЕЛКУ (${strategyName}):
Тикер: ${opportunity.ticker}
Биржи: ${opportunity.longExchange} / ${opportunity.shortExchange}
Размер позиции: $${positionSize}
Валовая прибыль: $${grossProfit.toFixed(4)} (${(opportunity.fundingDiff * 100).toFixed(4)}%)
Комиссии (${bestCommissions.commissionType}): $${bestCommissions.totalCommission.toFixed(4)}
  ├─ Вход лонг: $${bestCommissions.entryCommissionLong.toFixed(4)}
  ├─ Вход шорт: $${bestCommissions.entryCommissionShort.toFixed(4)}
  ├─ Выход лонг: $${bestCommissions.exitCommissionLong.toFixed(4)}
  └─ Выход шорт: $${bestCommissions.exitCommissionShort.toFixed(4)}
ЧИСТАЯ ПРИБЫЛЬ: $${netProfit.toFixed(4)} (${(netProfit/positionSize*100).toFixed(4)}%)
До выплаты: ${opportunity.timeToFunding.toFixed(1)} минут
Время: ${new Date().toLocaleString('ru-RU')}
    `);

    // 🔍 ЗАПУСКАЕМ МОНИТОРИНГ FUNDING RATE
    // Для Strategy 1 - мониторим обе биржи
    if (opportunity.strategy === 'rate_arbitrage') {
      this.fundingMonitoring.startPositionMonitoring(
        opportunity.ticker,
        opportunity.longExchange,
        opportunity.longFundingRate,
        opportunity.nextFundingTime,
        'rate_arbitrage'
      );
      
      this.fundingMonitoring.startPositionMonitoring(
        opportunity.ticker,
        opportunity.shortExchange,
        opportunity.shortFundingRate,
        opportunity.nextFundingTime,
        'rate_arbitrage'
      );
    } 
    // Для Strategy 2 - мониторим первую биржу (с ближайшей выплатой)
    else if (opportunity.strategy === 'timing_arbitrage') {
      this.fundingMonitoring.startPositionMonitoring(
        opportunity.ticker,
        opportunity.longExchange, // Первая биржа по времени
        opportunity.longFundingRate,
        opportunity.nextFundingTime,
        'timing_arbitrage'
      );
    }
  }

  @Cron('*/10 * * * *') // Каждые 10 минут - расширенная статистика
  async logDetailedStatistics(): Promise<void> {
    try {
      // Получаем свежие данные для статистики
      const spreadsData = await this.spreadDataService.fetchSpreadsData();
      
      if (!spreadsData || spreadsData.length === 0) {
        return;
      }

      // Анализируем текущую ситуацию
      const strategy1Opportunities = this.strategy1Service.analyzeAllTickers(spreadsData);
      const strategy2Opportunities = this.strategy2Service.analyzeAllTickers(spreadsData);

      // Статистика по решениям
      const decisionStats = this.decisions.length > 0 
        ? this.strategyAllocator.getDecisionStats(this.decisions)
        : null;

      // Статистика мониторинга funding rate
      const monitoringStats = this.fundingMonitoring.getStabilityStats();
      const activeMonitoring = this.fundingMonitoring.getActiveMonitoring();

      // Общая статистика по рынку
      const totalTickers = spreadsData.length;
      const spreads = spreadsData.map(t => t.spread).filter(s => s > 0);
      const avgSpread = spreads.length > 0 ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
      const maxSpread = spreads.length > 0 ? Math.max(...spreads) : 0;

      // Статистика по биржам
      const exchangeStats = this.calculateExchangeStats(spreadsData);

      this.logger.log(`
📈 ДЕТАЛЬНАЯ СТАТИСТИКА РЫНКА:
═══════════════════════════════════════════
📊 ОБЩИЕ ДАННЫЕ:
Всего тикеров: ${totalTickers}
Средний спред: ${(avgSpread * 100).toFixed(4)}%
Максимальный спред: ${(maxSpread * 100).toFixed(4)}%

🎯 СТРАТЕГИИ:
Strategy 1 возможностей: ${strategy1Opportunities.length}
Strategy 2 возможностей: ${strategy2Opportunities.length}

🏦 БИРЖИ:
${Object.entries(exchangeStats).map(([exchange, count]) => 
  `${exchange}: ${count} тикеров`
).join('\n')}

${decisionStats ? `
🎮 СТАТИСТИКА РЕШЕНИЙ (последние ${this.decisions.length}):
Всего анализов: ${decisionStats.total}
Strategy 1 входов: ${decisionStats.strategy1}
Strategy 2 входов: ${decisionStats.strategy2}
Оба стратегии: ${decisionStats.both}
Пропущено: ${decisionStats.skipped}
Успешность: ${decisionStats.successRate}
Средняя потенциальная прибыль: ${decisionStats.avgPotentialProfit}
` : ''}

🔍 МОНИТОРИНГ FUNDING RATE:
Активных проверок: ${activeMonitoring.length}
Всего проверок: ${monitoringStats.totalChecks}
Стабильных: ${monitoringStats.stableCount}
Нестабильных: ${monitoringStats.unstableCount}
Стабильность: ${monitoringStats.stabilityRate}
Среднее изменение: ${monitoringStats.avgChangePercent}
═══════════════════════════════════════════
      `);

    } catch (error) {
      this.logger.error('Ошибка при выводе детальной статистики:', error.message);
    }
  }

  private calculateExchangeStats(spreadsData: any[]): Record<string, number> {
    const exchanges = ['binance', 'bybit', 'bitget', 'bingx', 'mexc', 'bitmex', 'okx'];
    const stats: Record<string, number> = {};

    exchanges.forEach(exchange => {
      stats[exchange] = spreadsData.filter(ticker => 
        ticker[exchange] && ticker[exchange].fundingRate !== null && ticker[exchange].fundingRate !== undefined
      ).length;
    });

    return stats;
  }

  /**
   * Принудительный запуск анализа (для тестирования)
   */
  async manualAnalysis(): Promise<void> {
    this.logger.log('🔧 Запущен принудительный полный анализ стратегий');
    await this.analyzeStrategies();
  }

  /**
   * Получить историю решений
   */
  getDecisionHistory(): StrategyDecision[] {
    return [...this.decisions];
  }

  /**
   * Очистить историю решений
   */
  clearDecisionHistory(): void {
    this.decisions = [];
    this.logger.log('🗑️ История решений очищена');
  }
}
