# AI Superpowers For This Project

This document defines how AI agents should work inside the ULU Online School codebase. It is a project-level operating guide, not an application feature and not a production dependency.

## What This Adds

The Superpowers layer gives the project a stronger AI workflow:

- fewer random edits, because every non-trivial task starts with repo reconnaissance;
- smaller changes, because work is split into narrow vertical slices;
- safer school data handling, because role and ownership checks are considered before backend edits;
- better tests, because the expected verification level is selected before coding;
- cleaner handoffs, because every completed task ends with changed files, checks run, risks, and next steps;
- easier continuation by another agent, because decisions and assumptions are written down.

## Default Operating Mode

For any non-trivial task, follow this sequence:

1. Read `AGENTS.md` and the relevant docs.
2. Inspect the existing route, component, repository, Prisma model, and tests before editing.
3. State a short implementation plan.
4. Make the smallest safe change that satisfies the task.
5. Add or update focused tests for changed behavior.
6. Run the smallest relevant checks first, then broader checks when risk justifies it.
7. Self-review the diff before reporting completion.
8. Finish with a concise implementation report.

## Task Modes

Use these modes depending on the request:

- Recon: understand whether something exists, where it lives, and what would need to change.
- Diagnose: reproduce or inspect a failure before changing code.
- TDD: write or update a failing test first when changing business behavior.
- Minimal safe change: fix the narrow problem without broad rewrites.
- Security review: check role, ownership, input validation, secrets, and audit logging.
- PR handoff: summarize the diff, verification, risks, and follow-up work.

## Project-Specific Checks

Always account for these before backend or portal changes:

- Admin routes live under `app/(admin)/admin`.
- Portal routes live under `app/portal`.
- Teacher routes live under `app/portal/teacher`.
- Shared data access should live in `lib/repositories/*` or focused services.
- Server actions must validate input and enforce permissions server-side.
- Teacher, student, and parent data must be scoped by authenticated session, not by UI-only filtering.
- Sensitive mutations should write audit logs where the domain already tracks them.

## Verification Ladder

Choose the smallest useful check first:

1. Single targeted unit/component test.
2. Related test file or folder.
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm run test`.
6. `npm run test:e2e -- <specs>` for critical focused browser workflows, then
   `npm run test:e2e:release` for the full release gate.
7. `npm run build` before deployment-facing changes.

For Prisma changes, also consider:

- `npx prisma validate`
- `npx prisma generate`
- migration review before production deploy

## Handoff Format

Every completed implementation should report:

- branch or working tree state;
- files/modules changed;
- what changed in plain language;
- security and ownership notes;
- tests/checks run and result;
- browser verification, if applicable;
- remaining risks or follow-up tasks.

