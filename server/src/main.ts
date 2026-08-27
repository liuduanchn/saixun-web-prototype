import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Phase C-1: 安全头（默认 CSP 对纯 JSON API 无害）
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Phase C-1: CORS 由全开改为白名单（可用 CORS_ORIGINS 环境变量覆盖）
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`🚀 saixun-server listening on http://localhost:${port}`);
}

bootstrap();
