# Admin And Teacher Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all existing teacher onboarding and teacher workspace routes reachable through visible buttons.

**Architecture:** Extend the existing admin dashboard action area with a separate school setup card, safely pass an optional initial role into the existing user creation form, and extend the existing teacher quick navigation. Keep authorization and data ownership in the existing server layouts and repositories.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Prisma `UserRole`, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Reuse existing `Button`, `Card`, and `Link` components.
- Do not add routes, roles, database fields, or mutations.
- Parse `createRole` through `UserRole`; invalid values default to `STUDENT`.
- Preserve all existing server-side role and ownership checks.
- Keep CRM status filters separate from school setup actions.

---

### Task 1: Admin School Setup Navigation

**Files:**
- Modify: `app/(admin)/admin/page.tsx`
- Test: `app/(admin)/admin/__tests__/DashboardAccessibility.test.tsx`

**Interfaces:**
- Consumes: existing `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, and `Link`.
- Produces: visible links to `/admin/users`, `/admin/users?createRole=TEACHER`, `/admin/teachers`, `/admin/classes/new`, `/admin/students`, and `/admin/subjects`.

- [ ] **Step 1: Write the failing navigation test**

Add a test that renders `AdminDashboardPage`, finds the `School Setup` region, and asserts the six link names and exact `href` values.

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npx vitest run "app/(admin)/admin/__tests__/DashboardAccessibility.test.tsx"
```

Expected: FAIL because `School Setup`, `User Accounts`, and `Create Teacher Account` are absent.

- [ ] **Step 3: Implement the school setup card**

Add a labeled card below the existing admin actions card. Render the six links using the existing responsive `flex flex-wrap gap-2` and `Button asChild` pattern.

- [ ] **Step 4: Verify the admin dashboard test passes**

Run the same Vitest command and expect PASS.

### Task 2: Preselect Teacher Role

**Files:**
- Modify: `app/(admin)/admin/users/page.tsx`
- Test: `app/(admin)/admin/__tests__/UsersView.test.tsx`

**Interfaces:**
- Consumes: `searchParams.createRole?: string`, Prisma `UserRole`, and `UserCreateForm({ defaultRole })`.
- Produces: `TEACHER` as the initial role only when `createRole=TEACHER`; otherwise a valid requested role or `STUDENT` fallback.

- [ ] **Step 1: Write failing role-selection tests**

Render the users page with `createRole=TEACHER` and assert the `Create User` role select has value `TEACHER`. Render it with `createRole=INVALID` and assert `STUDENT`.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
npx vitest run "app/(admin)/admin/__tests__/UsersView.test.tsx"
```

Expected: the teacher case fails because `UserCreateForm` still defaults to `STUDENT`.

- [ ] **Step 3: Implement safe `createRole` parsing**

Extend the page search-parameter type with `createRole`, reuse enum membership validation, and pass the parsed value as `defaultRole` to `UserCreateForm`.

- [ ] **Step 4: Verify user page tests pass**

Run the same Vitest command and expect PASS.

### Task 3: Complete Teacher Quick Navigation

**Files:**
- Modify: `app/portal/teacher/page.tsx`
- Test: `app/portal/teacher/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: existing teacher routes and quick-navigation `Button` pattern.
- Produces: visible links for Classes, Students, Gradebook, Reports, and Activity in addition to the existing seven teacher destinations.

- [ ] **Step 1: Write the failing teacher navigation test**

Render `TeacherPortalPage` and assert all twelve quick-navigation labels have their exact teacher route destinations.

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npx vitest run "app/portal/teacher/__tests__/page.test.tsx"
```

Expected: FAIL for Classes, Students, Gradebook, Reports, and Activity.

- [ ] **Step 3: Add the missing links**

Add the five links to the existing `Quick Navigation` card using `Button asChild variant="secondary" size="sm"`.

- [ ] **Step 4: Verify teacher dashboard tests pass**

Run the same Vitest command and expect PASS.

### Task 4: Regression And Browser Verification

**Files:**
- Verify only; no planned production edits.

**Interfaces:**
- Consumes: completed navigation behavior from Tasks 1-3.
- Produces: fresh test, type, lint, and browser evidence.

- [ ] **Step 1: Run focused regression tests**

```powershell
npx vitest run "app/(admin)/admin/__tests__/DashboardAccessibility.test.tsx" "app/(admin)/admin/__tests__/UsersView.test.tsx" "app/portal/teacher/__tests__/page.test.tsx"
```

- [ ] **Step 2: Run static verification**

```powershell
npm run typecheck
npm run lint
```

- [ ] **Step 3: Verify in a real browser**

Open the admin dashboard and teacher dashboard at desktop and mobile widths. Confirm every new button is visible, wraps without overlap, and navigates to the expected page. Confirm `/admin/users?createRole=TEACHER` opens with `TEACHER` selected.

- [ ] **Step 4: Review the final diff**

Run `git diff --check` and inspect only the intended navigation, user page, tests, and plan files.
