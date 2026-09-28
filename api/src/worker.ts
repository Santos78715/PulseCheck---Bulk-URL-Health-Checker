import { NestFactory } from '@nestjs/core';
import { UrlCheckModule } from './url-check/url-check.module.js';

async function bootstrap() {
  await NestFactory.createApplicationContext(UrlCheckModule);

  console.log('Worker started');
}

bootstrap();
