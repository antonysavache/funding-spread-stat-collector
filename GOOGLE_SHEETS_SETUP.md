# Настройка Google Sheets для записи торговых данных

## 📋 Шаги настройки:

### 1. Создание Google Cloud проекта

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google Sheets API:
   - Перейдите в "APIs & Services" > "Library"
   - Найдите "Google Sheets API" и включите его

### 2. Создание Service Account

1. Перейдите в "APIs & Services" > "Credentials"
2. Нажмите "Create Credentials" > "Service Account"
3. Заполните название и описание
4. Нажмите "Create and Continue"
5. Добавьте роль "Editor" (для записи в таблицы)
6. Нажмите "Done"

### 3. Генерация ключа

1. В списке Service Accounts нажмите на созданный аккаунт
2. Перейдите во вкладку "Keys"
3. Нажмите "Add Key" > "Create new key"
4. Выберите формат JSON и нажмите "Create"
5. Скачайте файл ключа и сохраните как `google-service-account.json`

### 4. Создание Google Sheets таблицы

1. Создайте новую таблицу в [Google Sheets](https://sheets.google.com)
2. Создайте 3 листа с названиями:
   - `Trades` (для торговых сделок)
   - `Stability` (для проверок стабильности funding rate)
   - `DailyStats` (для дневной статистики)
3. Скопируйте ID таблицы из URL (часть между `/d/` и `/edit`)

### 5. Настройка доступа

1. Откройте созданную таблицу
2. Нажмите "Share" в правом верхнем углу
3. Добавьте email вашего Service Account (из JSON файла, поле "client_email")
4. Дайте права "Editor"

### 6. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json
```

### 7. Инициализация заголовков

После первого запуска выполните команду для создания заголовков в таблице:

```typescript
// В коде можно вызвать один раз
await googleSheetsService.createHeaders();
```

## 📊 Структура данных

### Лист "Trades":
- Время, Действие, Тикер, Лонг биржа, Шорт биржа, Стратегия
- Лонг funding %, Шорт funding %, Валовая прибыль $, Комиссии $
- Чистая прибыль $, Чистая прибыль %, Размер позиции $, До выплаты мин, Причина

### Лист "Stability":
- Время проверки, Тикер, Биржа, Исходный funding %, Текущий funding %
- Изменение %, Статус, До выплаты мин, Время выплаты, ID позиции

### Лист "DailyStats":
- Дата, Всего анализов, Входы Strategy 1, Входы Strategy 2, Оба стратегии
- Пропущено, Успешность, Общая чистая прибыль $, Общие комиссии $
- Средняя прибыль $, Проверок стабильности, Процент стабильности

## 🔧 Тестирование

Для проверки подключения можно использовать:

```typescript
await googleSheetsService.testConnection();
```

## ⚠️ Важные моменты

- Файл `google-service-account.json` должен быть в `.gitignore`
- Service Account email должен иметь доступ к таблице
- ID таблицы должен быть корректным
- Google Sheets API должен быть включен в проекте

## 🎯 Результат

После настройки все торговые сделки и проверки стабильности будут автоматически записываться в Google Sheets для дальнейшего анализа и отчетности.
