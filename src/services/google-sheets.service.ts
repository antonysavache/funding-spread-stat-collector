import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { StrategyDecision } from './strategy-allocator.service';
import { FundingStabilityCheck } from '../interfaces/position-monitoring.interface';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: any;
  private readonly spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  constructor() {
    this.initializeGoogleSheets();
  }

  private async initializeGoogleSheets() {
    try {
      // Проверяем, включены ли Google Sheets
      const enabled = process.env.GOOGLE_SHEETS_ENABLED === 'true';
      if (!enabled) {
        this.logger.log('📊 Google Sheets отключены (GOOGLE_SHEETS_ENABLED=false)');
        return;
      }

      // Получаем credentials из переменной окружения
      const credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
      if (!credentialsJson) {
        this.logger.error('❌ GOOGLE_SHEETS_CREDENTIALS не найдены в .env');
        return;
      }

      const credentials = JSON.parse(credentialsJson);

      // Инициализация Google Sheets API с credentials из env
      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });

      this.logger.log('✅ Google Sheets API инициализирован с существующими credentials');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Google Sheets API:', error.message);
    }
  }

  /**
   * Добавляет торговую сделку в Google Sheets
   */
  async addTradeToSheet(decision: StrategyDecision): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.warn('Google Sheets не настроен, пропускаем запись сделки');
      return;
    }

    try {
      const timestamp = new Date().toLocaleString('ru-RU');
      const opportunity = decision.selectedOpportunities[0]; // Берем первую возможность

      // Подготавливаем данные для записи
      const values = [
        [
          timestamp,                                           // A: Время
          decision.action.toUpperCase(),                      // B: Действие
          opportunity?.ticker || 'N/A',                       // C: Тикер
          opportunity?.longExchange || 'N/A',                 // D: Лонг биржа
          opportunity?.shortExchange || 'N/A',                // E: Шорт биржа
          opportunity?.strategy || 'N/A',                     // F: Стратегия
          (opportunity?.longFundingRate * 100)?.toFixed(4) || '0', // G: Лонг funding %
          (opportunity?.shortFundingRate * 100)?.toFixed(4) || '0', // H: Шорт funding %
          (decision.totalPotentialProfit)?.toFixed(4) || '0', // I: Валовая прибыль $
          (decision.totalCommissions)?.toFixed(4) || '0',     // J: Комиссии $
          (decision.netProfit)?.toFixed(4) || '0',            // K: Чистая прибыль $
          ((decision.netProfit / decision.positionSize) * 100)?.toFixed(4) || '0', // L: Чистая прибыль %
          decision.positionSize?.toString() || '1000',        // M: Размер позиции $
          opportunity?.timeToFunding?.toFixed(1) || '0',      // N: Время до выплаты мин
          decision.reason || 'N/A'                            // O: Причина решения
        ]
      ];

      // Добавляем данные в таблицу
      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'TradingTrades!A:O', // Лист "TradingTrades", колонки A-O
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      };

      await this.sheets.spreadsheets.values.append(request);

      this.logger.log(`📊 Сделка добавлена в Google Sheets: ${opportunity?.ticker} (${decision.action})`);

    } catch (error) {
      this.logger.error('❌ Ошибка записи сделки в Google Sheets:', error.message);
    }
  }

  /**
   * Добавляет результат проверки стабильности funding rate
   */
  async addStabilityCheckToSheet(check: FundingStabilityCheck): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.warn('Google Sheets не настроен, пропускаем запись проверки стабильности');
      return;
    }

    try {
      const values = [
        [
          check.checkTime.toLocaleString('ru-RU'),           // A: Время проверки
          check.ticker,                                       // B: Тикер
          check.exchange,                                     // C: Биржа
          (check.originalFundingRate * 100).toFixed(4),      // D: Исходный funding %
          (check.currentFundingRate * 100).toFixed(4),       // E: Текущий funding %
          check.changePercent.toFixed(2),                    // F: Изменение %
          check.isStable ? 'СТАБИЛЬНЫЙ' : 'ИЗМЕНИЛСЯ',       // G: Статус
          check.timeBeforeFunding.toFixed(1),                // H: До выплаты мин
          check.nextFundingTime.toLocaleString('ru-RU'),     // I: Время выплаты
          check.positionId                                    // J: ID позиции
        ]
      ];

      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'TradingStability!A:J', // Лист "TradingStability", колонки A-J
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      };

      await this.sheets.spreadsheets.values.append(request);

      this.logger.log(`📊 Проверка стабильности добавлена в Google Sheets: ${check.ticker} на ${check.exchange} (${check.isStable ? 'стабильный' : 'изменился'})`);

    } catch (error) {
      this.logger.error('❌ Ошибка записи проверки стабильности в Google Sheets:', error.message);
    }
  }

  /**
   * Создает заголовки для листов (вызывать один раз для настройки)
   */
  async createHeaders(): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.error('Google Sheets не настроен');
      return;
    }

    try {
      // Заголовки для листа Trades
      const tradesHeaders = [
        [
          'Время',
          'Действие', 
          'Тикер',
          'Лонг биржа',
          'Шорт биржа',
          'Стратегия',
          'Лонг funding %',
          'Шорт funding %',
          'Валовая прибыль $',
          'Комиссии $',
          'Чистая прибыль $',
          'Чистая прибыль %',
          'Размер позиции $',
          'До выплаты мин',
          'Причина'
        ]
      ];

      // Заголовки для листа Stability
      const stabilityHeaders = [
        [
          'Время проверки',
          'Тикер',
          'Биржа',
          'Исходный funding %',
          'Текущий funding %',
          'Изменение %',
          'Статус',
          'До выплаты мин',
          'Время выплаты',
          'ID позиции'
        ]
      ];

      // Добавляем заголовки в лист TradingTrades
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'TradingTrades!A1:O1',
        valueInputOption: 'RAW',
        resource: {
          values: tradesHeaders
        }
      });

      // Добавляем заголовки в лист TradingStability
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'TradingStability!A1:J1',
        valueInputOption: 'RAW',
        resource: {
          values: stabilityHeaders
        }
      });

      this.logger.log('✅ Заголовки созданы в Google Sheets');

    } catch (error) {
      this.logger.error('❌ Ошибка создания заголовков в Google Sheets:', error.message);
    }
  }

  /**
   * Добавляет статистику работы бота
   */
  async addDailyStats(stats: any): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.warn('Google Sheets не настроен, пропускаем запись статистики');
      return;
    }

    try {
      const today = new Date().toLocaleDateString('ru-RU');
      
      const values = [
        [
          today,                                              // A: Дата
          stats.totalAnalyzes || 0,                          // B: Всего анализов
          stats.strategy1Entries || 0,                       // C: Входы Strategy 1
          stats.strategy2Entries || 0,                       // D: Входы Strategy 2
          stats.bothStrategies || 0,                         // E: Оба стратегии
          stats.skipped || 0,                                // F: Пропущено
          stats.successRate || '0%',                         // G: Успешность
          stats.totalNetProfit?.toFixed(4) || '0',          // H: Общая чистая прибыль $
          stats.totalCommissions?.toFixed(4) || '0',        // I: Общие комиссии $
          stats.avgProfit?.toFixed(4) || '0',               // J: Средняя прибыль $
          stats.stabilityChecks || 0,                        // K: Проверок стабильности
          stats.stableRate || '0%'                          // L: Процент стабильности
        ]
      ];

      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'TradingStats!A:L',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      };

      await this.sheets.spreadsheets.values.append(request);

      this.logger.log(`📊 Дневная статистика добавлена в Google Sheets: ${today}`);

    } catch (error) {
      this.logger.error('❌ Ошибка записи дневной статистики в Google Sheets:', error.message);
    }
  }

  /**
   * Проверяет подключение к Google Sheets
   */
  async testConnection(): Promise<boolean> {
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.error('Google Sheets не настроен');
      return false;
    }

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      this.logger.log(`✅ Подключение к Google Sheets успешно: ${response.data.properties.title}`);
      return true;
    } catch (error) {
      this.logger.error('❌ Ошибка подключения к Google Sheets:', error.message);
      return false;
    }
  }
}
