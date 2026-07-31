import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Disable the built-in body parser (default 100KB limit) so we can register
    // our own with a limit large enough for base64 avatar data URLs.
    bodyParser: false,
  });

  // Use pino as the app logger.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const appCfg = config.get<AppConfig>('app')!;

  // Trust exactly the configured number of proxy hops so req.ip / rate limiting
  // are accurate without letting clients spoof X-Forwarded-For. The correct
  // value is a deployment property (TRUST_PROXY_HOPS), never guessed.
  app.set('trust proxy', appCfg.trustProxyHops);
  app.disable('x-powered-by');

  // JSON bodies must fit a base64 avatar data URL (Express default is only 100KB).
  // 1 MB is ample for avatars (~700KB max) + normal payloads; multipart uploads
  // are bounded separately by multer (MAX_UPLOAD_BYTES).
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Security headers.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: appCfg.isProduction
        ? { maxAge: 15552000, includeSubDomains: true, preload: true }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Strict CORS: only the configured frontend origins, no credentials/cookies.
  // The admin API key is intentionally NOT allow-listed here — admin routes are
  // server-to-server and the key must never live in browser JavaScript.
  app.enableCors({
    origin: appCfg.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  });

  // Global input validation: reject unknown props, strip extras, coerce types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Do not echo submitted values back in validation errors.
      validationError: { target: false, value: false },
    }),
  );

  // URI versioning: all routes live under /api/v1.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableShutdownHooks();

  await app.listen(appCfg.port);
  const logger = app.get(Logger);
  logger.log(`PortaGast backend listening on ${appCfg.appUrl} (env=${appCfg.env})`);
}

bootstrap().catch((err) => {
  // Ensure a failed startup exits non-zero with a readable reason.
  // eslint-disable-next-line no-console
  console.error('Fatal: backend failed to start', err);
  process.exit(1);
});
