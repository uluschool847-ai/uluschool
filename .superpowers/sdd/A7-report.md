# A7 Implementation Report

## A7 Correction Wave Plan

1. Add RED tests for strict repository boundary parsing, valid password-hash recognition, signed setup-capability freshness, post-commit cookie replacement faults, and explicit handoff recovery.
2. Add RED action/page/component tests for stale-before-confirm, rotation-during-confirm, secret removal, restart and handoff commands, copy feedback, and focus behavior.
3. Implement a bounded signed setup capability, precomputed normal-session cookie material, one centralized mutually exclusive auth-cookie replacement helper, and typed `restart-required` / `handoff-required` action states.
4. Add a recovery repository/action path that uses only the signed server setup identity, rotates exactly eight valid backup-code hashes with a sanitized audit, and never persists or accepts plain backup codes.
5. Add a PostgreSQL-gated integration suite for begin/begin, begin/confirm, confirm/confirm, and audit rollback, plus Playwright coverage for invalid code, stale restart, one-time backup-code display, refresh, cookie exclusivity, and later normal TOTP login.
6. Run focused RED/GREEN commands, adjacent auth checks, typecheck/lint, available PostgreSQL and browser gates, self-review the A7-only diff, append exact evidence and residual response-delivery limits here, then commit one coherent correction wave.

Security and routing scope: `/portal/setup/2fa`, focused auth/session and password-hash helpers, `account-setup-repository`, sanitized 2FA audit events, and A7 tests only. Identity remains derived from `getInitialSetupSession`; no client user id, plaintext backup-code persistence, browser storage, or unrelated revalidation is introduced.

## Scope

Implemented restricted initial administrator TOTP enrollment at `/portal/setup/2fa`.

Changed modules:

- `app/portal/setup/2fa/actions.ts`
- `app/portal/setup/2fa/page.tsx`
- `app/portal/setup/2fa/__tests__/actions.test.ts`
- `app/portal/setup/2fa/__tests__/page.test.tsx`
- `components/auth/InitialTwoFactorForm.tsx`
- `components/auth/__tests__/InitialTwoFactorForm.test.tsx`
- `lib/repositories/account-setup-repository.ts`
- `lib/repositories/__tests__/account-setup-repository.test.ts`
- `lib/auth/two-factor.ts`
- `lib/auth/__tests__/two-factor.test.ts`

## Behavior And Security

- Identity is derived only from the signed initial-setup session.
- The page and repository require an active `ADMIN` with unchanged id, email, and role, `mustChangePassword=false`, and disabled 2FA.
- Confirmation accepts only a runtime-validated `FormData` string containing exactly six ASCII digits before setup, repository, TOTP, or backup-code calls.
- Begin persists a fresh secret through a serializable transaction and never creates a normal session.
- Confirmation verifies the currently persisted secret, then the repository re-reads the same secret and eligibility inside a serializable transaction.
- Exactly eight unique plain backup codes are generated. Only eight unique hashes enter the repository and are persisted.
- Enabling 2FA and writing `ADMIN_2FA_ENABLED` occur in one Prisma transaction. The audit contains only boolean before/after values and `{ actorRole: "ADMIN", setupFlow: "INITIAL_SETUP" }` metadata.
- Failure states return bounded messages and do not contain the secret, OTP URI, entered code, backup codes or hashes, cookie values, or signing values.
- Failed begin/confirm attempts do not clear the initial-setup cookie or create a normal session.
- Successful confirmation clears the normal, pending-2FA, and initial-setup cookies before issuing exactly one password-authenticated admin session with `mfaVerified=true`.
- Success returns the eight plain codes once plus `getPortalRedirectPath(ADMIN, setup.nextPath)`; the action does not redirect.
- The completed client state replaces setup controls with the backup-code list and an accessible `Continue to admin` link. It has no disable control or persistent browser storage.

## TDD Evidence

- Repository and backup generation RED: 16 expected failures for missing enrollment APIs/collision handling; corrected one test-harness error before accepting RED.
- Repository and backup generation GREEN: 2 files, 25 tests passed.
- Action/page/component RED: 3 suites failed because the brief-owned modules did not exist.
- Action/page/component GREEN: 3 files, 37 tests passed.
- Exception-boundary RED/GREEN: 2 tests failed on propagated sensitive dependency errors, then 21 action tests passed after bounding those paths.
- Post-format focused run: 5 files, 64 tests passed.

## Verification

- Adjacent initial enrollment, normal admin security, and login TOTP tests: 5 files, 46 tests passed.
- Repository/audit tests: 4 files, 39 tests passed.
- `npm run lint`: passed; 774 files checked.
- `npm run typecheck`: passed.
- `npm run test`: passed; 333 files and 2,496 tests.
- `npm run build`: passed; Next.js 15.5.10 production build generated 87 static pages and the dynamic `/portal/setup/2fa` route.
- `git diff --check`: passed before final report/commit review.

## Staging Browser Workflow

Browser verification is deferred to staging because the flow requires a real signed setup cookie, authenticator, and production-like PostgreSQL transaction.

Use an active administrator with a temporary password, `mustChangePassword=true`, and `twoFactorEnabled=false`.

1. Start at `/portal/login`, sign in with the temporary password, complete `/portal/setup/password`, and confirm arrival at `/portal/setup/2fa` without an authenticated admin dashboard session.
2. Click `Set up authenticator`; confirm a manual secret and OTP URI appear, no disable control appears, and the layout is usable at desktop and mobile widths.
3. Submit a malformed code and a valid-shape incorrect code; confirm bounded error feedback, no normal admin session, no success audit, and the initial-setup cookie remains usable.
4. Refresh before confirmation; confirm the secret is no longer displayed from client state, the restricted page remains available, and beginning again rotates to a new persisted secret.
5. Add the current secret to an authenticator, submit a valid TOTP, and confirm the page does not redirect automatically.
6. Confirm exactly eight distinct backup codes appear once and `Continue to admin` points to the sanitized admin continuation path.
7. Refresh after success; confirm the backup codes are not displayed again and the restricted setup cookie is gone.
8. Follow `Continue to admin`; confirm the verified administrator session reaches the expected admin route.
9. Inspect the audit record and confirm one `ADMIN_2FA_ENABLED` event contains only boolean before/after state and bounded actor/setup metadata.
10. Sign out, sign in again with the normal password, confirm `/portal/login/verify-2fa` is required, submit a current TOTP, and confirm successful admin access.
11. Verify missing/expired setup routes to `/portal/login`, a non-admin setup identity routes to `/portal/unauthorized`, and an admin still requiring password change routes to `/portal/setup/password`.

## Remaining Risks

- The staging browser workflow has not yet been executed.
- Repository transaction behavior is covered with transaction-client unit tests, not a concurrent PostgreSQL integration test.
- Cookie-store or session-cookie write failures after the database transaction are not fault-injected; staging should verify the normal success handoff under the deployed runtime.

## A7 Correction Wave Final Report

This section supersedes the original report's `Staging Browser Workflow` and `Remaining Risks` status for the correction wave.

### Files Changed

- `app/portal/setup/2fa/actions.ts`
- `app/portal/setup/2fa/page.tsx`
- `app/portal/setup/2fa/__tests__/actions.test.ts`
- `app/portal/setup/2fa/__tests__/page.test.tsx`
- `components/auth/InitialTwoFactorForm.tsx`
- `components/auth/__tests__/InitialTwoFactorForm.test.tsx`
- `lib/auth/password.ts`
- `lib/auth/session.ts`
- `lib/auth/__tests__/password-hash.test.ts`
- `lib/auth/__tests__/session-handoff.test.ts`
- `lib/repositories/account-setup-repository.ts`
- `lib/repositories/__tests__/account-setup-repository.test.ts`
- `tests/repositories/account-setup-repository.postgres.test.ts`
- `e2e/portals/initial-admin-2fa.spec.ts`
- `.superpowers/sdd/A7-report.md`

No Prisma schema or migration change was required.

### Implemented Correction

- Added a short-lived, purpose-bound signed setup capability containing only the server-derived user id, a SHA-256 secret fingerprint, and expiry. Confirmation compares the capability with the current persisted secret before TOTP verification, and the repository still rechecks the expected secret in its serializable transaction.
- Added typed `restart-required` and `handoff-required` states. Stale setup removes the old secret and URI and exposes an accessible `Start setup again` action. A restart racing with completion prioritizes recoverable handoff.
- Precomputes the signed normal-session cookie and continuation before the enrollment transaction. A centralized auth-cookie-family replacement sets the verified session, clears pending 2FA and initial setup cookies, and reports a typed bounded error with best-effort session compensation.
- Treats database commit and response handoff as separate postconditions. Cookie work after a successful commit cannot produce a generic enrollment failure. The signed setup cookie authorizes a retryable handoff that atomically rotates to eight fresh backup-code hashes, writes a sanitized rotation audit, replaces cookies, and only then returns the fresh plaintext codes once.
- Added strict runtime parsing at every exported initial-admin 2FA repository boundary. Identity, ADMIN role, TOTP secret, expected secret, and exactly eight unique hashes in the project's scrypt format are validated before any transaction or write.
- Added explicit clipboard controls for the manual key, authenticator URI, and all backup codes. Feedback is non-persistent, completion focus moves to the result heading, and no credential is stored in browser storage.

### TDD Evidence

Initial correction RED:

```powershell
npx vitest run lib/auth/__tests__/password-hash.test.ts lib/auth/__tests__/session-handoff.test.ts lib/repositories/__tests__/account-setup-repository.test.ts app/portal/setup/2fa/__tests__/actions.test.ts app/portal/setup/2fa/__tests__/page.test.tsx components/auth/__tests__/InitialTwoFactorForm.test.tsx tests/repositories/account-setup-repository.postgres.test.ts
```

Result: expected RED, 6 failed files and 1 skipped PostgreSQL-gated file; 49 failed, 49 passed, and 4 skipped tests. Failures were the missing hash validator, signed capability/session handoff APIs, strict repository rejections, typed stale/handoff action states, restart UI, and copy/focus behavior.

Self-review race RED:

```powershell
npx vitest run components/auth/__tests__/InitialTwoFactorForm.test.tsx
```

Result: expected RED, 1 failed and 11 passed. The component rendered `Start setup again` instead of `Finish secure sign-in` when begin returned `handoff-required` during a stale restart.

Final focused GREEN:

```powershell
npx vitest run lib/auth/__tests__/password-hash.test.ts lib/auth/__tests__/session-handoff.test.ts lib/repositories/__tests__/account-setup-repository.test.ts app/portal/setup/2fa/__tests__/actions.test.ts app/portal/setup/2fa/__tests__/page.test.tsx components/auth/__tests__/InitialTwoFactorForm.test.tsx
```

Result: 6 files and 104 tests passed.

Adjacent auth GREEN:

```powershell
npx vitest run app/portal/setup/2fa components/auth/__tests__/InitialTwoFactorForm.test.tsx lib/auth/__tests__/password-hash.test.ts lib/auth/__tests__/session-handoff.test.ts lib/auth/__tests__/two-factor.test.ts lib/repositories/__tests__/account-setup-repository.test.ts app/portal/login/verify-2fa app/portal/login/__tests__/login-2fa-actions.test.ts 'app/(admin)/admin/security/__tests__/actions.test.ts' lib/__tests__/session-expiry.test.ts
```

Result: 10 files and 165 tests passed.

### PostgreSQL And Rollback Evidence

Migration gate:

```powershell
$env:DIRECT_URL = node -e "require('dotenv').config(); process.stdout.write(process.env.DATABASE_URL || '')"; npx prisma migrate status
```

Result: 23 migrations found; schema is up to date.

PostgreSQL integration GREEN:

```powershell
$env:RUN_A7_POSTGRES_INTEGRATION='1'; npx vitest run tests/repositories/account-setup-repository.postgres.test.ts
```

Result: 1 file and 4 tests passed against the configured PostgreSQL database. The suite runs real concurrent begin/begin, begin/confirm, and confirm/confirm transactions. It asserts a coherent final secret, at most one enable audit, one confirm winner with eight usable password hashes, and transaction rollback when a target-scoped PostgreSQL trigger rejects the success audit.

### Cookie And Session Fault Evidence

- Session helper tests precompute signed session material without accessing response cookies, assert one final session plus deletion of both competing cookie families, and fault each session set/pending-cookie clear/setup-cookie clear operation with a typed non-leaking result.
- Action tests make normal-session signing fail before commit and assert no repository commit. Separate post-commit cookie replacement faults assert the repository commit occurred and the result is `handoff-required`, not generic failure, with no plain code/hash/dependency detail returned.
- Recovery tests assert fresh hashes are rotated before fresh codes are returned, and repeated cookie failure remains explicit and retryable without exposing those codes.

### Browser Evidence

Discovery:

```powershell
npx playwright test e2e/portals/initial-admin-2fa.spec.ts --list
```

Result: 1 Playwright test discovered.

Executed browser GREEN:

```powershell
npm run test:e2e -- e2e/portals/initial-admin-2fa.spec.ts --retries=0 --reporter=line
```

Result: 1 test passed in 1.6 minutes against the local Next.js application and configured PostgreSQL database.

Browser workflow record:

- Role/user: test-created active ADMIN with password setup complete and 2FA disabled.
- Start: `/portal/login?next=%2Fadmin`.
- Actions: password sign-in, begin setup, submit invalid TOTP, rotate in a competing tab, submit stale code, invoke `Start setup again`, confirm a fresh TOTP, inspect one-time backup codes/cookies, refresh, clear cookies, sign in normally, and complete the standard TOTP challenge.
- Visible results: bounded invalid-code feedback; typed stale feedback with no stale secret; focused backup-code heading with exactly eight codes; code-free completion page after refresh; final `/admin` access after normal TOTP login.
- Cookie/audit results: exactly one `ulu_session`; no `ulu_initial_setup` or `ulu_admin_2fa_pending`; exactly one sanitized `ADMIN_2FA_ENABLED` audit.

### Broader Verification

- `npm run test`: passed before the final focused race regression, 335 files passed and 1 skipped; 2,536 tests passed and 4 skipped. The added final race test then passed in the final 104-test focused run.
- `npx vitest run app/__tests__/env-dependencies.audit.test.ts`: 1 file and 14 tests passed after adding the E2E password environment dependency declaration.
- `npm run lint`: passed, 778 files checked.
- `npm run typecheck`: passed.
- `npm run build`: passed on the final candidate; Next.js 15.5.10 compiled, checked types, and generated 87 static pages including the dynamic `/portal/setup/2fa` route.
- `git diff --check`: rerun after this report append and before commit.

### Security And Response-Delivery Limits

- Setup identity remains signed and server-derived. No client user id is accepted, and the client capability is bounded, signed, purpose-bound, expiring, and matched to the signed setup identity.
- Eligibility remains active ADMIN, password setup complete, with exact identity equality. Failed validation occurs before transaction/audit, and failed transactional mutations cannot retain a success audit.
- Exactly eight unique backup-code hashes are persisted. Plain backup codes exist only in the action process and one successful response state; no localStorage, sessionStorage, cookie, database, or audit stores them.
- The application can model cookie-store failures and retain or restore the short-lived setup-cookie recovery path, but HTTP response delivery is not observable by the server. If the committed action response is lost before the browser applies `Set-Cookie`, the browser keeps its signed setup cookie and can retry handoff, which rotates a new recoverable code set. If the runtime throws after partially mutating response headers, cookie APIs are not transactional; the helper performs best-effort deletion of the new session and the next request resolves from whichever signed cookie actually arrived.
- Deployment-level interruption after the server emits a successful response cannot be deterministically executed locally. The recovery design, operation-level cookie fault tests, and full browser flow are the evidence for that transport boundary; a staging fault-injection proxy remains the external gate for literal response truncation.

### Self-Review

- Reviewed the A7-only diff for identity trust, secret/code/hash leakage, repository pre-transaction validation, audit atomicity, stale capability integrity, cookie-family exclusivity, one-time response state, and compatibility with normal TOTP login.
- Fixed one self-review finding where a begin action returning `handoff-required` during a stale restart was hidden behind the older restart state; added RED/GREEN component coverage.
- No unrelated domain, Prisma model, migration, generated artifact, or dependency change is included.

## A7 Re-review Correction Plan

1. Add RED auth/action/repository tests for a separately expiring signed handoff capability, recovery after the original setup cookie expires, bounded malformed capability handling, wrong-user/state rejection, and replay rejection after backup-hash rotation.
2. Add RED page/component/E2E assertions for unconditional `/portal/login` redirect without the setup cookie, one-time backup-code disappearance at that destination, and suppression of the obsolete restart alert after a distinct fresh setup capability arrives.
3. Implement a short-lived purpose-bound handoff capability containing only a signed server-derived uid, issued-at/expiry bounds, and the fingerprint of the eight committed backup-code hashes; carry it only in typed action state and hidden form data.
4. Change recovery to authorize from that capability, precompute the next retry capability, and transactionally require the currently persisted enabled ADMIN backup-hash fingerprint before rotating hashes and writing the sanitized audit. No client user id, URL/cookie/database/audit capability persistence, or browser storage is introduced.
5. Restore the absent-setup redirect, make the stale UI state self-clearing when a fresh capability is rendered, then run focused A7 suites, the PostgreSQL recovery slice if required, Playwright, lint, typecheck, build, and staged self-review before committing.

## A7 Re-review Correction Results

### Files Changed

- `.superpowers/sdd/A7-report.md`
- `app/portal/setup/2fa/actions.ts`
- `app/portal/setup/2fa/page.tsx`
- `app/portal/setup/2fa/handoff/route.ts`
- `app/portal/setup/2fa/__tests__/actions.test.ts`
- `app/portal/setup/2fa/__tests__/page.test.tsx`
- `app/portal/setup/2fa/handoff/__tests__/route.test.ts`
- `components/auth/InitialTwoFactorForm.tsx`
- `components/auth/__tests__/InitialTwoFactorForm.test.tsx`
- `e2e/portals/initial-admin-2fa.spec.ts`
- `lib/auth/backup-code-hash.ts`
- `lib/auth/password.ts`
- `lib/auth/session.ts`
- `lib/auth/__tests__/password-hash.test.ts`
- `lib/auth/__tests__/session-handoff.test.ts`
- `lib/repositories/account-setup-repository.ts`
- `lib/repositories/__tests__/account-setup-repository.test.ts`
- `tests/repositories/account-setup-repository.postgres.test.ts`

No Prisma schema, migration, dependency, or unrelated domain file changed.

### RED Evidence

Initial focused RED:

```powershell
npx vitest run lib/auth/__tests__/password-hash.test.ts lib/auth/__tests__/session-handoff.test.ts lib/repositories/__tests__/account-setup-repository.test.ts app/portal/setup/2fa/__tests__/actions.test.ts app/portal/setup/2fa/__tests__/page.test.tsx components/auth/__tests__/InitialTwoFactorForm.test.tsx
```

Result: expected RED, 6 failed files with 17 failed and 99 passed tests. Failures were the missing handoff-capability lifetime/fingerprint API, setup-cookie-independent recovery and replay contracts, unconditional page redirect, and stale-alert suppression. After correcting one omitted page-test mock export, the isolated page test remained behaviorally RED with 2 failed and 12 passed.

Browser RED after restoring the required page redirect:

```powershell
npm run test:e2e -- e2e/portals/initial-admin-2fa.spec.ts --retries=0 --reporter=line
```

Result: expected workflow RED after 82 seconds. The backup-code heading was absent because a successful Server Action cookie mutation caused an RSC refresh; the now-correct setup page redirect ran before the one-time action result could mount. This drove the same-origin no-store POST handoff route used by the client for confirmation/recovery.

Route/client RED:

```powershell
npx vitest run app/portal/setup/2fa/handoff/__tests__/route.test.ts components/auth/__tests__/InitialTwoFactorForm.test.tsx
```

Result: expected RED, 2 failed files with 1 failed and 10 passed tests: the route module did not exist and the component did not issue the bounded same-origin request.

### GREEN Evidence

Final focused A7 GREEN:

```powershell
npx vitest run lib/auth/__tests__/password-hash.test.ts lib/auth/__tests__/session-handoff.test.ts lib/repositories/__tests__/account-setup-repository.test.ts app/portal/setup/2fa/__tests__/actions.test.ts app/portal/setup/2fa/__tests__/page.test.tsx components/auth/__tests__/InitialTwoFactorForm.test.tsx app/portal/setup/2fa/handoff/__tests__/route.test.ts
```

Result: 7 files and 120 tests passed.

Adjacent auth/session GREEN:

```powershell
npx vitest run lib/auth/__tests__/two-factor.test.ts app/portal/login/verify-2fa app/portal/login/__tests__/login-2fa-actions.test.ts lib/__tests__/session-expiry.test.ts tests/middleware.test.ts tests/middleware-session-expiry.integration.test.ts 'app/(admin)/admin/security/__tests__/actions.test.ts'
```

Result: 6 files and 86 tests passed. The full unit suite was not rerun because this correction adds a purpose-specific capability without changing the existing session or normal TOTP contracts, as requested.

PostgreSQL integration GREEN:

```powershell
$env:RUN_A7_POSTGRES_INTEGRATION='1'; npx vitest run tests/repositories/account-setup-repository.postgres.test.ts
```

Result: 1 file and 5 tests passed against the configured PostgreSQL database. Existing begin/begin, begin/confirm, confirm/confirm, and forced-audit rollback coverage remained green; the added test consumes a committed backup-hash fingerprint once, rejects replay after rotation with `HANDOFF_CHANGED`, retains the first rotation, and writes exactly one sanitized rotation audit.

Browser GREEN:

```powershell
npm run test:e2e -- e2e/portals/initial-admin-2fa.spec.ts --retries=0 --reporter=line
```

Result: 1 test passed in 1.4 minutes. It covers invalid TOTP, stale rotation/restart with the obsolete alert removed, successful one-time eight-code display, mutually exclusive cookie families, direct refresh redirect to `/portal/login` with no backup codes, and subsequent normal password plus TOTP login to `/admin`.

Static verification GREEN:

```powershell
npm run lint
npm run typecheck
npm run build
```

Results: lint passed with 781 files checked; typecheck passed; Next.js 15.5.10 production build passed in 121.8 seconds, generated 88 static pages, and included dynamic `/portal/setup/2fa` and `/portal/setup/2fa/handoff` routes plus middleware.

### Security And Concurrency Reasoning

- Confirmation precomputes both session-cookie material and a separate ten-minute `INITIAL_2FA_HANDOFF` capability before the enrollment transaction. Its `iat` begins at confirmation, so a delivered `handoff-required` state remains usable after the earlier fifteen-minute setup cookie expires.
- The signed capability has a strict purpose and exact runtime keys, a bounded server-derived uid, a SHA-256 fingerprint of exactly eight unique password-hash-formatted persisted entries, safe integer `iat`/`exp`, a maximum ten-minute lifetime, and a maximum encoded input size of 1024 bytes. Recovery does not read or accept a client user id or require the initial setup cookie.
- Recovery requires the signed uid to identify an active ADMIN with password setup complete and 2FA enabled. It checks the current backup-hash fingerprint before work and again inside a serializable transaction immediately before rotation and audit. The first rotation changes the fingerprint, making the delivered capability one-time and replay-resistant; malformed, expired, wrong-user, wrong-state, and replay failures are bounded and never echo the capability.
- A fresh successor capability is precomputed with the fresh hashes before each recovery transaction. If its response cookie replacement fails after rotation, the returned state remains honest and retryable against the new persisted fingerprint.
- The capability is carried only in the no-store POST response action state and a hidden form field. It is not placed in a URL, cookie, browser storage, database row, audit event, or log. Plain backup codes remain only in process memory and the single successful response; persistence and audits contain neither codes, code hashes, nor the capability.
- Confirmation/recovery POSTs use a strict same-origin route and bounded response-state parser. This avoids the RSC page refresh that would otherwise execute the required absent-setup-cookie redirect before the one-time codes render. A direct page refresh still redirects unconditionally to `/portal/login`, including when a verified normal ADMIN session exists.
- Focused PostgreSQL evidence retains the original enrollment races and audit rollback and adds real persisted fingerprint consumption/replay behavior. Unit tests also assert invalid repository boundary input starts no transaction and writes no update or audit.

### Residual Transport Limit

A delivered `handoff-required` response is now recoverable for ten minutes from confirmation even after setup-cookie expiry. A completely lost HTTP response after the database commit is still outside application observability: if neither the response state nor usable cookie headers reach the browser, the browser cannot possess the new handoff capability. Literal response truncation and partially applied deployment-runtime cookie headers still require a staging fault-injection proxy; the local suite proves operation-level cookie faults, not transport delivery. The full workflow also still needs the security-addendum staging gate.

### Self-Review

- Reviewed the complete A7 diff against every re-review finding, identity/role eligibility, capability shape/lifetime, hash validation, replay behavior, transaction/audit atomicity, cookie-family exclusivity, response-state secrecy, direct-refresh behavior, and later normal TOTP compatibility.
- The browser RED exposed an interaction between Server Action cookie mutation and the required page redirect. The focused same-origin route is intentionally limited to confirmation/recovery and delegates to the same hardened actions; setup begin/restart remains a Server Action.
- Scanned the A7 implementation for `localStorage`, `sessionStorage`, URL construction, logs, and capability persistence. Capability references are limited to signed helper/action state, the hidden POST field, and focused tests. `git diff --check` passed before final verification.
