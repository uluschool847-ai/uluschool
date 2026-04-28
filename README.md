# Ulu School

Next.js 15 web platform for ULU Online School with enquiry capture, admin review workflow, and email notifications.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- ShadCN UI components
- Prisma ORM
- PostgreSQL
- Server Actions
- Nodemailer
- Zod validation
- Sentry monitoring

## Setup
1. Install dependencies: `npm install`
2. Configure environment variables from `.env.example`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations: `npm run prisma:migrate`
5. Seed baseline content: `npm run prisma:seed`
6. Start dev server: `npm run dev`

## Local Environment Defaults (Safe Behavior)
- Required for local runtime:
  - `DATABASE_URL`, `DIRECT_URL`
  - `AUTH_SESSION_SECRET`
  - `DEFAULT_PORTAL_PASSWORD`
  - `CRON_SECRET`
  - `REMINDER_CRON_TOKEN`
  - `ALERT_TEST_TOKEN`
- Optional in local runtime:
  - SMTP vars (`SMTP_*`, `EMAIL_USER`, `EMAIL_PASS`)
  - Turnstile vars (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`)
  - `WHATSAPP_WEBHOOK_URL`
  - `ALERT_WEBHOOK_URL`
  - Sentry vars (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, trace sample rates)
- SMTP:
  - If `SMTP_*` (or fallback `EMAIL_USER`/`EMAIL_PASS`) is missing, email delivery is skipped safely.
  - If SMTP values are left on example placeholders (`smtp.example.com` / `username` / `password`), delivery is skipped safely.
  - In non-production, the app logs a local info message instead of attempting real delivery.
- Turnstile:
  - If `TURNSTILE_SECRET_KEY` is empty and `TURNSTILE_ENFORCE=false`, Turnstile checks are bypassed locally.
  - If `TURNSTILE_ENFORCE=true` with no secret, verification fails with `NOT_CONFIGURED`.
- Admin 2FA:
  - `ADMIN_REQUIRE_2FA=true` is the secure default.
  - In non-production, if admin 2FA is not configured yet, login uses a controlled dev bypass and redirects to `/admin/security?setup2fa=required`.
  - Set `ADMIN_REQUIRE_2FA=false` only for local-only troubleshooting.
- Cron/reminder/alert endpoints:
  - `GET /api/cron/automation` requires `Authorization: Bearer <CRON_SECRET>` in all environments.
  - `POST /api/reminders/send-due` requires `Authorization: Bearer <REMINDER_CRON_TOKEN>`.
  - `POST /api/alerts/test` requires `Authorization: Bearer <ALERT_TEST_TOKEN>`.
  - If `ALERT_WEBHOOK_URL` is empty, alerts fail safely with `ALERT_WEBHOOK_NOT_CONFIGURED`.

## Seeded Test Accounts (Portal)
After `npm run prisma:seed`, these users are created:

- `admin@uluglobalacademy.com` (`admin`)
- `teacher@uluglobalacademy.com` (`teacher`)
- `parent@uluglobalacademy.com` (`parent`)
- `student@uluglobalacademy.com` (`student`)

Password for all seeded accounts: value of `DEFAULT_PORTAL_PASSWORD` (defaults to `ChangeMe123!`).

## Admin Hardening (2FA / SSO)
1. Set `ADMIN_REQUIRE_2FA=true`.
2. Configure admin TOTP via `/admin/security` after first login (or preload `ADMIN_2FA_SECRET` for seed).
3. Optional SSO:
  - Enable `ADMIN_SSO_ENABLED=true`
  - Set `ADMIN_SSO_SHARED_SECRET`
  - Configure IdP/proxy callback to:
    - `GET /api/auth/sso/callback?email=<admin-email>&ts=<unix-ms>&sig=<hmac-hex>`
    - Signature format: `HMAC_SHA256("<email>:<ts>", ADMIN_SSO_SHARED_SECRET)`

## Production Migration
Use deploy-time migrations in production:

```bash
npx prisma migrate deploy
```

## Environment Variables
- `DATABASE_URL`
- `DIRECT_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `SMTP_FROM`
- `SCHOOL_INBOX_EMAIL`
- `SMTP_MAX_RETRIES`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_ENFORCE`
- `MIN_FORM_FILL_MS`
- `ENROL_FORM_MAX_REQUESTS`
- `ENROL_FORM_WINDOW_MS`
- `CONTACT_FORM_MAX_REQUESTS`
- `CONTACT_FORM_WINDOW_MS`
- `AUTH_SESSION_SECRET`
- `DEFAULT_PORTAL_PASSWORD`
- `ADMIN_REQUIRE_2FA`
- `ADMIN_2FA_SECRET`
- `TWO_FACTOR_ISSUER`
- `ADMIN_SSO_ENABLED`
- `ADMIN_SSO_SHARED_SECRET`
- `ADMIN_SSO_LOGIN_URL`
- `CRON_SECRET`
- `REMINDER_CRON_TOKEN`
- `WHATSAPP_WEBHOOK_URL`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `ALERT_WEBHOOK_URL`
- `ALERT_TEST_TOKEN`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`

## Email Deliverability Checklist
Before going live, configure these DNS records for your sending domain:

1. SPF: authorize your SMTP provider.
2. DKIM: publish provider DKIM public keys.
3. DMARC: start with monitoring policy, then tighten policy after validation.

Without SPF/DKIM/DMARC alignment, delivery can be unreliable even if SMTP credentials are valid.

## Folder Structure
```text
.
|-- app
|   |-- (admin)
|   |   `-- admin
|   |       |-- layout.tsx
|   |       `-- page.tsx
|   |-- about
|   |   `-- page.tsx
|   |-- contact
|   |   `-- page.tsx
|   |-- curriculum
|   |   `-- page.tsx
|   |-- enrol
|   |   |-- actions.ts
|   |   `-- page.tsx
|   |-- pricing
|   |   `-- page.tsx
|   |-- subjects
|   |   `-- page.tsx
|   |-- teachers
|   |   `-- page.tsx
|   |-- globals.css
|   |-- layout.tsx
|   |-- page.tsx
|   |-- robots.ts
|   `-- sitemap.ts
|-- components
|   |-- enrol
|   |   `-- enrol-form.tsx
|   |-- layout
|   |   |-- site-footer.tsx
|   |   |-- site-header.tsx
|   |   `-- theme-toggle.tsx
|   |-- providers
|   |   `-- theme-provider.tsx
|   |-- sections
|   |   |-- curriculum-overview-section.tsx
|   |   |-- faq-section.tsx
|   |   |-- free-trial-cta-section.tsx
|   |   |-- hero-section.tsx
|   |   |-- how-classes-work-section.tsx
|   |   |-- page-hero.tsx
|   |   |-- safeguarding-section.tsx
|   |   |-- subjects-levels-section.tsx
|   |   |-- teachers-preview-section.tsx
|   |   |-- testimonials-section.tsx
|   |   `-- why-choose-section.tsx
|   `-- ui
|       |-- accordion.tsx
|       |-- badge.tsx
|       |-- button.tsx
|       |-- card.tsx
|       |-- input.tsx
|       |-- label.tsx
|       |-- separator.tsx
|       `-- textarea.tsx
|-- lib
|   |-- admin
|   |   `-- pricing.ts
|   |-- cms
|   |   `-- provider.ts
|   |-- repositories
|   |   `-- enquiry-repository.ts
|   |-- services
|   |   `-- email.ts
|   |-- validations
|   |   `-- enrolment.ts
|   |-- content.ts
|   |-- prisma.ts
|   `-- utils.ts
|-- prisma
|   |-- schema.prisma
|   `-- seed.ts
|-- .env.example
|-- .eslintrc.json
|-- .gitignore
|-- components.json
|-- next-env.d.ts
|-- next.config.mjs
|-- package.json
|-- postcss.config.mjs
|-- tailwind.config.ts
`-- tsconfig.json
```

## Notes
- Enrolment and Contact forms use Server Actions + Zod validation + Prisma persistence + Nodemailer delivery.
- Admin dashboard supports status workflow (`new`, `in_review`, `accepted`, `rejected`) and admin notes.
- Basic anti-spam includes honeypot, minimum submit time guard, optional Turnstile captcha, and in-memory rate limiting.
- Portal login lives at `/portal/login`, and the student dashboard is available at `/portal/student`.
- Portal v1 supports login with roles (`admin`, `teacher`, `parent`, `student`) and protected pages.
- Admin hardening: `/admin` requires admin role and can be locked behind TOTP 2FA (`ADMIN_REQUIRE_2FA=true`) or SSO callback (`/api/auth/sso/callback`).
- Schedule v1 is available at `/portal/schedule` with class calendar and live lesson links.
- Reminder dispatch endpoint: `POST /api/reminders/send-due` with `Authorization: Bearer <REMINDER_CRON_TOKEN>`.
- Uptime endpoint: `GET /api/health` (use UptimeRobot/BetterStack and configure alerts).
- Manual alert pipeline test: `POST /api/alerts/test` with `Authorization: Bearer <ALERT_TEST_TOKEN>`.
- Admin audit log captures security and workflow changes in `AdminAuditLog` and is visible on `/admin`.
