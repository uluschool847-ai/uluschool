# Final Production Hardening Task 3 Report

Date: 2026-07-15
Branch: launch/mvp-production-readiness

## Scope

Implemented the private-upload reservation lifecycle and durable orphan cleanup required by
final-hardening-task-3-brief.md. Every Prisma and PostgreSQL operation used only the
following process-local database URL after asserting scheme, host, port, and database:

~~~
postgresql://postgres:postgres@127.0.0.1:55432/ulu_school_c5?schema=public
~~~

No repository .env database credentials, remote database, or live R2 storage was used.
Route and browser tests use the offline presigner and local storage mocks.

## Changed Files And Modules

- prisma/schema.prisma
- prisma/migrations/20260715200000_pending_uploads/migration.sql
- lib/repositories/pending-upload-repository.ts
- lib/repositories/storage-reference-repository.ts
- lib/repositories/course-material-repository.ts
- lib/repositories/report-repository.ts
- app/api/upload/route.ts
- app/api/cron/automation/route.ts
- app/portal/teacher/actions/material-actions.ts
- app/portal/teacher/components/MaterialForm.tsx
- app/(admin)/admin/teachers/actions.ts
- app/(admin)/admin/teachers/__tests__/actions.test.ts
- app/api/upload/__tests__/route.test.ts
- tests/app/api/cron/automation.route.test.ts
- tests/components/portal/MaterialForm.test.tsx
- tests/portal/teacher-material-actions.test.ts
- tests/repositories/course-material-repository.test.ts
- tests/repositories/pending-upload-repository.postgres.test.ts
- tests/repositories/storage-reference-repository.postgres.test.ts
- lib/repositories/__tests__/pending-upload-repository.test.ts
- lib/repositories/__tests__/storage-reference-repository.test.ts
- lib/repositories/__tests__/report-repository.test.ts
- e2e/portals/teacher-materials.spec.ts
- e2e/storage/signed-file-delivery.spec.ts
- docs/deployment/render-production.md
- docs/deployment/launch-checklist.md

## Model And Migration

Added additive PendingUpload reservations with an owner relation, globally unique storageKey,
purpose, exact upload metadata, expiry, and indexes for owner/purpose and expiry sweeps. The
20260715200000_pending_uploads migration was applied to guarded local PostgreSQL 18 and creates
the owner foreign key with cascade cleanup.

Reservations expire after one hour. A serializable owner-scoped transaction sweeps that owner's
expired reservations before checking the cap, enforces at most 20 outstanding reservations, and
enforces a 2 GiB active-plus-pending quota. The route has an in-process 30 requests/minute owner
defense.

## TDD Evidence

### RED

- Foundational repository units initially failed with two missing-module suites and zero tests:
  npx vitest run lib/repositories/__tests__/storage-reference-repository.test.ts lib/repositories/__tests__/pending-upload-repository.test.ts
- Guarded PostgreSQL lifecycle/reference tests initially had five P2021 reservation failures before
  migration, while two reference cases passed:
  RUN_TASK3_POSTGRES_INTEGRATION=1; npx vitest run tests/repositories/pending-upload-repository.postgres.test.ts tests/repositories/storage-reference-repository.postgres.test.ts
- Exact targeted RED commands and results:
  - npx vitest run tests/repositories/course-material-repository.test.ts -t "finalizes exact pending"
    -> 1 failed; finalizer was not called.
  - npx vitest run tests/portal/teacher-material-actions.test.ts -t "releases pending"
    -> 1 failed; release was not called.
  - npx vitest run app/api/upload/__tests__/route.test.ts -t "returns 201 with upload metadata"
    -> 1 failed; reservation was not called.
  - npx vitest run tests/components/portal/MaterialForm.test.tsx -t "releases a superseded pending upload"
    -> 1 failed; the final request was still POST.
  - npx vitest run lib/repositories/__tests__/report-repository.test.ts -t "uses the shared reference helper"
    -> 1 failed; the helper was not called.
  - npx vitest run app/(admin)/admin/teachers/__tests__/actions.test.ts -t "retains a replaced teacher photo"
    -> 1 failed; the helper was not called.
  - npx vitest run tests/app/api/cron/automation.route.test.ts -t "returns success when token matches"
    -> 1 failed; the sweep was not called.
  - npx vitest run lib/repositories/__tests__/pending-upload-repository.test.ts -t "normalizes active attachment aliases"
    -> 1 failed; an alias-equivalent reservation incorrectly succeeded.

### GREEN

- Foundational repository units: 17 tests passed when first implemented; final pending-upload unit
  suite has 11 tests.
- After guarded migration deploy, PostgreSQL lifecycle/reference integration has 8 passing tests,
  including concurrent claim handling, quota alias normalization, ownership, and cleanup retry.
- Course material repository: 45 tests passed. Teacher material actions: 62 tests passed.
  Upload route: 43 tests passed.
- Final focused Task 3 regression: 20 files / 537 tests passed, covering repository usage, report,
  admin teacher-photo, cron, form, private/public storage adapters, and PostgreSQL paths.
- Playwright contract suite: 60 tests passed.
- Strict signed-delivery partition: 1 test passed in 10.0 seconds, zero retries/skips.
- Strict storage partition: 6 tests passed in 5.2 minutes, zero retries/skips.

### Exact Final GREEN Commands

~~~powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/ulu_school_c5?schema=public'
$env:DIRECT_URL='postgresql://postgres:postgres@127.0.0.1:55432/ulu_school_c5?schema=public'
# Assert URI scheme=postgresql, host=127.0.0.1, port=55432, database=ulu_school_c5.
npx prisma validate                    # passed
npx prisma generate                    # passed
npx prisma migrate deploy              # passed
npx prisma migrate status              # passed: 27 migrations, schema up to date
$env:RUN_TASK3_POSTGRES_INTEGRATION='1'
npx vitest run tests/repositories/pending-upload-repository.postgres.test.ts tests/repositories/storage-reference-repository.postgres.test.ts
# passed: 8 tests
npx vitest run tests/repositories/course-material-repository.test.ts
# passed: 45 tests
npx vitest run tests/portal/teacher-material-actions.test.ts
# passed: 62 tests
npx vitest run app/api/upload/__tests__/route.test.ts
# passed: 43 tests
npx vitest run lib/repositories/__tests__/pending-upload-repository.test.ts lib/repositories/__tests__/storage-reference-repository.test.ts
# passed: final pending-upload suite 11 tests; foundational first GREEN was 17 tests
npm run test:e2e:signed-delivery       # passed: 1 test, zero retries/skips
npm run test:e2e:storage               # passed: 6 tests, zero retries/skips
npm run lint                           # passed: 847 files checked
npm run typecheck                      # passed
npm run build                          # passed: 88 static pages
git diff --check                       # passed
~~~

## Ownership, Transactions, And Race Safety

- Upload POST and DELETE use the signed server session and scope reservations to session.uid.
  Client-supplied owner IDs are never trusted, and public reservation/finalization errors are
  generic.
- Storage writes occur before reservation. Reservation failure best-effort deletes the just-written
  object and returns a generic failure. Every accepted single or batch item gets a reservation.
- Material create/replacement finalizes matching owner, purpose, key, filename, MIME type, byte
  size, and unexpired reservations inside the same material, attachment, and success-audit
  transaction. The repository uses that transaction client rather than global Prisma.
- Failure after a material transaction starts releases owned reservations best effort. The form
  calls authenticated DELETE /api/upload for superseded/cancelled selections.
- The sweeper claims in a serializable transaction before checking/deleting storage, so finalizer
  and sweeper have one winner. Storage delete failure recreates an immediately expired reservation
  for bounded retry.
- The common helper accepts Prisma or a transaction client, normalizes complete aliases, and checks
  Attachment.storageKey, CourseMaterial.fileUrl, Submission.contentUrl,
  ReportSnapshot.pdfStorageKey, and Teacher.photoUrl. Lookup errors fail closed as referenced.
  It is used by material, report, and administrator teacher-photo cleanup.
- Referenced expired reservations are removed without deleting the live object. Reference checks
  prevent double-counting active and pending storage.

## Audit, Revalidation, Cleanup, And Cron

The existing material create/update success audit remains in the successful transaction with
reservation finalization. Failed mutations do not write success audits. Existing affected teacher,
student, parent, and admin material revalidation paths are retained. Upload cancellation does not
mutate material records and intentionally emits no material success audit.

The existing Bearer CRON_SECRET authorization on /api/cron/automation remains in place. An
authorized invocation runs the bounded global reservation sweep with automation generation.
Render documentation now specifies a private Render Cron Job calling GET /api/cron/automation
every ten minutes with the Bearer secret.

Superseded/cancelled uploads invoke authenticated DELETE. Expired reservations are claimed before
delete, referenced objects are retained, and failed object deletes regenerate immediately expired
retry reservations. All stale-object deletion paths use the common fail-closed reference guard.

## Browser Verification

- A teacher signed session uploads a file, replaces a pending selection, receives a successful
  authenticated DELETE cancellation, uploads the replacement, saves material, and sees it persist.
- Strict storage covers teacher ownership boundaries and protected delivery for materials,
  submission attachments, report PDFs, and administrator referenced/unreferenced objects.
- Linked and unlinked parent sessions verify allowed and denied material/report/submission access;
  student and teacher cross-owner cases are denied.
- Browser coverage used signed local sessions, guarded local PostgreSQL, and offline presigning
  only; no live storage request was made.

## Self-Review And Verification

- No auth/session implementation changes were made.
- The migration is additive. Guarded Prisma validate/generate/migrate deploy/migrate status
  succeeded with 27 migrations and an up-to-date schema.
- Storage deletion is guarded by one complete transaction-aware helper, and lookup failures fail
  closed.
- Owner reservations are bounded and serializable, with a single sweeper/finalizer winner and an
  explicit retry record on storage deletion failure.
- npm run lint passed with 847 files checked. npm run typecheck passed. npm run build passed,
  compiling and generating 88 static pages. git diff --check is clean.

## Known Risk

npm run test completed but remains red outside Task 3: 57 failures in seven pre-existing Task 1
middleware test files. Those mocks omit the now-used verifyAdminPendingTwoFactorToken export while
middleware.ts invokes it. Two Task 3 repository-usage audit failures were corrected afterwards;
the targeted repository-usage suite then passed 21 tests. The remaining middleware failures were
not changed because this task forbids auth/session behavior changes and requires preserving Task 1
and Task 2 work. The Task 3 focused and strict browser partitions all pass.

The required 30 requests/minute defense is intentionally in-process, not a distributed limiter
across separate application instances.

## Review Correction - 2026-07-16

This correction addresses every independent-review finding I1-I4 and M1-M2.

- I1: `PendingUpload` claims are now persisted as tokenized leases. Lookup uncertainty and storage
  failures release the same durable row, stale leases are reclaimed, and cron returns 503 when a
  retry state cannot be preserved.
- I2: all retained pending rows, including expired and claimed retry rows, count toward the 20-row
  cap and the 2 GiB owner accounting. `ActiveStorageObject` records finalized material, report, and
  teacher-photo objects; unknown legacy reference sizes conservatively block further reservation.
- I3: the owner rate-limit slot is consumed immediately after authentication, before multipart body
  reads, and its in-process map evicts dormant/least-recent owners.
- I4: `MaterialForm` uses upload generations, releases stale successful responses, blocks Cancel
  while uploads are unresolved, and preserves the latest selected attachment.
- M1: teacher-photo cleanup normalizes current and legacy aliases before enqueuing durable cleanup.
- M2: `finalizePendingUploads` requires a supplied transaction client and writes active accounting
  before removing the reservation.

### Correction Verification

All database commands below set process-local `DATABASE_URL` and `DIRECT_URL` to
`postgresql://postgres:postgres@127.0.0.1:55432/ulu_school_c5?schema=public` and assert the exact
scheme, host, port, database, and `?schema=public` query before access. No database command used a
different endpoint.

- `npx vitest run app/api/upload/__tests__/route.test.ts app/(admin)/admin/teachers/__tests__/actions.test.ts tests/app/api/cron/automation.route.test.ts tests/components/portal/MaterialForm.test.tsx tests/portal/teacher-material-actions.test.ts tests/repositories/course-material-repository.test.ts tests/repositories/report-repository.test.ts lib/repositories/__tests__/pending-upload-repository.test.ts lib/repositories/__tests__/pending-upload-rate-limiter.test.ts lib/repositories/__tests__/storage-reference-repository.test.ts lib/repositories/__tests__/report-repository.test.ts prisma/__tests__/pending-upload-hardening-schema.test.ts`
  passed: 12 files, 295 tests.
- `git diff --exit-code -- prisma/migrations/20260715200000_pending_uploads/migration.sql`,
  `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy`, and
  `npx prisma migrate status` passed; the original migration is unchanged, the additive claims and
  active-storage migration is applied, and 28 migrations are current.
- `RUN_TASK3_POSTGRES_INTEGRATION=1 npx vitest run tests/repositories/pending-upload-repository.postgres.test.ts tests/repositories/storage-reference-repository.postgres.test.ts`
  passed: 2 files, 12 tests.
- `npm run build` passed twice after the correction: Biome checked 849 files, type validation
  passed, and Next generated 88 pages.
- `npm run test:e2e:storage` passed: 6 Playwright tests in 4.5 minutes using guarded local
  PostgreSQL and offline storage behavior. No orphaned Vitest or Playwright process was present
  before the run, so no process termination was necessary.
- After rebuilding immediately before `next start`, `npm run test:e2e:signed-delivery` passed:
  1 Playwright test in 9.2 seconds with real signed sessions, local PostgreSQL policy, Next routes,
  and offline R2 presigning.
- Final `npm run lint`, `npm run typecheck`, and `git diff --check` passed.

### Correction Self-Review And Remaining Risks

- The migration is additive; the already-applied `20260715200000_pending_uploads` migration was not
  rewritten. Reservation ownership remains server-session scoped, material and teacher-photo
  finalization stays inside serializable audit transactions, and failed cleanup retains a durable
  retry candidate.
- `npm run test` completed with 3,641 passing tests and two failures in
  `app/__tests__/env-dependencies.audit.test.ts`. A concurrent, separate
  `scripts/__tests__/playwright-test-contract.test.ts` temporarily creates and deletes an
  `e2e/playwright-contract-decoy-*` directory while the audit enumerates source files; the audit
  passes alone (20 tests). This unrelated full-suite parallelism race is outside the dirty Task 3
  scope and was not changed.
- The first signed-delivery invocation after the storage partition could not start because that
  isolated `next dev` runner had removed `.next/BUILD_ID`; rebuilding immediately before the
  `next start` invocation resolved the harness ordering condition. The final signed-delivery run
  passed.
- The request limiter remains intentionally process-local rather than distributed across instances.

## Second Review Correction - 2026-07-16

This wave resolves all binding re-review findings I1-I4 and M1.

### Implemented Corrections

- I1: owner quota accounting now includes every teacher-owned `CourseMaterial.fileUrl` and
  normalizes current and legacy aliases with pending rows, active ledger rows, and attachments.
  An attachment-less managed reference without known ledger metadata blocks further growth. Managed
  attachment-less URLs are queued on replacement/delete inside the supplied transaction, with
  normalized deduplication, external URL exclusion, and shared-reference retention.
- I2: persisted references are classified as managed, proved non-storage (`https:` and root-static),
  or uncertain. External/static report and photo values do not consume quota; malformed or
  storage-looking values remain fail-closed.
- I3: each `MaterialForm` effect setup restores `mountedRef`, including the React StrictMode replay.
  StrictMode overlap, cancellation, and post-unmount upload completion release the correct object.
- I4: the source-environment audits tolerate only `ENOENT` entries that disappear between walk/read
  operations. A deterministic regression test covers both `stat` and `readFile` disappearance;
  other filesystem errors and all audit violations still fail.
- M1: submit starts synchronously through a ref, disables file URL/file picker/upload controls, and
  guards their handlers so deferred actions cannot mutate attachment state during submission.
- The storage Playwright fixture now gives its attachment-less legacy material an active ledger row,
  matching the production fail-closed accounting contract.

### RED And GREEN Evidence

Initial focused RED coverage exposed missing file-URL accounting/cleanup, incorrect external/static
classification, StrictMode mount state, and mutable submit controls. The first guarded storage
Playwright run also failed with upload HTTP 500 because its fixture intentionally had an
attachment-less legacy managed URL with no ledger size. That was corrected by adding the matching
fixture ledger row; the production accounting remains fail-closed for genuinely unknown references.

All database commands set process-local `DATABASE_URL` and `DIRECT_URL` exactly to
`postgresql://postgres:postgres@127.0.0.1:55432/ulu_school_c5?schema=public` and validated scheme,
host, port, database, and query before access. No database command used an `.env` database URL.

~~~powershell
npx vitest run lib/repositories/__tests__/pending-upload-repository.test.ts tests/repositories/course-material-repository.test.ts tests/components/portal/MaterialForm.test.tsx __tests__/env-dependencies.test.ts app/__tests__/env-dependencies.audit.test.ts
# passed: 4 files, 128 tests

$env:RUN_TASK3_POSTGRES_INTEGRATION='1'
npx vitest run tests/repositories/pending-upload-repository.postgres.test.ts tests/repositories/storage-reference-repository.postgres.test.ts
# passed: 2 files, 17 tests

npm run test:e2e:storage
# passed: 6 Playwright tests in 5.8 minutes after the fixture ledger correction

npm run build
# passed: Biome checked 849 files, type validation passed, Next generated 88 pages

npm run test:e2e:signed-delivery
# passed: 1 Playwright test in 10.4 seconds

npm run typecheck
# passed

npm run test
# passed: 372 files passed, 6 skipped; 3,659 tests passed, 39 skipped
~~~

No Prisma schema or migration changed in this wave. The already-applied Task 3 migrations were not
rewritten, so Prisma validate/generate/migrate commands were not rerun.

### Second-Wave Self-Review And Remaining Risks

- Current/legacy managed aliases are deduplicated before quota sums and deletion queueing. Cleanup
  never queues external/root-static URLs and rechecks durable references before moving a ledger row
  into pending cleanup.
- The audit race fix is narrowly limited to concurrent `ENOENT`; permission, malformed-path, and
  audit-content failures still surface.
- The in-process upload request limiter remains intentionally non-distributed across application
  instances. Unknown managed-looking legacy data continues to block quota growth by design until it
  receives ledger metadata or is remediated.

## Owner Attribution Correction - 2026-07-16

This correction resolves the final second re-review Important finding without changing schema,
migrations, external/static classification, or legacy alias policy.

### Behavior And Ownership

- Current teacher-photo keys are parsed only after complete current-key validation and must have the
  exact direct shape `public/teachers/{administratorId}/{filename}`.
- A valid current photo attributed to another administrator is excluded from the current owner's
  accounting. It cannot consume or block the current owner's reservation quota.
- A current owner's own managed photo still uses that owner's pending/active map and blocks growth
  when no ledger metadata exists.
- Malformed current-photo shapes and ownerless legacy aliases remain unattributed and fail closed.
  Existing external HTTPS, root-static, and alias normalization behavior is unchanged.

### Exact RED And GREEN Evidence

Both RED database and GREEN database commands set process-local `DATABASE_URL` and `DIRECT_URL`
exactly to `postgresql://postgres:postgres@127.0.0.1:55432/ulu_school_c5?schema=public` and asserted
the exact scheme, host, port, database path, and query before access. No `.env` database URL was
used.

~~~powershell
npx vitest run lib/repositories/__tests__/pending-upload-repository.test.ts
# RED: 1 failed, 26 passed; administrator B was blocked by administrator A's valid current photo.

$env:RUN_TASK3_POSTGRES_INTEGRATION='1'
npx vitest run tests/repositories/pending-upload-repository.postgres.test.ts
# RED: 1 failed, 15 passed; the real two-admin reservation reproduced the same false block.

npx vitest run lib/repositories/__tests__/pending-upload-repository.test.ts app/api/upload/__tests__/route.test.ts 'app/(admin)/admin/teachers/__tests__/actions.test.ts'
# GREEN: 3 files, 109 tests passed.

$env:RUN_TASK3_POSTGRES_INTEGRATION='1'
npx vitest run tests/repositories/pending-upload-repository.postgres.test.ts tests/repositories/storage-reference-repository.postgres.test.ts
# GREEN: 2 files, 18 tests passed.

npm run test
# GREEN: 372 files passed, 6 skipped; 3,662 tests passed, 40 skipped.

npm run lint
# GREEN: Biome checked 849 files with no fixes required.

npm run typecheck
# GREEN: tsc --noEmit passed.
~~~

### Attribution Self-Review And Remaining Risks

- The focused owner parser uses the established current storage-key validator and validated teacher
  photo namespace; it performs no prefix slicing. Upload metadata ownership and quota attribution
  now share the same exact direct-photo shape.
- PostgreSQL coverage proves A's ledger-backed photo does not block B and B's own unledgered photo
  still blocks B. Unit coverage separately retains malformed current, malformed storage-looking,
  legacy, external, and root-static outcomes.
- No browser-facing behavior or UI changed, so no Playwright rerun was required for this correction.
  The upload request limiter remains intentionally process-local, as previously documented.
