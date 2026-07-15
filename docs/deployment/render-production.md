# Render Staging and Production Runbook

This runbook is the source of truth for the ULU Online School Render services. Use separate
resources for staging and production. Never copy production personal data into staging and never
paste credentials into tickets, chat, deploy logs, or this repository.

## Owners and prerequisites

Before creating a service, record the operator, date, workspace, database, R2 bucket, Sentry
project, Turnstile widget, SMTP account, and private operations channel in the private launch
record. The web service and its Render PostgreSQL database must both be in **Frankfurt** so that
database traffic uses Render's private network in one region.

Use paid web and database instances for a live school. The pre-deploy command is a paid web-service
feature, and point-in-time recovery is not available for a free Render PostgreSQL database.

## Service matrix

| Setting | Staging service | Production service |
| --- | --- | --- |
| Runtime | Node | Node |
| Branch | `staging` | `main` |
| Region | Frankfurt | Frankfurt |
| Root directory | repository root | repository root |
| Build command | `npm ci && npx prisma generate && npm run build` | `npm ci && npx prisma generate && npm run build` |
| Pre-deploy command | `npm run env:check && npx prisma migrate deploy && npm run bootstrap:production` | `npm run env:check && npx prisma migrate deploy && npm run bootstrap:production` |
| Start command | `npm run start` | `npm run start` |
| Health check path | `/api/health` | `/api/health` |
| Auto-deploy | after required GitHub checks pass | after required GitHub checks pass |

The repository pins Node.js 22 in `package.json` and `.nvmrc`. Do not override the service with a
different major version.

## Database configuration

Create one Render PostgreSQL database per environment in Frankfurt. For each web service:

1. Open that environment's database in Render and copy its **Internal Database URL**.
2. Add the value directly to the matching web service as both `DATABASE_URL` and `DIRECT_URL`.
3. Confirm the staging service points only to the staging database and production points only to
   the production database.
4. Keep the external database URL out of the web service unless a controlled operator task truly
   requires external access.
5. Open the database Recovery page and record whether paid backups and point-in-time recovery are
   active, the visible recovery window, and the restore-drill owner/date.

Do not run demo seeding, `prisma db push`, `prisma migrate dev`, `prisma migrate reset`, or
`npm run db:reset` against either hosted database.

## Environment variables

Set variables independently on each web service. Values in the **Required value or rule** column
are configuration rules, not credentials.

| Variable | Required value or rule |
| --- | --- |
| `RENDER` | Supplied by Render as its platform marker; do not override it |
| `NODE_ENV` | `production` in both services |
| `APP_ENV` | `APP_ENV=staging` on staging; `APP_ENV=production` on production |
| `DATABASE_URL` | Matching environment's Render Internal Database URL |
| `DIRECT_URL` | Matching environment's Render Internal Database URL |
| `AUTH_SESSION_SECRET` | Unique high-entropy value of at least 32 characters per environment |
| `ADMIN_REQUIRE_2FA` | `true` |
| `GOOGLE_TIMEZONE` | `Africa/Nairobi` |
| `NEXT_PUBLIC_SITE_URL` | Staging HTTPS origin on staging; `https://uluglobalacademy.com` on production |
| `TURNSTILE_ENFORCE` | `true` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Environment-specific Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Matching server-side Turnstile credential |
| `SMTP_HOST` | SMTP hostname only, without a URL scheme |
| `SMTP_PORT` | Provider port from 1 through 65535 |
| `SMTP_USER` | Environment-approved SMTP account |
| `SMTP_PASS` | Matching SMTP credential |
| `SMTP_FROM` | Valid ULU sender name and mailbox |
| `SCHOOL_INBOX_EMAIL` | Single monitored school mailbox |
| `STORAGE_DRIVER` | `r2` |
| `R2_ENDPOINT` | Cloudflare account endpoint for the environment |
| `R2_ACCESS_KEY_ID` | Server-only R2 credential scoped to the private bucket |
| `R2_SECRET_ACCESS_KEY` | Matching server-only R2 credential |
| `R2_BUCKET_NAME` | Private staging or production bucket name |
| `PRIVACY_CONTACT_EMAIL` | Monitored privacy mailbox |
| `PRIVACY_EMAIL_PROCESSOR_NAME` | Actual outbound-email processor name |
| `CRON_SECRET` | Unique high-entropy value of at least 32 characters |
| `REMINDER_CRON_TOKEN` | Unique high-entropy value of at least 32 characters |
| `ALERT_WEBHOOK_URL` | HTTPS webhook for the private operations channel |
| `ALERT_TEST_TOKEN` | Unique high-entropy value of at least 32 characters |
| `SENTRY_ENABLED` | `true` only when both environment-specific DSNs are configured; otherwise `false` with both DSNs empty |
| `SENTRY_DSN` | Server DSN for this environment when Sentry is enabled |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser DSN for this environment when Sentry is enabled |

For the launch gate, enable Sentry with separate staging and production projects so the browser
matrix can verify sanitization and environment routing.

Also set these operational values explicitly instead of relying on undocumented dashboard state:

| Variable | Launch setting or rule |
| --- | --- |
| `TWO_FACTOR_ISSUER` | `ULU Online School` |
| `ADMIN_2FA_SECRET` | Empty; hosted administrators enroll TOTP interactively |
| `ADMIN_SSO_ENABLED` | `false` for the MVP unless an approved SSO integration is separately verified |
| `ADMIN_SSO_SHARED_SECRET` | Empty when SSO is disabled |
| `ADMIN_SSO_LOGIN_URL` | Empty when SSO is disabled |
| `LOGIN_MAX_ATTEMPTS` | `5` |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` |
| `SMTP_SECURE` | Match the SMTP provider's selected port and transport mode |
| `SMTP_MAX_RETRIES` | `3` |
| `EMAIL_USER` and `EMAIL_PASS` | Empty when the primary SMTP tuple is used |
| `MIN_FORM_FILL_MS` | `1200` |
| `ENROL_FORM_MAX_REQUESTS` | `5` |
| `ENROL_FORM_WINDOW_MS` | `600000` |
| `CONTACT_FORM_MAX_REQUESTS` | `8` |
| `CONTACT_FORM_WINDOW_MS` | `600000` |
| `SENTRY_TRACES_SAMPLE_RATE` | Conservative environment-approved rate |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Conservative environment-approved rate |

Configure Google Calendar only when it is part of the launch: `GOOGLE_CALENDAR_ENABLED=true`
requires an environment-specific calendar plus server-only Google credentials. Keep
`GOOGLE_TIMEZONE` set to `Africa/Nairobi`. Set public ULU contact metadata to verified Kenyan
contact details before launch.

Render supplies `PORT` and its platform marker. Do not add a fixed `PORT`. Do not define a shared
portal-password variable or `SEED_PORTAL_PASSWORD` in staging or production.

## First administrator bootstrap

The pre-deploy command is idempotent. For a new database with no active administrator, set all
three variables in Render:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_ADMIN_PASSWORD`

The bootstrap creates one active admin with a mandatory first-login password change and writes a
security audit record. It neither seeds demo users nor prints the credential.

After the first administrator signs in, rotates the bootstrap credential, enrolls TOTP, saves the
backup codes offline, signs out, and proves a second TOTP login:

1. remove all three bootstrap variables from that Render service;
2. deploy again;
3. confirm `npm run bootstrap:production` reports that an active administrator already exists.

Do not leave one or two bootstrap variables configured. An incomplete tuple intentionally fails the
pre-deploy command.

## Private R2 storage

Create separate private R2 buckets for staging and production, or separate prefixes only when the
access policy can prove equivalent isolation. Bucket access must remain private:

- disable the public `r2.dev` endpoint;
- keep API credentials server-only and out of every `NEXT_PUBLIC_*` variable;
- scope each credential to only its environment's bucket;
- do not put raw object URLs in school records or operator notes;
- rotate a credential immediately if it appears in a log or screenshot.

After every first deployment or storage change, upload a disposable teacher material, download it
as the authorized student and linked parent, trigger one Render redeploy, and download the same
record again. Record the file record ID, deploy IDs, and result, then remove the disposable record.

## Deploy and service verification

1. Confirm the GitHub commit and environment-specific resources before clicking deploy.
2. Watch the build, environment check, migration, bootstrap, start, and health-check phases.
3. A build or pre-deploy failure must leave the previously healthy service serving traffic.
4. Open `/api/health`; require a successful response without configuration values or credentials.
5. Run the deployment smoke against the service's HTTPS `onrender.com` origin.
6. Complete `browser-verification.md` before promoting staging or attaching production DNS.
7. Record the Render service ID, deploy ID, commit SHA, operator, start/end time, and result in the
   private launch record.

Provider references:

- [Render deploys and pre-deploy commands](https://render.com/docs/deploys)
- [Render PostgreSQL recovery and backups](https://render.com/docs/postgresql-backups)
