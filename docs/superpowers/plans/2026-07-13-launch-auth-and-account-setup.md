# Launch Authentication and Account Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove client-trusted upload authorization and shared portal passwords, then provide a restricted first-login password and administrator 2FA enrollment flow plus an idempotent production bootstrap.

**Architecture:** Protected routes derive identity from `lib/auth/session.ts`; account creation generates one-time credentials; initial setup uses a separate 15-minute signed cookie that cannot authorize normal portal routes. Prisma stores only password hashes and a `mustChangePassword` flag, while security mutations and successful setup events use existing audit infrastructure.

**Tech Stack:** Next.js server actions and route handlers, Prisma/PostgreSQL, Zod, Node.js `crypto`/scrypt, signed HTTP-only cookies, otplib TOTP, Vitest, Testing Library.

## Global Constraints

- Never authorize from `x-role`, hidden form IDs, or client-sent ownership fields.
- Never write temporary passwords, password hashes, TOTP secrets, backup codes, or setup cookies to logs or audit metadata.
- New temporary passwords are 20-character cryptographically random values and are returned only once to the creating administrator.
- New passwords require at least 12 characters and cannot equal the current temporary password.
- Existing `AppUser` rows are migrated with `mustChangePassword=false`; new manually created users are explicit `true`.
- `ADMIN_REQUIRE_2FA=true` means an admin receives no normal admin session until TOTP setup or verification succeeds.
- Setup cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production, purpose-bound, signed, and valid for 15 minutes.
- Every server action validates input with Zod and writes success audit logs only after its mutation succeeds.

---

## File Map

- Secure `app/api/upload/route.ts` and remove `x-role` from `app/portal/teacher/components/MaterialForm.tsx`.
- Add Zod schemas to `app/(admin)/admin/users/actions.ts`.
- Add `mustChangePassword` and Prisma `directUrl`, with an additive migration.
- Add `lib/auth/temporary-password.ts` and update account creation call sites.
- Add a reusable one-time credential panel for admin account forms.
- Extend `lib/auth/session.ts` with a separate initial-setup cookie.
- Add `/portal/setup/password` and `/portal/setup/2fa` pages, actions, and client forms.
- Add `lib/repositories/account-setup-repository.ts` for password mutation and audit ownership.
- Add `lib/bootstrap/production-admin.ts` plus `prisma/bootstrap-production.ts`.
- Update focused route, action, component, middleware, repository, and bootstrap tests.

### Task 1: Authenticate the Upload Route Server-Side

**Files:**

- Modify: `app/api/upload/route.ts`
- Modify: `app/api/upload/__tests__/route.test.ts`
- Modify: `app/portal/teacher/components/MaterialForm.tsx`
- Modify: `tests/components/portal/MaterialForm.test.tsx`

**Interfaces:**

- Consumes: `getSession(): Promise<SessionPayload | null>` from `lib/auth/session.ts`.
- Produces: `POST /api/upload` responses that depend only on the revalidated server session and an allowlisted upload purpose.

- [ ] **Step 1: Replace header-based tests with session and forgery tests**

At the top of `app/api/upload/__tests__/route.test.ts`, add a hoisted session mock:

```ts
const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));
```

Set a valid teacher by default in `beforeEach`:

```ts
getSessionMock.mockResolvedValue({
  uid: "teacher-1",
  role: "TEACHER",
  email: "teacher@example.com",
  exp: Date.now() + 60_000,
  mfaVerified: true,
  authMethod: "password",
});
```

Define the request helper in the same test file so every case sends the purpose explicitly and
only forgery cases send the obsolete header:

```ts
function buildUploadRequest(input: {
  roleHeader?: string;
  purpose?: string;
  file?: File;
} = {}) {
  const form = new FormData();
  form.append("purpose", input.purpose ?? "course-material");
  form.append(
    "file",
    input.file ?? new File(["content"], "lesson.pdf", { type: "application/pdf" }),
  );

  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: input.roleHeader ? { "x-role": input.roleHeader } : undefined,
    body: form,
  });
}
```

Add these security cases and remove all tests that treat `DEVELOPER` or `x-role` as authority:

```ts
it("returns 401 without a revalidated session", async () => {
  getSessionMock.mockResolvedValueOnce(null);
  const { POST } = await import("@/app/api/upload/route");
  const response = await POST(buildUploadRequest({ roleHeader: "TEACHER" }));
  expect(response.status).toBe(401);
  expect(uploadMock).not.toHaveBeenCalled();
});

it.each(["STUDENT", "PARENT"])("returns 403 for %s", async (role) => {
  getSessionMock.mockResolvedValueOnce({
    uid: `${role.toLowerCase()}-1`,
    role,
    email: `${role.toLowerCase()}@example.com`,
    exp: Date.now() + 60_000,
    mfaVerified: true,
    authMethod: "password",
  });
  const { POST } = await import("@/app/api/upload/route");
  const response = await POST(buildUploadRequest({ roleHeader: "TEACHER" }));
  expect(response.status).toBe(403);
  expect(uploadMock).not.toHaveBeenCalled();
});

it("ignores a forged x-role header", async () => {
  getSessionMock.mockResolvedValueOnce(null);
  const { POST } = await import("@/app/api/upload/route");
  const response = await POST(buildUploadRequest({ roleHeader: "TEACHER" }));
  expect(response.status).toBe(401);
});
```

The request helper must append `purpose=course-material` to `FormData`; the role header exists only in the forgery test.

- [ ] **Step 2: Run the upload tests and verify RED**

```powershell
npx vitest run app/api/upload/__tests__/route.test.ts tests/components/portal/MaterialForm.test.tsx
```

Expected: route security tests fail because the handler still trusts `x-role`, and the component test detects the outgoing header.

- [ ] **Step 3: Implement session and purpose authorization**

In `app/api/upload/route.ts`, import `UserRole` and `getSession`, delete `isAllowedRole`, and begin `POST` with:

```ts
const session = await getSession();
if (!session) {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

if (![UserRole.ADMIN, UserRole.TEACHER].includes(session.role)) {
  return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
}
```

After parsing multipart data, validate purpose with a fixed policy:

```ts
const purpose = String(formData.get("purpose") ?? "");
const allowed =
  (session.role === UserRole.TEACHER && purpose === "course-material") ||
  (session.role === UserRole.ADMIN && ["course-material", "teacher-photo"].includes(purpose));

if (!allowed) {
  return NextResponse.json({ success: false, error: "Upload purpose is not allowed" }, { status: 403 });
}
```

Call `createStorageService()` without role options. Return the existing metadata shape for every successful authenticated upload; remove role-dependent response branching.

In `MaterialForm.tsx`, change the request to:

```ts
const formData = new FormData();
formData.append("purpose", "course-material");
formData.append("file", selectedFile, selectedFile.name);
const response = await fetch("/api/upload", {
  method: "POST",
  body: formData,
});
```

- [ ] **Step 4: Verify upload security GREEN**

```powershell
npx vitest run app/api/upload/__tests__/route.test.ts tests/components/portal/MaterialForm.test.tsx
```

Expected: all upload and MaterialForm tests pass, including unauthenticated, forbidden-role, forged-header, MIME, size, malformed payload, batch, and storage-failure cases.

- [ ] **Step 5: Commit the upload authorization fix**

```powershell
git add -- app/api/upload app/portal/teacher/components/MaterialForm.tsx tests/components/portal/MaterialForm.test.tsx
git commit -m "fix: authenticate material uploads"
```

### Task 2: Validate Generic Admin User Actions with Zod

**Files:**

- Modify: `app/(admin)/admin/users/actions.ts`
- Modify: `app/(admin)/admin/users/__tests__/actions.test.ts`

**Interfaces:**

- Consumes: raw action input from admin components.
- Produces: normalized validated inputs passed to `portal-repository`, with no audit log on validation failure.

- [ ] **Step 1: Add failing malformed-input tests**

Add tests for an invalid email, invalid role, empty user ID, and non-boolean status:

```ts
it("rejects malformed create input before repository or audit calls", async () => {
  const result = await createUserAction({
    email: "not-an-email",
    fullName: "",
    role: "OWNER",
  });

  expect(result.success).toBe(false);
  expect(createUserMock).not.toHaveBeenCalled();
  expect(createAdminAuditLogMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the action test and verify RED**

```powershell
npx vitest run 'app/(admin)/admin/users/__tests__/actions.test.ts'
```

Expected: malformed create input reaches manual parsing or repository code.

- [ ] **Step 3: Add exact Zod schemas**

In `actions.ts`, replace `parseRole` with:

```ts
const createUserInputSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.nativeEnum(UserRole),
  phoneWhatsapp: z.string().trim().min(7).max(32).optional().or(z.literal("")),
});

const updateUserRoleInputSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.nativeEnum(UserRole),
});

const toggleUserStatusInputSchema = z.object({
  userId: z.string().trim().min(1),
  isActive: z.boolean(),
});
```

Each action calls `safeParse` immediately after `requireRole`, returns `{ success: false, error: "Invalid input." }` on failure, and uses only `parsed.data` afterward.

- [ ] **Step 4: Verify the action test GREEN**

```powershell
npx vitest run 'app/(admin)/admin/users/__tests__/actions.test.ts'
```

Expected: all existing success/audit tests and new malformed-input tests pass.

- [ ] **Step 5: Commit action validation**

```powershell
git add -- 'app/(admin)/admin/users/actions.ts' 'app/(admin)/admin/users/__tests__/actions.test.ts'
git commit -m "fix: validate admin user actions"
```

### Task 3: Add Unique Temporary Credentials and the Prisma Flag

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713120000_initial_password_setup/migration.sql`
- Create: `lib/auth/temporary-password.ts`
- Create: `lib/auth/__tests__/temporary-password.test.ts`
- Modify: `lib/repositories/portal-repository.ts`
- Modify: `lib/repositories/__tests__/portal-repository.test.ts`
- Modify: `lib/repositories/admin-audit-repository.ts`
- Modify: `prisma/seed.ts`
- Modify: `app/_audit/repository-usage.ts`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: `generateTemporaryPassword(): string` and `createUser(...): { user; temporaryPassword; mustChangePassword: true }`.
- Consumes later: account forms, initial password setup, and production bootstrap.

- [ ] **Step 1: Write temporary-password and repository tests**

Create `lib/auth/__tests__/temporary-password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";

describe("generateTemporaryPassword", () => {
  it("returns a 20-character URL-safe password", () => {
    expect(generateTemporaryPassword()).toMatch(/^[A-Za-z0-9_-]{20}$/);
  });

  it("does not reuse one shared value", () => {
    const values = new Set(Array.from({ length: 32 }, generateTemporaryPassword));
    expect(values.size).toBe(32);
  });
});
```

Update the `createUser` repository tests to assert:

```ts
expect(hashPasswordMock).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9_-]{20}$/));
expect(appUserCreateMock).toHaveBeenCalledWith({
  data: expect.objectContaining({ mustChangePassword: true }),
});
expect(result).toEqual({
  user: expect.any(Object),
  temporaryPassword: expect.stringMatching(/^[A-Za-z0-9_-]{20}$/),
  mustChangePassword: true,
});
```

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npx vitest run lib/auth/__tests__/temporary-password.test.ts lib/repositories/__tests__/portal-repository.test.ts
```

Expected: the helper is missing and `createUser` still hashes `DEFAULT_PORTAL_PASSWORD`.

- [ ] **Step 3: Add the additive Prisma fields**

In `prisma/schema.prisma`, update the datasource and `AppUser`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

```prisma
model AppUser {
  // existing fields
  mustChangePassword Boolean @default(false)
  // existing relations
}
```

Create the migration:

```sql
ALTER TABLE "AppUser"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Implement the random credential helper**

Create `lib/auth/temporary-password.ts`:

```ts
import { randomBytes } from "node:crypto";

export function generateTemporaryPassword() {
  return randomBytes(15).toString("base64url");
}
```

Fifteen random bytes encode to exactly 20 URL-safe characters.

- [ ] **Step 5: Replace shared-password account creation**

In `createUser`, generate and hash a unique value:

```ts
const temporaryPassword = generateTemporaryPassword();
const passwordHash = await hashPassword(temporaryPassword);
const user = await database.appUser.create({
  data: {
    email,
    fullName: data.fullName.trim(),
    role: data.role,
    phoneWhatsapp: data.phoneWhatsapp,
    passwordHash,
    mustChangePassword: true,
    isActive: true,
    ...(data.role === UserRole.STUDENT ? { learningStatus: "ACTIVE" as const } : {}),
  },
});

return { user, temporaryPassword, mustChangePassword: true as const };
```

Delete the unused `convertEnquiryToStudent` export, its `DEFAULT_PORTAL_PASSWORD` code, and its synthetic call in `app/_audit/repository-usage.ts`; no production route calls this function.

In `prisma/seed.ts`, rename the local-only credential input to:

```ts
const seedPortalPassword = process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const passwordHash = await hashPassword(seedPortalPassword);
```

Remove `DEFAULT_PORTAL_PASSWORD` from `SENSITIVE_AUDIT_VALUES`; password-shaped keys remain redacted by the key matcher.

In `.env.example`, replace `DEFAULT_PORTAL_PASSWORD` with:

```dotenv
SEED_PORTAL_PASSWORD="ChangeMe123!"
BOOTSTRAP_ADMIN_EMAIL=""
BOOTSTRAP_ADMIN_NAME=""
BOOTSTRAP_ADMIN_PASSWORD=""
```

In CI, rename `DEFAULT_PORTAL_PASSWORD` to `SEED_PORTAL_PASSWORD`.

- [ ] **Step 6: Validate and generate Prisma**

```powershell
npx prisma validate
npx prisma generate
```

Expected: both commands exit `0`.

- [ ] **Step 7: Verify temporary credentials GREEN**

```powershell
npx vitest run lib/auth/__tests__/temporary-password.test.ts lib/repositories/__tests__/portal-repository.test.ts lib/repositories/__tests__/admin-audit-repository.test.ts prisma/__tests__/seed.test.ts
```

Expected: all tests pass and no production account creation reads `DEFAULT_PORTAL_PASSWORD`.

- [ ] **Step 8: Commit the credential model**

```powershell
git add -- prisma lib/auth lib/repositories app/_audit .env.example .github/workflows/ci.yml
git commit -m "feat: issue unique temporary credentials"
```

### Task 4: Show Temporary Credentials Once in Admin Forms

**Files:**

- Create: `components/admin/users/TemporaryCredentialsPanel.tsx`
- Create: `components/admin/users/__tests__/TemporaryCredentialsPanel.test.tsx`
- Modify: `components/admin/users/UserCreateForm.tsx`
- Modify: `components/admin/users/__tests__/UserManagement.test.tsx`
- Modify: `app/(admin)/admin/users/actions.ts`
- Modify: `app/(admin)/admin/users/__tests__/actions.test.ts`
- Modify: `app/(admin)/admin/students/actions.ts`
- Modify: `app/(admin)/admin/students/__tests__/actions.test.ts`
- Modify: `components/admin/students/StudentForm.tsx`
- Modify: `components/admin/students/__tests__/StudentForm.test.tsx`
- Modify: `app/(admin)/admin/parents/actions.ts`
- Modify: `app/(admin)/admin/parents/__tests__/actions.test.ts`
- Modify: `components/admin/parents/ParentForm.tsx`
- Modify: `components/admin/parents/__tests__/ParentForm.test.tsx`

**Interfaces:**

- Consumes: `temporaryPassword` from `createUser`.
- Produces: action state `{ success, message, accountEmail, temporaryPassword }` that exists only until navigation or refresh.

- [ ] **Step 1: Add failing action and component tests**

Add assertions that successful create actions return the temporary credential, audit snapshots omit it, and redirect query strings never contain it:

```ts
expect(result).toEqual(
  expect.objectContaining({
    success: true,
    accountEmail: "student@example.com",
    temporaryPassword: "UniqueTemporary123_A",
  }),
);
expect(createAdminAuditLogMock).toHaveBeenCalledWith(
  expect.not.objectContaining({ temporaryPassword: expect.anything() }),
  expect.anything(),
);
```

Add a component test that renders the credential once and clears it after navigation/remount.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npx vitest run components/admin/users/__tests__/UserManagement.test.tsx components/admin/students/__tests__/StudentForm.test.tsx components/admin/parents/__tests__/ParentForm.test.tsx 'app/(admin)/admin/users/__tests__/actions.test.ts' 'app/(admin)/admin/students/__tests__/actions.test.ts' 'app/(admin)/admin/parents/__tests__/actions.test.ts'
```

Expected: actions do not return the generated credential and specialized forms redirect before it can be displayed.

- [ ] **Step 3: Create the one-time credential panel**

Create a client component with this interface:

```ts
type TemporaryCredentialsPanelProps = {
  email: string;
  temporaryPassword: string;
  onDismiss?: () => void;
};
```

Render `email` and `temporaryPassword` in `<code>` elements, use the Lucide `Copy` icon inside a button with `title="Copy temporary password"`, call `navigator.clipboard.writeText(temporaryPassword)`, and state that the password will not be shown after leaving the page. Do not persist it in local storage, session storage, a URL, or a cookie.

- [ ] **Step 4: Return credentials from create actions without auditing them**

For student and parent creation, return the transaction result:

```ts
const created = await prisma.$transaction(async (tx) => {
  const data = await createUser(input, tx);
  await createAdminAuditLog(auditWithoutCredential(data.user), tx);
  return data;
});

return {
  success: true,
  message: "Account created.",
  accountEmail: created.user.email,
  temporaryPassword: created.temporaryPassword,
};
```

Extend `StudentActionState` and `ParentActionState` with optional `accountEmail` and `temporaryPassword`. Generic `createUserAction` already returns repository data; update `UserCreateForm` to read `result.data.temporaryPassword` instead of `defaultPassword`.

- [ ] **Step 5: Keep create credentials out of redirects**

Convert `StudentForm` and `ParentForm` to client components using `useActionState` for create mode. Do not submit `flash`, `successRedirect`, or `errorRedirect` hidden fields in create mode. Render `TemporaryCredentialsPanel` from returned state. Preserve the existing redirect-based action for edit mode.

The create action may still support legacy flash mode, but its success redirect contains only `"Account created"`; it must never encode the temporary password.

- [ ] **Step 6: Verify admin account creation GREEN**

Run the focused command from Step 2.

Expected: all action and form tests pass; credentials appear only in successful create state; audit calls and URLs contain no credential.

- [ ] **Step 7: Commit the admin credential handoff**

```powershell
git add -- components/admin/users components/admin/students components/admin/parents 'app/(admin)/admin/users' 'app/(admin)/admin/students' 'app/(admin)/admin/parents'
git commit -m "feat: show one-time portal credentials"
```

### Task 5: Add the Restricted Initial-Setup Cookie and Login Routing

**Files:**

- Modify: `lib/auth/session.ts`
- Modify: `lib/__tests__/session-expiry.test.ts`
- Modify: `lib/repositories/user-repository.ts`
- Modify: `app/portal/login/actions.ts`
- Modify: `app/portal/login/__tests__/login-2fa-actions.test.ts`
- Modify: `tests/auth/login-actions.test.ts`
- Modify: `middleware.ts`
- Modify: `tests/middleware.test.ts`

**Interfaces:**

- Produces: `createInitialSetupSession`, `getInitialSetupSession`, `clearInitialSetupSession`.
- Setup payload: `{ uid, email, role, nextPath?, exp, purpose: "INITIAL_SETUP" }`.
- Consumed by: Tasks 6 and 7.

- [ ] **Step 1: Add failing setup-cookie and login-routing tests**

Cover these cases:

```ts
it("routes a temporary-password user to password setup without a normal session", async () => {
  findUserByEmailMock.mockResolvedValue(user({ mustChangePassword: true, role: "STUDENT" }));
  await expect(loginAction(initialState, loginForm())).rejects.toThrow(
    "REDIRECT:/portal/setup/password",
  );
  expect(createInitialSetupSessionMock).toHaveBeenCalled();
  expect(createSessionMock).not.toHaveBeenCalled();
});

it("routes a production admin without TOTP to restricted 2FA setup", async () => {
  findUserByEmailMock.mockResolvedValue(
    user({ role: "ADMIN", mustChangePassword: false, twoFactorEnabled: false }),
  );
  await expect(loginAction(initialState, loginForm())).rejects.toThrow(
    "REDIRECT:/portal/setup/2fa",
  );
  expect(createSessionMock).not.toHaveBeenCalled();
});
```

Middleware tests must prove `/portal/setup/password` and `/portal/setup/2fa` can render without a normal `ulu_session`, while `/portal/student`, `/portal/teacher`, `/portal/parent`, and `/admin` remain protected.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npx vitest run lib/__tests__/session-expiry.test.ts app/portal/login/__tests__/login-2fa-actions.test.ts tests/auth/login-actions.test.ts tests/middleware.test.ts
```

Expected: setup helper imports and setup redirects are missing.

- [ ] **Step 3: Add the setup cookie helpers**

In `lib/auth/session.ts`, add:

```ts
const INITIAL_SETUP_COOKIE = "ulu_initial_setup";
const INITIAL_SETUP_DURATION_MS = 1000 * 60 * 15;

export type InitialSetupPayload = {
  uid: string;
  email: string;
  role: UserRole;
  nextPath?: string;
  purpose: "INITIAL_SETUP";
  exp: number;
};
```

Implement create/read/clear using the existing signed payload functions:

```ts
export async function createInitialSetupSession(
  input: Omit<InitialSetupPayload, "purpose" | "exp">,
) {
  const payload: InitialSetupPayload = {
    ...input,
    purpose: "INITIAL_SETUP",
    exp: Date.now() + INITIAL_SETUP_DURATION_MS,
  };
  const cookieStore = await cookies();
  cookieStore.set(INITIAL_SETUP_COOKIE, await encodeSignedPayload(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.NODE_ENV ?? "development") === "production",
    path: "/",
    maxAge: INITIAL_SETUP_DURATION_MS / 1000,
  });
}
```

`getInitialSetupSession` verifies signature, purpose, expiry, and the current active user's ID/role before returning. `clearInitialSetupSession` deletes the cookie. Raise the production `AUTH_SESSION_SECRET` minimum from 16 to 32 characters.

- [ ] **Step 4: Expose setup state from the user repository**

Add `mustChangePassword` to `findUserById` and add:

```ts
export async function findUserForInitialSetup(userId: string) {
  return prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      passwordHash: true,
      mustChangePassword: true,
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorBackupCodes: true,
    },
  });
}
```

- [ ] **Step 5: Route initial setup before normal session creation**

In `loginAction`, after successful password verification and audit logging, add:

```ts
const require2FA = (process.env.ADMIN_REQUIRE_2FA ?? "true") !== "false";
const adminNeedsEnrollment =
  user.role === UserRole.ADMIN && require2FA && !user.twoFactorEnabled;

if (user.mustChangePassword || adminNeedsEnrollment) {
  await createInitialSetupSession({
    uid: user.id,
    email: user.email,
    role: user.role,
    ...(nextPath ? { nextPath } : {}),
  });
  redirect(user.mustChangePassword ? "/portal/setup/password" : "/portal/setup/2fa");
}
```

Remove the development-only full admin session bypass. Existing admins with configured TOTP continue to the pending 2FA cookie and `/portal/login/verify-2fa`.

- [ ] **Step 6: Allow setup pages through middleware but not protected areas**

Add `isPortalSetupPath = matchesPrefix(pathname, "/portal/setup")` and exclude it from `isProtectedPath` exactly as the login path is excluded. Do not add setup routes to `PUBLIC_ROUTES`; the page/actions enforce the signed setup cookie.

- [ ] **Step 7: Verify setup routing GREEN**

Run the focused command from Step 2.

Expected: setup cookie, temporary password redirect, production admin enrollment redirect, configured admin 2FA, normal portal login, expiry, and middleware route tests all pass.

- [ ] **Step 8: Commit restricted setup routing**

```powershell
git add -- lib/auth/session.ts lib/__tests__/session-expiry.test.ts lib/repositories/user-repository.ts app/portal/login tests/auth middleware.ts tests/middleware.test.ts
git commit -m "feat: add restricted initial setup session"
```

### Task 6: Implement Forced Initial Password Change

**Files:**

- Create: `lib/validations/initial-password.ts`
- Create: `lib/repositories/account-setup-repository.ts`
- Create: `lib/repositories/__tests__/account-setup-repository.test.ts`
- Create: `app/portal/setup/password/actions.ts`
- Create: `app/portal/setup/password/page.tsx`
- Create: `app/portal/setup/password/__tests__/actions.test.ts`
- Create: `app/portal/setup/password/__tests__/page.test.tsx`
- Create: `components/auth/InitialPasswordForm.tsx`
- Create: `components/auth/__tests__/InitialPasswordForm.test.tsx`

**Interfaces:**

- Produces: `changeInitialPassword(userId, currentPassword, newPassword)` returning safe user setup state.
- Consumes: restricted setup payload from Task 5.

- [ ] **Step 1: Write repository and action tests first**

Test missing/expired setup cookie, cookie/user mismatch, wrong current password, short password, mismatched confirmation, password reuse, successful update, no success audit on failure, non-admin session creation, admin configured-TOTP handoff, and admin unconfigured-TOTP handoff.

The repository success assertion is:

```ts
expect(appUserUpdateMock).toHaveBeenCalledWith({
  where: { id: "student-1" },
  data: {
    passwordHash: "new-hash",
    mustChangePassword: false,
  },
});
expect(createAdminAuditLogMock).toHaveBeenCalledWith(
  expect.objectContaining({
    adminUserId: "student-1",
    action: "INITIAL_PASSWORD_CHANGED",
    before: { mustChangePassword: true },
    after: { mustChangePassword: false },
  }),
  expect.anything(),
);
```

- [ ] **Step 2: Run the new tests and verify RED**

```powershell
npx vitest run lib/repositories/__tests__/account-setup-repository.test.ts app/portal/setup/password/__tests__/actions.test.ts app/portal/setup/password/__tests__/page.test.tsx components/auth/__tests__/InitialPasswordForm.test.tsx
```

Expected: modules do not exist.

- [ ] **Step 3: Add the password setup schema**

Create `lib/validations/initial-password.ts`:

```ts
import { z } from "zod";

export const initialPasswordSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(12, "Use at least 12 characters."),
    confirmPassword: z.string().min(12),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
```

- [ ] **Step 4: Implement the focused repository mutation**

`changeInitialPassword` loads `findUserForInitialSetup`, requires `isActive` and `mustChangePassword`, verifies the current password, rejects reuse by verifying the new value against the old hash, hashes the new password, then updates and audits in one Prisma transaction. Return only `{ id, email, fullName, role, twoFactorEnabled }`.

- [ ] **Step 5: Implement the server action orchestration**

The action validates form data, reads `getInitialSetupSession`, calls the repository with `setup.uid`, and then:

```ts
if (user.role !== UserRole.ADMIN) {
  await clearInitialSetupSession();
  await createSession({
    uid: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    mfaVerified: true,
    authMethod: "password",
  });
  redirect(getPortalRedirectPath(user.role, setup.nextPath));
}

if (user.twoFactorEnabled) {
  await clearInitialSetupSession();
  await createAdminPendingTwoFactor({ uid: user.id, email: user.email });
  redirect("/portal/login/verify-2fa");
}

redirect("/portal/setup/2fa");
```

Failed validation or mutation returns a bounded form state and leaves the setup cookie available until its normal expiry.

- [ ] **Step 6: Build the password setup page and form**

The page is `noindex`, calls `getInitialSetupSession`, redirects to `/portal/login` when absent, redirects to `/portal/setup/2fa` when the admin no longer needs a password change but still needs TOTP, and otherwise renders `InitialPasswordForm` with current/new/confirm password inputs and accessible error output.

- [ ] **Step 7: Verify forced password setup GREEN**

Run the command from Step 2.

Expected: all repository, action, page, and component cases pass.

- [ ] **Step 8: Commit forced password setup**

```powershell
git add -- lib/validations/initial-password.ts lib/repositories/account-setup-repository.ts lib/repositories/__tests__/account-setup-repository.test.ts app/portal/setup/password components/auth/InitialPasswordForm.tsx components/auth/__tests__/InitialPasswordForm.test.tsx
git commit -m "feat: require initial password change"
```

### Task 7: Implement Restricted Administrator 2FA Enrollment

**Files:**

- Create: `app/portal/setup/2fa/actions.ts`
- Create: `app/portal/setup/2fa/page.tsx`
- Create: `app/portal/setup/2fa/__tests__/actions.test.ts`
- Create: `app/portal/setup/2fa/__tests__/page.test.tsx`
- Create: `components/auth/InitialTwoFactorForm.tsx`
- Create: `components/auth/__tests__/InitialTwoFactorForm.test.tsx`

**Interfaces:**

- Consumes: `getInitialSetupSession`, existing TOTP helpers, and user repository 2FA methods.
- Produces: a normal `mfaVerified=true` admin session only after a valid setup code.

- [ ] **Step 1: Write the 2FA enrollment tests**

Cover non-admin setup cookie rejection, missing/expired cookie, already-enabled admin, secret generation, invalid 6-digit code, invalid TOTP, successful enable, one-time backup-code display, audit redaction, cookie clearing, and normal session creation only after success.

Assert that no secret or backup code is present in the audit call:

```ts
expect(createAdminAuditLogMock).toHaveBeenCalledWith(
  expect.objectContaining({
    action: "ADMIN_2FA_ENABLED",
    before: { twoFactorEnabled: false },
    after: { twoFactorEnabled: true },
    meta: { actorRole: "ADMIN", setupFlow: "INITIAL_SETUP" },
  }),
);
```

- [ ] **Step 2: Run the new tests and verify RED**

```powershell
npx vitest run app/portal/setup/2fa/__tests__/actions.test.ts app/portal/setup/2fa/__tests__/page.test.tsx components/auth/__tests__/InitialTwoFactorForm.test.tsx
```

Expected: modules do not exist.

- [ ] **Step 3: Implement begin and confirm actions**

`beginInitialTwoFactorSetupAction` requires an `ADMIN` setup payload, loads the same active admin, rejects an already-enabled account, generates and saves a secret, and returns `{ setupSecret, otpAuthUrl }`.

`confirmInitialTwoFactorSetupAction` validates `/^\d{6}$/`, verifies the saved secret, generates and hashes eight backup codes, enables 2FA, writes the sanitized audit event, clears the setup cookie, and creates:

```ts
await createSession({
  uid: admin.id,
  role: UserRole.ADMIN,
  email: admin.email,
  fullName: admin.fullName,
  mfaVerified: true,
  authMethod: "password",
});
```

Return `{ success: true, backupCodes: backupCodes.plain, continueHref: getPortalRedirectPath(UserRole.ADMIN, setup.nextPath) }` without redirecting so backup codes remain visible once.

- [ ] **Step 4: Implement the page and one-time backup-code UI**

The page is `noindex`; absent setup cookie redirects to `/portal/login`, a non-admin payload redirects to `/portal/unauthorized`, and an admin with `mustChangePassword=true` redirects to `/portal/setup/password`.

The client form follows the existing `TwoFactorSettings` interaction but uses the restricted actions. After confirmation, show backup codes and a `Continue to admin` link. Do not provide a disable button in this setup flow.

- [ ] **Step 5: Verify admin enrollment GREEN**

Run the command from Step 2 plus existing admin 2FA tests:

```powershell
npx vitest run app/portal/setup/2fa app/portal/login/verify-2fa 'app/(admin)/admin/security/__tests__' components/auth/__tests__/InitialTwoFactorForm.test.tsx
```

Expected: initial enrollment and subsequent normal 2FA verification both pass.

- [ ] **Step 6: Commit initial 2FA enrollment**

```powershell
git add -- app/portal/setup/2fa components/auth/InitialTwoFactorForm.tsx components/auth/__tests__/InitialTwoFactorForm.test.tsx
git commit -m "feat: enroll initial admin 2FA"
```

### Task 8: Add Idempotent Production Admin Bootstrap

**Files:**

- Create: `lib/bootstrap/production-admin.ts`
- Create: `lib/bootstrap/__tests__/production-admin.test.ts`
- Create: `prisma/bootstrap-production.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**

- Produces: `bootstrapProductionAdmin(env, database)` with status `created | existing`.
- Render consumes: `npm run bootstrap:production` after migrations.

- [ ] **Step 1: Write bootstrap tests**

Test these exact states:

```ts
it("succeeds without bootstrap variables when an active admin exists");
it("fails when no active admin and variables are missing");
it("fails for a password shorter than 12 characters");
it("creates one admin with mustChangePassword true");
it("does not reset an existing admin password or 2FA");
it("fails when the configured email belongs to a non-admin user");
it("never includes the password or hash in its result or log message");
```

- [ ] **Step 2: Run the bootstrap tests and verify RED**

```powershell
npx vitest run lib/bootstrap/__tests__/production-admin.test.ts
```

Expected: module does not exist.

- [ ] **Step 3: Implement the bootstrap service**

Use a Zod schema for `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a minimum-12-character `BOOTSTRAP_ADMIN_PASSWORD`. First count active admins. If one exists and all three variables are empty, return `{ status: "existing" }`. If no active admin exists, require all fields.

For a new admin:

```ts
const passwordHash = await hashPassword(parsed.BOOTSTRAP_ADMIN_PASSWORD);
const user = await database.appUser.create({
  data: {
    email: parsed.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
    fullName: parsed.BOOTSTRAP_ADMIN_NAME.trim(),
    role: UserRole.ADMIN,
    passwordHash,
    mustChangePassword: true,
    isActive: true,
  },
  select: { id: true, email: true },
});
return { status: "created" as const, user };
```

When the configured email exists, verify role `ADMIN` and return `existing` without an update. Never return or log parsed password or hash.

- [ ] **Step 4: Add the CLI entry point and package script**

`prisma/bootstrap-production.ts` calls the service with `process.env` and `prisma`, logs only `Production admin created.` or `Production admin already exists.`, disconnects Prisma in `finally`, and sets `process.exitCode=1` on error.

Add to `package.json`:

```json
"bootstrap:production": "tsx prisma/bootstrap-production.ts"
```

- [ ] **Step 5: Verify bootstrap GREEN**

```powershell
npx vitest run lib/bootstrap/__tests__/production-admin.test.ts
npx prisma validate
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit production bootstrap**

```powershell
git add -- lib/bootstrap prisma/bootstrap-production.ts package.json package-lock.json .env.example
git commit -m "feat: add production admin bootstrap"
```

### Task 9: Run the Authentication Security Gate

**Files:**

- Verify all files changed by Tasks 1-8.

**Interfaces:**

- Produces: a green authentication/account milestone consumed by private storage and deployment plans.

- [ ] **Step 1: Search for removed unsafe behavior**

```powershell
rg -n "DEFAULT_PORTAL_PASSWORD|x-role|ChangeMe123!" app components lib prisma .env.example
```

Expected: no production `DEFAULT_PORTAL_PASSWORD` or `x-role`; `ChangeMe123!` may appear only in local seed/test fixtures.

- [ ] **Step 2: Run the focused security suite**

```powershell
npx vitest run app/api/upload app/portal/login app/portal/setup 'app/(admin)/admin/users' 'app/(admin)/admin/students' 'app/(admin)/admin/parents' components/auth components/admin/users components/admin/students components/admin/parents lib/auth lib/bootstrap lib/repositories/__tests__/account-setup-repository.test.ts tests/auth tests/middleware.test.ts
```

Expected: all selected files pass. Confirm the printed file list before trusting the result.

- [ ] **Step 3: Run broad verification**

```powershell
npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 4: Commit only if broad verification required a correction**

```powershell
git add -- app components lib prisma middleware.ts tests package.json package-lock.json .env.example .github/workflows/ci.yml
git commit -m "test: complete account security gate"
```

Skip this commit when no correction was needed.

## Plan Acceptance

This plan is complete when upload authorization ignores forged role headers, every new account has a unique one-time credential, first login forces password rotation, a production bootstrap admin can enroll TOTP without normal admin access, subsequent admin logins still require TOTP, and all sensitive values remain absent from URLs, logs, and audit metadata.
