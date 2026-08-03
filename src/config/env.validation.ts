import { z } from 'zod';

/**
 * Strict schema for all runtime configuration. Validated once at boot so the
 * process fails fast on misconfiguration rather than at first request.
 */
const csvList = (opts?: { lowercase?: boolean }) =>
  z.string().transform((v) =>
    v
      .split(',')
      .map((s) => (opts?.lowercase ? s.trim().toLowerCase() : s.trim()))
      .filter(Boolean),
  );

const csvOrigins = csvList()
  .refine((arr) => arr.length > 0, 'CORS_ORIGINS must list at least one origin')
  .refine(
    (arr) => arr.every((o) => o !== '*'),
    'Wildcard "*" is not allowed for CORS_ORIGINS',
  );

// Explicit boolean parsing — z.coerce.boolean() treats any non-empty string
// (including "false") as true, which is a silent-misconfiguration footgun.
const strictBool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_URL: z.string().url().default('http://localhost:4000'),
    // Number of trusted reverse-proxy hops in front of the app. Governs how
    // req.ip / X-Forwarded-For is derived — critical for rate limiting.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

    CORS_ORIGINS: csvOrigins,

    DATABASE_URL: z.string().min(1),
    // Prisma liest DIRECT_URL für Migrationen direkt aus der Umgebung — ohne
    // diese Zeile fällt ein Tippfehler erst beim Start auf.
    DIRECT_URL: z.string().min(1).optional(),

    // Separate secrets per cryptographic purpose (key separation).
    OTP_HASHING_SECRET: z
      .string()
      .min(32, 'OTP_HASHING_SECRET must be at least 32 characters'),
    VERIFICATION_TOKEN_SECRET: z
      .string()
      .min(32, 'VERIFICATION_TOKEN_SECRET must be at least 32 characters'),
    AUDIT_IP_PEPPER: z
      .string()
      .min(32, 'AUDIT_IP_PEPPER must be at least 32 characters'),
    ADMIN_API_KEY: z
      .string()
      .min(32, 'ADMIN_API_KEY must be at least 32 characters'),
    // HMAC signing key for stateless access JWTs and registration-draft tokens.
    AUTH_JWT_SECRET: z
      .string()
      .min(32, 'AUTH_JWT_SECRET must be at least 32 characters'),

    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    // Rolling issuance caps per contact (anti bombing / toll fraud).
    OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
    OTP_MAX_PER_DAY: z.coerce.number().int().positive().default(10),

    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('PortaGast <noreply@portagast.example>'),

    SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    // Only deliver SMS to these country prefixes (anti international pumping).
    SMS_ALLOWED_COUNTRY_PREFIXES: csvList().default('+49,+43,+41'),

    // Routing-Dienst für die exakte Fahrzeit. BEWUSST OHNE VORGABE: hierhin
    // gehen Standortdaten unserer Nutzer, deshalb muss die Adresse aus einer
    // Entscheidung stammen (eigene Instanz oder Anbieter mit Auftrags-
    // verarbeitungsvertrag) und darf nicht als Voreinstellung passieren.
    OSRM_URL: z.string().url().optional(),
    // Notausgang für die lokale Entwicklung: erlaubt den öffentlichen
    // OSRM-Demo-Server. Auf einer öffentlich erreichbaren Instanz wirkungslos.
    ROUTING_ALLOW_PUBLIC_DEMO: strictBool('false'),

    STORAGE_PROVIDER: z.enum(['s3']).default('s3'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('eu-central-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    // Supabase Storage session-token auth (JWT); leer bei klassischen S3-Keys.
    S3_SESSION_TOKEN: z.string().optional(),
    S3_FORCE_PATH_STYLE: strictBool('false'),
    // 'none' für Anbieter, die den SSE-Header nicht akzeptieren (z. B.
    // Supabase Storage — dort ist Verschlüsselung at rest ohnehin Standard).
    S3_SERVER_SIDE_ENCRYPTION: z
      .enum(['AES256', 'aws:kms', 'none'])
      .default('AES256'),
    S3_KMS_KEY_ID: z.string().optional(),

    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    MAX_UPLOAD_FILES: z.coerce.number().int().positive().default(8),

    APPLICATION_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(180),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

    // ── Auth (registration + login) ──────────────────────────────────────────
    // Access-token lifetime. Keep short; the frontend re-authenticates on expiry.
    AUTH_JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    // How long an incomplete registration wizard draft stays resumable.
    AUTH_REGISTRATION_DRAFT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(3600),
    // Password-reset token lifetime (short by design).
    AUTH_PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(900),
    AUTH_PASSWORD_RESET_URL: z
      .string()
      .url()
      .default('http://localhost:3000/reset-password'),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
    if (env.SMS_PROVIDER === 'twilio') {
      for (const key of [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_FROM_NUMBER',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SMS_PROVIDER=twilio`,
          });
        }
      }
    }
    if (env.S3_SERVER_SIDE_ENCRYPTION === 'aws:kms' && !env.S3_KMS_KEY_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_KMS_KEY_ID'],
        message:
          'S3_KMS_KEY_ID is required when S3_SERVER_SIDE_ENCRYPTION=aws:kms',
      });
    }

    // Production-only hardening: no log-only providers, TLS everywhere, EU data
    // residency by default.
    if (env.NODE_ENV === 'production') {
      if (env.EMAIL_PROVIDER === 'console') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_PROVIDER'],
          message: 'EMAIL_PROVIDER=console is not allowed in production',
        });
      }
      if (env.SMS_PROVIDER === 'console') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMS_PROVIDER'],
          message: 'SMS_PROVIDER=console is not allowed in production',
        });
      }
      if (!/sslmode=(require|verify-ca|verify-full)/.test(env.DATABASE_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'DATABASE_URL must enforce TLS in production (sslmode=require|verify-ca|verify-full)',
        });
      }
      if (env.S3_ENDPOINT && !env.S3_ENDPOINT.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ENDPOINT'],
          message: 'S3_ENDPOINT must use https in production',
        });
      }
      if (!env.S3_REGION.startsWith('eu-')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_REGION'],
          message:
            'S3_REGION must be an EU region in production (GDPR data residency)',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env` against the schema. Called once at module scope.
 * Throws a readable aggregated error listing every invalid variable.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
