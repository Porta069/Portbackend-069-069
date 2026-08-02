import { Env } from './env.validation';

/**
 * Typed accessor namespaces derived from the validated environment.
 * Consumed via `ConfigService.get<...>('namespace')`.
 */
export interface AppConfig {
  env: Env['NODE_ENV'];
  port: number;
  appUrl: string;
  corsOrigins: string[];
  trustProxyHops: number;
  isProduction: boolean;
}

export interface OtpConfig {
  hashingSecret: string;
  verificationTokenSecret: string;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxPerHour: number;
  maxPerDay: number;
}

export interface EmailConfig {
  provider: Env['EMAIL_PROVIDER'];
  resendApiKey?: string;
  from: string;
}

export interface SmsConfig {
  provider: Env['SMS_PROVIDER'];
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  allowedCountryPrefixes: string[];
}

export interface StorageConfig {
  provider: Env['STORAGE_PROVIDER'];
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle: boolean;
  serverSideEncryption: Env['S3_SERVER_SIDE_ENCRYPTION'];
  kmsKeyId?: string;
}

export interface SecurityConfig {
  adminApiKey: string;
  maxUploadBytes: number;
  maxUploadFiles: number;
}

export interface AuditConfig {
  ipPepper: string;
  retentionDays: number;
}

export interface RetentionConfig {
  applicationRetentionDays: number;
}

export interface AuthConfig {
  // HMAC signing key for stateless access JWTs and registration-draft tokens.
  jwtSecret: string;
  jwtTtlSeconds: number;
  registrationDraftTtlSeconds: number;
  passwordResetTtlSeconds: number;
  // Frontend URL the password-reset link points to (token appended as ?token=).
  passwordResetUrl: string;
}

export interface RootConfig {
  app: AppConfig;
  otp: OtpConfig;
  email: EmailConfig;
  sms: SmsConfig;
  storage: StorageConfig;
  security: SecurityConfig;
  audit: AuditConfig;
  retention: RetentionConfig;
  auth: AuthConfig;
}

/**
 * Maps the flat validated env into structured config namespaces.
 * The object returned here becomes the `ConfigService` source of truth.
 */
export function buildConfig(env: Env): RootConfig {
  return {
    app: {
      env: env.NODE_ENV,
      port: env.PORT,
      appUrl: env.APP_URL,
      corsOrigins: env.CORS_ORIGINS,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      isProduction: env.NODE_ENV === 'production',
    },
    otp: {
      hashingSecret: env.OTP_HASHING_SECRET,
      verificationTokenSecret: env.VERIFICATION_TOKEN_SECRET,
      ttlSeconds: env.OTP_TTL_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      maxPerHour: env.OTP_MAX_PER_HOUR,
      maxPerDay: env.OTP_MAX_PER_DAY,
    },
    email: {
      provider: env.EMAIL_PROVIDER,
      resendApiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    },
    sms: {
      provider: env.SMS_PROVIDER,
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      fromNumber: env.TWILIO_FROM_NUMBER,
      allowedCountryPrefixes: env.SMS_ALLOWED_COUNTRY_PREFIXES,
    },
    storage: {
      provider: env.STORAGE_PROVIDER,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      sessionToken: env.S3_SESSION_TOKEN,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      serverSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION,
      kmsKeyId: env.S3_KMS_KEY_ID,
    },
    security: {
      adminApiKey: env.ADMIN_API_KEY,
      maxUploadBytes: env.MAX_UPLOAD_BYTES,
      maxUploadFiles: env.MAX_UPLOAD_FILES,
    },
    audit: {
      ipPepper: env.AUDIT_IP_PEPPER,
      retentionDays: env.AUDIT_RETENTION_DAYS,
    },
    retention: {
      applicationRetentionDays: env.APPLICATION_RETENTION_DAYS,
    },
    auth: {
      jwtSecret: env.AUTH_JWT_SECRET,
      jwtTtlSeconds: env.AUTH_JWT_TTL_SECONDS,
      registrationDraftTtlSeconds: env.AUTH_REGISTRATION_DRAFT_TTL_SECONDS,
      passwordResetTtlSeconds: env.AUTH_PASSWORD_RESET_TTL_SECONDS,
      passwordResetUrl: env.AUTH_PASSWORD_RESET_URL,
    },
  };
}
