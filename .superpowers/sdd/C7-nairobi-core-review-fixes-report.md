# C7 Nairobi Core Review Fixes Report

## Scope

- Branch: `launch/mvp-production-readiness`
- Reviewed base: `ff45ca01fb223eed284efe901e2db6ffb63efad4`
- Write scope: lesson actions/tests, scheduling helper/tests, lesson repository/tests, Nairobi migration contract test, and this report only.

## Plan

1. Add focused regressions for the four independent review defects.
2. Capture RED evidence before production edits.
3. Apply the smallest parser, schema, action payload, and repository persistence changes.
4. Run focused tests, Biome on touched files, typecheck, and `git diff --check`.
5. Self-review and commit only scoped changes.

## RED Evidence

Command:

```text
npx vitest run 'app/(admin)/admin/lessons/__tests__/actions.test.ts' 'lib/scheduling/__tests__/availability-timezone.test.ts' 'lib/repositories/__tests__/lesson-repository.test.ts' 'prisma/__tests__/nairobi-timezone-migration.test.ts'
```

Result before production edits: exit `1`; 4 test files (3 failed, 1 passed); 89 tests (14 failed, 75 passed).

Expected failures observed:

- 5 helper failures: fractional seconds converted using the process timezone, while absolute timestamps and impossible/rollover local values were accepted.
- 4 action failures: tampered absolute/offset/impossible/rollover `datetime-local` values reached the transaction instead of field validation.
- 2 action failures: `updateLessonAction` and `rescheduleLessonAction` omitted the validated timezone from `rescheduleLesson` input.
- 1 repository failure: `rescheduleLesson` omitted timezone from the `ScheduledClass.update` data.
- 2 recurring action failures: an invalid timezone was accepted and a blank timezone reached persistence without Nairobi normalization.

The strengthened exact migration contract test passed during RED because the committed migration SQL is already exactly correct; no historical migration edit is required.

## GREEN Evidence

Focused regression command from RED rerun after implementation: exit `0`; 4 test files passed; 89 tests passed.

Final affected test command:

```text
npx vitest run 'app/(admin)/admin/lessons/__tests__/actions.test.ts' 'app/(admin)/admin/lessons/__tests__/google-meet-auto-create.test.ts' 'app/(admin)/admin/lessons/__tests__/meeting-link-actions.test.ts' 'lib/scheduling/__tests__/availability.test.ts' 'lib/scheduling/__tests__/availability-timezone.test.ts' 'lib/repositories/__tests__/lesson-repository.test.ts' 'prisma/__tests__/nairobi-timezone-migration.test.ts'
```

Final result: exit `0`; 7 test files passed; 125 tests passed.

Additional checks:

- Biome over all 7 touched TypeScript files: exit `0`; 7 files checked; no fixes applied.
- `npm run typecheck`: exit `0`.
- `git diff --check`: exit `0`.

## Implementation

- Strictly parse local lesson values as `YYYY-MM-DDTHH:mm` with optional seconds/fraction, reject `Z`/offset timestamps, and reject calendar/time rollovers before conversion.
- Reuse the existing timezone schema for recurring lessons so blank values normalize to `Africa/Nairobi` and invalid IANA values fail before persistence.
- Pass the validated timezone through both action reschedule paths and persist it with `startAt`/`endAt` in the repository's single update.
- Replace the permissive migration regex with an exact normalized SQL file contract, including statement order and final newline. Historical migration SQL was not edited.

## Security And Behavior Preservation

Self-review confirmed that admin auth and existing ownership boundaries are unchanged. Availability checks still run before mutation with the same UTC interval, Google Calendar receives the same validated interval/timezone inputs, and the repository mutation plus audits remain in the existing transaction. Audit ordering, failure behavior, and revalidation paths are unchanged.

## Browser Verification

Not required: this focused fix changes server validation/data persistence and tests, with no UI component or browser workflow changes.

## Remaining Risks

The full Vitest suite and Playwright suite were not run because the accepted scope requested affected tests and contains no UI change. The strict parser intentionally stops accepting absolute timestamps through the local-input helper; other callers are covered by the affected scheduling and lesson-action tests.
