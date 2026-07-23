# How To Understand And Modify Functionality

Цей документ призначений для розробника, який щойно приєднався до проєкту або повернувся після паузи. Це не теорія про код. Це практичний маршрут: як швидко зрозуміти, де живе функціонал, як безпечно додати новий, і як акуратно видалити зайвий.

## Швидке картування функціоналу

Починай не з випадкового читання коду, а з карти джерел правди.

### 1. Прочитай базову документацію

Порядок:

1. `D:\2026\mathSchool\README.md`
2. `D:\2026\mathSchool\docs\local-setup.md`
3. `D:\2026\mathSchool\docs\qa-matrix.md`
4. `D:\2026\mathSchool\docs\qa-checklist.md`
5. `D:\2026\mathSchool\docs\known-limitations.md`
6. `D:\2026\mathSchool\docs\architecture.md`
7. `D:\2026\mathSchool\docs\database.md`
8. `D:\2026\mathSchool\ai-progress.md`

Що ти там знайдеш:

- які ролі підтримуються: Guest, Student, Teacher, Parent, Admin
- які маршрути існують
- які seed-акаунти є локально
- які flows already covered smoke/E2E
- які технічні борги вже відомі

### 2. Зрозумій, де в проєкті живуть фічі

У цьому репо функціонал зазвичай розкладений так:

- `D:\2026\mathSchool\app\`
  - Next.js App Router pages, layouts, route handlers
- `D:\2026\mathSchool\components\`
  - UI, форми, dashboard widgets, admin blocks, sections
- `D:\2026\mathSchool\lib\repositories\`
  - доступ до Prisma / DB queries
- `D:\2026\mathSchool\lib\auth\`
  - session, password, SSO
- `D:\2026\mathSchool\lib\services\`
  - email, reminders
- `D:\2026\mathSchool\lib\storage\`
  - локальне файлове сховище
- `D:\2026\mathSchool\prisma\`
  - schema, migration, seed, verify-db

Поточний контракт автентифікації адміністратора:

ULU Online School administrators authenticate to the application with email and password.
Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
accounts remain protected with provider-level 2FA.

### 3. Не шукай те, чого тут немає

На поточний момент у репо:

- немає OpenAPI / Swagger
- немає ADR-папки
- немає окремого generated API contract layer

Тому джерела правди тут інші:

- route structure в `app/`
- repository API в `lib/repositories/`
- тестові сценарії в `__tests__/`
- Prisma schema

### 4. Тести тут часто є найбільш точним описом поточного контракту

Дивись:

- `D:\2026\mathSchool\app\**\__tests__\`
- `D:\2026\mathSchool\components\**\__tests__\`
- `D:\2026\mathSchool\lib\**\__tests__\`
- `D:\2026\mathSchool\prisma\__tests__\`
- `D:\2026\mathSchool\e2e\`

Якщо документація відстає, тест зазвичай точніший.

## Читання коду через призму бізнес-логіки

Задача не в тому, щоб “прочитати файл”. Задача в тому, щоб відновити бізнес-ланцюжок однієї фічі від UI до БД і назад.

### Робоча схема пошуку будь-якої фічі

Для будь-якої фічі проходь цей ланцюжок:

1. Route / page
2. Page-level component
3. Child components / forms / widgets
4. Actions / event handlers
5. Repository queries
6. Prisma model
7. Tests
8. Docs / QA scenarios

### Приклад мислення

Приклад: “Чому на `/teachers` нічого не видно?”

Шукати так:

1. page:
   - `D:\2026\mathSchool\app\teachers\page.tsx`
2. data source:
   - `getActiveTeachers()`
3. repository:
   - `D:\2026\mathSchool\lib\repositories\cms-repository.ts`
4. DB model:
   - `Teacher` у `D:\2026\mathSchool\prisma\schema.prisma`
5. seed:
   - `D:\2026\mathSchool\prisma\seed.ts`
6. tests:
   - `D:\2026\mathSchool\app\teachers\__tests__\TeachersPage.test.tsx`

### Що шукати для кожного типу функціоналу

#### Public page / marketing feature

Шукай у:

- `D:\2026\mathSchool\app\about\page.tsx`
- `D:\2026\mathSchool\app\fees\page.tsx`
- `D:\2026\mathSchool\app\results\page.tsx`
- `D:\2026\mathSchool\app\teachers\page.tsx`
- `D:\2026\mathSchool\components\sections\*.tsx`
- `D:\2026\mathSchool\lib\repositories\cms-repository.ts`

#### Portal dashboard feature

Шукай у:

- `D:\2026\mathSchool\app\portal\student\page.tsx`
- `D:\2026\mathSchool\app\portal\teacher\page.tsx`
- `D:\2026\mathSchool\app\portal\parent\page.tsx`
- `D:\2026\mathSchool\app\portal\student\components\`
- `D:\2026\mathSchool\app\portal\teacher\components\`
- `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- `D:\2026\mathSchool\lib\repositories\schedule-repository.ts`

#### Admin / CRM / CMS feature

Шукай у:

- `D:\2026\mathSchool\app\(admin)\admin\`
- `D:\2026\mathSchool\components\admin\`
- `D:\2026\mathSchool\app\(admin)\admin\*\actions.ts`
- `D:\2026\mathSchool\lib\repositories\admin-*.ts`
- `D:\2026\mathSchool\lib\repositories\enquiry-repository.ts`
- `D:\2026\mathSchool\lib\repositories\contact-lead-repository.ts`
- `D:\2026\mathSchool\lib\repositories\cms-repository.ts`

#### Auth / RBAC feature

Шукай у:

- `D:\2026\mathSchool\app\portal\login\`
- `D:\2026\mathSchool\components\auth\`
- `D:\2026\mathSchool\lib\auth\session.ts`
- `D:\2026\mathSchool\lib\security\rate-limit.ts`
- `D:\2026\mathSchool\middleware.ts`
- `D:\2026\mathSchool\e2e\auth\`

### Пошукові патерни

У цьому репо найчастіше достатньо таких патернів:

```powershell
Select-String -Path app\**\*.ts,app\**\*.tsx,components\**\*.ts,components\**\*.tsx,lib\**\*.ts -Pattern "featureName"
```

```powershell
Select-String -Path app\**\*.ts,app\**\*.tsx -Pattern "getActiveTeachers|submit|update|delete|archive|publish"
```

```powershell
Select-String -Path lib\repositories\*.ts -Pattern "findMany|findFirst|create|update|delete|upsert"
```

```powershell
Select-String -Path prisma\schema.prisma -Pattern "model Teacher|model Assignment|model Submission"
```

```powershell
Select-String -Path app\**\*.ts,app\**\*.tsx -Pattern "redirect\\(|notFound\\(|revalidatePath\\("
```

```powershell
Select-String -Path app\**\*.ts,app\**\*.tsx,components\**\*.tsx -Pattern "useActionState|useFormStatus|startTransition|action="
```

Якщо `rg` доступний у твоєму shell, він швидший:

```bash
rg -n "getActiveTeachers|Teacher|isActive" app components lib prisma
rg -n "portal/login|validateSession|middleware" app lib
rg -n "findMany|create|update|deleteMany" lib/repositories prisma
```

### Git-орієнтоване читання історії фічі

Якщо треба зрозуміти, навіщо код з’явився:

```bash
git log -- D:\2026\mathSchool\app\portal\student\page.tsx
git log -S "getActiveTeachers" -- D:\2026\mathSchool
git blame D:\2026\mathSchool\lib\repositories\cms-repository.ts
```

Це корисно, коли фіча виглядає дивно, але могла бути компромісом під тест або бізнес-вимогу.

## Додавання нового функціоналу

Ціль: додати фічу так, щоб вона “вкорінилась” у наявну архітектуру, а не стала ізольованим шматком коду.

### Крок 1. Знайди місце для вкорінення

Перед написанням коду знайди аналогічну фічу.

Що саме шукати:

- route/page з подібним UX
- repository з подібною query/model формою
- form/action pattern
- existing tests такого ж типу

Приклади:

- нова public form:
  - дивись `D:\2026\mathSchool\app\contact\actions.ts`
  - `D:\2026\mathSchool\components\contact\contact-form.tsx`
- нова portal action:
  - дивись `D:\2026\mathSchool\app\portal\teacher\actions\`
  - `D:\2026\mathSchool\app\portal\student\actions\`
- новий admin CRUD:
  - дивись `D:\2026\mathSchool\app\(admin)\admin\users\`
  - `D:\2026\mathSchool\app\(admin)\admin\tasks\`
  - `D:\2026\mathSchool\app\(admin)\admin\cms\`

### Крок 2. Зафіксуй бізнес-контракт до змін

Перед змінами дай собі відповідь:

- хто користувач цієї фічі
- який маршрут або entry point
- який happy path
- який empty state
- який validation error
- який access denied behavior
- яка модель у БД

Якщо не можеш відповісти на ці пункти, ти ще не зрозумів фічу достатньо, щоб її чіпати.

### Крок 3. Визнач точки змін

Новий функціонал у цьому проєкті зазвичай зачіпає такі шари:

1. `app/.../page.tsx` або `components/...`
2. `actions.ts` або client event handler
3. `lib/repositories/...`
4. `prisma/schema.prisma` і/або `prisma/seed.ts`
5. tests
6. docs

Не починай з UI, поки не зрозумів repository/model path.

### Крок 4. Додай тести на потрібному рівні

У цьому репо є кілька рівнів тестів. Обирай мінімально достатній набір:

#### Для чистої функції / formatting / helper

- `lib/**/__tests__/*.test.ts`

#### Для server component / page / section

- `app/**/__tests__/*.test.tsx`
- `components/**/__tests__/*.test.tsx`

#### Для form feedback / auth / role protection

- component test + existing smoke path

#### Для критичного сценарію наскрізно

- `D:\2026\mathSchool\e2e\`

### Крок 5. Перевір, що не зламав існуючі фічі

Мінімум перед merge:

```bash
npm run lint
npx tsc --noEmit
npm run test:e2e
```

Для DB-залежних змін ще:

```bash
npm run db:reset
npm run db:seed
npm run db:verify
```

Для unit/component coverage:

```bash
npm run test
```

Якщо повний suite довгий, хоча б таргетно проганяй:

```bash
npx vitest run path\to\changed\test-file.test.ts
```

### Крок 6. Онови документацію

Оновлюй docs одразу, не “потім”.

Що оновлювати:

- `README.md` якщо змінились setup/scripts/env
- `docs/qa-matrix.md` якщо змінився user flow
- `docs/qa-checklist.md` якщо додалась ручна перевірка
- `docs/known-limitations.md` якщо змінилось обмеження
- `ai-progress.md` якщо зміна суттєва і важлива для handoff

## Видалення непотрібного функціоналу

Небезпека тут не у видаленні файлу, а у прихованих залежностях.

### Крок 1. Спочатку доведи, що функціонал справді зайвий

Перевір:

- чи є route
- чи є navigation link
- чи є form/action caller
- чи є repository usage
- чи є tests
- чи є seed dependency
- чи є docs/QA mentions

Пошук:

```bash
git grep -n "FeatureName"
git grep -n "/route-path"
git grep -n "functionName"
```

Або PowerShell:

```powershell
Select-String -Path app\**\*.ts,app\**\*.tsx,components\**\*.ts,components\**\*.tsx,lib\**\*.ts,docs\**\*.md -Pattern "FeatureName|/route-path|functionName"
```

### Крок 2. Визнач залежності перед видаленням

Перевір усе нижче:

- UI entry points
- route handlers
- middleware / RBAC
- repositories
- Prisma models/relations
- seed fixtures
- Playwright tests
- docs

Приклад для маршруту:

1. `app\some-feature\page.tsx`
2. links у `components\layout\site-header.tsx`
3. links у sections / CTA
4. middleware allow/deny
5. tests на route
6. sitemap / robots, якщо актуально

### Крок 3. Якщо є сумнів — спочатку сховай, не видаляй

Для ризикованих фіч:

1. прибери лінки / CTA
2. вимкни entry point
3. проганяй QA / E2E
4. тільки потім видаляй код

У цьому репо повноцінний feature-flag system не є стандартом, тому тимчасовим “flag” часто буде:

- прибраний route link
- condition в рендері
- `isActive` / `isPublished` gating

Але якщо фіча ризикована, краще додати явний config guard, ніж видаляти навмання.

### Крок 4. Видаляй шарами

Безпечна послідовність:

1. tests, які описують старий контракт
2. UI references
3. action handlers
4. repository methods
5. schema/seed only if they більше ніде не використовуються
6. docs

Ніколи не починай видалення з `schema.prisma`, якщо не прибрані callers.

### Крок 5. Після видалення перевір, що dead code реально зник

Корисно перевіряти:

```bash
git grep -n "deletedFeatureName"
git grep -n "/deleted-route"
```

Якщо це npm dependency-level cleanup:

```bash
npx depcheck
```

Але `depcheck` використовуй обережно: у Next.js / Prisma / config-driven проектах він може давати false positives.

## Конкретні інструменти та команди

Нижче не абстрактний список, а те, що реально корисно в цьому репо.

### Пошук по коду

#### PowerShell

```powershell
Select-String -Path app\**\*.ts,app\**\*.tsx,components\**\*.ts,components\**\*.tsx,lib\**\*.ts -Pattern "keyword"
```

```powershell
Get-ChildItem app,components,lib,prisma -Recurse | Select-Object FullName
```

### `rg` / ripgrep

```bash
rg -n "keyword" app components lib prisma docs
rg -n "action=|useActionState|useFormStatus|startTransition" app components
rg -n "findMany|findFirst|create|update|deleteMany|upsert" lib/repositories
```

### `git grep`

```bash
git grep -n "/portal/teacher"
git grep -n "getActiveTeachers"
git grep -n "SEED_PORTAL_PASSWORD"
```

### Git history

```bash
git log -- D:\2026\mathSchool\app\teachers\page.tsx
git log -S "Teacher" -- D:\2026\mathSchool\prisma\seed.ts
git blame D:\2026\mathSchool\lib\auth\session.ts
```

### Prisma

```bash
npm run db:studio
npm run db:verify
npm run db:seed
npm run db:reset
```

### Local quality gates

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run build
```

### IDE-функції

Використовуй не “Go to Definition” тільки, а саме:

- Find Usages
- Find Implementations
- Find in Files
- Call Hierarchy
- Type Hierarchy

Для цього проєкту це особливо корисно в:

- `lib/repositories/*`
- `actions.ts`
- `middleware.ts`
- `components/layout/site-header.tsx`
- `app/portal/*`

## Чекліст перед додаванням функціоналу

- [ ] Я знаю точний user flow цієї фічі
- [ ] Я знайшов аналогічну фічу в проєкті і наслідую її патерн
- [ ] Я знаю, який route/page є entry point
- [ ] Я знаю, який repository/model шар читає або пише дані
- [ ] Я перевірив auth/RBAC наслідки
- [ ] Я додав або оновив тести
- [ ] Я прогнав `npm run lint`
- [ ] Я прогнав `npx tsc --noEmit`
- [ ] Я прогнав релевантні Vitest tests
- [ ] Я прогнав `npm run test:e2e`, якщо фіча критична для користувача
- [ ] Я оновив docs

## Чекліст перед видаленням функціоналу

- [ ] Я знайшов усі route/UI entry points
- [ ] Я перевірив, чи немає callers у `app/`, `components/`, `lib/`
- [ ] Я перевірив references у `docs/`
- [ ] Я перевірив references у tests
- [ ] Я перевірив залежності в seed/schema/repositories
- [ ] Я прибрав user-facing entry points перед жорстким видаленням
- [ ] Я прогнав `git grep` по назві фічі після видалення
- [ ] Я прогнав `npm run lint`
- [ ] Я прогнав `npx tsc --noEmit`
- [ ] Я прогнав релевантні Vitest tests
- [ ] Я прогнав `npm run test:e2e`, якщо фіча зачіпає auth/forms/portal/admin

## Практичний старт за 15 хвилин

Якщо ти тільки зайшов у проєкт, ось мінімальний маршрут:

1. Прочитай:
   - `D:\2026\mathSchool\README.md`
   - `D:\2026\mathSchool\docs\qa-matrix.md`
   - `D:\2026\mathSchool\ai-progress.md`
2. Подивись структуру:
   - `app/`
   - `components/`
   - `lib/repositories/`
   - `prisma/`
3. Запусти локальні baseline checks:
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run test:e2e
   ```
4. Для DB-контексту:
   ```bash
   npm run db:verify
   npm run db:studio
   ```
5. Візьми одну конкретну фічу і віднови її ланцюжок:
   - route
   - page
   - component
   - action
   - repository
   - Prisma model
   - tests

Це дасть тобі більше реального розуміння проекту, ніж читання всіх файлів підряд.
