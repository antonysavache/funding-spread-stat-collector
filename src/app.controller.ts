import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Trading Statistics Bot</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; text-align: center; }
        .api-list { background: #ecf0f1; padding: 20px; border-radius: 5px; }
        .endpoint { margin: 10px 0; padding: 10px; background: white; border-radius: 5px; }
        .method { display: inline-block; width: 60px; font-weight: bold; color: white; padding: 3px 8px; border-radius: 3px; font-size: 12px; }
        .get { background: #27ae60; }
        .post { background: #3498db; }
        .delete { background: #e74c3c; }
        .path { font-family: monospace; margin-left: 10px; }
        .description { color: #7f8c8d; font-size: 14px; margin-top: 5px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 14px; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 Trading Statistics Bot</h1>
        <p>Система автоматической торговли по спредам фандинга. Мониторинг каждые 2 минуты, вход за 10 минут до выплаты, выход через 4 минуты после выплаты.</p>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">0.15%</div>
                <div class="stat-label">Минимальный спред</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">2 мин</div>
                <div class="stat-label">Частота проверки</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$1000</div>
                <div class="stat-label">Размер позиции</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">7</div>
                <div class="stat-label">Поддерживаемых бирж</div>
            </div>
        </div>

        <h2>📡 API Endpoints</h2>
        <div class="api-list">
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/trading/opportunities</span>
                <div class="description">Получить текущие торговые возможности с расчетом комиссий</div>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/trading/positions</span>
                <div class="description">Получить все позиции (активные и закрытые)</div>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/trading/positions/active</span>
                <div class="description">Получить только активные позиции</div>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/trading/statistics</span>
                <div class="description">Получить статистику торговли (общая прибыль, комиссии, успешность)</div>
            </div>
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="path">/api/trading/check</span>
                <div class="description">Принудительно запустить проверку торговых возможностей</div>
            </div>
            <div class="endpoint">
                <span class="method delete">DELETE</span>
                <span class="path">/api/trading/history</span>
                <div class="description">Очистить историю закрытых позиций</div>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/trading/health</span>
                <div class="description">Проверка здоровья системы</div>
            </div>
        </div>

        <h2>🏦 Поддерживаемые биржи и комиссии</h2>
        <div style="background: #ecf0f1; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 14px;">
            <strong>Мейкер/Тейкер комиссии:</strong><br>
            • Binance: 0.02%/0.04%<br>
            • Bybit: 0.02%/0.055%<br>
            • Bitget: 0.02%/0.06%<br>
            • BingX: 0.02%/0.05%<br>
            • BitMEX: -0.01%/0.075% (рибейт для мейкера)<br>
            • OKX: 0.02%/0.05%<br>
            • MEXC: участвует в мониторинге
        </div>

        <h2>⚙️ Логика работы</h2>
        <ol>
            <li><strong>Мониторинг:</strong> Каждые 2 минуты запрос к API спредов</li>
            <li><strong>Фильтрация:</strong> Отбор спредов ≥ 0.15%</li>
            <li><strong>Вход в позицию:</strong> За 10 минут до выплаты фандинга</li>
            <li><strong>Выход из позиции:</strong> Через 4 минуты после выплаты</li>
            <li><strong>Учет комиссий:</strong> Сравнение рыночных и лимитных ордеров</li>
            <li><strong>Статистика:</strong> Накопление данных о прибыльности</li>
        </ol>

        <div style="margin-top: 30px; padding: 15px; background: #d5f4e6; border-radius: 5px; text-align: center;">
            <strong>🚀 Бот запущен и работает!</strong><br>
            Проверьте <a href="/api/trading/health">/api/trading/health</a> для статуса системы
        </div>
    </div>
</body>
</html>
    `;
  }
}
