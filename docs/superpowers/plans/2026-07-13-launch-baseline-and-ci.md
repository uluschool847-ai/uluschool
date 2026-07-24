# Launch Baseline and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a clean, reproducible Node.js 22 baseline in which Nairobi behavior, formatting, tests, and GitHub CI are green before security or deployment behavior changes.

**Architecture:** This plan changes no production business behavior except correcting stale test expectations. It first makes the current failures explicit, then normalizes repository tooling and line endings, and finally adds a PostgreSQL-backed GitHub Actions verification gate.

**Tech Stack:** Next.js 15, TypeScript 5.7, Vitest 4, Biome 1.9, Prisma 5, PostgreSQL 16, GitHub Actions, Node.js 22.

## Global Constraints

- Active schedule and availability expectations use `Africa/Nairobi`.
- Historical migration SQL remains unchanged even when it contains an old timezone value.
- Node.js major version is `22` in local version metadata, `package.json`, and CI.
- CI uses disposable test credentials and never reads Render production secrets.
- Generated `tsconfig.tsbuildinfo` is ignored and is not tracked after this plan.
- Every task ends with its focused verification before commit.

---

## File Map

- Modify the twelve currently failing route-local test files listed in Task 1.
- Create `.gitattributes` to enforce LF text files.
- Create `.nvmrc` to pin Node.js 22.
- Modify `package.json` to declare the Node.js engine.
- Stop tracking `tsconfig.tsbuildinfo`; `.gitignore` already contains `*.tsbuildinfo`.
- Format the 82 files currently reported by Biome.
- Create `.github/workflows/ci.yml` for the repository verification gate.
- Create `app/__tests__/ci-config.audit.test.ts` to prevent accidental weakening of CI.

### Task 1: Repair the Known Nairobi Regression Tests

**Files:**

- Modify: `app/portal/student/schedule/[lessonId]/__tests__/page.test.tsx`
- Modify: `app/portal/teacher/schedule/__tests__/page.test.tsx`
- Modify: `app/portal/teacher/availability/__tests__/page.test.tsx`
- Modify: `app/portal/teacher/schedule/__tests__/lesson-status.test.tsx`
- Modify: `app/portal/teacher/lessons/[lessonId]/__tests__/page.test.tsx`
- Modify: `app/(admin)/admin/teachers/[id]/availability/__tests__/page.test.tsx`
- Modify: `app/portal/teacher/__tests__/page.test.tsx`
- Modify: `app/portal/student/schedule/__tests__/lesson-status.test.tsx`
- Modify: `app/portal/parent/schedule/__tests__/page.test.tsx`
- Modify: `app/portal/parent/schedule/[studentId]/[lessonId]/__tests__/page.test.tsx`
- Modify: `app/portal/teacher/__tests__/FormattingConsistency.test.tsx`
- Modify: `app/portal/student/schedule/__tests__/page.test.tsx`

**Interfaces:**

- Consumes: current rendered timezone labels from schedule and availability pages.
- Produces: tests that assert `Africa/Nairobi` and one corrected array-length assertion.

- [ ] **Step 1: Reproduce the exact current failures**

Run in PowerShell:

```powershell
$tests = @(
  'app/portal/student/schedule/[lessonId]/__tests__/page.test.tsx',
  'app/portal/teacher/schedule/__tests__/page.test.tsx',
  'app/portal/teacher/availability/__tests__/page.test.tsx',
  'app/portal/teacher/schedule/__tests__/lesson-status.test.tsx',
  'app/portal/teacher/lessons/[lessonId]/__tests__/page.test.tsx',
  'app/(admin)/admin/teachers/[id]/availability/__tests__/page.test.tsx',
  'app/portal/teacher/__tests__/page.test.tsx',
  'app/portal/student/schedule/__tests__/lesson-status.test.tsx',
  'app/portal/parent/schedule/__tests__/page.test.tsx',
  'app/portal/parent/schedule/[studentId]/[lessonId]/__tests__/page.test.tsx',
  'app/portal/teacher/__tests__/FormattingConsistency.test.tsx',
  'app/portal/student/schedule/__tests__/page.test.tsx'
)
npx vitest run $tests
```

Expected: `12 failed` files and `15 failed` tests. Fourteen failures look for `Europe/Kiev`; the remaining failure calls `toBeGreaterThan` directly on the array returned by `getAllByRole`.

- [ ] **Step 2: Replace only active timezone expectations**

Replace test regexes such as:

```ts
expect(screen.getByText(/europe\/kiev/i)).toBeDefined();
expect(screen.getAllByText(/europe\/kiev/i).length).toBeGreaterThan(0);
expect(text).toMatch(/Europe\/Kiev/);
```

with:

```ts
expect(screen.getByText(/africa\/nairobi/i)).toBeDefined();
expect(screen.getAllByText(/africa\/nairobi/i).length).toBeGreaterThan(0);
expect(text).toMatch(/Africa\/Nairobi/);
```

Also replace the invalid admin availability assertion:

```ts
expect(screen.getAllByRole("button", { name: /edit unavailable period|edit period/i })).toBeGreaterThan(0);
```

with:

```ts
expect(
  screen.getAllByRole("button", { name: /edit unavailable period|edit period/i }).length,
).toBeGreaterThan(0);
```

Do not rename historical test fixture variables such as `mondayKievRule` unless Biome requires formatting; those names do not define active runtime behavior.

- [ ] **Step 3: Verify the repaired regression slice**

Run the same `$tests` command from Step 1.

Expected: all 12 files pass and all 15 previously failing tests are green.

- [ ] **Step 4: Confirm there are no stale active timezone assertions**

Run:

```powershell
rg -n "Europe|Kiev|europe|kiev" app components lib tests -g '*.ts' -g '*.tsx'
```

Expected: only intentionally historical fixture variable names remain; no rendered-label assertion expects Europe/Kiev.

- [ ] **Step 5: Commit the regression-test repair**

```powershell
git add -- app/portal app/'(admin)'/admin/teachers/'[id]'/availability/__tests__/page.test.tsx
git commit -m "test: align portal schedules with Nairobi"
```

### Task 2: Normalize Formatting, Line Endings, and Node Version

**Files:**

- Create: `.gitattributes`
- Create: `.nvmrc`
- Modify: `package.json`
- Remove from Git index: `tsconfig.tsbuildinfo`
- Modify: the exact 82 source/test files emitted by `npx biome check . --reporter=summary`

**Interfaces:**

- Consumes: repository Biome configuration and npm lockfile.
- Produces: deterministic LF formatting and a single Node.js major version for local, CI, and Render configuration.

- [ ] **Step 1: Capture the current formatting failure**

Run:

```powershell
npx biome check . --reporter=summary
```

Expected: `Checked 751 files`, `Found 82 errors`, and every error is a formatting error.

- [ ] **Step 2: Add deterministic line-ending and Node metadata**

Create `.gitattributes`:

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.ico binary
*.pdf binary
```

Create `.nvmrc`:

```text
22
```

Add this top-level field to `package.json` immediately after `private`:

```json
"engines": {
  "node": ">=22 <23"
},
```

- [ ] **Step 3: Stop tracking the generated TypeScript build cache**

Run:

```powershell
git rm --cached -- tsconfig.tsbuildinfo
```

Expected: the working file remains available locally, but Git stages its removal. Do not add a second ignore rule because `.gitignore` already contains `*.tsbuildinfo`.

- [ ] **Step 4: Apply the repository formatter once**

Run:

```powershell
npx biome check --write .
```

Expected: exactly the previously reported formatting drift is rewritten; no business logic changes are introduced by hand in this step.

- [ ] **Step 5: Verify formatting and types**

Run:

```powershell
npm run lint
npm run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 6: Review the mechanical diff**

Run:

```powershell
git diff --check
git diff --stat
git diff --word-diff=porcelain -- package.json .gitattributes .nvmrc
```

Expected: no whitespace errors; non-tooling source changes are formatting-only.

- [ ] **Step 7: Commit tooling normalization**

```powershell
git add -- .gitattributes .nvmrc package.json package-lock.json app components e2e lib
git add -u -- tsconfig.tsbuildinfo
git commit -m "chore: normalize Node and repository formatting"
```

### Task 3: Add a PostgreSQL-Backed GitHub CI Gate

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `app/__tests__/ci-config.audit.test.ts`

**Interfaces:**

- Consumes: `.nvmrc`, `package-lock.json`, Prisma migrations, and local seed fixtures.
- Produces: a `verify` GitHub check required before staging or production promotion.

- [ ] **Step 1: Write the failing CI contract test**

Create `app/__tests__/ci-config.audit.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("GitHub CI production-readiness contract", () => {
  it("pins Node 22 and runs every required verification command", () => {
    const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();

    expect(nvmrc).toBe("22");
    expect(workflow).toContain("node-version-file: .nvmrc");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npx prisma migrate deploy");
    expect(workflow).toContain("npm run db:seed");
    expect(workflow).toContain("npx prisma validate");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run test");
    expect(workflow).toContain("npm run build");
  });

  it("provides a disposable PostgreSQL service", () => {
    const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

    expect(workflow).toContain("image: postgres:16");
    expect(workflow).toContain("ulu_school_test");
    expect(workflow).not.toContain("onrender.com");
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npx vitest run app/__tests__/ci-config.audit.test.ts
```

Expected: failure because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main
      - staging

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ulu_school_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d ulu_school_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ulu_school_test?schema=public
      DIRECT_URL: postgresql://postgres:postgres@localhost:5432/ulu_school_test?schema=public
      AUTH_SESSION_SECRET: ci-only-session-secret-with-at-least-32-characters
      DEFAULT_PORTAL_PASSWORD: CiOnlyPortalPassword123!
      ADMIN_REQUIRE_2FA: "true"
      GOOGLE_TIMEZONE: Africa/Nairobi
      TURNSTILE_ENFORCE: "false"
      CRON_SECRET: ci-only-cron-secret
      REMINDER_CRON_TOKEN: ci-only-reminder-secret
      ALERT_TEST_TOKEN: ci-only-alert-secret
      NEXT_PUBLIC_SITE_URL: http://localhost:3000
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      NODE_OPTIONS: --max-old-space-size=4096
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Generate Prisma client
        run: npx prisma generate
      - name: Validate Prisma schema
        run: npx prisma validate
      - name: Apply test database migrations
        run: npx prisma migrate deploy
      - name: Seed deterministic test fixtures
        run: npm run db:seed
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm run test
      - name: Build
        run: npm run build
```

- [ ] **Step 4: Run the CI contract test and verify GREEN**

Run:

```powershell
npx vitest run app/__tests__/ci-config.audit.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the complete local baseline gate**

Run in order:

```powershell
npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: every command exits `0`; Vitest reports `321 passed` test files and `2299` tests after adding the CI contract file.

- [ ] **Step 6: Commit the CI gate**

```powershell
git add -- .github/workflows/ci.yml app/__tests__/ci-config.audit.test.ts
git commit -m "ci: verify launch baseline"
```

## Plan Acceptance

This plan is complete when a clean Node.js 22 install passes Prisma validation, Biome, TypeScript, all Vitest files, and the Next.js build, and the same sequence is represented by the GitHub `CI / verify` check.
