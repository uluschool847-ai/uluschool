# Teachers, Contacts, and Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the four approved teacher profiles, identify the founder, show two verified contact links, and start new visitors in light mode.

**Architecture:** Keep public profile copy in one typed content module shared by deterministic seeding and the production synchronization service. Continue rendering teachers from PostgreSQL through `cms-repository`; synchronize only `Teacher` profile rows in a serializable transaction and record every create, update, and delete in `AdminAuditLog`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 5/PostgreSQL, next-themes, Vitest, Testing Library, Playwright.

## Global Constraints

- The public teaching team contains exactly Sir Nickson Onyango, Sir Alphonse, Ms. Cholette, and Sir Bernard in that order.
- Removing an extra `Teacher` profile must not delete its linked `AppUser` or cabinet data.
- Production mutations require an existing active admin actor and write audit logs in the same transaction.
- Phone is `+254 701 256 095`; WhatsApp is `+254 706 359 133`.
- New visitors start in light mode; the existing manual theme toggle remains functional.
- Preserve unrelated local hero-section changes and generated image files.

---

### Task 1: Approved Teacher Content and Deterministic Seed

**Files:**
- Create: `lib/content/approved-teachers.ts`
- Modify: `prisma/seed.ts`
- Modify: `prisma/__tests__/seed.test.ts`
- Test: `lib/content/__tests__/approved-teachers.test.ts`

**Interfaces:**
- Produces: `APPROVED_PUBLIC_TEACHERS`, a readonly array with `fullName`, `title`, `bio`, `photoUrl`, `displayOrder`, `isActive`, and `subjectSlugs`.
- Consumes: existing Prisma `Teacher`, `Subject`, and `TeacherSubject` models.

- [ ] **Step 1: Write the failing content-contract test**

Assert the exact four names, `/nick.jpg`, `/alphonse.jpg`, `/cholette.jpg`, `/bernard.png`, corrected biographies, active status, and display orders 1-4.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- lib/content/__tests__/approved-teachers.test.ts`

Expected: FAIL because `APPROVED_PUBLIC_TEACHERS` does not exist.

- [ ] **Step 3: Add the typed approved content constant**

Use the exact copy from `docs/superpowers/specs/2026-08-08-teachers-contacts-light-theme-design.md`; do not add unverified qualifications or experience claims.

- [ ] **Step 4: Replace marketing profiles in deterministic seed**

Import `APPROVED_PUBLIC_TEACHERS`, preserve the existing `teacher-123` cabinet account independently, and create the approved `Teacher` rows after `teacher.deleteMany()`. Resolve only subject slugs that exist in deterministic fixtures.

- [ ] **Step 5: Update and run seed tests**

Require the exact approved active names and valid subjects, then run:

`npm test -- lib/content/__tests__/approved-teachers.test.ts prisma/__tests__/seed.test.ts`

Expected: PASS (database integration suite remains environment-gated unless explicitly enabled).

### Task 2: Contacts, Founder, and Default Theme

**Files:**
- Modify: `lib/content.ts`
- Modify: `components/layout/site-footer.tsx`
- Modify: `app/contact/page.tsx`
- Modify: `app/about/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `lib/__tests__/content.test.ts`
- Modify: `tests/components/layout/site-footer.test.tsx`
- Create: `app/about/__tests__/page.test.tsx`
- Modify: `app/__tests__/root-metadata.test.ts`

**Interfaces:**
- Produces: `siteConfig.contact.phoneHref` and `siteConfig.contact.whatsappHref` alongside formatted labels.
- Preserves: `ThemeToggle` API and persisted user theme behavior.

- [ ] **Step 1: Write failing tests for contact defaults and links**

Require `+254 701 256 095` with `tel:+254701256095` and `+254 706 359 133` with `https://wa.me/254706359133` in both footer and Contact page.

- [ ] **Step 2: Write failing tests for founder identity and light default**

Require `/nick.jpg`, `Sir Nickson Onyango`, and `Founder's Message` on About. Capture `ThemeProvider` props in the root-layout test and require `defaultTheme="light"` plus `enableSystem={false}`.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- lib/__tests__/content.test.ts tests/components/layout/site-footer.test.tsx app/about/__tests__/page.test.tsx app/__tests__/root-metadata.test.ts`

Expected: FAIL on the new contact, founder, and theme assertions.

- [ ] **Step 4: Implement accessible contact links and founder identity**

Use `<a href={siteConfig.contact.phoneHref}>` for Phone and `<a href={siteConfig.contact.whatsappHref}>` for WhatsApp. Add the founder image and name inside the existing founder card without adding a nested card.

- [ ] **Step 5: Set the initial theme**

Change the root provider to `defaultTheme="light"` and `enableSystem={false}`; leave the existing toggle unchanged.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Task 2 command and expect PASS.

### Task 3: Audited Teacher Synchronization

**Files:**
- Create: `lib/services/sync-approved-teachers.ts`
- Create: `tests/lib/services/sync-approved-teachers.test.ts`
- Create: `scripts/sync-approved-teachers.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `syncApprovedTeachers({ actorId, database }) => Promise<{ created: number; updated: number; deleted: number }>`.
- Consumes: `APPROVED_PUBLIC_TEACHERS`, Prisma transaction client, and `createAdminAuditLog`.

- [ ] **Step 1: Write failing synchronization tests**

Cover creating four missing profiles, updating a matching name, deleting an extra `Teacher`, preserving its linked `AppUser`, idempotent second execution, and create/update/delete audit events.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/lib/services/sync-approved-teachers.test.ts`

Expected: FAIL because the synchronization service does not exist.

- [ ] **Step 3: Implement the serializable synchronization service**

Match approved profiles by exact `fullName`, replace their subject links, create missing rows, delete all other `Teacher` rows, and write `TEACHER_PROFILE_CREATED`, `TEACHER_PROFILE_UPDATED`, or `TEACHER_PROFILE_DELETED` audit entries in the same transaction. Compare normalized snapshots so an unchanged second run performs zero mutations.

- [ ] **Step 4: Add the guarded CLI**

The script requires `APP_ENV=production`, resolves the active ADMIN identified by `BOOTSTRAP_ADMIN_EMAIL`, invokes the service, prints counts only, and always disconnects Prisma. Add `db:sync-approved-teachers` to `package.json`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/lib/services/sync-approved-teachers.test.ts`

Expected: PASS.

### Task 4: Verification, Production Data, and Deployment

**Files:**
- Verify only; no unrelated files are staged.

**Interfaces:**
- Consumes: verified code, Render production database connection, existing Render web service `srv-d8nvkdm7r5hc73ba4ai0`.
- Produces: exact approved teacher rows and a live verified deployment.

- [ ] **Step 1: Reset deterministic local data and inspect `/teachers`**

Run the approved synchronization against the local database, then verify exactly four cards and working local images at `http://localhost:3100/teachers`.

- [ ] **Step 2: Run the verification ladder**

Run focused tests, `npm run typecheck`, `npm run lint`, `npm run build`, and the relevant public-page Playwright scenarios.

- [ ] **Step 3: Self-review and commit scoped files**

Confirm the diff does not include `components/sections/hero-section.tsx`, its tests, lion images, or browser output. Commit the implementation and push `main`.

- [ ] **Step 4: Wait for GitHub CI**

Require the `verify` job and browser release gate to complete successfully for the exact pushed SHA.

- [ ] **Step 5: Synchronize production teacher data**

Use the Render Postgres external connection only in process memory, run `npm run db:sync-approved-teachers`, and verify the result reports exactly four approved active profiles. Never print credentials.

- [ ] **Step 6: Update Render contacts and deploy**

Set `NEXT_PUBLIC_CONTACT_PHONE=+254 701 256 095` and `NEXT_PUBLIC_CONTACT_WHATSAPP=+254 706 359 133` on the existing service, trigger one manual deployment for the verified SHA, and wait for `live`.

- [ ] **Step 7: Verify production**

Run deployment smoke and Chromium checks on `/teachers`, `/about`, `/contact`, and the footer. Require four correct teacher cards, all four local photos returning HTTP 200, the founder identity, both clickable contacts, one theme toggle, and light initial rendering with dark mode still switchable.
