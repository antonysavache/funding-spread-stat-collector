import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { StrategyDecision } from './strategy-allocator.service';
import { FundingStabilityCheck } from '../interfaces/position-monitoring.interface';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: any;
  private readonly spreadsheetId = '1BD3mYqiEEbcadDSqoiyS6rk8M9ZTAbeYsp3OHHV4Lug';
  private readonly enabled = true; // Включаем Google Sheets по умолчанию

  constructor() {
    this.logger.log('🚀 GoogleSheetsService конструктор вызван');
    this.initializeGoogleSheets();
  }

  private async initializeGoogleSheets() {
    this.logger.log('🔧 initializeGoogleSheets метод вызван');
    try {
      // Проверяем, включены ли Google Sheets
      if (!this.enabled) {
        this.logger.log('📊 Google Sheets отключены');
        return;
      }

      this.logger.log('🔧 Начинаем инициализацию Google Sheets...');

      // Получаем credentials из переменной окружения
      const credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
      if (!credentialsJson) {
        this.logger.error('❌ GOOGLE_SHEETS_CREDENTIALS не найдены в .env');
        return;
      }

      this.logger.log('🔑 Credentials найдены, парсим JSON...');
      const credentials = JSON.parse(credentialsJson);
      this.logger.log('✅ JSON успешно распарсен');

      // Инициализация Google Sheets API с credentials из env
      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      this.logger.log(`📊 Google Sheets объект создан, spreadsheetId: ${this.spreadsheetId}`);

      this.logger.log('✅ Google Sheets API инициализирован с существующими credentials');
      
      // Добавляем тестовую запись для проверки работы
      setTimeout(async () => {
        this.logger.log('⏰ Запускаем тестовую запись через 3 секунды...');
        await this.addTestRecord();
      }, 3000); // Небольшая задержка для завершения инициализации

    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Google Sheets API:', error.message);
      this.logger.error('❌ Полная ошибка:', error);
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

    // ЗАПИСЫВАЕМ ТОЛЬКО ФАКТИЧЕСКИЕ СДЕЛКИ, НЕ ПРОПУСКИ
    if (decision.action === 'skip') {
      this.logger.log('🔇 Пропускаем запись в Google Sheets - решение: SKIP');
      return;
    }

    try {
      const timestamp = new Date().toLocaleString('ru-RU');
      const opportunity = decision.selectedOpportunities[0]; // Берем первую возможность

      if (!opportunity) {
        this.logger.warn('Нет данных о возможности для записи в таблицу');
        return;
      }

      // Подготавливаем данные для записи согласно новой структуре колонок
      const values = [
        [
          timestamp,                                           // A: date
          opportunity.strategy === 'rate_arbitrage' ? 'Strategy 1' : 'Strategy 2', // B: strategy
          opportunity.longExchange || 'N/A',                 // C: exchange 1
          opportunity.shortExchange || 'N/A',                // D: exchange 2  
          opportunity.ticker || 'N/A',                       // E: coin
          (opportunity.longFundingRate * 100)?.toFixed(4) + '%' || '0%', // F: funding before 4 min exchange 1
          '', // G: funding before 1 min exchange 1 (будет заполнено при проверке стабильности)
          (opportunity.shortFundingRate * 100)?.toFixed(4) + '%' || '0%', // H: funding before 4 min exchange 2
          '', // I: funding before 1 min exchange 2 (будет заполнено при проверке стабильности)
          (decision.totalPotentialProfit)?.toFixed(4) || '0', // J: dirty pnl
          (decision.totalCommissions / 2)?.toFixed(4) || '0', // K: commission 1 (половина от общих комиссий)
          (decision.totalCommissions / 2)?.toFixed(4) || '0', // L: commission 2 (половина от общих комиссий)
          (decision.netProfit)?.toFixed(4) || '0'             // M: clean pnl
        ]
      ];

      // Добавляем данные в таблицу (используем колонки A-M)
      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'A:M', // Колонки A-M как в новой структуре
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      };

      await this.sheets.spreadsheets.values.append(request);

      this.logger.log(`📊 РЕАЛЬНАЯ СДЕЛКА добавлена в Google Sheets: ${opportunity?.ticker} (${decision.action})`);

    } catch (error) {
      this.logger.error('❌ Ошибка записи сделки в Google Sheets:', error.message);
    }
  }

  /**
   * Обновляет колонку "funding before 1 min" при проверке стабильности
   */
  async updateFundingBefore1Min(check: FundingStabilityCheck): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.warn('Google Sheets не настроен, пропускаем обновление funding before 1 min');
      return;
    }

    try {
      // Находим последнюю строку с нужным тикером и биржей
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:M'
      });

      const rows = response.data.values || [];
      
      // Ищем строку с нужным тикером (колонка E) - идем снизу вверх для последней записи
      for (let i = rows.length - 1; i >= 1; i--) { // Начинаем с конца, пропускаем заголовок
        const row = rows[i];
        const coin = row[4]; // Колонка E (coin)
        
        if (coin === check.ticker) {
          // Обновляем колонку G (funding before 1 min)
          const rowNumber = i + 1; // +1 потому что индексы начинаются с 0, а строки с 1
          
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `G${rowNumber}`,
            valueInputOption: 'RAW',
            resource: {
              values: [[(check.currentFundingRate * 100).toFixed(4) + '%']]
            }
          });

          this.logger.log(`📊 Обновлен funding before 1 min для ${check.ticker}: ${(check.currentFundingRate * 100).toFixed(4)}%`);
          break;
        }
      }

    } catch (error) {
      this.logger.error('❌ Ошибка обновления funding before 1 min в Google Sheets:', error.message);
    }
  }

  /**
   * Добавляет тестовую запись для проверки работы Google Sheets
   */
  async addTestRecord(): Promise<void> {
    this.logger.log(`🔍 Проверка настроек: sheets=${!!this.sheets}, spreadsheetId=${this.spreadsheetId}`);
    
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.warn('Google Sheets не настроен, пропускаем тестовую запись');
      this.logger.warn(`Детали: sheets=${!!this.sheets}, spreadsheetId=${this.spreadsheetId}`);
      return;
    }

    try {
      const timestamp = new Date().toLocaleString('ru-RU');
      
      // Тестовые данные
      const values = [
        [
          timestamp,                    // A: date
          'TEST',                       // B: strategy
          'binance',                    // C: exchange 1
          'bybit',                      // D: exchange 2
          'TESTUSDT',                   // E: coin
          '0.2500%',                    // F: funding before 4 min exchange 1
          '0.2450%',                    // G: funding before 1 min exchange 1
          '0.2600%',                    // H: funding before 4 min exchange 2
          '0.2550%',                    // I: funding before 1 min exchange 2
          '2.50',                       // J: dirty pnl
          '0.75',                       // K: commission 1
          '0.70',                       // L: commission 2
          '1.05'                        // M: clean pnl
        ]
      ];

      this.logger.log('📝 Попытка записи тестовых данных в Google Sheets...');

      // Добавляем тестовую запись
      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'A:M',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: values
        }
      };

      await this.sheets.spreadsheets.values.append(request);

      this.logger.log('✅ Тестовая запись добавлена в Google Sheets успешно!');

    } catch (error) {
      this.logger.error('❌ Ошибка добавления тестовой записи в Google Sheets:', error.message);
      this.logger.error('❌ Полная ошибка:', error);
    }
  }
}
