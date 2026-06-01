# Math School

mathSchool is a Next.js 15 application for **ULU Online School**. It combines the public marketing site with portal dashboards for admins, teachers, students, and parents, plus a Prisma-backed CRM/CMS and basic billing/analytics tooling.

### Prerequisites
- Node.js 18+ (the repo does not declare an `engines` field)
- npm (all project scripts use npm)
- PostgreSQL (the Prisma datasource provider is `postgresql`)
- A local or remote database URL for both `DATABASE_URL` and `DIRECT_URL`

### Quick Start

#### 1. Install dependencies
The repository URL is not stored in the codebase. After cloning your copy of the repository:

```bash
cd mathSchool
npm install
```

#### 2. Environment setup
```bash
cp .env.example .env
cp .env.example .env.local
```
Then update any values you need in both:
- `D:\2026\mathSchool\.env`
- `D:\2026\mathSchool\.env.local`

Why both files:
- Next.js reads `.env.local` during app runtime
- Prisma CLI and `tsx prisma/*.ts` scripts in this repo rely on `.env`

#### 3. Database setup
Recommended local bootstrap:

```bash
npm run db:generate
npx prisma db push
npm run db:seed
npm run db:verify
```

If you prefer a destructive reset that also reseeds the database:

```bash
npm run db:reset
```

#### 4. Start the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the production bundle |
| `npm run start` | Run the production server locally |
| `npm run test` | Run the full Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run Biome checks across the repo |
| `npm run qa:admin-smoke` | Run the admin QA smoke suite on an isolated localhost port |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Run `prisma migrate dev` |
| `npm run db:seed` | Seed the database with local demo/test data |
| `npm run db:reset` | Destructively reset the database and rerun the seed |
| `npm run db:verify` | Verify that required seed data exists |
| `npm run db:setup` | Generate Prisma client, reset the DB, and verify seed state |
| `npm run db:studio` | Open Prisma Studio |

### AI-Assisted Development

AI-assisted work in this repository must follow the project rules in [`AGENTS.md`](./AGENTS.md):
context first, plan before code, small scoped tasks, strict ownership checks, mandatory tests,
manual browser verification for UI flows, and a final implementation report.

### Environment Variables

#### Database & Runtime

| Variable | Required? | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Primary Prisma connection string |
| `DIRECT_URL` | Yes | Direct DB connection string for Prisma operations |
| `NODE_ENV` | No | Normally set by Next.js/hosting; `.env.example` defaults to `development` |
| `NEXT_RUNTIME` | No | Normally set by Next.js runtime |

#### Auth & Portal

| Variable | Required? | Description |
| --- | --- | --- |
| `AUTH_SESSION_SECRET` | Yes | HMAC secret for the custom signed session cookie (`ulu_session`) |
| `DEFAULT_PORTAL_PASSWORD` | Yes | Password used for all seeded portal accounts |
| `ADMIN_REQUIRE_2FA` | Yes for secure local parity | Controls whether admin login requires 2FA flow. Use `true` to verify production-like admin hardening; use `false` for local/demo password-only admin access. |
| `ADMIN_2FA_SECRET` | Optional | Seeds TOTP for the main admin account if provided |
| `TWO_FACTOR_ISSUER` | Optional | TOTP issuer label shown in authenticator apps |
| `ADMIN_SSO_ENABLED` | Optional | Enables the admin SSO callback flow |
| `ADMIN_SSO_SHARED_SECRET` | Optional | Shared secret used by `/api/auth/sso/callback` |
| `ADMIN_SSO_LOGIN_URL` | Optional | Upstream SSO login URL |

#### SMTP / Email

| Variable | Required? | Description |
| --- | --- | --- |
| `SMTP_HOST` | Optional | Primary SMTP host for Nodemailer |
| `SMTP_PORT` | Optional | SMTP port |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |
| `SMTP_SECURE` | Optional | `true`/`false` secure transport flag |
| `SMTP_FROM` | Optional | From address used by outbound mail |
| `SCHOOL_INBOX_EMAIL` | Optional | Inbox that receives contact/enrolment notifications |
| `SMTP_MAX_RETRIES` | Optional | Retry count for outbound email sending |
| `EMAIL_USER` | Optional | Gmail fallback username |
| `EMAIL_PASS` | Optional | Gmail fallback password |

#### Form Security & CAPTCHA

| Variable | Required? | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional | Client-side Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Optional | Server-side Turnstile secret |
| `TURNSTILE_ENFORCE` | Optional | If `true`, missing Turnstile config becomes an error |
| `MIN_FORM_FILL_MS` | Optional | Minimum submission time for spam protection |
| `ENROL_FORM_MAX_REQUESTS` | Optional | In-memory enrol form rate limit quota |
| `ENROL_FORM_WINDOW_MS` | Optional | Enrol form rate-limit window |
| `CONTACT_FORM_MAX_REQUESTS` | Optional | In-memory contact form rate limit quota |
| `CONTACT_FORM_WINDOW_MS` | Optional | Contact form rate-limit window |

#### Cron, Alerts, and Monitoring

| Variable | Required? | Description |
| --- | --- | --- |
| `CRON_SECRET` | Yes if using `/api/cron/automation` | Bearer token for automation cron route |
| `REMINDER_CRON_TOKEN` | Yes if using `/api/reminders/send-due` | Bearer token for manual/cron reminder dispatch |
| `WHATSAPP_WEBHOOK_URL` | Optional | WhatsApp reminder webhook; if empty, WhatsApp is skipped |
| `SENTRY_DSN` | Optional | Server-side Sentry DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Client-side Sentry DSN |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional | Server-side Sentry traces sample rate |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Optional | Client-side traces sample rate |
| `ALERT_WEBHOOK_URL` | Optional | Alert destination webhook |
| `ALERT_TEST_TOKEN` | Yes if testing `/api/alerts/test` | Bearer token for alert test endpoint |

#### Public App Metadata & Seed Defaults

| Variable | Required? | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public site URL used in metadata/config |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional | Marketing site contact email |
| `NEXT_PUBLIC_CONTACT_PHONE` | Optional | Marketing site contact phone |
| `NEXT_PUBLIC_CONTACT_WHATSAPP` | Optional | Marketing site contact WhatsApp |
| `SEED_LIVE_LESSON_URL` | Optional | Default live lesson URL used by seed data |
| `SEED_HOMEWORK_CONTENT_URL` | Optional | Default homework submission URL used by seed data |
| `SEED_MATERIAL_FILE_URL` | Optional | Default course material URL used by seed data |

### Test Accounts
All seeded accounts use `DEFAULT_PORTAL_PASSWORD`. If you do not override it, the password is `ChangeMe123!`.

#### Primary portal accounts

| Email | Password | Role | Notes |
| --- | --- | --- | --- |
| `admin@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Admin | Main admin account; `ADMIN_2FA_SECRET` can seed TOTP |
| `teacher@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Teacher | General teacher account |
| `teacher2@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Teacher | Extra teacher account |
| `parent@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Parent | General parent account |
| `student@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Student | General student account |
| `student2@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Student | Extra student account |
| `freshstudent@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Student | Sparse/empty-state student fixture |
| `newteacher@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Teacher | Sparse/empty-state teacher fixture |
| `onboardingparent@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Parent | Sparse/empty-state parent fixture |

#### Fixed-ID fixtures used by dashboards/tests

| Email | Password | Role | Notes |
| --- | --- | --- | --- |
| `fixed.admin@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Admin | Deterministic admin fixture |
| `fixed.teacher@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Teacher | Seeded with classes, assignments, and submissions |
| `fixed.teacher2@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Teacher | Secondary teacher fixture |
| `fixed.parent@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Parent | Linked to `fixed.student@...` |
| `fixed.student@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Student | Seeded with assignments, submission history, progress, schedule |
| `fixed.student2@uluglobalacademy.com` | `DEFAULT_PORTAL_PASSWORD` | Student | Additional seeded student in classes |

### Local QA Manual Flows

#### Admin QA smoke command
Run the focused admin smoke suite with one command:

```bash
npm run qa:admin-smoke
```

The command allocates a free `localhost` port, sets `PORT` and `PLAYWRIGHT_BASE_URL` for that run,
and uses the seeded admin fixture `fixed.admin@uluglobalacademy.com` with
`E2E_PORTAL_PASSWORD`, `DEFAULT_PORTAL_PASSWORD`, or `ChangeMe123!` in that order. It runs
`e2e/portals/admin-full-coverage.spec.ts`, which checks primary admin routes, browser console
errors, page errors, failed network requests, 5xx responses, dashboard CRM search, reminder dry run,
authenticated header actions, and sensitive-route RBAC.

Before running it on a fresh database, seed the fixed accounts:

```bash
npm run db:seed
```

#### Guest flows
1. Open `/` and verify the public site header, mobile menu, theme toggle, and skip link.
2. Open `/contact`, submit the contact form, and verify the success reference ID and next steps.
3. Open `/enrol`, complete the multi-step enrolment flow, and verify the success reference ID.
4. Open `/portal/login` and verify login validation and error feedback.

#### Student flow
1. Log in as `fixed.student@uluglobalacademy.com`.
2. Verify `/portal/student` shows seeded assignments, grade/feedback, and progress notes.
3. Open `/portal/schedule` and confirm lesson dates/times and join links.

#### Teacher flow
1. Log in as `fixed.teacher@uluglobalacademy.com`.
2. Verify `/portal/teacher` shows classes, assignments, pending submissions, and grading controls.
3. Open `/portal/schedule` and confirm the same class times are shown there.

#### Parent flow
1. Log in as `fixed.parent@uluglobalacademy.com`.
2. Verify `/portal/parent` shows one linked child with classes, homework status, grades, and progress cards.
3. Log in as `onboardingparent@uluglobalacademy.com` to verify the empty-state dashboard.

#### Admin flow
1. Log in as `fixed.admin@uluglobalacademy.com` or `admin@uluglobalacademy.com`.
2. In local development with `ADMIN_REQUIRE_2FA=true`, expect admin login to redirect to `/admin/security?setup2fa=required` before normal admin work. The security page explains that setup is required and links directly to the 2FA setup panel.
3. For local demos where forced setup would interrupt the flow, set `ADMIN_REQUIRE_2FA=false` and restart the dev server. Admin login can then continue to `/admin`, while `/admin/security` still allows optional 2FA setup.
4. Verify `/admin` for analytics, CRM summaries, enquiries, leads, and recent audit logs.
5. Verify `/admin/users`, `/admin/tasks`, `/admin/billing`, `/admin/analytics`, `/admin/audit`, and `/admin/cms`.
6. Under `/admin/cms`, verify pages, blog posts, and FAQ items can be listed/edited.

### Seed Data
`D:\2026\mathSchool\prisma\seed.ts` creates or refreshes the following baseline data:

- 3 `Level` records
- 12 `Subject` records
- 15 `AppUser` records (9 general accounts + 6 fixed-ID fixtures)
- 3 `ScheduledClass` records
- 2 `Assignment` records
- 2 `Submission` records
- 1 `CourseMaterial` record
- 1 `BlogPost` record
- 3 `FaqItem` records
- 2 `Enquiry` records
- 2 `ContactLead` records
- 1 `StudentProgress` record
- 1 `ManagerTask` record
- 1 `StudentSubscription` record
- 1 `PaymentTransaction` record
- 1 parent-child relationship (`fixed.parent@...` linked to `fixed.student@...`)

Not seeded by default:
- `PageContent` CMS pages
- public `Teacher` marketing profiles
- `Testimonial` records
- `ReminderLog` records

### Local Email Behavior
- The app uses `nodemailer` via `D:\2026\mathSchool\lib\services\email.ts`.
- If `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are not set — or still equal the example placeholder values — email delivery is skipped safely.
- In non-production, skipped delivery logs an informational message instead of throwing.
- A Gmail fallback exists via `EMAIL_USER` and `EMAIL_PASS`.

### Database Reset
If migrations are in sync:

```bash
npm run db:reset
```

If schema has drifted or you hit a local migration/table mismatch:

```bash
npx prisma db push --force-reset
npm run db:seed
```

Windows note:
- Prisma can fail with `EPERM` on `node_modules/.prisma/client/query_engine-windows.dll.node` if a dev server or another Node process is still using the client.
- Stop running `node` processes before regeneration/reset, then rerun the command.

### Architecture Overview
- **Frontend / Full-stack runtime:** Next.js 15 App Router with React 18 server and client components
- **Database:** PostgreSQL via Prisma Client
- **Auth:** custom signed cookie sessions (`ulu_session`) with optional admin TOTP and optional admin SSO callback
- **UI:** Tailwind CSS, Radix primitives, and local UI components in `components/ui`
- **Persistence layer:** repository modules under `D:\2026\mathSchool\lib\repositories`
- **Public CMS:** Prisma-backed Pages, Blog Posts, and FAQ items surfaced through `/admin/cms`, `/pages`, `/blog`, and FAQ-driven page sections

### Key Features

#### Guest
- Public marketing pages
- Contact enquiry form
- Enrolment / trial booking form
- Blog listing and blog detail pages
- Public CMS page index/detail under `/pages`

#### Student
- Student dashboard with assignments, grades, and progress summaries
- Homework submission flow
- Portal schedule page with live lesson links

#### Teacher
- Teacher dashboard with metrics, classes, assignments, upcoming lessons, and grading forms
- Teacher schedule page
- Teacher-side homework/archive, grading, and progress components in the portal module

#### Parent
- Parent dashboard with linked child overview, homework status, recent grades, and structured progress

#### Admin
- Admin dashboard with analytics, CRM summaries, audit logs, and reminder trigger
- User management
- Manager task operations
- Billing visibility and local payment status/refund actions
- CMS management for pages, blog posts, and FAQ items
- Security / 2FA setup page
- Audit log and analytics pages

### Known Limitations (Local Dev)
See `D:\2026\mathSchool\docs\known-limitations.md` for the full list. The main local constraints are:
- email is skipped unless SMTP is configured
- billing is local-data only; there is no live Stripe/PayPal integration
- WhatsApp reminders are skipped unless `WHATSAPP_WEBHOOK_URL` is configured
- uploads use local filesystem storage under `public/uploads`
- seeded CMS pages, testimonials, and public teacher profiles are not created by default

### Project Structure
```text
mathSchool/
├── app/           # Next.js App Router pages, route handlers, and portal/admin entry points
├── components/    # Shared UI, layout, forms, CRM, billing, and section components
├── lib/           # Auth, repositories, services, storage, formatting, validation, and helpers
├── prisma/        # Prisma schema, migrations, seed, and verification scripts
└── docs/          # Setup notes, architecture, schema, and local QA/reference docs
```

### Additional Documentation
- `D:\2026\mathSchool\docs\local-setup.md`
- `D:\2026\mathSchool\docs\qa-checklist.md`
- `D:\2026\mathSchool\docs\qa-matrix.md` — Role-based QA matrix (happy path, empty, error, access denied)
- `D:\2026\mathSchool\docs\known-limitations.md`
- `D:\2026\mathSchool\docs\architecture.md`
- `D:\2026\mathSchool\docs\database.md`
