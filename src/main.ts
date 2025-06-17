import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

// Загружаем переменные окружения
dotenv.config();

// Исправляем проблему с crypto для @nestjs/schedule
(global as any).crypto = crypto;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3005);
}
bootstrap();
