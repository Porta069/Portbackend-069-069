import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from './config/env.validation';
import { buildConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OtpModule } from './otp/otp.module';
import { ApplicationsModule } from './applications/applications.module';
import { PartnerModule } from './partner/partner.module';
import { MatchingModule } from './matching/matching.module';
import { JobsModule } from './jobs/jobs.module';
import { EmployerModule } from './employer/employer.module';
import { RetentionModule } from './retention/retention.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Validate exactly once at boot (fail fast), then expose structured,
      // typed namespaces via the loaded config.
      load: [() => buildConfig(validateEnv(process.env))],
    }),

    // Structured, redacted request logging.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<boolean>('app.isProduction');
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
            // Never log secrets, credentials, codes or PII-bearing payloads.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers["x-admin-api-key"]',
                'req.headers.cookie',
                'req.body.code',
                'req.body.verificationToken',
                'req.body.password',
                'req.body.newPassword',
                'req.body.token',
                'req.body.draftToken',
                'req.body.email',
                'req.body.phone',
                'req.body.contact',
                'req.body.firstName',
                'req.body.lastName',
                'req.body.birthDate',
              ],
              remove: true,
            },
            autoLogging: true,
          },
        };
      },
    }),

    // Global rate limiting baseline (endpoints tighten further via @Throttle).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
    ]),

    ScheduleModule.forRoot(),

    PrismaModule,
    AuditModule,
    AuthModule,
    OtpModule,
    ApplicationsModule,
    PartnerModule,
    MatchingModule,
    JobsModule,
    EmployerModule,
    RetentionModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
