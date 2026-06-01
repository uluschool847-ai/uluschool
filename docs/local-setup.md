# Local Development Setup

## System Requirements
- Node.js 18+
- npm
- PostgreSQL database reachable through both `DATABASE_URL` and `DIRECT_URL`
- A writable filesystem for local uploads (`D:\2026\mathSchool\public\uploads`)

Notes:
- The repo does not pin a Node.js version via `package.json.engines`.
- Prisma is configured for **PostgreSQL only**. There is no SQLite or MySQL option in `D:\2026\mathSchool\prisma\schema.prisma`.

## Step-by-Step Installation

### 1. Install dependencies
From your existing checkout:

```bash
cd mathSchool
npm install
```

### 2. Create your local environment files
```bash
cp .env.example .env
cp .env.example .env.local
```

The sample `.env.example` assumes a PostgreSQL instance listening on `localhost:6543`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:6543/ulu_school?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:6543/ulu_school?schema=public"
```

Important:
- keep `.env.local` for Next.js runtime configuration
- keep `.env` for Prisma CLI and `tsx prisma/*.ts` scripts such as `npm run db:seed` and `npm run db:verify`

If you only create `.env.local`, Prisma commands on a fresh machine will fail with `Environment variable not found: DATABASE_URL`.

### 3. Generate Prisma Client
```bash
npm run db:generate
```

### 4. Initialize the database
For a first-time local setup, the least surprising workflow is:

```bash
npx prisma db push
npm run db:seed
npm run db:verify
```

What each step does:
- `npx prisma db push` syncs the current schema to your database without creating a new migration.
- `npm run db:seed` loads lookup tables, portal users, schedule data, CRM fixtures, and billing fixtures.
- `npm run db:verify` confirms that the DB contains at least one admin, plus subject and level lookup data.

### 5. Start the app
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Options

### Option A: Local PostgreSQL
Use the sample values from `.env.example` and point them at your local Postgres instance.

Recommended when:
- you want a fully offline local setup
- you are debugging Prisma or seed behavior
- you do not want to connect to a shared hosted database

### Option B: Hosted PostgreSQL / Neon
The repo docs recommend Neon for hosted environments. If you use Neon locally:
- set both `DATABASE_URL` and `DIRECT_URL`
- keep the `?schema=public` suffix if your connection string expects it
- use SSL parameters if your hosted DB requires them

There is no SQLite fallback in this project.

## Environment Variables Deep Dive

### Core runtime
| Variable | Example | Why it matters |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://...` | Used by Prisma for normal database access |
| `DIRECT_URL` | `postgresql://...` | Used for direct Prisma operations/migrations |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public origin used in site config/metadata |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public app URL |

### Auth and portal
| Variable | Example | Why it matters |
| --- | --- | --- |
| `AUTH_SESSION_SECRET` | `change-this-session-secret` | Signs the custom `ulu_session` cookie |
| `DEFAULT_PORTAL_PASSWORD` | `ChangeMe123!` | Password assigned to all seeded accounts |
| `ADMIN_REQUIRE_2FA` | `true` | Enables the admin 2FA gate. Set to `false` only for local/demo password-only admin access. |
| `ADMIN_2FA_SECRET` | empty or TOTP secret | Preloads TOTP for the main admin account during seeding |
| `TWO_FACTOR_ISSUER` | `ULU Online School` | Issuer label for authenticator apps |
| `ADMIN_SSO_ENABLED` | `false` | Enables optional admin SSO callback logic |
| `ADMIN_SSO_SHARED_SECRET` | empty | Secret used by `/api/auth/sso/callback` |
| `ADMIN_SSO_LOGIN_URL` | empty | Optional upstream SSO login URL |

Important local behavior:
- In development, when `ADMIN_REQUIRE_2FA=true`, admin login uses a controlled dev bypass and redirects to `/admin/security?setup2fa=required`.
- This is expected local behavior, not a broken redirect. The security page explains that 2FA setup is required and points to the setup panel.
- For demos where setup should be optional, set `ADMIN_REQUIRE_2FA=false` and restart the dev server. Admins can continue to the dashboard, and `/admin/security` remains available for optional setup.

### Email
| Variable | Example | Why it matters |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.example.com` | Primary SMTP transport host |
| `SMTP_PORT` | `587` | SMTP transport port |
| `SMTP_USER` | `username` | SMTP username |
| `SMTP_PASS` | `password` | SMTP password |
| `SMTP_SECURE` | `false` | Toggles secure transport |
| `SMTP_FROM` | `ULU Online School <no-reply@...>` | From address for notifications |
| `SCHOOL_INBOX_EMAIL` | `info@uluglobalacademy.com` | Inbox for contact/enrolment notifications |
| `SMTP_MAX_RETRIES` | `3` | Retry count for email sending |
| `EMAIL_USER` / `EMAIL_PASS` | empty | Gmail fallback if the primary SMTP tuple is not used |

Local behavior:
- If SMTP is unconfigured or left on the example placeholder values, the app skips email sending safely.
- In non-production, it logs an informational message rather than throwing.

### Form security and CAPTCHA
| Variable | Example | Why it matters |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | empty | Client Turnstile site key |
| `TURNSTILE_SECRET_KEY` | empty | Server Turnstile secret |
| `TURNSTILE_ENFORCE` | `false` | If `true`, missing Turnstile config becomes a hard failure |
| `MIN_FORM_FILL_MS` | `1200` | Honeypot/timing-based spam guard |
| `ENROL_FORM_MAX_REQUESTS` | `5` | Enrol form rate-limit quota |
| `ENROL_FORM_WINDOW_MS` | `600000` | Enrol form rate-limit window |
| `CONTACT_FORM_MAX_REQUESTS` | `8` | Contact form rate-limit quota |
| `CONTACT_FORM_WINDOW_MS` | `600000` | Contact form rate-limit window |

Local behavior:
- If `TURNSTILE_SECRET_KEY` is empty and `TURNSTILE_ENFORCE=false`, Turnstile checks are bypassed.

### Cron, alerts, and reminders
| Variable | Example | Why it matters |
| --- | --- | --- |
| `CRON_SECRET` | `change-this-cron-secret` | Protects `GET /api/cron/automation` |
| `REMINDER_CRON_TOKEN` | `change-this-reminder-token` | Protects `POST /api/reminders/send-due` |
| `WHATSAPP_WEBHOOK_URL` | empty | Enables outbound WhatsApp reminder delivery |
| `ALERT_WEBHOOK_URL` | empty | Enables alert webhook delivery |
| `ALERT_TEST_TOKEN` | `change-this-alert-test-token` | Protects `POST /api/alerts/test` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | empty | Enables server/client Sentry reporting |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Server-side traces sampling |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Client-side traces sampling |

### Seed-only local defaults
| Variable | Example | Why it matters |
| --- | --- | --- |
| `SEED_LIVE_LESSON_URL` | `https://meet.google.com/` | Default live lesson URL in seed data |
| `SEED_HOMEWORK_CONTENT_URL` | `https://example.com/homework.pdf` | Default submission link in seed data |
| `SEED_MATERIAL_FILE_URL` | `https://example.com/seeded-physics.pdf` | Default course material file URL in seed data |

## Seed Data Overview
The seed script creates:
- 3 curriculum levels
- 12 subjects
- 15 users
- 3 scheduled classes
- 2 assignments
- 2 homework submissions
- 1 course material
- 1 blog post
- 3 FAQ items
- 2 enrolment enquiries
- 2 contact leads
- 1 student progress record
- 1 manager task
- 1 subscription
- 1 payment

Use these fixtures for manual testing:
- data-rich teacher: `fixed.teacher@uluglobalacademy.com`
- data-rich student: `fixed.student@uluglobalacademy.com`
- data-rich parent: `fixed.parent@uluglobalacademy.com`
- sparse/empty-state teacher: `newteacher@uluglobalacademy.com`
- sparse/empty-state student: `freshstudent@uluglobalacademy.com`
- sparse/empty-state parent: `onboardingparent@uluglobalacademy.com`

## Local Services and Integrations

### Email
No external email sandbox is built into the repo. If SMTP is unset, delivery is skipped.

### Uploads
File uploads use `LocalStorageService` and write to:
- `D:\2026\mathSchool\public\uploads`

Current local upload constraints:
- max 5 MB per file
- MIME whitelist for PDFs, images, zip files, and plain text
- route policy allows `DEVELOPER` and `TEACHER` request roles
- readable stream uploads are not implemented in local mode

### Payments
There is no Stripe or PayPal integration in this repo.
- Billing data is stored in `PaymentTransaction` and `StudentSubscription`
- Admin billing actions mutate local DB state directly
- “Refund” currently marks a transaction as `FAILED`

### Live lessons
Live lesson links are plain URLs stored on `ScheduledClass.liveLessonUrl`.
- Seed data defaults to `SEED_LIVE_LESSON_URL`
- The app does not provision video sessions locally

## Troubleshooting Common Issues

### Port 3000 is already in use
Run on another port:

```bash
npx next dev -p 3001
```

### Prisma migration or schema conflicts
If the local schema drifts and you do not care about preserving local data:

```bash
npm run db:reset
```

If `migrate` is blocked but you just need a working local DB:

```bash
npx prisma db push --force-reset
npm run db:seed
npm run db:verify
```

### Auth session is not persisting
Check the following:
- `AUTH_SESSION_SECRET` is present in `.env.local`
- you are staying on the same origin (`http://localhost:3000` by default)
- your browser is not blocking cookies
- for admins, the redirect to `/admin/security?setup2fa=required` is expected in development when `ADMIN_REQUIRE_2FA=true`; set `ADMIN_REQUIRE_2FA=false` and restart the dev server for demo/password-only dashboard access

### Login succeeds but the dashboard is empty
Use the fixed fixture accounts for data-rich dashboards:
- `fixed.teacher@uluglobalacademy.com`
- `fixed.student@uluglobalacademy.com`
- `fixed.parent@uluglobalacademy.com`

The non-fixed onboarding accounts are intentionally sparse and useful for empty-state QA.

### Module not found / Prisma client not generated
Run:

```bash
npm install
npm run db:generate
```

### SMTP warnings in the console
This is expected if SMTP is not configured. The app is designed to skip delivery safely in local development.

### Turnstile verification fails locally
Either:
- keep `TURNSTILE_ENFORCE=false`, or
- supply real Turnstile keys in `.env.local`

### Reminder or alert endpoints return authorization errors
Set the matching bearer token values in `.env.local`:
- `CRON_SECRET`
- `REMINDER_CRON_TOKEN`
- `ALERT_TEST_TOKEN`
