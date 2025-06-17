import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

// Исправляем проблему с crypto для @nestjs/schedule только если необходимо
if (!global.crypto || !global.crypto.randomUUID) {
  const cryptoModule = require('crypto');
  if (!global.crypto) {
    (global as any).crypto = cryptoModule;
  } else if (!global.crypto.randomUUID) {
    global.crypto.randomUUID = cryptoModule.randomUUID;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3005);
}
bootstrap();
