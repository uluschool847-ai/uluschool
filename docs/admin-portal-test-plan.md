# Admin Portal Test Plan

This checklist implements the admin test scope for ULU School. It complements the focused
Playwright specs under `e2e/portals/admin*.spec.ts` and the admin unit/action/component tests.

## Automated Coverage

- Focused one-command QA smoke: `npm run qa:admin-smoke`
  - Allocates an isolated `localhost` port for the run and sets `PLAYWRIGHT_BASE_URL`/`PORT`.
  - Uses seeded admin credentials: `fixed.admin@uluglobalacademy.com` with `E2E_PORTAL_PASSWORD`,
    `DEFAULT_PORTAL_PASSWORD`, or `ChangeMe123!`.
  - Runs route smoke, authenticated header checks, browser console/page error checks,
    failed-request and 5xx network checks, dashboard CRM search, reminder dry run, and sensitive
    admin RBAC.
- Route smoke and RBAC matrix: `e2e/portals/admin-full-coverage.spec.ts`
- Domain workflows: `e2e/portals/admin-{teachers,teacher-availability,students,parents,classes,lessons,subjects,crm,cms,billing,analytics,audit,security,tasks}.spec.ts`
- Action/component/repository coverage: admin tests under `app/(admin)/admin/**/__tests__`,
  `components/admin/**/__tests__`, `tests/admin*`, and `lib/repositories/**/__tests__`.
- Standalone admin materials/files workspace: intentionally unavailable. There is no
  `/admin/materials` or `/admin/files` route or dashboard link; course materials are managed through
  the teacher portal at `/portal/teacher/materials` and consumed read-only by student/parent
  material routes.
- Upload validation coverage where uploads exist:
  `app/api/upload/__tests__/route.test.ts` covers MIME, size, empty file, batch partial failure, and
  storage errors; `tests/components/portal/MaterialForm.test.tsx` covers visible teacher material
  upload validation; `app/(admin)/admin/teachers/__tests__/actions.test.ts` and
  `e2e/portals/admin-teachers.spec.ts` cover admin teacher photo type/size validation.

## Manual Browser Checklist

Use the seeded admin `fixed.admin@uluglobalacademy.com` with `ChangeMe123!`.

1. Login at `/portal/login`, confirm redirect to `/admin` or `/admin/security`.
2. Open every primary workspace: dashboard, users, security, teachers, students, parents, classes,
   subjects, CMS pages/blog/FAQ, analytics, billing, audit, tasks, AI drafts, reminders,
   submissions, and leads.
   Confirm there is no separate Materials or Files admin workspace; use `/portal/teacher/materials`
   when verifying course material creation and file upload flows.
3. For teacher, student, parent, subject, class group, lesson, and CMS content, create or update a
   QA record, reload the page, and confirm persistence plus success feedback.
4. Confirm cross-role visibility after admin mutations: schedules in teacher/student/parent portals,
   parent-student links, billing visibility, and public CMS publish/unpublish behavior.
5. Submit invalid forms for each mutation area and confirm validation blocks the change.
6. Login as teacher, student, and parent; confirm `/admin`, `/admin/users`, `/admin/security`,
   `/admin/billing`, and `/admin/audit` redirect to unauthorized or login.
7. Review `/admin/audit` after successful mutations and confirm failed mutations did not write
   success audit records.

## Verification Commands

Run narrow checks first:

```bash
npm run qa:admin-smoke
npm run test:e2e -- e2e/portals/admin-full-coverage.spec.ts
npm run test:e2e -- e2e/portals/admin*.spec.ts
npm run test -- "app/(admin)/admin"
npm run test -- components/admin
npm run test -- tests/admin tests/admin-*.test.ts
```

If port `3000` is already serving another app, use an isolated port in PowerShell:

```powershell
$env:PORT='3005'; $env:PLAYWRIGHT_BASE_URL='http://localhost:3005'; npm run test:e2e -- e2e/portals/admin-full-coverage.spec.ts
```

Then run regression gates when the target environment is ready:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

## Acceptance Criteria

- Admin can load all primary admin workspaces.
- Portal roles cannot access admin-only workspaces.
- Admin mutations validate input, persist correct state, revalidate affected views, and audit only
  successful changes.
- Existing domain e2e specs pass for CRUD, cross-role visibility, audit, and integration edge cases.
