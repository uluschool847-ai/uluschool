# Top-Tier Readiness Specification

**Date:** 2026-07-29

## Goal

Make the current product release-ready through migration-first database setup, safe E2E
isolation, deterministic tests, public content hygiene, and responsive admin tables.

Completion requires:

- two consecutive full Vitest runs with zero failures;
- a production build with zero errors;
- a clean PostgreSQL migration proof using `prisma migrate deploy`;
- E2E execution that cannot mutate the configured development or a remote database;
- no empty testimonial section or placeholder public contacts;
- readable, locally scrollable admin tables at 390x844 and 1440x900.

## Non-goals

- Admin shell or navigation redesign.
- Broad repository/action refactors.
- Payment or meeting-provider implementation.
- Visual-system redesign or business workflow changes.
- Editing, deleting, squashing, or reordering existing migrations.
- `prisma db push` in documented or scripted setup paths.
- Automatic cleanup of arbitrary records in a shared database.

## Global Constraints

- Preserve authentication, ownership, audit, and revalidation behavior.
- Never print database credentials, query strings, tokens, or secrets.
- Never increase Vitest, subprocess, Playwright, or assertion timeouts to make tests pass.
- Never reset a remote database.
- An E2E reset is allowed only when both URLs use a loopback host, the database name ends
  in `_test` or `_e2e`, and the caller explicitly opts in.
- `E2E_DATABASE_URL` and `E2E_DIRECT_URL` must override runtime `DATABASE_URL` and
  `DIRECT_URL` before Playwright starts its web server.
- Missing local phone/WhatsApp values are hidden. Production email is required; optional
  phone/WhatsApp values must be valid and non-placeholder when present.
- UI scope is limited to conditional public rendering and responsive table behavior.
- Browser base URLs remain on `localhost`.

## Slice 1: Migration-First Database Readiness

**Affected files**

- `package.json`
- `prisma/verify-db.ts`
- `app/api/health/route.ts`
- `app/api/health/__tests__/route.test.ts`
- `.github/workflows/ci.yml`
- `.env.example`
- `README.md`
- `docs/local-setup.md`
- `docs/deployment/render-production.md`
- `app/__tests__/ci-config.audit.test.ts`
- `app/__tests__/env-dependencies.audit.test.ts`
- `app/__tests__/deployment-docs.audit.test.ts`

**Requirements**

- Replace every canonical `db push` setup path with migration-based setup.
- Keep `prisma migrate status` in CI/pre-deploy, not inside the HTTP health route.
- Extend `db:verify` with schema-sensitive queries that touch recently migrated fields.
- Add one cheap health schema sentinel, such as selecting `Enquiry.consentVersion` with
  `take: 1`; return a generic failure without Prisma details.
- Keep Render order accurate: build, env-check, migrate deploy, bootstrap, db:verify, start.

**Acceptance**

- A clean disposable PostgreSQL reaches current schema through `prisma migrate deploy`.
- `prisma migrate status` reports that the schema is current.
- `db:verify`, `/api/health`, `/admin`, and `/admin/submissions` work on that database.
- Missing `DIRECT_URL` stops migration/start with a redacted error.
- No scripted or canonical documented setup uses `prisma db push`.

## Slice 2: Safe E2E Database

**Affected files**

- `scripts/playwright-test.mjs`
- `playwright.config.ts`
- `scripts/__tests__/playwright-test-contract.test.ts`
- `e2e/support/e2e-database.ts`
- `.github/workflows/ci.yml`
- `.env.example`
- `README.md`
- `docs/local-setup.md`
- related CI/deployment contract tests

**Requirements**

- Require both `E2E_DATABASE_URL` and `E2E_DIRECT_URL`.
- Validate isolation before Playwright loads its web-server configuration.
- Accept only `localhost`, `127.0.0.1`, or `[::1]`, with a database ending in `_test` or
  `_e2e`, plus explicit `E2E_DATABASE_RESET_ALLOWED=1`.
- Reject all remote database reset targets, including when `CI=true`.
- Override server and Prisma child environments with the E2E URLs.
- Reset/migrate/seed the disposable E2E database instead of deleting broad name prefixes.
- Make direct UI mode use the same guard.

**Acceptance**

- Missing, malformed, remote, or non-test E2E URLs fail before the web server starts.
- Error output contains no credentials or query parameters.
- CI reuses its existing disposable `ulu_school_test` service with explicit E2E variables.
- Interrupted runs are recovered by resetting the disposable E2E database on the next run.
- The configured development/remote database is never mutated by E2E.

## Slice 3: Deterministic Vitest

**Affected files**

- `app/portal/student/__tests__/page.test.tsx`
- `scripts/__tests__/playwright-test-contract.test.ts`

**Requirements**

- Import the student page once after hoisted mocks instead of dynamically importing it per test.
- Split multi-partition subprocess assertions so each test owns one bounded process tree.
- Preserve all assertions and existing timeout constants.

**Acceptance**

- Each targeted test file passes five consecutive runs.
- Two consecutive `npm run test` runs pass with zero failures.
- No timeout value is increased and no retry is added.

## Slice 4: Public Content Hygiene

**Affected files**

- `lib/content.ts`
- `lib/__tests__/content.test.ts`
- `lib/config/production-env.ts`
- `lib/config/__tests__/production-env.test.ts`
- `components/sections/testimonials-section.tsx`
- `components/sections/__tests__/testimonials-section.test.tsx`
- `components/sections/__tests__/sections.test.tsx`
- `components/layout/site-footer.tsx`
- `tests/components/layout/site-footer.test.tsx`
- `app/contact/page.tsx`
- `app/results/page.tsx`
- `app/results/__tests__/page.test.tsx`
- `.env.example`
- deployment documentation and environment contract tests

**Requirements**

- Represent missing public contact values as `null`.
- Always require a valid public contact email in production.
- Treat phone and WhatsApp as optional, but reject placeholders when present.
- Render only configured contact rows.
- Return `null` for the home testimonial section when no published records exist.
- Do not render an empty testimonial grid on `/results`.

**Acceptance**

- Public pages and footer contain no `XXX`, example contacts, or empty testimonial sections.
- Production environment validation rejects missing email and placeholder contact values.
- Valid configured contacts and published testimonials still render in order.

## Slice 5: Responsive Admin Tables

**Affected files**

- `app/(admin)/admin/classes/page.tsx`
- `app/(admin)/admin/classes/[id]/lessons/page.tsx`
- `app/(admin)/admin/cms/pages/page.tsx`
- `app/(admin)/admin/teachers/page.tsx`
- `e2e/portals/admin-responsive.spec.ts`

**Requirements**

- Give each table an explicit content-appropriate minimum width.
- Use no-wrap selectively where line wrapping destroys identifiers, statuses, or actions.
- Keep horizontal scrolling inside the table container and avoid global body overflow.
- Preserve filters, sorting, pagination, actions, semantics, and keyboard access.
- The E2E spec must create non-empty namespaced fixtures on the disposable database.

**Acceptance**

- At 390x844, all four pages have no global horizontal overflow.
- Their table containers have `scrollWidth > clientWidth`.
- Primary identifiers, status, and actions remain readable and keyboard accessible.
- At 1440x900, the tables have no desktop regression.

## Slice 6: Release Evidence

Required fresh evidence:

1. Targeted tests for each slice.
2. `npm run lint`.
3. `npm run typecheck`.
4. Two consecutive `npm run test` runs.
5. `npm run build`.
6. Clean disposable PostgreSQL migration/status/verify proof.
7. Relevant focused E2E and the release E2E gate.
8. Desktop/mobile browser screenshots and overflow measurements.

Any failed required gate keeps the goal incomplete and must be reported with exact evidence.
