# PortaGast Backend

Secure API for the PortaGast placement platform. Built with **NestJS + Prisma +
PostgreSQL** and **S3-compatible** object storage. The frontend
(`codehandwerk`) builds on the HTTP contract documented below.

> All routes are served under `/api/v1`.

## Architecture

```
src/
├── main.ts                 # Hardened bootstrap (helmet, CORS, validation, versioning)
├── app.module.ts           # Root wiring: config, logging, throttling, schedule
├── config/                 # Zod-validated env → typed config namespaces
├── common/                 # Crypto, filters, guards, contact + file helpers
├── prisma/                 # PrismaService (DB access, parameterized queries)
├── audit/                  # Append-only audit trail (IPs stored hashed)
├── auth/                   # Registration wizard + email/password login (JWT)
├── notifications/          # Email (Resend) + SMS (Twilio) providers, dev fallback
├── storage/                # Private, encrypted S3 uploads + magic-byte validation
├── otp/                    # OTP request/verify + proof-of-verification token
├── applications/           # Verified multipart intake + admin retrieval/erasure
├── retention/              # Nightly GDPR retention erasure
└── health/                 # Liveness/readiness probe
```

## Security model

| Area | Control |
|------|---------|
| Transport headers | `helmet` (CSP, HSTS in prod, no-referrer, `x-powered-by` off) |
| CORS | Strict origin allowlist from `CORS_ORIGINS`; wildcards rejected at boot |
| Input validation | Global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + typed DTOs) |
| Rate limiting | Global throttler + tighter per-endpoint limits on OTP & submit |
| OTP | 6-digit CSPRNG codes, **HMAC-hashed at rest**, TTL, attempt cap, single-use, resend cooldown, constant-time compare |
| Verification binding | Stateless signed token binds a verified contact to the submission |
| File uploads | Size caps, **magic-byte** content validation (not MIME trust), per-category allowlist, randomized non-guessable keys, filename sanitization |
| Storage | Private bucket, **server-side encryption**, access via short-lived pre-signed URLs only |
| SQL injection | Prisma parameterized queries throughout |
| Admin routes | `x-admin-api-key` compared in constant time |
| Secrets | Env-only, validated at boot, never logged (pino redaction) |
| Errors | Uniform envelope; internal details/stack never leak to clients |
| PII in logs | Redacted (email, phone, name, codes, tokens, credentials) |
| GDPR | Consent capture, retention window, automated erasure, right-to-erasure endpoint, hashed audit IPs |

## Setup (local)

```bash
cp .env.example .env          # then fill secrets (openssl rand -hex 32)
docker compose up -d          # PostgreSQL + MinIO (S3) + bucket
npm install
npm run prisma:generate
npm run prisma:migrate        # creates the schema
npm run start:dev             # http://localhost:4000/api/v1
```

In development, `EMAIL_PROVIDER`/`SMS_PROVIDER` default to `console` (codes are
not sent; only masked log lines appear). Production config forbids `console`.

## Auth: registration + login (JWT)

Email + password accounts with stateless HS256 JWTs. Registration is a **6-step
wizard**: steps 1–5 are **placeholders** (schema still open — their payloads are
stored opaquely) and the final step collects the contact data and creates the
account.

Passwords are stored only as a **scrypt** hash. Access tokens carry a
`tokenVersion` that logout / password-reset bumps to revoke old tokens. All auth
crypto is built on Node's `crypto` — no extra dependencies.

### Registration wizard
```
POST /api/v1/auth/registration/start
→ 201 { "draftToken": "…", "progress": { "currentStep": 0, "totalSteps": 6, "steps": [ …5 placeholders… ] } }

POST /api/v1/auth/registration/step        # steps 1–5 (placeholder, payload TBD)
{ "draftToken": "…", "step": 1, "data": { /* anything, stored as-is */ } }
→ 200 { "currentStep": 1, "totalSteps": 6, "steps": [ … ] }

POST /api/v1/auth/registration/complete    # final contact step → creates account
{ "draftToken": "…", "firstName": "…", "lastName": "…", "email": "…", "phone": "…", "password": "≥10 chars" }
→ 201 { "accessToken": "…", "expiresAt": "…", "user": { … } }
```

### Login / session
```
POST /api/v1/auth/login
{ "email": "…", "password": "…" }              → 200 { "accessToken", "expiresAt", "user" }

GET  /api/v1/auth/me        (Authorization: Bearer <jwt>)   → 200 { user }
POST /api/v1/auth/logout    (Authorization: Bearer <jwt>)   → 204   (revokes issued tokens)
```

### Password reset
```
POST /api/v1/auth/password/forgot   { "email": "…" }                  → 200 { "status": "ok" }  (generic, no account enumeration)
POST /api/v1/auth/password/reset    { "token": "…", "newPassword": "…" } → 200 { "status": "ok" }
```

## API contract (for the frontend)

The current frontend stub `lib/db.ts` maps to these endpoints:

### `sendVerificationCode(method, contact)` → `POST /api/v1/otp/request`
```json
{ "channel": "email" | "sms", "contact": "user@mail.de" }
→ 200 { "status": "sent", "expiresInSeconds": 600 }
```

### `verifyCode(contact, code)` → `POST /api/v1/otp/verify`
```json
{ "channel": "email" | "sms", "contact": "user@mail.de", "code": "123456" }
→ 200 { "verified": true, "verificationToken": "…", "tokenExpiresAt": "…" }
```
Store `verificationToken` in the client and pass it to the submission.

### `createApplication(applicant, files)` → `POST /api/v1/applications`
`multipart/form-data`:
- text: `firstName, lastName, birthDate (YYYY-MM-DD), email, phone,`
  `profession?, federalState?, availability?, searchIntent?(active|passive),`
  `verificationToken, consent(true)`
- files: `cv` (required), `photo` (optional), `qualifications` (0–10)

```
→ 201 { "id": "…", "status": "SUBMITTED" }
```

### Admin (require header `x-admin-api-key`)
- `GET  /api/v1/applications?page=&pageSize=` — list
- `GET  /api/v1/applications/:id` — detail with signed document URLs
- `DELETE /api/v1/applications/:id` — GDPR erasure

## Testing

```bash
npm test          # unit tests (crypto, verification token, file validation)
npm run audit:ci  # dependency vulnerability gate
```

## Production notes

- Set every secret via the environment; never commit `.env`.
- Use a least-privilege PostgreSQL role and an S3 bucket policy that denies
  public access and requires encryption.
- Put the API behind a single trusted reverse proxy (the app trusts one hop).
- Choose EU regions for PostgreSQL and S3 to satisfy GDPR data residency.
