// Пример использования Strategy1Service

import { Strategy1Service } from './strategy1.service';
import { SpreadData } from '../interfaces/spread-data.interface';

// Тестовые данные (пример из вашего API)
const testData: SpreadData = {
  ticker: "GPSUSDT",
  binance: {
    fundingRate: -0.00198462,
    nextFundingTime: 1750161600000
  },
  bybit: {
    fundingRate: -0.00406986,
    nextFundingTime: 1750161600000
  },
  bitget: {
    fundingRate: -0.003177,
    nextFundingTime: 1750161600000
  },
  bingx: {
    fundingRate: -0.001371,
    nextFundingTime: 1750161600000
  },
  bitmex: {
    fundingRate: 0.0001,
    nextFundingTime: 1750161600000
  },
  okx: {
    fundingRate: -0.0020958905371468,
    nextFundingTime: 1750161600000
  },
  minFundingRate: -0.00406986,
  maxFundingRate: 0.0001,
  spread: 0.00416986
};

// Пример использования
const strategy1Service = new Strategy1Service();

// 1. Проверка с дефолтными настройками
console.log('Подходит ли Strategy 1 (дефолт):', strategy1Service.isStrategy1Suitable(testData));

// 2. Проверка с кастомными настройками
const customConfig = {
  minFundingDiff: 0.003,  // Более высокий порог
  maxTimeToFunding: 20    // Больше времени до выплаты
};
console.log('Подходит ли Strategy 1 (кастом):', strategy1Service.isStrategy1Suitable(testData, customConfig));

// 3. Получение лучшей возможности
const opportunity = strategy1Service.findBestOpportunity(testData);
if (opportunity) {
  console.log('Лучшая возможность:', {
    ticker: opportunity.ticker,
    pair: `${opportunity.longExchange}/${opportunity.shortExchange}`,
    spread: `${(opportunity.fundingDiff * 100).toFixed(4)}%`,
    timeToFunding: `${opportunity.timeToFunding.toFixed(1)} минут`
  });
}

// 4. Анализ массива тикеров
const allOpportunities = strategy1Service.analyzeAllTickers([testData]);
console.log(`Найдено возможностей: ${allOpportunities.length}`);
