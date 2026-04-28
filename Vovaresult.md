1. **Executive summary**
- Current state of the product: the codebase is a partially integrated local MVP. The public site exists, role-based portals exist, contact and enrolment forms persist to PostgreSQL, admin 2FA exists, CMS pages exist, and basic teacher/student dashboards render real data. `npx tsc --noEmit` passes.
- What seems already implemented: canonical portal login at `/portal/login`; role-based redirects and middleware guards; public marketing pages; contact and enrol forms with Zod validation, rate limit, honeypot, and optional Turnstile; admin dashboard with enquiry/contact review; CMS CRUD for pages/blog/FAQ; teacher dashboard with grading action; student dashboard with homework submission; basic analytics queries; seed accounts for admin/teacher/parent/student.
- What prevents the product from being complete locally: the academic workflow is incomplete end to end; parent data ownership is not modeled correctly; public CMS/blog/FAQ integration is only partial; many admin/business models exist in Prisma but are not operable in UI; several actions lack validation and ownership checks; seed data is too shallow for full QA; some public pages still contain placeholder content; local DX is incomplete; `npm run lint` fails widely; current `npm run build` is blocked by a local `.next\trace` file lock.
- Biggest risks: schema changes around parent-child and class membership; RBAC and ownership gaps in server actions; disconnect between static marketing content and CMS/database content; large admin scope around academic master data and CRM workflows; hidden quality debt because `next.config.mjs` currently ignores lint during builds.

2. **Product completeness score**
- Public website: `58/100`
- Admin area: `55/100`
- Teacher portal: `42/100`
- Student portal: `46/100`
- Parent portal: `18/100`
- CMS: `52/100`
- Enquiries/contact/enrolment: `72/100`
- Educational workflow: `28/100`
- Local developer experience: `44/100`
- Overall local product readiness: `41/100`

3. **Complete task backlog**

**Phase 1 — Local foundation, seed data, and developer setup**

**P1-01 — Complete the local environment contract**
- Current problem: `.env.example` is not a full local contract. It omits `CRON_SECRET`, does not clearly document local SMTP behavior, and does not explain safe local defaults for Turnstile, 2FA, reminder jobs, and alert endpoints.
- Expected result: one complete local `.env.example` plus README guidance that lets a new developer run the full product locally without guessing environment variables.
- User role affected: Developer, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\.env.example`, `D:\2026\mathSchool\README.md`, `D:\2026\mathSchool\app\api\cron\automation\route.ts`, `D:\2026\mathSchool\lib\services\email.ts`
- Priority: Blocker
- Complexity: Small
- Dependencies: None
- Acceptance criteria: every env var used by local code is present in `.env.example`; local-safe defaults are documented; README explains which vars are optional locally and what behavior changes when they are unset.

**P1-02 — Add deterministic local database setup, reset, and reseed flow**
- Current problem: local setup is not one-command reproducible. There is no documented reset/reseed workflow and no clean “start from scratch” path for QA.
- Expected result: documented commands and scripts for generate, migrate, reset, reseed, and optional Prisma Studio.
- User role affected: Developer, QA
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\package.json`, `D:\2026\mathSchool\README.md`, `D:\2026\mathSchool\prisma`
- Priority: Blocker
- Complexity: Small
- Dependencies: P1-01
- Acceptance criteria: a new developer can reset the local DB and restore a usable demo state with one documented flow.

**P1-03 — Expand seed data to cover the full local product**
- Current problem: `prisma/seed.ts` only seeds minimal users, levels, subjects, and a couple of classes. Most models needed for real end-to-end QA are empty.
- Expected result: rich demo data for CMS, enquiries, contact leads, classes, homework, submissions, progress, tasks, subscriptions, payments, blog, FAQ, and academic relationships.
- User role affected: Admin, Teacher, Student, Parent, Developer, QA
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\prisma\seed.ts`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: Blocker
- Complexity: Large
- Dependencies: P1-02, P8-01, P7-01
- Acceptance criteria: all core product flows can be exercised locally with seeded accounts and seeded data, without manual DB inserts.

**P1-04 — Write complete local setup, demo, and QA documentation**
- Current problem: README is usable but not complete. It lacks a local QA script, reset flow, expected accounts walkthrough, local email behavior, and known limitations.
- Expected result: a complete local-only operating guide for developers and testers.
- User role affected: Developer, QA
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\README.md`, `D:\2026\mathSchool\docs`
- Priority: High
- Complexity: Small
- Dependencies: P1-01, P1-02, P1-03
- Acceptance criteria: README covers setup, reset, test accounts, seed data, manual QA entry points, and how to verify contact/enrol/auth/CMS/portal flows locally.

**Phase 2 — Auth, routing, sessions, and RBAC**

**P2-01 — Remove remaining legacy auth/portal ambiguity**
- Current problem: `/student-portal` is now a compatibility route, but auth actions and some naming still live under legacy files, which keeps routing and ownership logic harder to reason about.
- Expected result: one canonical mental model for portal auth, routing, and redirects, with legacy routes reduced to explicit compatibility redirects only.
- User role affected: Guest, Admin, Teacher, Student, Parent, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal`, `D:\2026\mathSchool\app\student-portal`, `D:\2026\mathSchool\components\layout\site-header.tsx`
- Priority: High
- Complexity: Medium
- Dependencies: None
- Acceptance criteria: no primary auth logic depends on legacy route structure; internal links point to `/portal/login` or canonical role dashboards; `/student-portal` is compatibility-only.

**P2-02 — Make redirects and unauthorized behavior fully consistent**
- Current problem: role redirects work, but cross-role access falls back to role dashboards instead of a clear access-denied state, and the admin 2FA step does not reliably preserve the original destination.
- Expected result: predictable auth flow for unauthenticated access, cross-role denial, `next` preservation, and post-login/post-2FA redirects.
- User role affected: Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\middleware.ts`, `D:\2026\mathSchool\lib\auth\session.ts`, `D:\2026\mathSchool\app\student-portal\actions.ts`, `D:\2026\mathSchool\app\portal\login\verify-2fa\page.tsx`
- Priority: Blocker
- Complexity: Medium
- Dependencies: P2-01
- Acceptance criteria: no redirect loops; protected routes always redirect unauthenticated users to `/portal/login?next=...`; successful login and 2FA land users on the intended allowed page; cross-role attempts show a deliberate UX.

**P2-03 — Add auth abuse protection and better session UX**
- Current problem: portal login lacks dedicated brute-force protection, clearer session expiry handling, and stronger local auth audit coverage.
- Expected result: login rate limiting, failed-login protection, clearer login/logout/session-expiry feedback, and audited auth events.
- User role affected: Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\student-portal\actions.ts`, `D:\2026\mathSchool\lib\security`, `D:\2026\mathSchool\lib\repositories\admin-audit-repository.ts`
- Priority: High
- Complexity: Medium
- Dependencies: P2-02
- Acceptance criteria: repeated bad login attempts are throttled locally; key auth events are auditable; expired/invalid sessions produce a clear re-login path.

**P2-04 — Audit middleware route map and remove route policy drift**
- Current problem: middleware protects some prefixes that have little or no corresponding route surface, and it currently rewrites `/pricing` to `/pricing-v2`, which appears unresolved in the app.
- Expected result: route rules match the actual product surface exactly, with no broken rewrites, no dead protected prefixes, and no accidental public/protected mismatches.
- User role affected: Guest, Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\middleware.ts`, `D:\2026\mathSchool\app`
- Priority: Blocker
- Complexity: Medium
- Dependencies: None
- Acceptance criteria: every middleware rule maps to a real route policy; no broken public rewrite remains; protected areas are secure by default and intentionally scoped.

**Phase 3 — Public website, forms, and enquiries**

**P3-01 — Fix broken public routing, navigation, and orphaned entry points**
- Current problem: public navigation and routing are not fully trustworthy. The `/pricing` rewrite is suspect, CMS/public page discoverability is partial, and some CTA expectations are stronger than the actual route surface.
- Expected result: all public nav items, footer links, CTA links, and static/CMS page routes resolve correctly and intentionally.
- User role affected: Guest
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\components\layout\site-header.tsx`, `D:\2026\mathSchool\components\layout\site-footer.tsx`, `D:\2026\mathSchool\middleware.ts`, `D:\2026\mathSchool\app`
- Priority: Blocker
- Complexity: Medium
- Dependencies: P2-04
- Acceptance criteria: clicking every public nav and CTA route works locally without 404s, rewrite surprises, or dead ends.

**P3-02 — Replace placeholder marketing content and align claims to local reality**
- Current problem: several public pages still contain sample or placeholder copy, and some sections promise platform features that are not fully implemented locally.
- Expected result: every public page reflects real local functionality, real operational content, or clearly scoped coming-soon messaging that is intentional.
- User role affected: Guest, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\fees\page.tsx`, `D:\2026\mathSchool\app\results\page.tsx`, `D:\2026\mathSchool\app\admissions\page.tsx`, `D:\2026\mathSchool\components\sections`, `D:\2026\mathSchool\lib\content.ts`
- Priority: High
- Complexity: Medium
- Dependencies: P9-01, P9-02, P9-03, P9-04
- Acceptance criteria: no user-visible placeholder copy remains on core public pages; all marketing claims are either implemented locally or intentionally adjusted.

**P3-03 — Finish local-first contact and enrolment success flows**
- Current problem: forms persist correctly, but user-facing completion UX is still minimal. There is no visible reference number, no admin-facing detail deep link, and local email behavior is not explicit.
- Expected result: strong local success UX, traceable submissions, and clear admin follow-up visibility.
- User role affected: Guest, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\contact\actions.ts`, `D:\2026\mathSchool\app\enrol\actions.ts`, `D:\2026\mathSchool\components\contact`, `D:\2026\mathSchool\components\enrol`, `D:\2026\mathSchool\app\(admin)\admin`
- Priority: High
- Complexity: Medium
- Dependencies: P4-01, P10-03
- Acceptance criteria: each successful form submission shows a clear success state, reference, and expected next step; admin can quickly find the created record locally.

**P3-04 — Replace hardcoded form catalogue data with database-driven options**
- Current problem: public forms and some content sections still use `lib/content.ts` for subjects, levels, and other catalogue-style data that already exists in Prisma.
- Expected result: one source of truth for subjects, levels, and similar structured options.
- User role affected: Guest, Admin, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\lib\content.ts`, `D:\2026\mathSchool\app\enrol`, `D:\2026\mathSchool\app\curriculum`, `D:\2026\mathSchool\app\subjects`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: High
- Complexity: Medium
- Dependencies: P4-04, P1-03
- Acceptance criteria: forms and public catalogue pages read structured data from DB-backed sources instead of duplicate hardcoded lists.

**Phase 4 — Admin workflows**

**P4-01 — Build full enquiries and contact lead management**
- Current problem: the admin dashboard shows lists, filters, and simple status updates, but there is no dedicated case-management workflow with detail views, search, pagination, timeline, or robust notes handling.
- Expected result: a usable local CRM-lite workflow for enrolment enquiries and contact leads.
- User role affected: Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin`, `D:\2026\mathSchool\lib\repositories\enquiry-repository.ts`, `D:\2026\mathSchool\lib\repositories\contact-lead-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P10-01, P10-03
- Acceptance criteria: admin can search, filter, paginate, open detail, edit status, add notes, and review a basic timeline for both enquiries and contact leads.

**P4-02 — Make ManagerTask operational in the admin UI**
- Current problem: `ManagerTask` exists in the schema and cron automation can create tasks, but admins cannot work with tasks in the product.
- Expected result: an internal tasks screen for viewing, assigning, updating, and completing operational tasks.
- User role affected: Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin`, `D:\2026\mathSchool\lib\repositories\automation-repository.ts`, `D:\2026\mathSchool\app\api\cron\automation\route.ts`
- Priority: High
- Complexity: Medium
- Dependencies: P1-01, P1-03
- Acceptance criteria: generated tasks are visible in admin, task statuses can be updated, and stale enquiry tasks are actionable.

**P4-03 — Add admin user and role management**
- Current problem: `AppUser` exists, helper queries exist, but there is no admin UI for managing accounts, roles, passwords/default credentials, or local account lifecycle.
- Expected result: a minimal but real local admin user-management toolset.
- User role affected: Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: High
- Complexity: Large
- Dependencies: P2-02, P10-01, P10-02
- Acceptance criteria: admin can list users, filter by role, create or activate local accounts, and update role-safe account metadata.

**P4-04 — Add admin CRUD for academic master data**
- Current problem: the educational models exist, but there is no admin UI to manage teachers, subjects, levels, teacher-subject assignment, and scheduled classes.
- Expected result: admins can maintain the school’s academic catalogue locally.
- User role affected: Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin`, `D:\2026\mathSchool\prisma\schema.prisma`, `D:\2026\mathSchool\lib\repositories`
- Priority: Blocker
- Complexity: Large
- Dependencies: P8-01, P10-01
- Acceptance criteria: admin can create, edit, and retire the academic entities needed for teacher/student/parent portals to function.

**P4-05 — Add admin visibility for subscriptions, payments, and business analytics inputs**
- Current problem: subscription and payment models exist and analytics read from them, but there is no admin workflow to inspect or maintain that data.
- Expected result: billing-related entities become visible and editable enough for local business-flow testing.
- User role affected: Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin\analytics`, `D:\2026\mathSchool\prisma\schema.prisma`, `D:\2026\mathSchool\lib\repositories\analytics-repository.ts`
- Priority: Medium
- Complexity: Medium
- Dependencies: P1-03, P10-01
- Acceptance criteria: seeded subscriptions and payments appear in admin; analytics inputs are inspectable and locally testable.

**P4-06 — Expand audit log coverage and audit log usability**
- Current problem: audit logging exists but only covers part of the admin/auth surface, and the viewer is limited.
- Expected result: admins can review meaningful audit trails for status changes, CMS edits, security changes, and critical educational actions.
- User role affected: Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin`, `D:\2026\mathSchool\lib\repositories\admin-audit-repository.ts`
- Priority: High
- Complexity: Medium
- Dependencies: P10-02, P10-03
- Acceptance criteria: audit log includes critical actions and can be filtered/read locally without raw DB access.

**Phase 5 — Teacher portal**

**P5-01 — Build real teacher class and schedule workflow**
- Current problem: the teacher dashboard shows classes and upcoming lessons, but there are no class detail pages or structured class management surfaces.
- Expected result: teachers can open a class, see its schedule, students, materials, assignments, and recent activity.
- User role affected: Teacher
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\teacher`, `D:\2026\mathSchool\app\portal\schedule`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`, `D:\2026\mathSchool\lib\repositories\schedule-repository.ts`
- Priority: High
- Complexity: Large
- Dependencies: P4-04, P8-01
- Acceptance criteria: teachers can navigate from dashboard cards to class-specific views with real schedule and roster context.

**P5-02 — Implement teacher course material management**
- Current problem: `CourseMaterial` exists but there is no teacher UI to create, edit, delete, or attach materials to subjects/classes.
- Expected result: teachers can manage lesson resources locally.
- User role affected: Teacher
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\teacher`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: Blocker
- Complexity: Large
- Dependencies: P4-04, P8-01, P8-03
- Acceptance criteria: teachers can create and manage materials, attach them to the correct academic context, and students can later consume them.

**P5-03 — Implement homework assignment CRUD and detail pages**
- Current problem: teacher homework creation is still a disabled placeholder, and there are no assignment detail pages or edit/delete flows.
- Expected result: full local homework authoring workflow for teachers.
- User role affected: Teacher
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\teacher\page.tsx`, `D:\2026\mathSchool\app\portal`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P5-01, P8-01, P10-01
- Acceptance criteria: teachers can create, edit, view, and archive assignments tied to the right class/subject and due date.

**P5-04 — Build submissions review and grading workflow safely**
- Current problem: a grading action exists, but it lacks Zod validation, deeper ownership checks, and a proper review UI/history.
- Expected result: teachers can review submissions, grade only allowed work, and leave structured feedback safely.
- User role affected: Teacher
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\actions.ts`, `D:\2026\mathSchool\app\portal\teacher`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P5-03, P10-01, P10-02
- Acceptance criteria: only the correct teacher can grade relevant submissions; feedback and grade states are visible and persist correctly.

**P5-05 — Add teacher progress-note and academic follow-up workflow**
- Current problem: `StudentProgress` and related repository logic exist, but there is no teacher UI for recording progress notes or structured academic feedback beyond assignment grading.
- Expected result: teachers can log progress notes and review ongoing student performance locally.
- User role affected: Teacher
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\teacher`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: High
- Complexity: Medium
- Dependencies: P5-01, P8-01
- Acceptance criteria: teachers can create and review progress notes linked to the correct student, subject, and academic context.

**Phase 6 — Student portal**

**P6-01 — Add student materials and class-resource access**
- Current problem: students currently see homework/progress, but there is no UI for course materials or structured class resources.
- Expected result: students can open their subjects/classes and access materials prepared by teachers.
- User role affected: Student
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\student`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P5-02, P8-01, P10-02
- Acceptance criteria: students can view only their own materials, organized by class/subject, with empty states when nothing is available.

**P6-02 — Build homework detail, submission history, and resubmission UX**
- Current problem: homework is shown in a compact dashboard format only. There is no dedicated detail page, no clean history view, and no resubmission workflow.
- Expected result: a usable local student homework workflow from “assigned” to “submitted” to “graded”.
- User role affected: Student
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\student`, `D:\2026\mathSchool\app\portal\actions.ts`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P5-03, P10-01
- Acceptance criteria: students can open assignment details, submit work, view submission timestamps/status, and review returned feedback/grades.

**P6-03 — Harden student ownership checks and submission validation**
- Current problem: `submitHomeworkAction` trusts the submitted homework ID too much and only enforces a non-empty URL. A student could potentially target work outside their allowed scope.
- Expected result: safe action-level ownership checks and validated submission input.
- User role affected: Student
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\actions.ts`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- Priority: Blocker
- Complexity: Medium
- Dependencies: P8-01, P10-01, P10-02
- Acceptance criteria: students can submit only to homework assigned to them or their class; malformed inputs are rejected with clear errors.

**P6-04 — Complete the student dashboard UX**
- Current problem: the student dashboard is useful but still incomplete. It lacks dedicated class links, clearer status grouping, and stronger loading/success/error states.
- Expected result: a coherent local student home screen that supports daily use.
- User role affected: Student
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\student`, `D:\2026\mathSchool\app\portal\schedule`
- Priority: High
- Complexity: Medium
- Dependencies: P6-01, P6-02, P11-01
- Acceptance criteria: the dashboard clearly shows upcoming lessons, homework status, grades/feedback, and direct entry points to resources and schedule.

**Phase 7 — Parent portal**

**P7-01 — Add a real parent-child relationship model**
- Current problem: the parent portal currently uses placeholder logic and does not model which student belongs to which parent. This is the biggest functional gap in the parent product.
- Expected result: explicit parent-child relationships in the schema and repository layer.
- User role affected: Parent, Admin, Student, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\prisma\schema.prisma`, `D:\2026\mathSchool\prisma\seed.ts`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P8-01
- Acceptance criteria: each parent account maps to one or more specific student accounts in local data, and repository queries use that relationship instead of placeholder assumptions.

**P7-02 — Build the real read-only parent dashboard**
- Current problem: the parent portal is effectively a placeholder. It does not show the child’s schedule, homework state, grades, or structured progress from real ownership-aware queries.
- Expected result: a genuine local parent experience focused on read-only child visibility.
- User role affected: Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\parent`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`, `D:\2026\mathSchool\app\portal\schedule`
- Priority: Blocker
- Complexity: Large
- Dependencies: P7-01, P6-01, P6-02, P5-05
- Acceptance criteria: parents can see their child’s progress, homework status, grades, feedback, and schedule without any edit capability.

**P7-03 — Enforce parent access scoping and multi-child behavior**
- Current problem: once parent-child relationships exist, the portal still needs strict scope enforcement and a clear multi-child UX.
- Expected result: parents can only access their own linked children and can switch context if multiple children are linked.
- User role affected: Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\middleware.ts`, `D:\2026\mathSchool\lib\auth\session.ts`, `D:\2026\mathSchool\lib\repositories\portal-repository.ts`, `D:\2026\mathSchool\app\portal\parent`
- Priority: Blocker
- Complexity: Medium
- Dependencies: P7-01, P7-02, P10-02
- Acceptance criteria: a parent cannot see another family’s student data; multi-child selection behaves predictably.

**Phase 8 — Core educational loop end-to-end**

**P8-01 — Repair the educational data model for real ownership and assignment**
- Current problem: class membership and ownership are too weak for a real school product. `ScheduledClass.participantUserIds` is an array, parent-child is missing, and educational records are not fully linked through classes/teachers/students.
- Expected result: a schema and repository model that supports real assignments, classes, ownership, and academic progression locally.
- User role affected: Admin, Teacher, Student, Parent, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\prisma\schema.prisma`, `D:\2026\mathSchool\lib\repositories`
- Priority: Blocker
- Complexity: Large
- Dependencies: None
- Acceptance criteria: the schema can express which students are in which class, which teacher owns which class/subject, which parents are linked to which students, and how homework/materials/progress attach to that structure.

**P8-02 — Connect the full academic loop across roles**
- Current problem: there is no complete local workflow from accepted enquiry to enrolled student to assigned class to teacher materials to homework to submission to grade to parent visibility.
- Expected result: one continuous local academic lifecycle across admin, teacher, student, and parent roles.
- User role affected: Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin`, `D:\2026\mathSchool\app\portal`, `D:\2026\mathSchool\lib\repositories`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: Blocker
- Complexity: Large
- Dependencies: P4-04, P5-02, P5-03, P5-04, P6-01, P6-02, P7-01, P8-01
- Acceptance criteria: locally, an admin can configure the academic entities, a teacher can publish work, a student can consume and submit work, and a parent can observe outcomes for the correct child.

**P8-03 — Add local-first file and material handling**
- Current problem: homework submissions currently only accept a URL, and course materials have no local file-handling strategy. The product needs a local solution before cloud storage exists.
- Expected result: a safe local-first approach for material links and, if implemented, local dev-only file storage that can later be abstracted behind cloud storage.
- User role affected: Teacher, Student, Admin, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal`, `D:\2026\mathSchool\prisma\schema.prisma`, `D:\2026\mathSchool\public`, `D:\2026\mathSchool\lib`
- Priority: High
- Complexity: Medium
- Dependencies: P5-02, P6-02, P10-01
- Acceptance criteria: teachers and students can attach materials/submissions locally using the chosen local-first strategy; storage expectations are documented; cloud storage is not required for local use.

**P8-04 — Add comprehensive academic seed scenarios for end-to-end QA**
- Current problem: even with schema and UI fixes, QA will be weak unless seeded data covers multiple classes, multiple homework states, graded/ungraded submissions, and parent-linked families.
- Expected result: seeded end-to-end academic scenarios for realistic local testing.
- User role affected: Admin, Teacher, Student, Parent, QA
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\prisma\seed.ts`
- Priority: High
- Complexity: Medium
- Dependencies: P1-03, P7-01, P8-01, P8-02
- Acceptance criteria: seeded data demonstrates at least one complete academic lifecycle and at least one negative/empty-state scenario per role.

**Phase 9 — CMS and public content integration**

**P9-01 — Wire FAQ CMS to the public FAQ experience**
- Current problem: `FaqItem` exists and has admin CRUD, but the public FAQ still uses hardcoded content.
- Expected result: public FAQ is DB/CMS-backed and respects publish state.
- User role affected: Guest, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\(admin)\admin\cms`, `D:\2026\mathSchool\components\sections\faq-section.tsx`, `D:\2026\mathSchool\lib\content.ts`, `D:\2026\mathSchool\lib\repositories\cms-repository.ts`
- Priority: Blocker
- Complexity: Medium
- Dependencies: P1-03, P10-01
- Acceptance criteria: adding or publishing an FAQ item in admin changes the public FAQ without code edits.

**P9-02 — Build public blog listing and detail routes**
- Current problem: `BlogPost` admin CRUD exists, but the public blog is a static stub with no post rendering.
- Expected result: a real local blog pipeline with publish-aware listing and detail routes.
- User role affected: Guest, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\blog`, `D:\2026\mathSchool\app\(admin)\admin\cms`, `D:\2026\mathSchool\lib\repositories\cms-repository.ts`
- Priority: Blocker
- Complexity: Large
- Dependencies: P1-03, P10-01
- Acceptance criteria: published blog posts appear publicly; unpublished posts do not; slugs are stable and usable locally.

**P9-03 — Move teacher/testimonial/public profile content to DB-backed sources**
- Current problem: the teachers and testimonials shown publicly are still hardcoded even though matching models exist.
- Expected result: public staff and social-proof sections use managed data instead of duplicated static arrays.
- User role affected: Guest, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\teachers\page.tsx`, `D:\2026\mathSchool\components\sections\testimonials-section.tsx`, `D:\2026\mathSchool\lib\content.ts`, `D:\2026\mathSchool\prisma\schema.prisma`
- Priority: High
- Complexity: Medium
- Dependencies: P4-04, P1-03
- Acceptance criteria: admin-managed teacher/testimonial data is reflected publicly and no conflicting hardcoded version remains active.

**P9-04 — Define and implement ownership of static pages vs CMS pages**
- Current problem: `PageContent` is publicly rendered at `/pages/[slug]`, but major public pages still live as hardcoded route files. Content ownership is unclear and editors cannot predict what belongs in CMS.
- Expected result: an explicit model for which pages stay coded and which become CMS-managed, including reserved slug rules and editor-facing expectations.
- User role affected: Admin, Guest, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\pages`, `D:\2026\mathSchool\app\(admin)\admin\cms`, `D:\2026\mathSchool\docs\cms-pages-visibility-audit.md`, `D:\2026\mathSchool\lib\cms\provider.ts`
- Priority: High
- Complexity: Large
- Dependencies: P9-01, P9-02
- Acceptance criteria: the team can state exactly where new content belongs; public rendering behavior is predictable; dead CMS abstractions are either wired or removed.

**Phase 10 — Validation, API routes, and Server Actions**

**P10-01 — Add schema validation to every important action and route**
- Current problem: public form actions are validated, but many admin, portal, CMS, and API entry points still parse raw `FormData` or query params without comprehensive Zod schemas.
- Expected result: all important server actions and API routes use explicit schemas and reject malformed input consistently.
- User role affected: Admin, Teacher, Student, Parent, Guest, Developer
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\contact\actions.ts`, `D:\2026\mathSchool\app\enrol\actions.ts`, `D:\2026\mathSchool\app\student-portal\actions.ts`, `D:\2026\mathSchool\app\portal\actions.ts`, `D:\2026\mathSchool\app\(admin)\admin\actions.ts`, `D:\2026\mathSchool\app\(admin)\admin\cms\actions.ts`, `D:\2026\mathSchool\app\api`
- Priority: Blocker
- Complexity: Large
- Dependencies: None
- Acceptance criteria: each important write path validates its input with a schema and returns structured errors instead of implicit failure or ad hoc parsing.

**P10-02 — Enforce auth, role, and ownership checks at every write path**
- Current problem: some portal actions rely on the user being logged in but do not verify enough ownership context. This is especially visible around homework submission and grading.
- Expected result: every action and API route enforces the correct caller role and record ownership.
- User role affected: Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\actions.ts`, `D:\2026\mathSchool\app\(admin)\admin\actions.ts`, `D:\2026\mathSchool\app\api`, `D:\2026\mathSchool\lib\repositories`
- Priority: Blocker
- Complexity: Large
- Dependencies: P8-01, P10-01
- Acceptance criteria: no write path can be used to alter data outside the authenticated user’s allowed scope.

**P10-03 — Standardize error handling, result shapes, and user-visible feedback**
- Current problem: some actions revalidate silently, some return strings, some throw, and many screens lack consistent success/error surfacing.
- Expected result: one predictable pattern for action results and user messaging across public, admin, and portal flows.
- User role affected: Guest, Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app`, `D:\2026\mathSchool\components`
- Priority: Blocker
- Complexity: Large
- Dependencies: P10-01
- Acceptance criteria: users always see a clear loading, success, or error outcome when they trigger a write action.

**P10-04 — Remove or wire disconnected actions, routes, and env dependencies**
- Current problem: there are repository helpers, CMS/provider stubs, middleware prefixes, and env dependencies that are only partially wired into the product.
- Expected result: no important code path remains half-connected without a clear reason.
- User role affected: Developer, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\lib\cms\provider.ts`, `D:\2026\mathSchool\lib\repositories`, `D:\2026\mathSchool\middleware.ts`, `D:\2026\mathSchool\app\api`
- Priority: High
- Complexity: Medium
- Dependencies: P10-01, P10-02
- Acceptance criteria: each major repository action is either used by a real feature, intentionally documented as deferred, or removed from the active local scope.

**Phase 11 — UI states, placeholders, and polish**

**P11-01 — Complete loading, empty, error, success, and disabled states**
- Current problem: many surfaces render data but do not fully handle empty/loading/error states, especially around admin actions, grading, submissions, and CMS writes.
- Expected result: every important screen behaves clearly across the full state matrix.
- User role affected: Guest, Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app`, `D:\2026\mathSchool\components`
- Priority: High
- Complexity: Medium
- Dependencies: P10-03
- Acceptance criteria: no important user flow leaves the user guessing whether an action is in progress, failed, succeeded, or returned no data.

**P11-02 — Remove or replace all visible placeholders and misleading UI**
- Current problem: the product still exposes disabled controls and fake-complete sections such as the teacher “Create Assignment” button, the disabled theme toggle, sample pricing/results content, and decorative dashboard blocks.
- Expected result: either the feature works locally or the UI no longer implies it does.
- User role affected: Guest, Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal\teacher\page.tsx`, `D:\2026\mathSchool\components\layout\theme-toggle.tsx`, `D:\2026\mathSchool\app\fees\page.tsx`, `D:\2026\mathSchool\app\results\page.tsx`, `D:\2026\mathSchool\components\sections`
- Priority: High
- Complexity: Medium
- Dependencies: P3-02, P5-03
- Acceptance criteria: no user-visible placeholder or disabled action remains on a supposedly complete local product.

**P11-03 — Run a responsive and accessibility pass**
- Current problem: key UI flows work, but mobile/tablet and keyboard/accessibility coverage is not yet a verified, complete product-quality pass.
- Expected result: public site, admin area, and portals are locally usable across common breakpoints and interaction modes.
- User role affected: Guest, Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\components`, `D:\2026\mathSchool\app`
- Priority: High
- Complexity: Medium
- Dependencies: P11-01, P11-02
- Acceptance criteria: header, mobile menu, forms, tables, dashboards, and CMS screens are usable on desktop and mobile with proper semantics and focus behavior.

**P11-04 — Normalize date, time, and content consistency**
- Current problem: schedules, reminders, and portal content need consistent timezone language, formatting, and terminology so the product feels coherent locally.
- Expected result: consistent school-facing language across dashboards, reminders, and public pages.
- User role affected: Guest, Admin, Teacher, Student, Parent
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\app\portal`, `D:\2026\mathSchool\components`, `D:\2026\mathSchool\lib\content.ts`
- Priority: Medium
- Complexity: Small
- Dependencies: P11-01
- Acceptance criteria: dates, times, grades, and content labels are formatted consistently across the product.

**Phase 12 — Local QA, testing, and final cleanup**

**P12-01 — Restore a clean local quality baseline**
- Current problem: TypeScript passes, but `npm run lint` fails heavily and current `npm run build` is blocked by a local `.next\trace` file lock. Also builds currently ignore lint.
- Expected result: repeatable local `lint`, `typecheck`, and `build` without hidden quality bypasses.
- User role affected: Developer, QA
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\package.json`, `D:\2026\mathSchool\next.config.mjs`, `D:\2026\mathSchool\biome.json`, `D:\2026\mathSchool\.next`
- Priority: Blocker
- Complexity: Medium
- Dependencies: Most implementation phases
- Acceptance criteria: `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass locally on a clean checkout with documented prerequisites.

**P12-02 — Create a role-based manual QA matrix**
- Current problem: there is no formal end-to-end QA checklist for guest, admin, teacher, student, and parent flows.
- Expected result: one local QA matrix covering happy path, empty state, validation error, and access-denied cases.
- User role affected: QA, Developer, Admin
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\README.md`, `D:\2026\mathSchool\docs`
- Priority: High
- Complexity: Small
- Dependencies: P1-04, P8-04
- Acceptance criteria: a tester can run through defined scenarios for every role and mark pass/fail without inventing their own flow.

**P12-03 — Add automated smoke tests for critical local flows**
- Current problem: there are no automated tests configured, so regressions in auth, forms, and role protection will be easy to introduce.
- Expected result: a minimal automated safety net around login, RBAC, public forms, and critical portal actions.
- User role affected: Developer, QA
- Affected files/folders/areas if identifiable: `D:\2026\mathSchool\package.json`, `D:\2026\mathSchool\app`, `D:\2026\mathSchool\lib`
- Priority: High
- Complexity: Medium
- Dependencies: P12-01
- Acceptance criteria: at least critical smoke flows run locally and catch regressions in auth/RBAC/forms.

**P12-04 — Run a clean-machine local completion rehearsal**
- Current problem: the project is not yet proven as a truly self-contained local product on a fresh environment.
- Expected result: a final rehearsal from clone to reset to seed to QA on a clean machine profile.
- User role affected: Developer, QA
- Affected files/folders/areas if identifiable: whole repository
- Priority: High
- Complexity: Small
- Dependencies: P12-01, P12-02, P12-03
- Acceptance criteria: the full local product can be set up and exercised end to end from documented steps only.

**Phase 13 — Post-local product tasks for later DevOps/cloud work**

**P13-01 — Replace local-first file handling with production object storage**
- Current problem: local-first file/material handling is the right near-term scope, but durable production storage is not yet addressed.
- Expected result: later integration with S3/R2/Vercel Blob or equivalent behind a clean storage abstraction.
- User role affected: Admin, Teacher, Student, Developer
- Affected files/folders/areas if identifiable: future work across `D:\2026\mathSchool\app`, `D:\2026\mathSchool\lib`, storage adapters
- Priority: Low
- Complexity: Large
- Dependencies: P8-03
- Acceptance criteria: deferred until local workflows are stable; not required for local completion.

**P13-02 — Production email deliverability and DNS-backed auth hardening**
- Current problem: local SMTP can be good enough for development, but real SPF/DKIM/DMARC and production-grade email/SSO hardening are outside local completion.
- Expected result: production-ready email and identity setup later.
- User role affected: Admin, Developer
- Affected files/folders/areas if identifiable: future infra and provider configuration
- Priority: Low
- Complexity: Medium
- Dependencies: Local product completion
- Acceptance criteria: explicitly deferred until post-local launch work.

**P13-03 — Deployment, domains, monitoring, external cron, and CI/CD**
- Current problem: there are monitoring and cron hooks in the repo, but production operationalization is not the current goal.
- Expected result: later staging/production deployment pipeline and operational controls.
- User role affected: Developer, Admin
- Affected files/folders/areas if identifiable: future work across deployment, domains, uptime, alerts, cron, CI
- Priority: Low
- Complexity: Large
- Dependencies: Local product completion
- Acceptance criteria: explicitly deferred until the local product is complete.

**P13-04 — Infrastructure as code, Terraform, and Kubernetes if scale justifies it**
- Current problem: the repo already has some architecture thinking, but infra automation and orchestration would be premature before local product completeness.
- Expected result: later infrastructure formalization only if traffic and ops complexity require it.
- User role affected: Developer
- Affected files/folders/areas if identifiable: future infrastructure repos/configuration
- Priority: Low
- Complexity: Large
- Dependencies: P13-03
- Acceptance criteria: explicitly deferred; not part of local completion.

4. **Blockers**
- `P1-01` Complete the local environment contract
- `P1-02` Add deterministic local database setup, reset, and reseed flow
- `P1-03` Expand seed data to cover the full local product
- `P2-02` Make redirects and unauthorized behavior fully consistent
- `P2-04` Audit middleware route map and remove route policy drift
- `P3-01` Fix broken public routing, navigation, and orphaned entry points
- `P4-01` Build full enquiries and contact lead management
- `P4-04` Add admin CRUD for academic master data
- `P5-02` Implement teacher course material management
- `P5-03` Implement homework assignment CRUD and detail pages
- `P5-04` Build submissions review and grading workflow safely
- `P6-01` Add student materials and class-resource access
- `P6-02` Build homework detail, submission history, and resubmission UX
- `P6-03` Harden student ownership checks and submission validation
- `P7-01` Add a real parent-child relationship model
- `P7-02` Build the real read-only parent dashboard
- `P7-03` Enforce parent access scoping and multi-child behavior
- `P8-01` Repair the educational data model for real ownership and assignment
- `P8-02` Connect the full academic loop across roles
- `P9-01` Wire FAQ CMS to the public FAQ experience
- `P9-02` Build public blog listing and detail routes
- `P10-01` Add schema validation to every important action and route
- `P10-02` Enforce auth, role, and ownership checks at every write path
- `P10-03` Standardize error handling, result shapes, and user-visible feedback
- `P12-01` Restore a clean local quality baseline

5. **Quick wins**
- Add missing `CRON_SECRET` and local env guidance to `.env.example`.
- Document the exact reset/reseed flow in the README.
- Remove or fix the `/pricing` to `/pricing-v2` rewrite.
- Preserve `next` across admin 2FA so users land where they intended.
- Replace the disabled teacher `Create Assignment` button with either a real route or no button.
- Wire public FAQ to `FaqItem`; the admin side already exists.
- Turn the public blog stub into a simple published-post list.
- Show submission reference IDs and next-step text after contact/enrol success.
- Remove or implement the disabled theme toggle.
- Add visible success/error feedback to admin status updates and reminder dispatch.
- Add Zod validation to `app\portal\actions.ts`.
- Seed at least one graded and one ungraded homework submission.

6. **Risky tasks**
- `P8-01` Repair the educational data model for real ownership and assignment.
- `P7-01` Add a real parent-child relationship model.
- `P10-02` Enforce auth, role, and ownership checks at every write path.
- `P4-03` Add admin user and role management.
- `P4-04` Add admin CRUD for academic master data.
- `P8-02` Connect the full academic loop across roles.
- `P9-04` Define and implement ownership of static pages vs CMS pages.
- `P12-01` Restore a clean local quality baseline, because lint/build cleanup can touch many files.

7. **Recommended implementation order**
1. `P1-01`
2. `P1-02`
3. `P2-04`
4. `P3-01`
5. `P2-01`
6. `P2-02`
7. `P10-01`
8. `P10-02`
9. `P8-01`
10. `P7-01`
11. `P4-04`
12. `P1-03`
13. `P8-04`
14. `P5-01`
15. `P5-02`
16. `P5-03`
17. `P5-04`
18. `P5-05`
19. `P6-01`
20. `P6-02`
21. `P6-03`
22. `P6-04`
23. `P7-02`
24. `P7-03`
25. `P8-02`
26. `P8-03`
27. `P4-01`
28. `P4-02`
29. `P4-03`
30. `P4-05`
31. `P4-06`
32. `P9-01`
33. `P9-02`
34. `P9-03`
35. `P9-04`
36. `P3-04`
37. `P3-03`
38. `P3-02`
39. `P10-03`
40. `P10-04`
41. `P2-03`
42. `P11-01`
43. `P11-02`
44. `P11-03`
45. `P11-04`
46. `P1-04`
47. `P12-01`
48. `P12-02`
49. `P12-03`
50. `P12-04`
51. `P13-01`
52. `P13-02`
53. `P13-03`
54. `P13-04`

8. **Recommended next 10 Codex tasks**
1. **Complete local env contract**
   - Prompt-ready description: `Audit all environment variable usage in the repo, update .env.example so it includes every variable required for local development, add clear local-safe defaults/comments, and update README with a local env setup section. Do not add production deployment guidance.`

2. **Add DB reset and reseed scripts**
   - Prompt-ready description: `Add a deterministic local database reset and reseed workflow. Update package.json scripts and README so a developer can reset, migrate, generate Prisma client, seed demo data, and open Prisma Studio locally.`

3. **Fix middleware route drift**
   - Prompt-ready description: `Audit middleware.ts and remove or fix broken route policy drift, especially the /pricing rewrite and any dead protected prefixes. Keep route protection behavior intact and minimal.`

4. **Preserve next through admin 2FA**
   - Prompt-ready description: `Update the portal login and admin 2FA flow so the original next destination is preserved through authentication and verification, with no redirect loops.`

5. **Add Zod validation to portal actions**
   - Prompt-ready description: `Add explicit Zod validation to app/portal/actions.ts for homework submission and grading actions. Return structured errors without changing UI design.`

6. **Add ownership checks to homework actions**
   - Prompt-ready description: `Harden teacher grading and student submission actions so they verify role and record ownership correctly. A student must only submit to allowed homework, and a teacher must only grade submissions for their own assigned classes.`

7. **Wire public FAQ to the CMS**
   - Prompt-ready description: `Replace the hardcoded public FAQ data with published FaqItem records from the database. Keep the current public FAQ layout and only change data wiring.`

8. **Build public blog listing**
   - Prompt-ready description: `Replace the static blog stub with a real public blog listing page backed by published BlogPost records. Keep the current design direction and add correct empty-state behavior.`

9. **Add form success references**
   - Prompt-ready description: `Improve contact and enrol success UX so users see a clear confirmation state, a local reference ID, and expected next steps. Do not redesign the forms.`

10. **Create ManagerTask admin screen**
   - Prompt-ready description: `Implement a minimal admin ManagerTask screen to list tasks, filter by status, view task context, and mark tasks complete. Reuse existing admin patterns and data models.`

9. **Definition of Done for local product completion**
- A new developer can clone the repo, configure `.env` from `.env.example`, run one documented local setup flow, and reach a usable seeded product.
- The local database can be reset and reseeded deterministically.
- Seed data covers admin, teacher, student, and parent end-to-end scenarios, including CMS content and academic workflows.
- `/portal/login` is the single canonical portal login route.
- Protected routes enforce authentication and role access consistently, with no redirect loops.
- Admin 2FA works locally and preserves intended destinations where allowed.
- Public navigation, footer links, CTA links, CMS pages, and static routes all resolve correctly.
- Contact and enrol forms validate, persist, show clear success/error states, and are visible in admin.
- Admin can manage enquiries and contact leads with search/filter/detail/status/notes.
- Admin can manage the academic master data required to operate the school locally.
- Admin can work with internal tasks and review meaningful audit logs.
- FAQ content is managed in admin and rendered publicly.
- Blog posts are managed in admin and rendered publicly.
- Public teacher/testimonial/content sources are no longer split between hardcoded and DB-managed versions without a clear ownership model.
- Teachers can view classes, manage materials, create homework, review submissions, grade work, and record progress notes.
- Students can access schedule, materials, homework details, submit work, view submission history, and see grades/feedback.
- Parents can view only their own linked child or children, with read-only access to schedule, homework status, grades, feedback, and progress.
- The educational data model correctly represents class membership, teacher ownership, parent-child links, and academic records.
- All important server actions and API routes use schema validation.
- All important write paths enforce auth, role, and ownership checks.
- Every important user action has clear loading, success, error, and empty-state UX.
- No major placeholder, fake-complete UI, or disabled dead-end control remains visible in the local product.
- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- `npm run build` passes on a clean local environment.
- A documented manual QA matrix exists for all roles and critical flows.
- A minimal automated smoke suite exists for auth, RBAC, public forms, and core portal actions.
- A clean-machine rehearsal confirms the product is fully operable locally without DevOps or cloud dependencies.
