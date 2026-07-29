# Known Limitations (Local Development)

## Email Delivery
- Email is implemented through `nodemailer` in `D:\2026\mathSchool\lib\services\email.ts`.
- If `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are not configured — or still equal the placeholder values from `.env.example` — outbound delivery is skipped.
- In local development, skipped delivery logs an informational message instead of throwing.

## Payment Processing
- The app stores billing data in `StudentSubscription` and `PaymentTransaction`.
- There is **no live Stripe, PayPal, or webhook integration** in this repo.
- Admin billing actions mutate the local database directly.
- The current “refund” behavior marks a payment transaction as `FAILED`; it does not call an external payment provider.

## BI Analytics Currency
- Admin BI analytics currently treats `USD` as the only reporting currency.
- Revenue cards, LTV, monthly revenue trends, and raw daily revenue inputs include only successful `PaymentTransaction` rows where `currency = "USD"`.
- Non-USD payments can still exist in billing data, but they are intentionally excluded from BI aggregates until a real FX/base-currency normalization policy is defined.

## Live Lessons
- Live lessons are simple URLs stored on `ScheduledClass.liveLessonUrl`.
- Seed data defaults to `SEED_LIVE_LESSON_URL`, which is `https://meet.google.com/` unless you override it.
- The app does not provision conferencing rooms or validate that a meeting link is usable.

## File Uploads
- Local uploads use `LocalStorageService` and write to `D:\2026\mathSchool\public\uploads`.
- The local implementation does not support readable stream uploads.
- Upload size is capped at 5 MB per file.
- MIME types are restricted to a small allowlist plus images.
- Upload routes derive identity and role from the authenticated server-side session. Repository and
  action code enforce teacher assignment, student enrollment, and linked-parent ownership.
- Hosted staging and production require private Cloudflare R2 through the S3-compatible adapter;
  local development intentionally retains filesystem storage.

## Admin Materials / Files
- There is intentionally no standalone `/admin/materials` or `/admin/files` workspace.
- Course materials are teacher-owned and managed through `/portal/teacher/materials`, where teacher
  ownership is enforced through the course material repository.
- Students and parents consume materials through their own portal read-only material views.
- Admin users can manage the surrounding academic objects such as teachers, students, parents,
  classes, class groups, and lessons, but they do not have a separate global file library in this
  implementation.

## SMS / WhatsApp Notifications
- WhatsApp reminders are only attempted when `WHATSAPP_WEBHOOK_URL` is configured.
- If that variable is empty, reminder processing records WhatsApp deliveries as skipped.
- There is no Twilio-style built-in local sandbox.

## Third-Party Integrations
- Turnstile is optional locally. If `TURNSTILE_SECRET_KEY` is empty and `TURNSTILE_ENFORCE=false`, CAPTCHA checks are bypassed.
- Sentry is optional. Empty DSNs leave monitoring effectively disabled.
- Admin SSO is optional and disabled by default.
- ULU Online School administrators authenticate to the application with email and password.
  Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
  audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
  accounts remain protected with provider-level 2FA.

## Seed Coverage
- The seed script does **not** create `PageContent` records, public `Teacher` marketing profiles, or `Testimonial` records.
- As a result, some public CMS/marketing areas may start empty until you add content manually in the admin UI or through Prisma Studio.
- The richest seeded dashboards are tied to the `fixed.*` fixture accounts, not every general account.

## Performance with Large Datasets
- Local seed data is intentionally small.
- Several admin flows use pagination or filtering, but the repo does not include documented large-dataset benchmarks.
- `LocalStorageService` and the default local Postgres setup are suitable for development only.

## Browser Compatibility
- Automated frontend tests exist, but the repository does not document a formal browser support matrix.
- <!-- TODO: Verify manual browser coverage (Chrome, Edge, Safari, Firefox) for the current release. -->

## Screen Reader Compatibility
- The repo contains automated accessibility tests for landmarks, forms, tables, header navigation, and dashboards.
- Manual screen reader validation is not documented in the codebase.
- <!-- TODO: Verify manual NVDA, VoiceOver, and JAWS coverage. -->

## Migration History
- Local migration history can drift from the current Prisma schema if models are renamed or reshaped without a matching migration update.
- If `npm run db:reset` fails with a missing-table error such as `public.Submission does not exist`, recreate the disposable local database and run `npm run db:setup`.
- `npm run db:clean` regenerates Prisma Client, performs a migration reset, and verifies the resulting schema.
- Local and production recovery remain migration-first so the database always records the reviewed migration history.
