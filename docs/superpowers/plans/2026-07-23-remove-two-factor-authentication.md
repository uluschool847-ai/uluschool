# Remove Application Two-Factor Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove application-managed TOTP and backup-code authentication so administrators use email and password only, using two deployments to avoid breaking the release that still references the old database schema.

**Architecture:** Deployment 1 removes every reachable 2FA flow, creates password-only administrator sessions, replaces the MFA-bearing session contract, and leaves the old Prisma fields and challenge table dormant. After that release passes production smoke tests, Deployment 2 takes and verifies a PostgreSQL backup, drops the dormant data through a Prisma migration, removes the short-lived compatibility bridge, and verifies the final password-only release.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 5/PostgreSQL, signed HTTP-only cookies, Zod, Vitest, Testing Library, Playwright, Render.

## Global Constraints

- Preserve forced change of bootstrap and manually issued temporary passwords.
- Preserve login rate limiting, inactive-user rejection, password hashing, signed HTTP-only sessions, audit logging, server-side role checks, and ownership enforcement.
- Do not change student, parent, or teacher authentication behavior.
- Do not enable administrator SSO in production.
- Keep provider-level 2FA enabled for Render, GitHub, Cloudflare, Resend, Sentry, and email accounts.
- Do not delete historical authentication audit records or remove redaction rules that protect historical TOTP and backup-code data.
- Deployment 1 must not drop or rename `AppUser.twoFactorEnabled`, `AppUser.twoFactorSecret`, `AppUser.twoFactorBackupCodes`, or `AdminTwoFactorChallenge`.
- Deployment 2 must not run until Deployment 1 is live, the previous release is no longer receiving traffic, and a PostgreSQL backup has been restored successfully to a disposable database.
- Never place passwords, database URLs, TOTP secrets, backup codes, session tokens, or backup files in git, test output, screenshots, or chat.

---

## File Map

### Deployment 1 runtime changes

- `app/portal/login/actions.ts`: issue a normal session after valid password authentication.
- `app/portal/login/page.tsx`: remove pending-2FA presentation.
- `app/portal/setup/password/actions.ts`: issue a normal session after password rotation.
- `app/portal/setup/password/page.tsx`: stop redirecting completed admins to enrollment.
- `app/api/auth/sso/callback/route.ts`: issue a normal SSO session when SSO is explicitly enabled.
- `lib/auth/session.ts`: introduce session version 3 without `mfaVerified`, remove 2FA capabilities, and temporarily clear the legacy pending cookie.
- `middleware.ts`: remove MFA enforcement and temporarily redirect retired 2FA URLs.
- `lib/repositories/account-setup-repository.ts`: retain password setup only.
- `lib/repositories/user-repository.ts`: stop selecting 2FA fields and remove 2FA mutations.
- `lib/bootstrap/production-admin.ts`: stop treating empty 2FA state as a bootstrap invariant.
- `prisma/seed.ts`: stop reading or writing application 2FA values.
- `package.json`, `package-lock.json`: remove `otplib` and the 2FA-specific E2E partition.
- `playwright.config.ts`, `scripts/playwright-test.mjs`: remove the 2FA partition and its environment override.
- `.github/workflows/ci.yml`, `.env.example`, `lib/config/production-env.ts`: remove application 2FA configuration.

### Deployment 1 deletions

- `app/portal/setup/2fa/`
- `app/portal/login/verify-2fa/`
- `app/(admin)/admin/security/`
- `components/auth/InitialTwoFactorForm.tsx`
- `components/auth/two-factor-form.tsx`
- `components/admin/two-factor-settings.tsx`
- `lib/auth/two-factor.ts`
- `lib/auth/backup-code-hash.ts`
- `lib/validations/two-factor.ts`
- `lib/repositories/admin-two-factor-challenge-repository.ts`
- Their focused unit, integration, component, and E2E tests.

### Deployment 2 schema changes

- `prisma/schema.prisma`: remove the three `AppUser` fields, the relation, and `AdminTwoFactorChallenge`.
- `prisma/migrations/20260723120000_remove_application_two_factor_authentication/migration.sql`: drop the dormant table and fields.
- Seed, fixture, repository, and E2E files that still set dormant schema fields during the Deployment 1 compatibility window.
- `lib/auth/session.ts`, `middleware.ts`: remove the legacy pending-cookie cleanup and retired-route redirects after the compatibility window.

---

## Deployment 1

### Task 1: Make Administrator Authentication Password-Only

**Files:**
- Modify: `app/portal/login/actions.ts`
- Modify: `app/portal/login/page.tsx`
- Rename: `app/portal/login/__tests__/login-2fa-actions.test.ts` to `app/portal/login/__tests__/login-actions.test.ts`
- Modify: `app/portal/login/__tests__/login-actions.test.ts`
- Modify: `app/portal/login/__tests__/login-error-ux.test.tsx`
- Modify: `tests/auth/login-actions.test.ts`
- Rename: `tests/app/student-portal/login-2fa-env.test.ts` to `tests/app/student-portal/login-actions.test.ts`
- Modify: `tests/app/student-portal/login-actions.test.ts`
- Modify: `app/api/auth/sso/callback/route.ts`
- Modify: `app/api/auth/sso/callback/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `createSession(SessionInput)`, `createInitialSetupSession(...)`, `getPortalRedirectPath(role, nextPath)`, `logAuthEvent(...)`.
- Produces: password-authenticated administrator sessions with `authMethod: "password"` and SSO sessions with `authMethod: "sso"`; no pending challenge.

- [ ] **Step 1: Rewrite the route-local login tests to require direct administrator access**

Replace 2FA expectations with:

```ts
it("creates a normal administrator session after valid password authentication", async () => {
  findUserByEmailMock.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Admin User",
    role: UserRole.ADMIN,
    isActive: true,
    mustChangePassword: false,
    passwordHash: "hash",
  });
  verifyPasswordMock.mockResolvedValue(true);

  await expect(loginAction(initialState, validLoginForm())).rejects.toThrow("REDIRECT:/admin");

  expect(createSessionMock).toHaveBeenCalledWith({
    uid: "admin-1",
    role: UserRole.ADMIN,
    email: "admin@example.com",
    fullName: "Admin User",
    authMethod: "password",
  });
  expect(startAdminTwoFactorChallengeMock).not.toHaveBeenCalled();
  expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
});
```

Keep the existing wrong-password, inactive-user, rate-limit, first-password, non-admin, and safe-next-path cases.

- [ ] **Step 2: Run the login tests and verify they fail on the pending-2FA behavior**

Run:

```bash
npx vitest run app/portal/login/__tests__/login-actions.test.ts tests/auth/login-actions.test.ts tests/app/student-portal/login-actions.test.ts
```

Expected: FAIL because administrators still redirect to `/portal/setup/2fa` or `/portal/login/verify-2fa`.

- [ ] **Step 3: Simplify `loginAction` to one final session path**

After valid password verification and cookie cleanup, use:

```ts
if (user.mustChangePassword) {
  await createInitialSetupSession({
    uid: user.id,
    email: user.email,
    role: user.role,
    ...(nextPath ? { nextPath } : {}),
  });
  redirect("/portal/setup/password");
}

await createSession({
  uid: user.id,
  role: user.role,
  email: user.email,
  fullName: user.fullName,
  authMethod: "password",
});
await logAuthEvent({
  eventType: "LOGIN_SUCCESS",
  userId: user.id,
  identifier,
  metadata: { authenticationStage: "final", authMethod: "password" },
  timestamp: new Date(),
});
redirect(getPortalRedirectPath(user.role, nextPath));
```

Remove `ADMIN_REQUIRE_2FA`, `twoFactorEnabled`, `startAdminTwoFactorChallenge`, and pending-challenge creation from this action. Retain temporary legacy-cookie clearing until Task 3 replaces the session API.

- [ ] **Step 4: Remove pending-2FA content from the login page**

Render `PortalLoginForm` directly and retain session-expiry and optional SSO content:

```tsx
<CardTitle>Login</CardTitle>
<CardContent>
  <div className="space-y-4">
    {sessionMessage ? (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {sessionMessage}
      </div>
    ) : null}
    <PortalLoginForm nextPath={nextPath} />
    {ssoEnabled && ssoLoginUrl ? (
      <div className="border-t border-secondary pt-4">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Organization SSO
        </p>
        <Button asChild variant="secondary">
          <a href={ssoLoginUrl}>Continue with SSO</a>
        </Button>
      </div>
    ) : null}
  </div>
</CardContent>
```

Remove the `Link` and `getAdminPendingTwoFactor` imports and update the UX test so a stale pending cookie cannot change the heading or hide the form.

- [ ] **Step 5: Rewrite the SSO callback tests**

Assert that an active admin with `mustChangePassword: false` gets:

```ts
expect(createSessionMock).toHaveBeenCalledWith({
  uid: "admin-1",
  role: UserRole.ADMIN,
  email: "admin@example.com",
  fullName: "Admin User",
  authMethod: "sso",
});
expect(response.headers.get("location")).toBe("https://school.example/admin");
expect(createAdminAuditLogMock).toHaveBeenCalledWith(
  expect.objectContaining({
    action: "ADMIN_SSO_LOGIN_SUCCESS",
    meta: { authenticationStage: "final", authMethod: "sso" },
  }),
);
```

Keep the disabled-SSO, malformed, expired, invalid-signature, inactive-user, non-admin, and `mustChangePassword` rejection tests.

- [ ] **Step 6: Implement direct SSO session creation**

Replace the challenge block with:

```ts
if (user.mustChangePassword) {
  return NextResponse.json(
    { ok: false, error: "Admin user must complete local password setup" },
    { status: 403 },
  );
}

await createSession({
  uid: user.id,
  role: user.role,
  email: user.email,
  fullName: user.fullName,
  authMethod: "sso",
});
await createAdminAuditLog({
  adminUserId: user.id,
  action: "ADMIN_SSO_LOGIN_SUCCESS",
  targetType: "Auth",
  targetId: user.id,
  meta: { authenticationStage: "final", authMethod: "sso" },
});
return NextResponse.redirect(new URL("/admin", request.url));
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx vitest run app/portal/login/__tests__/login-actions.test.ts app/portal/login/__tests__/login-error-ux.test.tsx tests/auth/login-actions.test.ts tests/app/student-portal/login-actions.test.ts app/api/auth/sso/callback/__tests__/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add app/portal/login app/api/auth/sso/callback tests/auth/login-actions.test.ts tests/app/student-portal
git commit -m "refactor: use password-only admin login"
```

### Task 2: Keep Password Rotation and Bootstrap Without 2FA

**Files:**
- Modify: `app/portal/setup/password/actions.ts`
- Modify: `app/portal/setup/password/page.tsx`
- Modify: `app/portal/setup/password/__tests__/actions.test.ts`
- Modify: `app/portal/setup/password/__tests__/page.test.tsx`
- Modify: `lib/repositories/account-setup-repository.ts`
- Modify: `lib/repositories/__tests__/account-setup-repository.test.ts`
- Modify: `tests/repositories/account-setup-repository.postgres.test.ts`
- Modify: `lib/repositories/user-repository.ts`
- Modify: `lib/repositories/__tests__/user-repository.test.ts`
- Modify: `lib/bootstrap/production-admin.ts`
- Modify: `lib/bootstrap/__tests__/production-admin.test.ts`
- Modify: `prisma/seed.ts`
- Modify: `e2e/auth/initial-password.spec.ts`

**Interfaces:**
- Consumes: `changeInitialPassword(userId, currentPassword, newPassword)`.
- Produces: `SafeInitialSetupUser` with `{ id, email, fullName, role }`; successful rotation always creates a normal session and redirects through `getPortalRedirectPath`.

- [ ] **Step 1: Change password-setup tests to require direct admin access**

Use this successful admin case:

```ts
it("creates an administrator session immediately after password rotation", async () => {
  getInitialSetupSessionMock.mockResolvedValue(
    setupSession({ uid: "admin-1", email: "admin@example.com", role: UserRole.ADMIN }),
  );
  accountSetupMocks.changeInitialPassword.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Admin User",
    role: UserRole.ADMIN,
  });
  getPortalRedirectPathMock.mockReturnValue("/admin");

  await expect(changeInitialPasswordAction(initialState, validPasswordForm())).rejects.toThrow(
    "REDIRECT:/admin",
  );
  expect(createSessionMock).toHaveBeenCalledWith({
    uid: "admin-1",
    role: UserRole.ADMIN,
    email: "admin@example.com",
    fullName: "Admin User",
    authMethod: "password",
  });
});
```

Delete setup-enrollment and configured-TOTP handoff cases. Keep invalid setup, wrong current password, reuse, short password, user mismatch, and cookie ordering cases.

- [ ] **Step 2: Run password-setup tests and verify they fail**

Run:

```bash
npx vitest run app/portal/setup/password/__tests__/actions.test.ts app/portal/setup/password/__tests__/page.test.tsx lib/repositories/__tests__/account-setup-repository.test.ts lib/bootstrap/__tests__/production-admin.test.ts
```

Expected: FAIL on 2FA redirects and 2FA-bearing return types.

- [ ] **Step 3: Make password rotation create a normal session for every role**

After identity validation, replace all role-specific 2FA branches with:

```ts
await clearAllAuthCookies();
await createSession({
  uid: user.id,
  role: user.role,
  email: user.email,
  fullName: user.fullName,
  authMethod: "password",
});
redirect(getPortalRedirectPath(user.role, setup.nextPath));
```

`clearAllAuthCookies` must clear the current session, legacy pending cookie during Deployment 1, and initial setup cookie. Remove challenge imports, 2FA audit stages, and environment branching.

- [ ] **Step 4: Simplify the password-setup page**

For a valid setup user whose password no longer requires rotation:

```ts
if (!user.mustChangePassword) {
  redirect("/portal/login");
}
```

Remove `UserRole`, `ADMIN_REQUIRE_2FA`, and `twoFactorEnabled` page logic.

- [ ] **Step 5: Remove 2FA enrollment operations from the account setup repository**

Keep only:

```ts
export type SafeInitialSetupUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

export async function changeInitialPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<SafeInitialSetupUser> {
  // Preserve the existing validation, serializable transaction,
  // password update, mustChangePassword=false transition, and audit write.
}
```

Delete initial-admin enrollment, handoff, backup-code validation, related error codes, and related imports. Keep all password-change tests and remove only the 2FA-specific describe blocks.

- [ ] **Step 6: Stop repository, bootstrap, and seed code from reading 2FA fields**

`findUserByEmail` and `findUserForInitialSetup` select only fields used by password authentication:

```ts
select: {
  id: true,
  email: true,
  fullName: true,
  role: true,
  passwordHash: true,
  mustChangePassword: true,
  isActive: true,
}
```

Remove 2FA mutation methods from `user-repository.ts`. Remove 2FA fields from production bootstrap types, selects, invariants, and tests. Remove `ADMIN_2FA_SECRET` and explicit 2FA values from seed `create` and `update` objects; Prisma defaults keep the dormant Deployment 1 columns valid.

- [ ] **Step 7: Update the initial-password browser fixture**

Remove 2FA fields from `restoreInitialPasswordFixture()`:

```ts
data: {
  passwordHash,
  mustChangePassword: true,
  isActive: true,
}
```

Do not change the existing student password-rotation browser assertions.

- [ ] **Step 8: Run repository and password-setup tests**

Run:

```bash
npx vitest run app/portal/setup/password/__tests__/actions.test.ts app/portal/setup/password/__tests__/page.test.tsx lib/repositories/__tests__/account-setup-repository.test.ts tests/repositories/account-setup-repository.postgres.test.ts lib/repositories/__tests__/user-repository.test.ts lib/bootstrap/__tests__/production-admin.test.ts
```

Expected: all configured unit tests PASS. The PostgreSQL test may be skipped only when its documented integration database is unavailable.

- [ ] **Step 9: Commit**

```bash
git add app/portal/setup/password lib/repositories lib/bootstrap prisma/seed.ts e2e/auth/initial-password.spec.ts
git commit -m "refactor: remove 2fa from account setup"
```

### Task 3: Remove 2FA Routes, Components, and Runtime Modules

**Files:**
- Delete: `app/portal/setup/2fa/`
- Delete: `app/portal/login/verify-2fa/`
- Delete: `app/(admin)/admin/security/`
- Delete: `components/auth/InitialTwoFactorForm.tsx`
- Delete: `components/auth/two-factor-form.tsx`
- Delete: `components/auth/__tests__/InitialTwoFactorForm.test.tsx`
- Modify: `components/auth/__tests__/AuthFormFeedback.test.tsx`
- Delete: `components/admin/two-factor-settings.tsx`
- Delete: `components/admin/__tests__/TwoFactorSettingsFeedback.test.tsx`
- Delete: `lib/auth/two-factor.ts`
- Delete: `lib/auth/__tests__/two-factor.test.ts`
- Delete: `lib/validations/two-factor.ts`
- Delete: `lib/repositories/admin-two-factor-challenge-repository.ts`
- Delete: `lib/repositories/__tests__/admin-two-factor-challenge-repository.test.ts`
- Delete: `tests/repositories/admin-two-factor-challenge-repository.postgres.test.ts`
- Modify: `app/(admin)/admin/page.tsx`

**Interfaces:**
- Consumes: password-only login and password setup from Tasks 1 and 2.
- Produces: no reachable application route, action, component, repository, or helper that can enroll or verify TOTP.

- [ ] **Step 1: Add a source audit test that forbids reachable 2FA modules**

Add to `app/__tests__/env-dependencies.audit.test.ts`:

```ts
it("does not ship application-managed 2FA routes or runtime modules", () => {
  const removedPaths = [
    "app/portal/setup/2fa",
    "app/portal/login/verify-2fa",
    "app/(admin)/admin/security",
    "lib/auth/two-factor.ts",
    "lib/repositories/admin-two-factor-challenge-repository.ts",
  ];
  for (const relativePath of removedPaths) {
    expect(existsSync(resolve(process.cwd(), relativePath))).toBe(false);
  }
});
```

- [ ] **Step 2: Run the audit test and verify it fails**

Run:

```bash
npx vitest run app/__tests__/env-dependencies.audit.test.ts
```

Expected: FAIL because the listed paths still exist.

- [ ] **Step 3: Delete the 2FA runtime and focused tests**

Delete exactly the files and directories listed in this task. Remove the `Security` link from `app/(admin)/admin/page.tsx`:

```tsx
// Delete only this button:
<Button asChild variant="secondary" size="sm">
  <Link href="/admin/security">Security</Link>
</Button>
```

Preserve unrelated administrator dashboard links and audits.

- [ ] **Step 4: Remove dead component-test mocks and imports**

Delete only the 2FA form test from `AuthFormFeedback.test.tsx`; retain login and password form feedback coverage.

- [ ] **Step 5: Run the audit and TypeScript checks**

Run:

```bash
npx vitest run app/__tests__/env-dependencies.audit.test.ts components/auth/__tests__/AuthFormFeedback.test.tsx
npm run typecheck
```

Expected: tests and type checking PASS. Session-only compatibility APIs may remain until Task 4, but no import may reference a module deleted in this task.

- [ ] **Step 6: Commit**

```bash
git add app components lib tests
git commit -m "refactor: remove application 2fa runtime"
```

### Task 4: Replace the MFA Session Contract and Middleware

**Files:**
- Modify: `lib/auth/session.ts`
- Modify: `lib/__tests__/session-expiry.test.ts`
- Delete: `lib/auth/__tests__/session-handoff.test.ts`
- Modify: `app/__tests__/session-expiry-page.test.tsx`
- Modify: `middleware.ts`
- Modify: `tests/middleware.test.ts`
- Modify: `e2e/helpers/session.ts`
- Delete: `lib/auth/backup-code-hash.ts`
- Modify: every test fixture that constructs a version-2 session payload.

**Interfaces:**
- Produces:

```ts
export type SessionPayload = {
  purpose: "SESSION";
  version: 3;
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  exp: number;
  authMethod: "password" | "sso";
};
```

- Temporary Deployment 1 compatibility: `clearSession()` and `createSession()` expire `ulu_admin_2fa_pending`; middleware redirects retired 2FA URLs to `/portal/login`.

- [ ] **Step 1: Add failing session-version tests**

Add:

```ts
it("accepts version 3 password sessions without an MFA field", async () => {
  const token = await createSessionToken({
    uid: "admin-1",
    role: UserRole.ADMIN,
    email: "admin@example.com",
    fullName: "Admin User",
    authMethod: "password",
  });
  await expect(verifySessionToken(token)).resolves.toMatchObject({
    version: 3,
    uid: "admin-1",
    role: UserRole.ADMIN,
    authMethod: "password",
  });
});

it("rejects version 2 MFA-bearing sessions", async () => {
  const token = await createLegacyVersionTwoSessionToken();
  await expect(verifySessionToken(token)).resolves.toBeNull();
});
```

Update helper names to match the test file's existing token factory pattern.

- [ ] **Step 2: Add failing middleware tests**

Cover:

```ts
it.each(["/portal/setup/2fa", "/portal/login/verify-2fa"])(
  "redirects retired route %s to portal login",
  async (pathname) => {
    const response = await runMiddleware(pathname);
    expect(response.headers.get("location")).toBe("http://localhost/portal/login");
  },
);

it("allows an administrator session without mfaVerified", async () => {
  verifySessionTokenMock.mockResolvedValue(adminSessionV3());
  const response = await runMiddleware("/admin");
  expect(response.status).not.toBe(403);
  expect(response.headers.get("location")).toBeNull();
});
```

- [ ] **Step 3: Run session and middleware tests and verify they fail**

Run:

```bash
npx vitest run lib/__tests__/session-expiry.test.ts tests/middleware.test.ts
```

Expected: FAIL because version 2 and `mfaVerified` are still required.

- [ ] **Step 4: Implement session version 3**

Use:

```ts
const SESSION_SECURITY_VERSION = 3 as const;

type SessionInput = {
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  authMethod?: AuthMethod;
};

export type SessionPayload = {
  purpose: "SESSION";
  version: typeof SESSION_SECURITY_VERSION;
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  exp: number;
  authMethod: AuthMethod;
};
```

Remove `mfaVerified` from payload construction and validation. Remove pending-challenge payloads, initial-2FA capabilities, prepared handoff cookies, and their exports. Keep password initial-setup capabilities.

During Deployment 1 only:

```ts
const LEGACY_ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";

export async function createSession(input: SessionInput) {
  const prepared = await prepareSessionCookie(input);
  const cookieStore = await cookies();
  cookieStore.set(prepared.name, prepared.value, prepared.options);
  cookieStore.delete(LEGACY_ADMIN_PENDING_2FA_COOKIE);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LEGACY_ADMIN_PENDING_2FA_COOKIE);
}
```

Keep `PreparedSessionCookie` and `prepareSessionCookie` as the generic session encoder used above.
Delete `replaceAuthCookieFamilyWithSession` and `AuthCookieReplacementError`, which existed only for
the 2FA handoff.

- [ ] **Step 5: Simplify middleware**

Before normal route policy:

```ts
const RETIRED_TWO_FACTOR_PATHS = ["/portal/setup/2fa", "/portal/login/verify-2fa"] as const;
if (matchesAnyPrefix(pathname, RETIRED_TWO_FACTOR_PATHS)) {
  const redirectResponse = NextResponse.redirect(new URL("/portal/login", request.url));
  redirectResponse.cookies.delete("ulu_admin_2fa_pending");
  return redirectResponse;
}
```

Delete pending-token verification, pending-login redirects, and the administrator MFA enforcement block. Continue deleting the legacy cookie from normal middleware responses during Deployment 1.

- [ ] **Step 6: Update E2E session helpers**

`createSessionToken` emits version 3 and no MFA field:

```ts
return createSignedToken({
  purpose: "SESSION",
  version: 3,
  uid: input.uid,
  role: input.role,
  email: input.email,
  fullName: input.fullName,
  exp: Date.now() + SESSION_DURATION_MS,
  authMethod: "password",
});
```

Keep a version-2 token factory only for the invalidation test. Delete the pending-2FA token factory.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx vitest run lib/__tests__/session-expiry.test.ts app/__tests__/session-expiry-page.test.tsx tests/middleware.test.ts
npm run typecheck
```

Expected: all tests and type checking PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/auth lib/__tests__ app/__tests__/session-expiry-page.test.tsx middleware.ts tests/middleware.test.ts e2e/helpers/session.ts
git commit -m "refactor: replace mfa session contract"
```

### Task 5: Replace 2FA Release Coverage and Configuration

**Files:**
- Create: `e2e/auth/admin-password-only.spec.ts`
- Delete: `e2e/portals/admin-security.spec.ts`
- Delete: `e2e/portals/initial-admin-2fa.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `playwright.config.ts`
- Modify: `scripts/playwright-test.mjs`
- Modify: `scripts/__tests__/playwright-test-contract.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.env.example`
- Modify: `lib/config/production-env.ts`
- Modify: `lib/config/__tests__/production-env.test.ts`
- Modify: `app/__tests__/env-dependencies.audit.test.ts`
- Modify: `app/__tests__/deployment-docs.audit.test.ts`

**Interfaces:**
- Produces: standard-partition browser coverage for existing configured admins, first-password admins, stale routes, stale cookies, logout, and role isolation.
- Produces: production environment validation with no `ADMIN_REQUIRE_2FA`, `ADMIN_2FA_SECRET`, `TWO_FACTOR_ISSUER`, or `E2E_ADMIN_REQUIRE_2FA`.

- [ ] **Step 1: Write the password-only administrator E2E test**

Create a serial spec with two administrators during Deployment 1:

```ts
test("an existing configured admin signs in with password only", async ({ page }) => {
  await page.goto("/portal/login?next=%2Fadmin");
  await page.getByLabel(/email/i).fill(configuredAdminEmail);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await expect(page.getByRole("heading", { name: /admin dashboard/i })).toBeVisible();
});

test("a bootstrap admin changes the temporary password and reaches admin directly", async ({
  page,
}) => {
  await login(page, bootstrapAdminEmail, temporaryPassword);
  await expect(page).toHaveURL(/\/portal\/setup\/password$/);
  await changePassword(page, temporaryPassword, rotatedPassword);
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await page.getByRole("button", { name: /logout|sign out/i }).click();
  await login(page, bootstrapAdminEmail, rotatedPassword);
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
});
```

Also assert retired routes redirect to `/portal/login` and a manually inserted `ulu_admin_2fa_pending` cookie disappears.

- [ ] **Step 2: Remove the 2FA Playwright partition**

Set:

```json
"test:e2e": "npm run test:e2e:standard && npm run test:e2e:signed-delivery && npm run test:e2e:storage",
"test:e2e:release": "npm run test:e2e:standard && npm run test:e2e:signed-delivery && npm run test:e2e:storage"
```

Delete the `test:e2e:admin-2fa` and `test:e2e:initial-admin-2fa` scripts. Remove `admin-2fa` from partition flags, release partitions, ignore patterns, environment forwarding, and runner contract tests. The new E2E spec runs in `standard`.

- [ ] **Step 3: Remove `otplib`**

Run:

```bash
npm uninstall otplib
```

Expected: `package.json` and `package-lock.json` no longer contain `otplib` packages.

- [ ] **Step 4: Remove application 2FA environment validation**

Delete the 2FA keys from `.env.example`, CI environment, audit-required key lists, Zod input shape, and `superRefine`. The valid production fixture must omit them:

```ts
const validEnvironment = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  DATABASE_URL: "...",
  DIRECT_URL: "...",
  AUTH_SESSION_SECRET: "auth-session-value-7f4b2d9c6a1e8f3d",
  ADMIN_SSO_ENABLED: "false",
  // Remaining existing required values stay unchanged.
};
```

Delete the invalid literal case `["ADMIN_REQUIRE_2FA", "false"]`.

- [ ] **Step 5: Update runner and environment contract tests**

Assert:

```ts
expect(scripts["test:e2e"]).toBe(
  "npm run test:e2e:standard && npm run test:e2e:signed-delivery && npm run test:e2e:storage",
);
expect(source).not.toContain("admin-2fa");
expect(source).not.toContain("E2E_ADMIN_REQUIRE_2FA");
expect(source).not.toContain("ADMIN_REQUIRE_2FA");
```

- [ ] **Step 6: Run focused configuration tests**

Run:

```bash
npx vitest run lib/config/__tests__/production-env.test.ts app/__tests__/env-dependencies.audit.test.ts app/__tests__/deployment-docs.audit.test.ts scripts/__tests__/playwright-test-contract.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add e2e package.json package-lock.json playwright.config.ts scripts .github/workflows/ci.yml .env.example lib/config app/__tests__
git commit -m "test: replace 2fa release coverage"
```

### Task 6: Update Active Product and Deployment Documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/product-requirements-document.md`
- Modify: `docs/how-to-understand-and-modify-functionality.md`
- Modify: `docs/local-setup.md`
- Modify: `docs/qa-checklist.md`
- Modify: `docs/qa-matrix.md`
- Modify: `docs/known-limitations.md`
- Modify: `docs/infrastructure-policy.md`
- Modify: `docs/deployment/render-production.md`
- Modify: `docs/deployment/launch-checklist.md`
- Modify: `docs/deployment/browser-verification.md`
- Modify: `docs/deployment/rollback.md`
- Modify: `docs/superpowers/specs/2026-07-13-launch-critical-mvp-production-readiness-design.md`

**Interfaces:**
- Produces: active documentation that describes password-only application admin login and still requires provider-level 2FA.

- [ ] **Step 1: Update active authentication wording**

Use this exact policy statement wherever the active application contract is described:

```text
ULU Online School administrators authenticate to the application with email and password.
Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
accounts remain protected with provider-level 2FA.
```

Do not rewrite historical implementation plans. Add a supersession note to the prior launch design:

```markdown
> **Superseded for application 2FA:** The administrator TOTP requirements in this document were
> replaced by `2026-07-23-remove-two-factor-authentication-design.md`. Other launch requirements
> remain active.
```

- [ ] **Step 2: Replace launch checklist B02**

Use:

```markdown
| B02 | Bootstrap admin, `/portal/login` | Sign in with the bootstrap credential, rotate it, sign out, and sign in again with the new password. | Password rotation cannot be skipped, no authenticator prompt appears, and the second login reaches `/admin`. |
```

Remove backup-code recording and TOTP smoke steps. Add a provider-account checklist item requiring 2FA on Render, GitHub, Cloudflare, Resend/email, and Sentry.

- [ ] **Step 3: Update rollback and Render environment instructions**

Remove application 2FA variables and challenges. Document that Deployment 1 is code-rollback-safe while Deployment 2 requires both the pre-migration database backup and compatible code.

- [ ] **Step 4: Run documentation audits and search**

Run:

```bash
npx vitest run app/__tests__/deployment-docs.audit.test.ts app/__tests__/env-dependencies.audit.test.ts
rg -n "ADMIN_REQUIRE_2FA|ADMIN_2FA_SECRET|E2E_ADMIN_REQUIRE_2FA|setup/2fa|verify-2fa" docs .env.example .github package.json scripts app components lib tests e2e
```

Expected: tests PASS. Remaining matches are limited to the approved 2026-07-23 spec/plan, historical audit-action redaction, the temporary Deployment 1 compatibility bridge, and old migration history.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: describe password-only admin access"
```

### Task 7: Verify and Publish Deployment 1

**Files:**
- No source changes expected.
- Record evidence in: `docs/deployment/browser-verification.md` without credentials, personal data, tokens, or secrets.

**Interfaces:**
- Produces: a live release that no longer uses the dormant 2FA schema and is safe for the destructive Deployment 2 migration.

- [ ] **Step 1: Run targeted authentication checks**

```bash
npx vitest run app/portal/login app/portal/setup/password app/api/auth/sso/callback lib/__tests__/session-expiry.test.ts tests/middleware.test.ts lib/repositories/__tests__/account-setup-repository.test.ts lib/bootstrap/__tests__/production-admin.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full verification ladder**

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: every command exits 0. Do not deploy with a skipped release gate or a failing browser partition.

- [ ] **Step 3: Self-review the diff**

Run:

```bash
git diff --check
git status --short
rg -n "ADMIN_REQUIRE_2FA|ADMIN_2FA_SECRET|E2E_ADMIN_REQUIRE_2FA|setup/2fa|verify-2fa|otplib" app components lib tests e2e scripts package.json .github .env.example
```

Expected: no whitespace errors; only intentional Deployment 1 compatibility matches remain.

- [ ] **Step 4: Push Deployment 1 and wait for Render**

Push the reviewed branch, merge it according to the repository's release workflow, and deploy the existing Render service. Do not create another paid web service or database.

Expected Render checks:

```text
environment validation passes
Prisma generate passes
no destructive migration runs
Next.js build passes
health endpoint reports HTTP 200 and database ok
```

- [ ] **Step 5: Run the live browser gate**

Use a non-production-data test administrator:

```text
1. Existing TOTP-configured admin signs in with email and password only.
2. Bootstrap admin changes the temporary password and reaches /admin directly.
3. Logout and second password-only login both succeed.
4. /portal/setup/2fa and /portal/login/verify-2fa redirect to /portal/login.
5. A stale ulu_admin_2fa_pending cookie is removed.
6. Wrong password, inactive account, and rate limit behavior still reject access.
7. Student, parent, and teacher logins are unchanged.
8. Student, parent, and teacher sessions cannot open /admin.
```

Record role, starting route, actions, expected result, and visible result. Never record credentials or cookies.

- [ ] **Step 6: Mark the destructive migration gate**

Do not begin Task 8 until the user explicitly confirms:

```text
Deployment 1 verified; proceed with destructive 2FA database cleanup.
```

---

## Deployment 2

### Task 8: Create and Verify the Pre-Migration PostgreSQL Backup

**Files:**
- Do not add backup artifacts to the repository.
- Update evidence only: `docs/deployment/browser-verification.md`.

**Interfaces:**
- Produces: an encrypted or access-controlled custom-format PostgreSQL backup and a successful disposable restore.

- [ ] **Step 1: Capture the production migration state**

Run from a trusted shell with the secret supplied only through the environment:

```bash
npx prisma migrate status
```

Expected: database schema is up to date through the Deployment 1 migration set.

- [ ] **Step 2: Create the custom-format backup**

```bash
pg_dump --format=custom --no-owner --no-acl --file ulu-pre-2fa-removal.dump "$DIRECT_URL"
```

Expected: exit 0 and a non-empty dump outside the git workspace. Do not print `DIRECT_URL`.

- [ ] **Step 3: Restore into a disposable PostgreSQL database**

```bash
createdb ulu_2fa_restore_check
pg_restore --clean --if-exists --no-owner --no-acl --dbname ulu_2fa_restore_check ulu-pre-2fa-removal.dump
```

Expected: exit 0.

- [ ] **Step 4: Verify restored objects and representative non-secret data**

```sql
SELECT COUNT(*) FROM "AppUser";
SELECT COUNT(*) FROM "AdminTwoFactorChallenge";
SELECT COUNT(*) FROM "EnrolmentApplication";
SELECT COUNT(*) FROM "ContactSubmission";
```

Expected: queries succeed. Record counts privately for restore comparison; do not put personal data or secrets in docs.

- [ ] **Step 5: Record backup evidence**

Record only:

```text
backup timestamp
source Render database name
dump format: PostgreSQL custom
restore target: disposable database
restore result: pass
verifier name
```

### Task 9: Drop the Dormant 2FA Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260723120000_remove_application_two_factor_authentication/migration.sql`
- Modify: remaining fixtures that explicitly set 2FA fields, including `e2e/auth/admin-password-only.spec.ts`
- Modify: Prisma-shape tests that still expect the removed fields or relation.

**Interfaces:**
- Consumes: verified Deployment 1 release and verified backup from Task 8.
- Produces: `AppUser` without application 2FA fields and no `AdminTwoFactorChallenge` model or table.

- [ ] **Step 1: Add a failing schema audit**

Add:

```ts
it("contains no application 2FA schema", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  expect(schema).not.toMatch(/\btwoFactorEnabled\b/);
  expect(schema).not.toMatch(/\btwoFactorSecret\b/);
  expect(schema).not.toMatch(/\btwoFactorBackupCodes\b/);
  expect(schema).not.toMatch(/\bAdminTwoFactorChallenge\b/);
});
```

- [ ] **Step 2: Run the schema audit and verify it fails**

Run:

```bash
npx vitest run app/__tests__/env-dependencies.audit.test.ts
```

Expected: FAIL on the existing Prisma fields and model.

- [ ] **Step 3: Add the destructive migration**

Create:

```sql
-- Deployment 1 no longer reads or writes these objects.
DROP TABLE "AdminTwoFactorChallenge";

ALTER TABLE "AppUser"
  DROP COLUMN "twoFactorBackupCodes",
  DROP COLUMN "twoFactorEnabled",
  DROP COLUMN "twoFactorSecret";
```

- [ ] **Step 4: Remove the Prisma model and fields**

Delete from `AppUser`:

```prisma
twoFactorEnabled     Boolean  @default(false)
twoFactorSecret      String?
twoFactorBackupCodes String[] @default([])
adminTwoFactorChallenges AdminTwoFactorChallenge[]
```

Delete the complete `AdminTwoFactorChallenge` model. Do not modify unrelated relations or defaults.

- [ ] **Step 5: Remove compatibility fixture fields**

In the Deployment 1 browser test, retain the password-only login assertion but create the admin without 2FA fields:

```ts
const admin = await prisma.appUser.create({
  data: {
    email,
    fullName: "QA Password Only Admin",
    role: UserRole.ADMIN,
    passwordHash: await hashPassword(password),
    isActive: true,
    mustChangePassword: false,
  },
});
```

Update all remaining object literals and selects reported by TypeScript.

- [ ] **Step 6: Validate and generate Prisma**

Run:

```bash
npx prisma validate
npx prisma generate
npm run typecheck
```

Expected: all commands exit 0 and no generated type exposes the removed fields or model.

- [ ] **Step 7: Apply the migration to a disposable copy**

Point `DATABASE_URL` and `DIRECT_URL` to the restored disposable database, then run:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Expected: migration succeeds and status reports up to date.

Verify:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'AppUser'
  AND column_name IN ('twoFactorEnabled', 'twoFactorSecret', 'twoFactorBackupCodes');

SELECT to_regclass('"AdminTwoFactorChallenge"');
```

Expected: first query returns zero rows; second query returns `NULL`.

- [ ] **Step 8: Commit**

```bash
git add prisma app e2e tests lib
git commit -m "db: remove application 2fa data"
```

### Task 10: Remove the Deployment 1 Compatibility Bridge

**Files:**
- Modify: `lib/auth/session.ts`
- Modify: `middleware.ts`
- Modify: `lib/__tests__/session-expiry.test.ts`
- Modify: `tests/middleware.test.ts`
- Modify: active docs that describe the temporary compatibility window.
- Render environment: remove `ADMIN_REQUIRE_2FA` and `ADMIN_2FA_SECRET`.

**Interfaces:**
- Produces: no runtime references to 2FA routes, cookies, fields, tables, packages, or environment variables.

- [ ] **Step 1: Remove temporary legacy cleanup**

Delete:

```ts
const LEGACY_ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";
```

Stop deleting that cookie from `createSession`, `clearSession`, and middleware. Remove retired-route redirect constants and tests; the removed URLs may now return the normal not-found response.

- [ ] **Step 2: Run a repository-wide reference audit**

Run:

```bash
rg -n -i "two.?factor|2fa|totp|otpauth|backup.?code|ADMIN_REQUIRE_2FA|ADMIN_2FA_SECRET|E2E_ADMIN_REQUIRE_2FA|AdminTwoFactorChallenge|twoFactorEnabled|twoFactorSecret|twoFactorBackupCodes" app components lib tests e2e scripts prisma/schema.prisma package.json .env.example .github docs
```

Expected remaining matches:

```text
the approved 2026-07-23 design and implementation plan
historical migration files and historical superpowers plans/specs
audit redaction rules or tests that protect historical records
provider-level 2FA policy
```

No active route, session, repository, Prisma schema, package, environment contract, or current launch instruction may reference application 2FA.

- [ ] **Step 3: Remove Render variables**

In the existing `uluschool` web service, remove only:

```text
ADMIN_REQUIRE_2FA
ADMIN_2FA_SECRET
```

Do not remove `AUTH_SESSION_SECRET`, bootstrap credentials until their separate bootstrap cleanup gate passes, database URLs, SMTP, Turnstile, R2, alerts, Sentry, or Nairobi timezone variables.

- [ ] **Step 4: Update compatibility documentation**

Mark Deployment 1 compatibility cleanup complete and retain the backup location/restore evidence outside git.

- [ ] **Step 5: Run focused tests**

```bash
npx vitest run lib/__tests__/session-expiry.test.ts tests/middleware.test.ts app/__tests__/env-dependencies.audit.test.ts app/__tests__/deployment-docs.audit.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib middleware.ts tests app docs
git commit -m "chore: finish application 2fa removal"
```

### Task 11: Verify and Publish Deployment 2

**Files:**
- No source changes expected.
- Record final evidence in: `docs/deployment/browser-verification.md`.

**Interfaces:**
- Produces: final deployed password-only application with no application 2FA data or runtime.

- [ ] **Step 1: Run the full local verification ladder**

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: every command exits 0.

- [ ] **Step 2: Review migration and diff**

```bash
git diff --check
git status --short
git show --stat --oneline HEAD
```

Expected: clean diff checks, intentional migration only, no generated or secret files.

- [ ] **Step 3: Deploy to the existing Render service**

Use the existing web service and PostgreSQL database. Pre-deploy runs:

```bash
npx prisma migrate deploy
```

Expected: migration succeeds once, build succeeds, service becomes healthy, and no new paid resource is created.

- [ ] **Step 4: Verify the live database without exposing values**

Run metadata-only checks:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'AppUser'
  AND column_name IN ('twoFactorEnabled', 'twoFactorSecret', 'twoFactorBackupCodes');

SELECT to_regclass('"AdminTwoFactorChallenge"');
```

Expected: zero rows and `NULL`.

- [ ] **Step 5: Run final browser smoke**

```text
admin password login -> /admin
bootstrap password rotation -> /admin
logout -> second password login -> /admin
wrong password -> generic rejection and rate-limit accounting
student login -> student portal
teacher login -> teacher portal
parent login -> parent portal
all non-admin roles -> /admin denied
health endpoint -> HTTP 200 and database ok
```

- [ ] **Step 6: Final implementation report**

Report:

```text
two deployment SHAs
migration name
Render deploy results
files/modules removed
password, session, audit, role, and ownership controls retained
tests and browser workflows run
backup and restore verification status without paths or secrets
remaining risk: administrator account is password-only
```
