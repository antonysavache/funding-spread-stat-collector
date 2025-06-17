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
    this.initializeGoogleSheets();
  }

  private async initializeGoogleSheets() {
    try {
      // Проверяем, включены ли Google Sheets
      if (!this.enabled) {
        this.logger.log('📊 Google Sheets отключены');
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
      
      // Добавляем тестовую запись для проверки работы
      setTimeout(async () => {
        await this.addTestRecord();
      }, 3000); // Небольшая задержка для завершения инициализации

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

      if (!opportunity) {
        this.logger.warn('Нет данных о возможности для записи в таблицу');
        return;
      }

      // Подготавливаем данные для записи согласно вашей структуре колонок
      const values = [
        [
          timestamp,                                           // A: date
          opportunity.strategy === 'rate_arbitrage' ? 'Strategy 1' : 'Strategy 2', // B: strategy
          opportunity.longExchange || 'N/A',                 // C: exchange 1
          opportunity.shortExchange || 'N/A',                // D: exchange 2  
          opportunity.ticker || 'N/A',                       // E: coin
          (opportunity.longFundingRate * 100)?.toFixed(4) + '%' || '0%', // F: funding before 4 min
          '', // G: funding before 1 min (будет заполнено при проверке стабильности)
          (decision.totalPotentialProfit)?.toFixed(4) || '0', // H: dirty pnl
          (decision.totalCommissions)?.toFixed(4) || '0',     // I: commission 1
          '', // J: commission 2 (если нужно разделить комиссии по биржам)
          (decision.netProfit)?.toFixed(4) || '0'             // K: clean pnl
        ]
      ];

      // Добавляем данные в таблицу (используем первый лист, так как видно что у вас один лист)
      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'A:K', // Колонки A-K как на скриншоте
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
        range: 'A:K'
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
    if (!this.sheets || !this.spreadsheetId) {
      this.logger.warn('Google Sheets не настроен, пропускаем тестовую запись');
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
          '0.2500%',                    // F: funding before 4 min
          '0.2450%',                    // G: funding before 1 min
          '2.50',                       // H: dirty pnl
          '1.45',                       // I: commission 1
          '',                           // J: commission 2
          '1.05'                        // K: clean pnl
        ]
      ];

      // Добавляем тестовую запись
      const request = {
        spreadsheetId: this.spreadsheetId,
        range: 'A:K',
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
    }
  }
}
