import { Injectable, Logger } from '@nestjs/common';
import { SpreadDataService } from './spread-data.service';
import { PositionMonitoring, FundingStabilityCheck } from '../interfaces/position-monitoring.interface';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable()
export class FundingMonitoringService {
  private readonly logger = new Logger(FundingMonitoringService.name);
  private activeMonitoring: Map<string, PositionMonitoring> = new Map();
  private stabilityChecks: FundingStabilityCheck[] = [];

  constructor(
    private readonly spreadDataService: SpreadDataService,
    private readonly googleSheetsService: GoogleSheetsService
  ) {}

  /**
   * Запускает мониторинг позиции с проверкой за 1 минуту до выплаты
   */
  startPositionMonitoring(
    ticker: string,
    exchange: string,
    originalFundingRate: number,
    nextFundingTime: number,
    strategy: 'rate_arbitrage' | 'timing_arbitrage'
  ): string {
    const positionId = `${ticker}_${exchange}_${Date.now()}`;
    const now = Date.now();
    const timeToFunding = nextFundingTime - now;
    const checkTime = timeToFunding - (1 * 60 * 1000); // За 1 минуту до выплаты

    if (checkTime <= 0) {
      this.logger.warn(`⚠️ Слишком поздно для мониторинга ${ticker} на ${exchange} - до выплаты менее 1 минуты`);
      return positionId;
    }

    const position: PositionMonitoring = {
      id: positionId,
      ticker,
      exchange,
      originalFundingRate,
      nextFundingTime,
      entryTime: now,
      strategy,
      checkScheduled: true
    };

    // Устанавливаем setTimeout для проверки за 1 минуту до выплаты
    const timeoutId = setTimeout(() => {
      this.checkFundingStability(positionId);
    }, checkTime);

    position.timeoutId = timeoutId;
    this.activeMonitoring.set(positionId, position);

    this.logger.log(`
🔍 МОНИТОРИНГ ЗАПУЩЕН:
Position ID: ${positionId}
Тикер: ${ticker}
Биржа: ${exchange}
Исходный funding rate: ${(originalFundingRate * 100).toFixed(4)}%
Проверка через: ${(checkTime / 1000 / 60).toFixed(1)} минут (за 1 мин до выплаты)
Время выплаты: ${new Date(nextFundingTime).toLocaleString('ru-RU')}
    `);

    return positionId;
  }

  /**
   * Проверяет стабильность funding rate за 1 минуту до выплаты
   */
  private async checkFundingStability(positionId: string): Promise<void> {
    const position = this.activeMonitoring.get(positionId);
    if (!position) {
      this.logger.error(`Позиция ${positionId} не найдена для проверки стабильности`);
      return;
    }

    try {
      this.logger.log(`🕐 [ПРОВЕРКА СТАБИЛЬНОСТИ] Запрос данных для ${position.ticker} на ${position.exchange}...`);

      // Получаем актуальные данные с меткой что это проверка стабильности
      const spreadsData = await this.spreadDataService.fetchSpreadsData();
      const tickerData = spreadsData.find(data => data.ticker === position.ticker);

      if (!tickerData) {
        this.logger.error(`❌ [ПРОВЕРКА СТАБИЛЬНОСТИ] Тикер ${position.ticker} не найден в данных`);
        this.activeMonitoring.delete(positionId);
        return;
      }

      const exchangeData = tickerData[position.exchange as keyof typeof tickerData] as any;
      if (!exchangeData || exchangeData.fundingRate === null || exchangeData.fundingRate === undefined) {
        this.logger.error(`❌ [ПРОВЕРКА СТАБИЛЬНОСТИ] Данные для ${position.exchange} не найдены`);
        this.activeMonitoring.delete(positionId);
        return;
      }

      const currentFundingRate = exchangeData.fundingRate;
      const changePercent = Math.abs(currentFundingRate - position.originalFundingRate) / Math.abs(position.originalFundingRate) * 100;
      const isStable = changePercent <= 10; // Считаем стабильным если изменение < 10%
      const timeBeforeFunding = (position.nextFundingTime - Date.now()) / 1000 / 60;

      const stabilityCheck: FundingStabilityCheck = {
        positionId,
        ticker: position.ticker,
        exchange: position.exchange,
        originalFundingRate: position.originalFundingRate,
        currentFundingRate,
        changePercent,
        isStable,
        checkTime: new Date(),
        nextFundingTime: new Date(position.nextFundingTime),
        timeBeforeFunding
      };

      this.stabilityChecks.push(stabilityCheck);

      // Записываем результат проверки в Google Sheets
      await this.googleSheetsService.addStabilityCheckToSheet(stabilityCheck);

      // Логируем результат проверки с четкой меткой
      this.logger.log(`
🔍 [РЕЗУЛЬТАТ ПРОВЕРКИ СТАБИЛЬНОСТИ]:
═══════════════════════════════════════════
Position ID: ${positionId}
Тикер: ${position.ticker}
Биржа: ${position.exchange}
Исходный funding rate: ${(position.originalFundingRate * 100).toFixed(4)}%
Текущий funding rate: ${(currentFundingRate * 100).toFixed(4)}%
Изменение: ${changePercent.toFixed(2)}%
Статус: ${isStable ? '✅ СТАБИЛЬНЫЙ' : '⚠️ ИЗМЕНИЛСЯ'}
До выплаты: ${timeBeforeFunding.toFixed(1)} минут
Время проверки: ${stabilityCheck.checkTime.toLocaleString('ru-RU')}
═══════════════════════════════════════════
      `);

      // Удаляем из активного мониторинга
      this.activeMonitoring.delete(positionId);

    } catch (error) {
      this.logger.error(`❌ [ПРОВЕРКА СТАБИЛЬНОСТИ] Ошибка при проверке ${positionId}:`, error.message);
      this.activeMonitoring.delete(positionId);
    }
  }

  /**
   * Отменяет мониторинг позиции
   */
  cancelPositionMonitoring(positionId: string): void {
    const position = this.activeMonitoring.get(positionId);
    if (position && position.timeoutId) {
      clearTimeout(position.timeoutId);
      this.activeMonitoring.delete(positionId);
      this.logger.log(`🗑️ Мониторинг ${positionId} отменен`);
    }
  }

  /**
   * Получить активный мониторинг
   */
  getActiveMonitoring(): PositionMonitoring[] {
    return Array.from(this.activeMonitoring.values());
  }

  /**
   * Получить историю проверок стабильности
   */
  getStabilityChecks(): FundingStabilityCheck[] {
    return [...this.stabilityChecks];
  }

  /**
   * Получить статистику стабильности
   */
  getStabilityStats(): any {
    if (this.stabilityChecks.length === 0) {
      return {
        totalChecks: 0,
        stableCount: 0,
        unstableCount: 0,
        stabilityRate: 0,
        avgChangePercent: 0
      };
    }

    const stableCount = this.stabilityChecks.filter(check => check.isStable).length;
    const avgChangePercent = this.stabilityChecks.reduce((sum, check) => sum + check.changePercent, 0) / this.stabilityChecks.length;

    return {
      totalChecks: this.stabilityChecks.length,
      stableCount,
      unstableCount: this.stabilityChecks.length - stableCount,
      stabilityRate: (stableCount / this.stabilityChecks.length * 100).toFixed(1) + '%',
      avgChangePercent: avgChangePercent.toFixed(2) + '%'
    };
  }

  /**
   * Очистить старые проверки (оставить последние 50)
   */
  cleanupOldChecks(): void {
    if (this.stabilityChecks.length > 50) {
      this.stabilityChecks = this.stabilityChecks.slice(-50);
      this.logger.log('🧹 Очищена история старых проверок стабильности');
    }
  }
}
