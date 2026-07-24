# Launch-Critical MVP Production Readiness Design

**Status:** Approved

**Date:** 2026-07-13

**Repository:** `uluschool847-ai/uluschool`

> **Superseded for application 2FA:** The administrator TOTP requirements in this document were
> replaced by `2026-07-23-remove-two-factor-authentication-design.md`. Other launch requirements
> remain active.

## 1. Summary

This design defines the work required to launch the existing ULU Online School application as a controlled production MVP for Kenya. The launch includes the public site, enrolment and contact forms, manual account creation by an administrator, mandatory administrator 2FA, and the existing student, parent, and teacher portals.

The work is organized as sequential production gates. A gate is complete only when its focused tests pass and its acceptance criteria are met. Infrastructure is activated only after the code baseline, authentication, data ownership, and persistent storage are safe enough for production traffic.

## 2. Current State

The repository already contains:

- a Next.js 15 App Router application;
- Prisma with PostgreSQL;
- public `/enrol` and `/contact` workflows that validate input, apply spam controls, persist records, and attempt email delivery;
- admin enquiry and contact-lead management;
- manual student, parent, and teacher account management;
- student, parent, and teacher portals;
- administrator TOTP 2FA and backup codes;
- an `/api/health` route;
- active Nairobi timezone defaults in application code.

The audited launch blockers are:

- the full test suite and lint command are not green after the Nairobi timezone migration;
- `/api/upload` trusts a client-provided `x-role` header and does not authenticate the request server-side;
- manually created accounts share one fallback password and are not actually forced to change it;
- a new production administrator cannot securely complete first-time 2FA setup in production;
- production bootstrap relies on a demo-oriented seed script;
- uploaded files use Render's ephemeral local filesystem;
- the Sentry configuration does not scrub school and authentication data;
- production environment requirements are not validated as one explicit contract;
- the enrolment flow does not persist evidence of parent or guardian consent;
- Render is suspended and the public domain does not currently resolve;
- there is no staging branch or automated CI gate.

## 3. Goals

1. Make `lint`, `typecheck`, unit/integration tests, and production build pass reproducibly on Node.js 22.
2. Ensure every protected API derives identity and role from the signed server session.
3. Give each manually created user a unique temporary password and force a password change before portal access.
4. Allow a bootstrap administrator to change the initial password and configure 2FA without receiving normal admin access first.
5. Store production uploads in a private Cloudflare R2 bucket and authorize every download through the application.
6. Record explicit parent or guardian consent for enrolment submissions.
7. Enforce a documented production environment contract for Render.
8. Deploy a non-indexed staging environment, verify it, then deploy production with the public domain and HTTPS.
9. Preserve existing working portal behavior and repository ownership rules.

## 4. Non-Goals

The following features are excluded from this launch cycle:

- public self-service account registration;
- email address verification;
- M-Pesa or card payments;
- email-based forgotten-password recovery;
- automatic account provisioning from an enrolment enquiry;
- automated legal or ODPC registration;
- distributed Redis-backed rate limiting; Turnstile and Cloudflare remain the primary launch controls while the existing in-process limiter remains defense in depth;
- broad portal redesigns or unrelated repository refactors.

Users can change a temporary password during initial setup, but they cannot request a password-reset email in this release. Administrators handle lost-password recovery operationally until the post-launch recovery flow is designed.

## 5. Delivery Approach

The selected approach is **sequential launch gates**:

1. restore a green and reproducible baseline;
2. close authentication and upload authorization gaps;
3. add safe account bootstrap and initial credential setup;
4. replace ephemeral storage with private R2 storage;
5. add consent evidence, privacy disclosures, environment validation, and observability controls;
6. configure staging, verify role workflows, and promote to production.

An infrastructure-first deployment was rejected because it would expose known authorization and credential weaknesses. A single big-bang release was rejected because it would make failures difficult to isolate and rollback.

## 6. Architecture

### 6.1 Runtime Boundaries

The application keeps the existing Next.js monolith and repository pattern:

- pages and components render UI and collect input;
- server actions and route handlers validate input with Zod or focused validators;
- `lib/auth/session.ts` is the source of authenticated user identity;
- focused repositories enforce role, relationship, and ownership rules;
- Prisma is the only application path to PostgreSQL;
- storage adapters own object persistence, while application routes own authorization;
- sensitive mutations use the existing audit-log infrastructure.

No client-provided role, user ID, teacher ID, student ID, or parent-child link is accepted as proof of authorization.

### 6.2 Green Baseline and CI

The baseline gate will:

- update stale `Europe/Kiev` test expectations to `Africa/Nairobi` where they describe active behavior;
- retain historical migration text that accurately records old database defaults;
- fix the remaining full-suite failures based on their actual root causes;
- format affected files with the repository's existing Biome configuration;
- enforce LF line endings through `.gitattributes`;
- pin Node.js 22 through `package.json` engines and a repository version file;
- add a GitHub Actions workflow that runs install, Prisma generation and validation, lint, typecheck, tests, and build;
- keep generated `tsconfig.tsbuildinfo` out of intentional commits unless the repository explicitly requires an updated generated artifact.

CI must use non-secret test values and must never depend on production credentials.

### 6.3 Upload Authentication

`POST /api/upload` will ignore and stop accepting `x-role`. It will call the existing server session helpers and authorize only authenticated `TEACHER` and `ADMIN` users for the upload categories supported by this release.

The route will continue to enforce file-count, size, MIME-type, and filename rules. The storage key will be generated server-side and namespaced by category and authenticated user ID. Client filenames are metadata only and cannot choose an object path.

The route response will contain an opaque storage key and an application download URL. It will not expose R2 credentials, bucket URLs, local filesystem paths, or an unrestricted public object URL.

Security tests must prove that:

- an unauthenticated request receives `401`;
- a student or parent receives `403` for teacher/admin upload categories;
- a forged `x-role: TEACHER` header does not change authorization;
- an authenticated teacher cannot claim another user's storage namespace;
- invalid MIME types, empty files, oversized files, and traversal filenames remain rejected.

### 6.4 Initial Password and Administrator Enrollment

`AppUser` will gain `mustChangePassword Boolean @default(false)`. The migration leaves existing accounts at `false` to avoid locking out established users. Every new manually created portal account and the first bootstrap admin are explicitly created with `mustChangePassword: true`.

The shared `DEFAULT_PORTAL_PASSWORD` behavior will be removed from account creation. A cryptographically secure, 20-character temporary password will be generated for each new account, hashed with the existing password helper, returned once to the authorized administrator, and never written to logs or audit metadata.

Initial setup uses a short-lived, signed, HTTP-only setup cookie that is separate from the normal portal session. It is issued after valid email and password authentication when the user must change a password or when an administrator must enroll TOTP. The cookie is `Secure` in production, `SameSite=Lax`, purpose-bound, and expires after 15 minutes.

1. a user with `mustChangePassword: true` is redirected to `/portal/setup/password`;
2. the password action verifies the current password, validates a new password of at least 12 characters, prevents reuse of the temporary password, updates the hash, clears `mustChangePassword`, and records a password-change audit event;
3. a non-admin user then receives a normal role session and is redirected to the appropriate portal;
4. an admin subject to `ADMIN_REQUIRE_2FA=true` is redirected to `/portal/setup/2fa` if TOTP is not configured, whether or not a password change was required;
5. the admin setup route generates and confirms TOTP using the existing two-factor helpers, returns backup codes once, and only then creates a normal admin session with `mfaVerified: true`;
6. an admin who already has TOTP configured is moved from password setup into the existing pending-2FA verification flow rather than receiving a normal session;
7. the setup cookie cannot authorize `/admin`, `/portal/teacher`, `/portal/student`, `/portal/parent`, or protected APIs.

An admin who already has TOTP configured continues through the existing `/portal/login/verify-2fa` flow. Normal admin access remains unavailable until the password and 2FA requirements are satisfied.

### 6.5 Production Bootstrap

An idempotent production bootstrap script will replace demo seeding for production account initialization. It will consume:

- `BOOTSTRAP_ADMIN_EMAIL`;
- `BOOTSTRAP_ADMIN_NAME`;
- `BOOTSTRAP_ADMIN_PASSWORD`.

The script will:

- succeed without bootstrap variables when at least one active administrator already exists;
- require and validate all three bootstrap variables when no active administrator exists;
- reject incomplete or weak bootstrap credentials;
- create one active admin only when the configured email does not already exist;
- set `mustChangePassword: true` for a newly created bootstrap admin;
- never reset an existing user's password or 2FA settings;
- fail if the configured email belongs to a non-admin account;
- avoid printing the password or hash;
- report only whether the admin was created, already present, or blocked by invalid state.

`prisma/seed.ts` remains available for local/demo data but is not called by Render production commands.

### 6.6 Private Cloudflare R2 Storage

Production uses `STORAGE_DRIVER=r2`; local development may continue using `STORAGE_DRIVER=local`. The R2 implementation uses the S3-compatible AWS SDK and these server-only variables:

- `R2_ENDPOINT`;
- `R2_ACCESS_KEY_ID`;
- `R2_SECRET_ACCESS_KEY`;
- `R2_BUCKET_NAME`.

The R2 bucket remains private. `StorageService.getURL()` returns an application URL, not a bucket URL. A focused file-access route resolves the storage key, validates the signed session and related database record, then redirects to a short-lived signed R2 GET URL.

Authorization rules are:

- administrator: may access school-managed attachments and generated reports;
- teacher: may access files attached to their own course materials, classes, submissions they are assigned to review, and reports they own;
- student: may access material for an enrolled class, their own submission files, and their own reports;
- parent: may access only files and reports belonging to a linked child;
- public visitor: may access only an active teacher's explicitly public profile image through the public asset route.

External HTTPS links already supported by course materials and student URL submissions remain external links and are not copied into R2.

Upload, metadata persistence, and object cleanup are coordinated so that a failed material mutation does not create a successful audit event. Best-effort cleanup removes an uploaded object when a subsequent database mutation fails. Deleting a material first verifies teacher ownership in the repository and then removes the associated object.

### 6.7 Enrolment Consent and Privacy

`Enquiry` will gain nullable legacy-compatible fields:

- `consentVersion String?`;
- `consentGivenAt DateTime?`.

Existing records remain null and are labeled as legacy records with no captured consent evidence. The `/enrol` form will require the submitting parent or guardian to confirm that they are authorized to submit the child's information and have read the privacy policy. The server action validates `consentAccepted: true`; a client-only checked box is not sufficient. Every new enquiry stores consent version `enrolment-consent-v1` and a server-generated timestamp.

The public response retains the human-safe reference ID and submission timestamp but removes the internal `adminPath` and database record ID.

The privacy page will describe:

- the school as data controller and the published privacy contact channel;
- the purposes for enrolment, teaching, portal access, communication, security, and service operation;
- processing by Render, Cloudflare, Google services used by the school, Sentry when enabled, and the configured SMTP delivery provider;
- cross-border processing outside Kenya;
- access, correction, deletion, objection, and complaint channels;
- operational retention: unsuccessful enquiries for up to 24 months after last contact and authentication/security logs for up to 12 months, while active student records follow the school's education-record and legal retention duties;
- the parent or guardian consent requirement for a minor.

The deployment environment must provide the actual privacy contact email and SMTP provider display name. The code and documentation must not claim that the software itself completes ODPC registration or guarantees legal compliance.

### 6.8 Environment Contract

A focused production environment validator will run before production startup and as a Render pre-deploy check. The package `prestart` script will invoke the same validator before `next start`. It will reject unsafe production configuration without printing secret values.

Required production settings are:

- `NODE_ENV=production`;
- `DATABASE_URL` and `DIRECT_URL`;
- `AUTH_SESSION_SECRET` with at least 32 characters;
- `ADMIN_REQUIRE_2FA=true`;
- `GOOGLE_TIMEZONE=Africa/Nairobi`;
- `TURNSTILE_ENFORCE=true`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and `TURNSTILE_SECRET_KEY`;
- SMTP host, port, user, password, from address, and enquiry recipient;
- `STORAGE_DRIVER=r2` and all R2 credentials;
- `PRIVACY_CONTACT_EMAIL` and `PRIVACY_EMAIL_PROCESSOR_NAME`;
- health-alert authentication and recipient settings already required by the health subsystem;
- Sentry DSNs when `SENTRY_ENABLED=true`.

`DEFAULT_PORTAL_PASSWORD` is removed from the production contract. `PORT` is supplied by Render and is not hard-coded.

Prisma will use `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`. On Render, both may use the internal PostgreSQL connection when no separate pooler is used.

### 6.9 Sentry and Logging

A shared Sentry sanitizer will be used by server, edge, and client initialization. It removes or redacts:

- authorization and cookie headers;
- password, token, secret, backup-code, and session fields;
- enrolment names, email addresses, phone numbers, notes, and child details from event extras and breadcrumbs;
- request bodies for authentication, enrolment, contact, and setup routes.

Sentry traces use an environment-configured sample rate with a conservative production default. Application logs use reference IDs and technical status, not raw form payloads or secrets.

### 6.10 Render, Staging, and Domain

The existing Render resources are configured rather than duplicated through a new Blueprint. The web service and PostgreSQL database remain in the same Frankfurt region, which is the selected Render region for the Kenya launch. A deployment runbook will record the exact settings and secret names.

The web service commands are:

```text
Build: npm ci && npx prisma generate && npm run build
Pre-deploy: npm run env:check && npx prisma migrate deploy && npm run bootstrap:production
Start: npm run start
Health check: /api/health
```

Migrations run only in pre-deploy, not in both build and pre-deploy.

A `staging` branch and Render staging service use a separate PostgreSQL database, separate R2 prefix or bucket, separate Turnstile/Sentry environment, and no production personal data. Staging sets `APP_ENV=staging`; `robots.ts` returns `noindex, nofollow` unless `APP_ENV=production`.

Promotion order is:

1. feature branch passes CI;
2. staging branch deploys and passes smoke/E2E checks;
3. the approved feature branch is merged to `main`;
4. production migration, bootstrap, and deploy run;
5. health and role workflows are checked on the Render URL;
6. Cloudflare DNS is pointed to Render and HTTPS is verified;
7. `uluglobalacademy.com` becomes the canonical application URL and `www.uluglobalacademy.com` redirects to it.

Cloudflare proxies the public domain and caches only public static assets. `/admin`, `/portal`, `/api`, setup/authentication routes, and responses associated with the session cookie bypass edge caching.

Render account reactivation, billing, DNS ownership, R2 credentials, SMTP credentials, Turnstile keys, Sentry credentials, and legal/ODPC actions require the authorized account owner. Secrets are entered directly in provider dashboards and are not copied into chat, git, screenshots, or documentation.

## 7. Error Handling and Recovery

- Enrolment and contact records are considered accepted after the database write. SMTP failure is logged without losing the record, and the public response tells the user that follow-up will occur.
- Invalid production environment state fails before the web process accepts traffic.
- Bootstrap is idempotent and never resets an existing administrator.
- A failed upload returns a bounded public error and logs only technical metadata.
- A failed database mutation after upload triggers best-effort object cleanup and never writes a success audit log.
- Unauthorized file access returns `401` or `403`; missing file metadata returns `404` without revealing whether an unrelated user's object exists.
- Database migrations are additive for this release. Existing accounts remain usable because `mustChangePassword` defaults to `false`.
- If production deployment fails, Render keeps the last healthy application version. Database rollback uses a forward corrective migration rather than destructive schema reset.

## 8. Testing Strategy

### 8.1 Focused Automated Tests

- timezone tests for schedule and availability defaults;
- upload route authentication, role rejection, forged-header rejection, MIME/size/path validation, and storage errors;
- account repository tests for unique temporary passwords and `mustChangePassword`;
- initial password setup tests for expiry, password policy, password reuse, session restriction, successful rotation, and audit behavior;
- admin 2FA enrollment tests proving that no admin session exists before confirmed TOTP;
- production bootstrap tests for create, idempotent existing admin, role conflict, weak credentials, and secret redaction;
- R2 adapter tests with mocked S3 client operations;
- file-access repository/route tests for teacher, student, parent, admin, public profile image, and cross-user IDOR denial;
- enrolment action tests for required consent, persisted consent version/time, and absence of `adminPath`;
- environment validator tests for each required production invariant;
- Sentry sanitizer tests using representative nested event payloads;
- `robots.ts` tests for staging and production behavior.

### 8.2 Broad Automated Checks

The release branch must pass:

```text
npm ci
npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Broad Vitest and Playwright runs must report the selected files/tests so a filtered command is not mistaken for full-suite evidence.

### 8.3 Browser Verification

Staging browser verification records the user role, starting route, actions, visible result, and cross-role visibility for:

- public enrolment and contact submissions;
- admin login, initial password change, 2FA setup, logout, and subsequent 2FA login;
- admin creation of student, parent, and teacher accounts;
- first login and password change for each portal role;
- teacher material upload, student access, linked-parent access, unrelated-user denial, and teacher deletion;
- core schedule and portal dashboards in Nairobi time;
- desktop and 360-390 px mobile layouts;
- `/api/health` and a Render redeploy proving uploaded files persist.

## 9. Acceptance Criteria

The launch-critical MVP is ready for production promotion only when:

1. all broad automated checks pass from a clean install;
2. no protected upload or file route trusts a client-provided identity or role;
3. newly created users receive unique temporary passwords and cannot enter a portal before changing them;
4. an initial admin can securely configure 2FA in production but cannot access admin data before setup completion;
5. production never uses demo seed data or a shared portal password;
6. uploaded materials and generated reports survive a Render redeploy;
7. file access obeys teacher ownership, student enrollment, and parent-child links;
8. enrolment submissions persist parent/guardian consent evidence and expose no internal admin path;
9. production startup rejects missing security, storage, email, anti-spam, timezone, and privacy configuration;
10. Sentry and application logs do not capture secrets or enrolment payloads;
11. staging is non-indexed and uses isolated data and credentials;
12. Render production is active, migrations succeed once, health is green, HTTPS works, and the public domain resolves;
13. browser verification covers public, admin, teacher, student, and parent workflows;
14. remaining external legal and account-owner actions are documented without being misrepresented as code-complete.

## 10. Rollout and Commit Boundaries

Implementation is divided into reviewable commits:

1. baseline tests, formatting, Node pin, and CI;
2. authenticated upload route and security tests;
3. temporary-password lifecycle and restricted initial setup;
4. production bootstrap and Prisma direct URL;
5. R2 adapter and authorized file delivery;
6. enrolment consent and privacy disclosure updates;
7. environment validation, Sentry sanitization, and staging robots behavior;
8. deployment runbook and final verification corrections.

Each commit must pass its focused tests. Schema changes are reviewed before migration generation, and deployment occurs only after the complete release verification gate passes.
