import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: Meta webhook imzosini (X-Hub-Signature-256) tekshirish uchun
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
