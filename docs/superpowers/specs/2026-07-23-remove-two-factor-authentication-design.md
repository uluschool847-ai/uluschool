# Remove Application Two-Factor Authentication

**Date:** 2026-07-23  
**Status:** Approved design  
**Decision owner:** School owner

## Goal

Remove application-managed TOTP two-factor authentication from ULU Online School. Administrators
will authenticate with email and password only. The change must preserve password rotation, login
rate limiting, signed sessions, audit logging, role enforcement, and all teacher, student, and
parent access controls.

Provider accounts such as Render, GitHub, Cloudflare, Resend, and Sentry remain outside this scope
and should continue to use provider-level 2FA.

## Decision

The removal will use two deployments. This prevents the first deployment's database migration from
dropping columns or tables while the previous Render release can still receive requests.

The alternatives were:

1. Disable 2FA with an environment flag while retaining the feature. Rejected because the requested
   outcome is complete removal.
2. Remove runtime behavior first and database objects second. Selected because it gives the old
   release time to stop using the 2FA schema before destructive cleanup.
3. Remove code and database objects in one deployment. Rejected because Render runs migrations
   before switching all traffic to the new release.

## Non-Goals

- Changing password complexity or password hashing.
- Adding password reset, email verification, passkeys, or self-service registration.
- Enabling administrator SSO in production.
- Changing role, ownership, or portal authorization rules.
- Disabling 2FA on infrastructure provider accounts.

## Current Behavior

When `ADMIN_REQUIRE_2FA=true`, an administrator must enroll TOTP during initial setup and complete a
TOTP or backup-code challenge after later password or SSO authentication. The implementation spans:

- portal login and initial password setup;
- initial TOTP enrollment and pending-login verification routes;
- middleware and server-side session enforcement;
- administrator security settings;
- SSO handoff;
- TOTP, backup-code, and challenge repositories;
- `AppUser` 2FA fields and `AdminTwoFactorChallenge`;
- production environment validation, tests, and deployment documentation.

## Deployment 1: Remove Runtime 2FA

Deployment 1 changes the application to password-only administrator authentication while leaving
the existing database columns and challenge table intact but unused.

### Authentication Flow

- A valid administrator password creates a normal administrator session immediately.
- Initial password rotation creates a normal administrator session after the password is changed.
- SSO, if enabled in a non-production environment, creates a normal session without a 2FA handoff.
- Incorrect passwords, inactive users, login rate limits, and audit events retain their existing
  behavior.
- Student, parent, and teacher authentication remains unchanged.

### Routes and User Interface

- Remove `/portal/setup/2fa`.
- Remove `/portal/login/verify-2fa`.
- Remove the administrator 2FA security page, its actions, and its dashboard link.
- Remove initial enrollment, verification, backup-code, and authenticator components.
- A stale visit to a removed 2FA URL must redirect to `/portal/login`, not expose an error page.

### Sessions and Legacy Cookies

- Increment the signed session security version so sessions created under the 2FA contract cannot
  survive the change.
- Stop adding or enforcing `mfaVerified` in new sessions.
- Expire the legacy `ulu_admin_2fa_pending` cookie during login and logout.
- Keep the initial setup cookie because it is also required for mandatory first-password rotation.

### Configuration

- Stop reading `ADMIN_REQUIRE_2FA` and `ADMIN_2FA_SECRET`.
- Remove the production validator requirement that `ADMIN_REQUIRE_2FA` equals `true`.
- Permit the existing Render variables to remain temporarily during Deployment 1; they have no
  effect after the new release is live.
- Update `.env.example` and active deployment documentation to remove application 2FA variables.

### Database Contract

Deployment 1 must not drop or rename:

- `AppUser.twoFactorEnabled`;
- `AppUser.twoFactorSecret`;
- `AppUser.twoFactorBackupCodes`;
- `AdminTwoFactorChallenge`.

Runtime code must no longer read from or write to those fields or the challenge table.

## Deployment 1 Verification Gate

Deployment 2 is blocked until all of the following pass against the live Deployment 1 release:

1. An administrator with an existing 2FA configuration can sign in using only email and password.
2. A bootstrap administrator can change the temporary password and reach `/admin` directly.
3. Logout followed by another password-only login succeeds.
4. Old session and pending-2FA cookies do not grant access and do not cause redirect loops.
5. Wrong-password lockout, login audit events, and inactive-user rejection still work.
6. Student, parent, and teacher login behavior is unchanged.
7. Admin-only routes still reject every portal role.
8. Lint, type checking, related tests, the full test suite, build, and release browser checks pass.

## Deployment 2: Remove Stored 2FA Data

After Deployment 1 is verified and the previous release is no longer serving traffic:

1. Create and verify a PostgreSQL backup.
2. Add a Prisma migration that drops `AdminTwoFactorChallenge` and its indexes and foreign keys.
3. Drop the three 2FA columns from `AppUser`.
4. Remove the corresponding Prisma models and relations.
5. Delete remaining dormant 2FA helpers, repositories, types, tests, and historical active
   deployment checks that are no longer needed.
6. Remove `ADMIN_REQUIRE_2FA` and `ADMIN_2FA_SECRET` from Render.
7. Deploy and repeat the password-only administrator smoke test.

The migration intentionally destroys TOTP secrets, hashed backup codes, and pending challenge data.
These values will not be recoverable without restoring the pre-migration database backup.

## Security Controls Retained

Removing application 2FA weakens protection against administrator password compromise. The
following controls remain mandatory:

- a unique administrator password stored in a password manager;
- forced change of bootstrap and manually issued temporary passwords;
- password hashing and constant-time password verification;
- login rate limiting and lockout behavior;
- secure, signed, HTTP-only session cookies;
- session invalidation through the security-version change;
- server-side role and ownership enforcement;
- authentication and sensitive administrator audit events;
- provider-level 2FA for Render, GitHub, Cloudflare, email, and monitoring accounts.

No change may replace server-side authorization with UI-only checks.

## Tests

Deployment 1 adds or updates tests for:

- password-only administrator login;
- password rotation followed by direct administrator access;
- password-only SSO behavior when explicitly enabled outside production;
- middleware and `requireSession` without MFA enforcement;
- stale pending-2FA cookie cleanup;
- removed-route redirects;
- unchanged non-admin login and role denial;
- production environment validation without 2FA variables.

Obsolete TOTP enrollment, challenge, backup-code, and 2FA UI tests are removed with their
implementations.

Deployment 2 additionally verifies:

- `npx prisma validate`;
- `npx prisma generate`;
- migration application against a disposable PostgreSQL database;
- no remaining runtime references to the removed schema or environment variables.

The final verification ladder is:

```text
targeted authentication and middleware tests
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Rollback

Deployment 1 can be rolled back without a database restore because the 2FA schema remains present.
Administrators who previously configured TOTP can resume using it after the old release is restored.

Deployment 2 cannot be rolled back to a 2FA release using code alone. Rollback requires both:

- redeploying a compatible 2FA release; and
- restoring the verified pre-migration PostgreSQL backup.

## Acceptance Criteria

The work is complete when:

- no application page asks for an authenticator or backup code;
- administrator password authentication reaches the admin portal directly;
- first-password rotation remains mandatory;
- no runtime or Prisma code references application 2FA;
- the 2FA database table and user columns are absent after Deployment 2;
- Render contains no application 2FA variables;
- role isolation, login controls, audit logging, tests, build, and browser verification pass;
- active launch documentation describes password-only administrator authentication accurately.
