import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: Meta webhook imzosini (X-Hub-Signature-256) tekshirish uchun
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // API javoblari TanStack Query tomonidan keshlanadi — brauzerning ETag/304 keshi kerak emas
  app.set('etag', false);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
