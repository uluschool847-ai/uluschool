# AI-Assisted Engineering Rules

This project is a production-oriented Next.js 15 + Prisma/PostgreSQL school platform for ULU Online School. AI tools may be used to plan, implement, review, and test changes, but they must follow the project-specific workflow below.

## Required Workflow

Every non-trivial change must follow this order:

1. Analyze existing project context before proposing or editing code.
2. Write a short implementation plan before coding.
3. Split work into small scoped tasks.
4. Enforce ownership, role, and data-access rules in backend code.
5. Add or update mandatory tests for the changed behavior.
6. Manually verify browser-facing workflows when UI changes.
7. Finish with a short implementation report listing changes, verification, and remaining risks.

## Project Context

- Framework: Next.js 15 App Router.
- Database: Prisma with PostgreSQL.
- Auth: custom session helpers in `lib/auth/session`.
- Admin routes live under `app/(admin)/admin`.
- Portal routes live under `app/portal`.
- Teacher cabinet routes live under `app/portal/teacher`.
- Shared business logic should live in `lib/repositories/*` or focused service modules, not directly in route/page components.

## Plan-First Development

Before code changes, identify:

- affected routes, components, repositories, actions, and Prisma models;
- exact business rule being implemented;
- ownership/security checks;
- audit log requirements;
- revalidation paths;
- tests to add or update;
- manual browser flow to verify.

Do not start broad rewrites from a vague task. Narrow the task first.

## Small Scoped Tasks

Prefer changes such as:

- `Teacher assignments list`
- `Submission review detail`
- `Course material upload cleanup`
- `Teacher progress notes ownership`

Avoid combining unrelated work such as grading, attendance, materials, and Google Meet integration in one change.

## Ownership And Security Rules

Never rely on UI filtering, hidden inputs, or client-sent IDs as security.

Use `session.uid` from server-side auth and enforce scope in repository/server action code.

Teacher-owned data must generally be scoped through one or more of:

- direct teacher ownership, e.g. `teacherId = session.uid`;
- scheduled class ownership, e.g. `ScheduledClass.teacherId = session.uid`;
- class group ownership, e.g. `ScheduledClass.classGroup.teacherId = session.uid`;
- assignment/submission/material ownership through their related scheduled class or class group.

Student and parent data must be scoped through enrollment or linked parent-child relations.

For sensitive mutations, write audit logs where the project already tracks that domain. This includes users, teachers, students, parents, classes, lessons, homework, submissions/grading, materials, security, billing, and progress notes when implemented.

## Repository And Action Rules

- Pages should not use direct Prisma queries when a repository exists or should exist.
- Server actions must validate input with `zod` or a project-standard validator.
- Server actions must call repository methods that enforce ownership.
- Mutations must revalidate affected teacher/student/parent/admin routes.
- Failed mutations must not write success audit logs.
- Avoid duplicating legacy helpers in `portal-repository.ts`; prefer focused repositories for new work.

## Mandatory Tests

Choose tests based on the changed layer:

- Repository logic: unit tests under `tests/repositories/*` or `lib/repositories/__tests__/*`.
- Server actions: tests under `tests/portal/*` or route-local `__tests__`.
- Components: tests under `tests/components/*` or route-local `__tests__`.
- Pages/routes: route-local `__tests__`.
- Critical browser workflows: Playwright tests under `e2e/*`.

Always include security/IDOR tests for role-scoped data:

- teacher cannot access another teacher's class, assignment, submission, material, attendance, or progress note;
- student cannot submit or view another student's work;
- parent cannot view an unlinked student;
- admin-only pages reject portal roles.

Common verification commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

Run the smallest relevant subset first, then broader commands when risk or scope justifies it.

## Manual Browser Verification

Use browser verification for UI changes.

For each browser workflow, record:

- test user/role used;
- starting route;
- main actions clicked/submitted;
- expected visible result;
- any error/success feedback;
- affected data visible from another role when relevant.

Examples:

- teacher creates homework, student sees it, teacher archives it;
- teacher reviews submission, saves grade/feedback, student and parent see result;
- teacher uploads material, student sees material, teacher deletes it;
- admin creates lesson, teacher sees schedule, Google Meet link opens if configured.

## Final Implementation Report

Every completed implementation should end with:

- changed files/modules;
- what was implemented;
- security/ownership notes;
- tests run and results;
- browser verification performed;
- known gaps or follow-up tasks.

Do not claim 100% completion unless tests and manual verification cover the accepted scope.

