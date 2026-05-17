# AI Progress Log

Цей файл потрібен як handoff для нового чату або іншої LLM. Він фіксує фактичний стан проєкту, вже виконані роботи, результати перевірок і відкриті технічні борги.

## Project

- Path: `D:\2026\mathSchool`
- Stack:
  - Next.js 15 App Router
  - React 18
  - TypeScript
  - Prisma
  - PostgreSQL
  - Vitest
  - Playwright

## Current baseline

На момент створення цього файлу:

- `npm run lint` -> passed
- `npx tsc --noEmit` -> passed
- `npm run build` -> passed
- `npm run test:e2e` -> passed (`23/23`)

## Major work already completed

### 1. Test harness and RED/GREEN cleanup across app

Було виправлено велику кількість тестів і production-коду, зокрема:

- async server component rendering tests
- form feedback patterns
- action result normalization
- auth/session UX
- role-based dashboard/accessibility issues
- formatting consistency for dates/times/status labels
- content/placeholder cleanup

Це вже інтегровано в кодову базу.

### 2. Lint / typecheck / build baseline

Було приведено репозиторій до чистого локального baseline:

- Biome lint cleaned
- TypeScript errors fixed
- hidden build lint bypass removed from `next.config.mjs`
- build pipeline runs lint before build

### 3. Playwright smoke tests

Додано і стабілізовано E2E smoke suite:

- `playwright.config.ts`
- `e2e/global-setup.ts`
- `e2e/auth/login.spec.ts`
- `e2e/auth/rbac.spec.ts`
- `e2e/forms/contact.spec.ts`
- `e2e/forms/enrol.spec.ts`
- `e2e/portals/student.spec.ts`
- `e2e/portals/teacher.spec.ts`
- `e2e/portals/admin.spec.ts`
- `e2e/portals/parent.spec.ts`

Smoke suite покриває:

- login
- RBAC / route protection
- contact form
- enrol form
- student portal
- teacher portal
- admin portal
- parent portal

### 4. Clean-machine rehearsal

Було виконано rehearsal у свіжій копії репозиторію:

- fresh copy
- install
- env setup
- DB reset/seed
- verify
- e2e
- lint
- typecheck
- build

За результатом rehearsal були додатково виправлені:

- `README.md`
- `docs/local-setup.md`
- `biome.json`

Ключовий висновок: проєкт можна підняти локально end-to-end за документацією.

## Documentation already added/updated

Оновлені або створені:

- `README.md`
- `docs/local-setup.md`
- `docs/qa-checklist.md`
- `docs/qa-matrix.md`
- `docs/known-limitations.md`

## Important resolved issue: public /teachers page

### Problem

Сторінка:

- `http://localhost:3000/teachers`

була порожня після seed/reset.

### Root cause

Сторінка використовує:

- `D:\2026\mathSchool\lib\repositories\cms-repository.ts`
- `getActiveTeachers()`
- `prisma.teacher.findMany({ where: { isActive: true } })`

Але `prisma/seed.ts` створював тільки `AppUser` із роллю `TEACHER`, і не створював записи в окремій моделі `Teacher`.

### Fix applied

У `D:\2026\mathSchool\prisma\seed.ts` додано seed block, який створює 3 записи в `Teacher`:

- `Jane Doe`
- `John Smith`
- `Alice Brown`

Підхід:

- `await prisma.teacher.deleteMany()`
- create 3 deterministic records

Це зроблено idempotent для локального seed path.

## Important unresolved issue: migration/schema drift

### Status

У репозиторії є окремий технічний борг між:

- `prisma/schema.prisma`
- `prisma/migrations/...`
- фактичними очікуваннями `prisma/seed.ts`

### Symptom

Окремий запуск:

```bash
npm run db:seed
```

може падати після `prisma migrate reset`, якщо DB піднята лише з migration history, бо одна з локальних схем не збігається з поточною Prisma schema.

Зафіксований приклад:

- `The table public.Subject does not exist`

### Why this matters

Це не блокує поточний працюючий baseline, але означає:

- локальна migration history ще не є повністю чистою/надійною
- є технічний борг у DB lifecycle

### Recommendation

Окремий backlog item:

1. звірити `prisma/schema.prisma` з `prisma/migrations`
2. вирівняти migration history під поточні моделі
3. перевірити `npm run db:reset`
4. перевірити `npm run db:seed`
5. перевірити `npm run db:setup`

## Current behavior notes

### Auth / session

Вже реалізовано:

- rate limit for login
- session validation
- expired/invalid redirects
- auth audit logging

### Role routing

Middleware і portal flow already exercised by E2E suite:

- guest blocked from protected routes
- role redirects work
- wrong-role access blocked

### Teachers public page

Працює тільки якщо таблиця `Teacher` має активні записи.

Сторінка не читає `AppUser` role=`TEACHER`.

## Known local limitations

### 1. Object storage

Не виконано, deferred:

- local-first file handling still in place
- production object storage abstraction (`S3` / `R2` / `Vercel Blob`) ще не реалізована

Це не блокує local completion.

### 2. DB migration hygiene

Як зазначено вище:

- schema / migration drift все ще потребує окремого cleanup

### 3. Vitest include patterns

Поточний `vitest` config не включає всі можливі каталоги.

Приклад:

- `prisma/__tests__/seed.test.ts` не запускається через дефолтний include pattern

Якщо цей test потрібен у стандартному suite, треба або:

1. оновити include pattern у Vitest config
2. або запускати його окремим config/filter, який реально матчить `prisma/__tests__`

## Seeded test accounts

Використовувались у smoke/manual flows:

- `fixed.student@uluglobalacademy.com`
- `fixed.teacher@uluglobalacademy.com`
- `fixed.parent@uluglobalacademy.com`
- `fixed.admin@uluglobalacademy.com`
- `freshstudent@uluglobalacademy.com`
- `newteacher@uluglobalacademy.com`
- `onboardingparent@uluglobalacademy.com`

Пароль локально:

- `ChangeMe123!`

або значення з:

- `DEFAULT_PORTAL_PASSWORD`

## Recommended starting points for the next chat

Якщо роботу продовжує інша LLM або новий чат, починати варто так:

### If the goal is product work

1. прочитати `README.md`
2. прочитати `docs/local-setup.md`
3. прочитати `docs/qa-matrix.md`
4. перевірити:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run test:e2e`

### If the goal is DB stability

Почати з:

- `prisma/schema.prisma`
- `prisma/migrations/`
- `prisma/seed.ts`
- `prisma/verify-db.ts`

і окремо пропрацювати `db:reset` / `db:seed` consistency.

### If the goal is public teachers/CMS work

Почати з:

- `app/teachers/page.tsx`
- `components/sections/teachers-preview-section.tsx`
- `lib/repositories/cms-repository.ts`
- `prisma/schema.prisma` (`Teacher`)
- `prisma/seed.ts`

## Files most recently changed

Останні суттєві зміни були в:

- `D:\2026\mathSchool\prisma\seed.ts`
- `D:\2026\mathSchool\README.md`
- `D:\2026\mathSchool\docs\local-setup.md`
- `D:\2026\mathSchool\docs\qa-checklist.md`
- `D:\2026\mathSchool\docs\qa-matrix.md`
- `D:\2026\mathSchool\docs\known-limitations.md`
- `D:\2026\mathSchool\biome.json`
- `D:\2026\mathSchool\playwright.config.ts`
- `D:\2026\mathSchool\e2e\...`

## One-line summary

Проєкт зараз у робочому локальному стані з чистим lint/typecheck/build і working Playwright smoke suite, але має окремий невирішений технічний борг у Prisma migration/schema consistency.
