# Top-Tier Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deployment, tests, public content, and responsive admin tables release-ready.

**Architecture:** Keep changes inside existing configuration, repository, route, and page
boundaries. Database safety is enforced before Playwright starts, deployment uses existing Prisma
migrations, and UI fixes preserve current workflows.

**Tech Stack:** Next.js 15, React 18, TypeScript, Prisma/PostgreSQL, Vitest, Playwright, Tailwind.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-29-top-tier-readiness.md`.
- Do not mutate the currently configured remote development database.
- Do not increase test timeouts or add retries.
- Do not change authorization, audit, ownership, or revalidation semantics.
- Add tests before or with each behavior change.

---

### Task 1: Deterministic Vitest

**Files:**
- Modify: `app/portal/student/__tests__/page.test.tsx`
- Modify: `scripts/__tests__/playwright-test-contract.test.ts`

- [ ] Replace per-test student page imports with one import after hoisted mocks.
- [ ] Run the student page test five times and confirm each run is green.
- [ ] Split partition config assertions into one bounded subprocess case per partition.
- [ ] Run the Playwright contract test five times and confirm each run is green.
- [ ] Confirm timeout constants and Vitest retry behavior are unchanged.

### Task 2: Public Content Hygiene

**Files:**
- Modify: `lib/content.ts`
- Modify: `lib/config/production-env.ts`
- Modify: `components/sections/testimonials-section.tsx`
- Modify: `components/layout/site-footer.tsx`
- Modify: `app/contact/page.tsx`
- Modify: `app/results/page.tsx`
- Modify: related existing tests and environment documentation

- [ ] Add failing tests for empty testimonials and missing/placeholder contacts.
- [ ] Make contact fallbacks nullable and render only configured rows.
- [ ] Require production email and validate optional phone/WhatsApp values.
- [ ] Return no section/grid when testimonials are empty.
- [ ] Run the focused content, environment, footer, contact, and results tests.

### Task 3: Responsive Admin Tables

**Files:**
- Modify: four table pages listed in the specification
- Create: `e2e/portals/admin-responsive.spec.ts`

- [ ] Add component/source assertions for explicit table minimum widths.
- [ ] Add content-appropriate `min-w-*` and selective no-wrap classes.
- [ ] Add fixture-backed mobile and desktop overflow assertions.
- [ ] Run focused page tests and the responsive Playwright spec.

### Task 4: Migration-First Readiness

**Files:**
- Modify: `package.json`, `prisma/verify-db.ts`, `app/api/health/route.ts`
- Modify: CI, env example, setup/deployment docs, and contract tests
- Create: `app/api/health/__tests__/route.test.ts` when no equivalent test exists

- [ ] Add failing tests for the health schema sentinel and migration-first contracts.
- [ ] Remove canonical `db push` setup paths.
- [ ] Add schema-sensitive verification without running Prisma CLI in the health route.
- [ ] Align CI and Render order with the specification.
- [ ] Run Prisma validation and focused deployment/config tests.

### Task 5: Safe E2E Database

**Files:**
- Create: `e2e/support/e2e-database.ts`
- Modify: `scripts/playwright-test.mjs`, `playwright.config.ts`
- Modify: runner tests, CI, env example, and local setup documentation

- [ ] Add failing URL-policy tests for missing, remote, non-test, and credential-bearing inputs.
- [ ] Implement redacted pre-server validation for both E2E database URLs.
- [ ] Override runtime and direct URLs for all E2E child processes.
- [ ] Wire the existing CI PostgreSQL service as the disposable E2E database.
- [ ] Verify unsafe targets fail before any server or mutation.

### Task 6: Release Verification

- [ ] Run all focused tests changed by Tasks 1-5.
- [ ] Run `npm run lint` and `npm run typecheck`.
- [ ] Run `npm run test` twice consecutively.
- [ ] Run `npm run build`.
- [ ] On a disposable local PostgreSQL, run generate, migrate deploy, migrate status, seed, and
      db:verify.
- [ ] Run relevant focused E2E, then `npm run test:e2e:release`.
- [ ] Verify public and admin pages at 390x844 and 1440x900 with screenshots and measurements.
- [ ] Review the complete diff against the specification before reporting completion.
