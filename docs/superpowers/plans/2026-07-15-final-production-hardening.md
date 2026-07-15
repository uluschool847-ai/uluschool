# Final Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Critical or Important finding from the final launch reviews, make the release gate deterministic and strict, and leave the branch ready for an isolated Render staging deployment.

**Architecture:** Keep the existing Next.js 15, Prisma, custom-session, repository, and private-storage boundaries. Add database-backed one-time capabilities for administrator 2FA and pending uploads, keep sensitive mutations and audit writes atomic, and make CI run the same strict browser partitions used by the local release gate. Use focused additive migrations and do not rewrite unrelated portal features.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 5/PostgreSQL, Vitest, Playwright, GitHub Actions, Render, Cloudflare R2.

## Global Constraints

- `ADMIN_REQUIRE_2FA=true` means an administrator receives no normal admin session until password setup and TOTP verification are complete.
- Production and staging must reject enabled administrator SSO for this controlled MVP.
- Never write passwords, password hashes, TOTP secrets, backup codes, signed capabilities, storage credentials, or signed file tokens to logs or audit metadata.
- All sensitive state transitions and their success audit rows must commit or roll back together.
- All database changes are additive; never reset or push the local, staging, or production schema destructively.
- Production uploads use private R2 objects and application-authorized download URLs.
- Dates shown in school emails use `Africa/Nairobi` independent of the host operating-system timezone.
- Release Playwright partitions run with `retries=0`; a retry or skipped release test is not a passing launch gate.
- Database tests and migrations may target only the guarded local PostgreSQL database at `127.0.0.1:55432/ulu_school_c5` until the staging step.
- Every task follows RED, GREEN, focused verification, commit, independent spec/quality review, and correction of all Critical or Important findings.

---

### Task 1: Strict Release Gate And CI

**Files:**
- Modify: `e2e/portals/teacher-progress.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `scripts/__tests__/playwright-test-contract.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `app/__tests__/ci-config.audit.test.ts`

**Interfaces:**
- Consumes: existing `scripts/playwright-test.mjs` partition flags and the Next production build.
- Produces: focused retries only, strict release partitions, and a GitHub job that installs Chromium and runs `npm run test:e2e:release` after the production build.

- [ ] **Step 1: Add failing release-contract tests**

Add behavioral config assertions that load the Playwright config in fresh subprocesses and prove:

```ts
expect(configFor("focused").retries).toBe(1);
for (const partition of ["standard", "admin-2fa", "signed-delivery", "storage"]) {
  expect(configFor(partition).retries).toBe(0);
}
```

Extend the CI audit to require `npx playwright install --with-deps chromium` and `npm run test:e2e:release`, with browser installation after dependency installation and release E2E after the production build.

- [ ] **Step 2: Preserve the deterministic teacher-progress reproduction**

Run the existing single spec with `--retries=0 --trace=on` against the guarded local database. Confirm it fails because the click on `All progress` has not completed before the old detail-page filter form is used, and the trace ends at `status=active`.

- [ ] **Step 3: Implement the minimal navigation and retry fixes**

After clicking `All progress`, wait for the list route before selecting the list filter:

```ts
await page.getByRole("link", { name: /all progress|back to progress/i }).click();
await expect(page).toHaveURL(new RegExp("/portal/teacher/progress(?:\\?|$)"));
await page.getByLabel(/status/i).selectOption("archived");
```

Derive release retry policy from `E2E_PARTITION`:

```ts
const isReleasePartition = ["standard", "admin-2fa", "signed-delivery", "storage"].includes(partition);
// defineConfig
retries: isReleasePartition ? 0 : 1,
```

Update GitHub Actions to install Chromium and execute the aggregate release script. Raise the job timeout only as needed to cover the measured unit, build, and browser duration.

- [ ] **Step 4: Verify focused GREEN**

Run:

```powershell
npx vitest run scripts/__tests__/playwright-test-contract.test.ts app/__tests__/ci-config.audit.test.ts
node scripts/playwright-test.mjs --isolated-server --standard-partition --next-start e2e/portals/teacher-progress.spec.ts --retries=0 --trace=on
```

Expected: all contract tests pass and the Playwright spec passes once without retry or skip.

- [ ] **Step 5: Commit**

```powershell
git add -- e2e/portals/teacher-progress.spec.ts playwright.config.ts scripts/__tests__/playwright-test-contract.test.ts .github/workflows/ci.yml app/__tests__/ci-config.audit.test.ts
git commit -m "test: enforce strict release browser gate"
```

---

### Task 2: Administrator Authentication Hardening

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260715190000_admin_two_factor_challenges/migration.sql`
- Create: `lib/repositories/admin-two-factor-challenge-repository.ts`
- Create: `lib/repositories/__tests__/admin-two-factor-challenge-repository.test.ts`
- Create: `tests/repositories/admin-two-factor-challenge-repository.postgres.test.ts`
- Modify: `lib/auth/session.ts`
- Modify: `app/portal/login/actions.ts`
- Modify: `app/portal/login/verify-2fa/actions.ts`
- Modify: `app/api/auth/sso/callback/route.ts`
- Modify: `middleware.ts`
- Modify: `app/(admin)/admin/security/actions.ts`
- Modify: `components/admin/two-factor-settings.tsx`
- Modify: `lib/config/production-env.ts`
- Modify: `lib/__tests__/session-expiry.test.ts`
- Modify: `app/portal/login/__tests__/login-2fa-actions.test.ts`
- Modify: `tests/auth/login-actions.test.ts`
- Modify: `app/api/auth/sso/callback/route.test.ts`
- Modify: `tests/middleware.test.ts`
- Modify: `app/(admin)/admin/security/__tests__/actions.test.ts`
- Modify: `app/(admin)/admin/security/__tests__/page.test.tsx`
- Modify: `components/admin/__tests__/TwoFactorSettingsFeedback.test.tsx`
- Modify: `lib/config/__tests__/production-env.test.ts`

**Interfaces:**
- Consumes: signed pending-2FA cookie, `verifyTotpCode`, `consumeBackupCode`, Prisma serializable transactions, and `createAdminAuditLog`.
- Produces: a one-time database-backed challenge with a five-failure budget, atomic backup-code consumption, no SSO bypass, and no self-service 2FA disablement in the MVP.

- [ ] **Step 1: Write failing challenge and policy tests**

Cover all of these behaviors before implementation:

```text
new password login invalidates older pending challenges for the same admin
five invalid TOTP or backup submissions consume the challenge
a sixth submission cannot verify even with a valid code
two concurrent redemptions of one backup code produce exactly one session-capable success
backup-code removal and ADMIN_LOGIN_2FA_BACKUP_SUCCESS audit roll back together
SSO cannot pass mustChangePassword, unenrolled TOTP, or the pending TOTP challenge
production/staging reject ADMIN_SSO_ENABLED other than false and reject non-empty SSO URL/secret
mandatory administrator 2FA cannot be disabled from an existing bearer session
```

The PostgreSQL concurrency test must assert one success, one rejection, one persisted hash removal, and one success audit row.

- [ ] **Step 2: Add the additive challenge model**

Add `AdminTwoFactorChallenge` with:

```prisma
id             String   @id @default(cuid())
userId         String
authMethod     String
failedAttempts Int      @default(0)
expiresAt      DateTime
consumedAt     DateTime?
createdAt      DateTime @default(now())
updatedAt      DateTime @updatedAt
```

Add the `AppUser` relation with `onDelete: Cascade`, plus indexes on `[userId, expiresAt]` and `[expiresAt, consumedAt]`. Generate an additive SQL migration with the matching foreign key and indexes.

- [ ] **Step 3: Implement concurrency-safe challenge operations**

Use a maximum of five failures. Start a challenge in a serializable transaction that consumes prior active challenges for the user and creates a fresh row. Invalid-code recording must increment only an unconsumed, unexpired challenge below the budget and consume it at the fifth failure. Successful TOTP and backup-code completion must compare-and-set the challenge to consumed and write the success audit in the same transaction.

Backup-code verification must re-read the current hash array inside a serializable transaction. On serialization conflict (`P2034`), retry the complete transaction from the fresh row so concurrent use of the same or different backup codes cannot replay or restore a consumed hash.

- [ ] **Step 4: Bind the signed cookie to the database challenge**

Extend the pending payload with `challengeId` and `authMethod`. A decoded cookie is only a pointer; the verification repository decides whether it is live. Clear the cookie on expiry, lockout, or successful completion, and create the normal session only after the repository returns a committed success.

Remove the `authMethod === "sso"` exemption from middleware and backend role checks.

- [ ] **Step 5: Fail closed for MVP SSO and 2FA disablement**

Add `ADMIN_SSO_ENABLED`, `ADMIN_SSO_LOGIN_URL`, and `ADMIN_SSO_SHARED_SECRET` to the production environment schema. For staging and production require:

```text
ADMIN_SSO_ENABLED=false
ADMIN_SSO_LOGIN_URL empty
ADMIN_SSO_SHARED_SECRET empty
```

Keep the callback defensive: accounts requiring a password change are rejected, and an enabled SSO flow must use the normal pending-TOTP challenge instead of setting `mfaVerified` unconditionally.

Remove the self-service disable control from the administrator security page for the launch. The server action must reject direct invocation while the mandatory policy is active. Any allowed non-production factor transition must update state and audit in one transaction.

- [ ] **Step 6: Correct authentication audit semantics**

Record password-stage completion as `ADMIN_LOGIN_PASSWORD_VERIFIED`; reserve `LOGIN_SUCCESS` for a committed final authentication. Remove hard-coded loopback/user-agent placeholders. Store only bounded request metadata that the application can identify honestly; do not trust arbitrary forwarded IP headers.

- [ ] **Step 7: Verify focused GREEN**

Run the challenge repository unit and guarded PostgreSQL concurrency tests, login/2FA action tests, SSO callback tests, middleware tests, production environment tests, administrator security tests, and the administrator 2FA E2E partition. Expected: no retry, skip, leaked secret, replay, or non-atomic success.

- [ ] **Step 8: Commit**

```powershell
git add -- prisma lib/auth lib/repositories app/portal/login app/api/auth/sso middleware.ts 'app/(admin)/admin/security' components/admin lib/config tests
git commit -m "fix: harden administrator two-factor authentication"
```

---

### Task 3: Durable Private Upload Lifecycle

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260715200000_pending_uploads/migration.sql`
- Create: `lib/repositories/pending-upload-repository.ts`
- Create: `lib/repositories/storage-reference-repository.ts`
- Create: focused unit and guarded PostgreSQL tests for both repositories
- Modify: `app/api/upload/route.ts`
- Modify: `app/api/upload/__tests__/route.test.ts`
- Modify: `app/portal/teacher/actions/material-actions.ts`
- Modify: `app/portal/teacher/components/MaterialForm.tsx`
- Modify: `lib/repositories/course-material-repository.ts`
- Modify: `lib/repositories/report-repository.ts`
- Modify: `tests/portal/teacher-material-actions.test.ts`
- Modify: `e2e/storage/signed-file-delivery.spec.ts`
- Modify: `docs/deployment/render-production.md`
- Modify: `docs/deployment/launch-checklist.md`

**Interfaces:**
- Consumes: authenticated uploader identity, purpose-bound storage namespaces, private `StorageService`, material transactions, and normalized persisted storage aliases.
- Produces: expiring owner-bound pending reservations, atomic finalization, bounded storage exposure, fail-closed cross-table orphan checks, and broader route-level signed-delivery coverage.

- [ ] **Step 1: Write failing lifecycle and reference tests**

Cover upload-then-cancel, upload twice before submit, expired sweep, storage-delete failure retry, material create/update audit rollback, expired/foreign/forged reservation rejection, one-winner concurrent finalize-versus-sweep, owner quota rejection, alias-equivalent attachment references, and references in `CourseMaterial.fileUrl`, `Submission.contentUrl`, `ReportSnapshot.pdfStorageKey`, and `Teacher.photoUrl`.

- [ ] **Step 2: Add the additive pending-upload model**

Add `PendingUpload` with a unique `storageKey`, owner relation, purpose, filename, MIME type, byte size, expiry, and creation timestamp. Use a one-hour expiry, at most 20 outstanding reservations per owner, a 2 GiB active-plus-pending owner quota, and an in-process defense-in-depth rate of 30 upload requests per minute per authenticated owner. Add indexes on `[ownerId, purpose, expiresAt]` and `expiresAt`.

- [ ] **Step 3: Implement reservation, finalization, release, and sweep**

Provide focused repository/service functions that:

```text
reserve only metadata that exactly matches the completed storage write
finalize only unexpired rows owned by the authenticated actor and matching the submitted metadata
delete reservations in the same transaction that creates material attachment rows and success audits
claim a pending row before object deletion so finalize and cleanup cannot both win
re-create an immediately expired reservation when object deletion fails, allowing a later sweep retry
sweep in bounded batches and treat database lookup failure as no-delete
```

Call an owner-scoped expired sweep before quota evaluation on upload. Also invoke the bounded global sweep from an existing token-protected cron workflow and document its Render schedule.

- [ ] **Step 4: Integrate the upload route and material workflow**

After each successful R2/local write, persist a pending row; if persistence fails, delete the new object best effort and report a generic upload failure. On material create or replacement, consume every matching reservation inside the material/audit transaction. Add authenticated `DELETE /api/upload` release behavior and have the material form release a superseded pending upload. Validation failures may leave a bounded reservation for retry; database/audit failures must release it best effort.

- [ ] **Step 5: Make orphan checks alias-aware and cross-table**

Move the report repository's reference pattern into `storage-reference-repository.ts`. Normalize each candidate to its complete alias set and query every persisted reference column before deletion. Any lookup error returns `referenced=true`. Use the shared helper from both report and material cleanup paths.

- [ ] **Step 6: Expand real-route signed-delivery coverage**

Extend the existing offline-presigner E2E with administrator referenced/unreferenced access, parent linked/unlinked access, one report PDF, and one submission attachment. Requests must use the real signed session, route, PostgreSQL policy, and application redirect without live R2 network access.

- [ ] **Step 7: Verify focused GREEN**

Run Prisma validate/generate/migrate on the guarded local database, pending-upload and storage-reference unit/PostgreSQL tests, upload route tests, material action/repository tests, storage adapter tests, and the strict signed-delivery and storage Playwright partitions. Expected: no retry, skip, orphan deletion of a live alias, or double finalization.

- [ ] **Step 8: Commit**

```powershell
git add -- prisma lib/repositories app/api/upload app/portal/teacher tests e2e/storage docs/deployment
git commit -m "fix: make private upload lifecycle durable"
```

---

### Task 4: Nairobi, Monitoring, And Environment Hardening

**Files:**
- Modify: `lib/services/email.ts`
- Modify: `tests/lib/services/email.test.ts`
- Modify: `lib/monitoring/sentry-sanitize.ts`
- Modify: `tests/lib/monitoring/sentry-sanitize.test.ts`
- Modify: `lib/config/production-env.ts`
- Modify: `lib/config/__tests__/production-env.test.ts`
- Modify: `.env.example`
- Modify: applicable deployment checklists/runbooks

**Interfaces:**
- Consumes: existing email templates, shared Sentry sanitizer hooks, and production environment validation.
- Produces: host-independent Nairobi timestamps, token-safe file-route telemetry, and rejection of dormant seed/shared-password and reserved-domain placeholders.

- [ ] **Step 1: Write failing timezone, sanitizer, and environment tests**

Run reminder email rendering in a subprocess with a non-Kenyan `TZ` and require the same Nairobi text. Add sanitizer events whose request URLs and transaction names include `/api/files/<token>` and `/api/public-files/<token>`, and require `[Filtered]` or a stable parameter placeholder instead of the token. Add environment table cases for `.invalid`, `.example`, `.test`, localhost monitoring URLs and any non-empty `SEED_PORTAL_PASSWORD`.

- [ ] **Step 2: Pin school email formatting to Nairobi**

Use one shared `Intl.DateTimeFormat("en-GB", { dateStyle, timeStyle, timeZone: "Africa/Nairobi" })` path for class start/end and assignment due dates. Do not depend on host `TZ` or a browser locale.

- [ ] **Step 3: Sanitize signed file routes**

Treat `/api/files` and `/api/public-files` as sensitive route prefixes. Rewrite dynamic token segments in request URLs and transaction names to a stable placeholder before Sentry receives them, while preserving the route family and HTTP method for grouping. Keep query/body/cookie/header redaction unchanged or stricter.

- [ ] **Step 4: Reject dormant and reserved placeholders**

Reject non-empty `SEED_PORTAL_PASSWORD` and `DEFAULT_PORTAL_PASSWORD` in staging/production. For alert and Sentry HTTPS URLs, reject loopback hosts and IANA-reserved `.invalid`, `.example`, and `.test` names without weakening valid provider DSNs.

- [ ] **Step 5: Verify focused GREEN and commit**

Run the email, sanitizer, production environment, CI audit, privacy, alert, and storage configuration test slices, followed by lint and typecheck.

```powershell
git add -- lib/services/email.ts tests/lib/services/email.test.ts lib/monitoring/sentry-sanitize.ts tests/lib/monitoring/sentry-sanitize.test.ts lib/config .env.example docs/deployment
git commit -m "fix: harden Nairobi production configuration"
```

---

### Task 5: Final Review, Full Gate, And Staging Handoff

**Files:**
- Modify only files required by verified final-review findings.
- Record ignored evidence under `.superpowers/sdd/`.

**Interfaces:**
- Consumes: all four reviewed task commits.
- Produces: a clean branch, strict local release evidence, final whole-branch approval, and exact SHA/environment inputs for isolated staging.

- [ ] **Step 1: Run independent task reviews**

For each task, generate a review package from its recorded base to head. Require both spec compliance and code-quality verdicts. Dispatch one correction worker for the complete Critical/Important list and re-review until clean.

- [ ] **Step 2: Run the full guarded local gate from scratch**

Run Prisma validate/generate/migrate/seed, lint, typecheck, full Vitest, production build, focused Playwright, and all strict release partitions. Record exact summaries. Required result: exit 0, no failed or skipped release tests, no retries in any release partition, and no orphan process.

- [ ] **Step 3: Run the final whole-branch review**

Review `298ebca3a3f73ed058f1fbdc2ec485f001a4e458..HEAD` with the approved launch spec, all domain reviews, task reports, and final gate log. Correct every Critical or Important finding in one coordinated fix wave, re-run affected tests, and re-review.

- [ ] **Step 4: Publish and stage**

Push the feature branch, create the isolated `staging` branch/PR, require GitHub CI green, and deploy the exact reviewed SHA to separate Render PostgreSQL, web, R2, Turnstile, SMTP, and Sentry staging resources in Frankfurt. Run the documented B01-B12 browser matrix before any merge to `main`.

- [ ] **Step 5: Production go/no-go**

Merge and deploy to production only when the staging SHA equals the approved SHA and every external owner-controlled gate is `GO`: Render billing/workspace, backup/PITR, private R2 persistence, SMTP, Turnstile, Sentry/alerts, bootstrap admin, Cloudflare/DNS, legal/ODPC actions, rollback owner, and production smoke tests.
