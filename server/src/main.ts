import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AppModule } from './app.module';
import { htmlPages, pageGate, securityHeaders } from './common/page-gate';
import { Db } from './database/db';
import { runMigrations } from './database/migrate';
import { AuthService, SESSION_COOKIE } from './modules/users';

const WEB_BUILD_DIR = path.resolve(__dirname, '..', '..', 'web', 'out');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1); // Railway terminates HTTPS in front of the app.
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cookieParser());
  // Document uploads (PDFs, and .eml capital-event emails) arrive as the raw file body (no multipart parsing),
  // capped just above the 20 MB document limit.
  app.useBodyParser('raw', { type: 'application/pdf', limit: '21mb' });
  app.useBodyParser('raw', { type: 'message/rfc822', limit: '21mb' });
  app.setGlobalPrefix('api');

  await runMigrations(app.get(Db));
  const auth = app.get(AuthService);
  await auth.ensureAdminFromEnv();

  if (existsSync(WEB_BUILD_DIR)) {
    app.use(pageGate(async (req) => (await auth.userForToken(req.cookies?.[SESSION_COOKIE])) !== null));
    app.use(htmlPages(WEB_BUILD_DIR));
    app.useStaticAssets(WEB_BUILD_DIR, { index: false, redirect: false });
  } else {
    console.warn(`Web build not found at ${WEB_BUILD_DIR}. Run "npm run build" at the repo root to serve the pages.`);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`NKSquared Portfolio Manager listening on port ${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
