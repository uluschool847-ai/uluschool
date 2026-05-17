# Product Requirements Document (PRD)

## 1. Product Summary

**Product name:** Math School  
**Repository path:** `D:\2026\mathSchool`

Math School is a single Next.js application that combines:

- a public marketing site for **ULU Online School**
- authenticated portals for **Student**, **Teacher**, **Parent**, and **Admin**
- a built-in CRM/CMS
- local billing visibility and analytics tooling
- seeded local development workflows for QA and product iteration

The product is designed to support the full lifecycle from public lead capture to internal academic operations.

## 2. Problem Statement

The school needs one system that supports:

- public discovery and trust-building
- enquiry and enrolment capture
- authenticated academic operations for families and staff
- internal admin workflows for CRM, CMS, billing visibility, and audits

Without a unified product, teams would need to coordinate across separate tools for:

- marketing content
- lead capture
- portal access
- homework and progress tracking
- internal admin operations

That fragmentation increases operational overhead, slows down follow-up, and makes QA harder.

## 3. Product Goals

### Primary goals

1. Provide a working public site that can capture leads and enrolment interest.
2. Provide role-based portals for Student, Teacher, Parent, and Admin.
3. Provide an internal admin surface for CRM, CMS, security, audit, billing visibility, and analytics.
4. Make the product runnable locally with seeded accounts and repeatable smoke coverage.

### Secondary goals

1. Standardize feedback/error handling across forms and actions.
2. Improve accessibility and responsive behavior across primary surfaces.
3. Keep the stack unified on Next.js + Prisma + PostgreSQL.

## 4. Non-Goals

The following are explicitly not in current committed scope:

1. Full production object storage migration
   - current storage is local-first
   - object storage remains deferred future work
2. Live production payment processing
   - billing is visible and operable at the data/UI level
   - there is no full Stripe/PayPal live flow integrated end-to-end
3. External headless CMS replacement
   - CMS is custom and Prisma-backed
4. Full multi-tenant architecture
5. Fully automated background worker runtime
   - cron-style automation is routed through authenticated API endpoints

## 5. User Roles

### Guest

Can:

- browse public pages
- read blog content
- view published CMS content
- submit contact enquiries
- submit enrolment requests
- open login page

Cannot:

- access protected portal routes
- access admin surfaces

### Student

Can:

- log into `/portal/student`
- view assignments
- view grades and feedback
- view progress notes
- view schedule
- submit homework

Cannot:

- access teacher portal
- access admin routes

### Teacher

Can:

- log into `/portal/teacher`
- view dashboard metrics
- view classes and assignments
- review and grade submissions
- manage homework-related workflows
- view schedule
- manage progress notes

Cannot:

- access student portal as a student
- access admin surfaces

### Parent

Can:

- log into `/portal/parent`
- view linked child information
- review child homework status
- review grades and progress

Cannot:

- access student or teacher portal surfaces
- access admin surfaces

### Admin

Can:

- access `/admin`
- manage users
- manage tasks
- work with CRM enquiries and leads
- review audit logs
- work in CMS
- review billing data
- access security / 2FA setup flows
- use analytics pages

Cannot:

- use student/teacher portal routes as role-equivalent product areas

## 6. In-Scope Product Areas

## 6.1 Public Marketing Site

Current public routes include:

- `/`
- `/about`
- `/admissions`
- `/contact`
- `/curriculum`
- `/fees`
- `/results`
- `/subjects`
- `/teachers`
- `/blog`
- `/pages`

Requirements:

- pages must render without placeholder/sample content
- pages must be accessible and responsive
- public pages must not expose disabled fake controls
- content sections must be meaningful and production-like

## 6.2 Contact Form

Route:

- `/contact`

Requirements:

- form loads for guests
- field labels and required indicators are accessible
- invalid input shows validation feedback
- successful submission shows user-visible confirmation
- submission creates a CRM lead path usable by admin

## 6.3 Enrolment Form

Route:

- `/enrol`

Requirements:

- multi-step flow
- client and server validation
- success confirmation with reference ID / next-step messaging
- no silent failure states

## 6.4 Authentication and Session UX

Routes:

- `/portal/login`
- `/portal/login/verify-2fa`

Requirements:

- seeded users can log in locally
- invalid credentials show clear error feedback
- login brute-force protection exists
- expired sessions redirect with `reason=expired`
- invalid sessions redirect with `reason=invalid`
- callback URL preservation for protected routes

## 6.5 Student Portal

Route:

- `/portal/student`

Related route:

- `/portal/schedule`

Requirements:

- assignments visible for data-rich seeded student
- progress and grades visible
- schedule renders correctly
- submission flow works
- empty-state student account renders graceful empty status messages

## 6.6 Teacher Portal

Route:

- `/portal/teacher`

Related route:

- `/portal/schedule`

Requirements:

- metrics visible
- classes and assignments visible
- pending submissions visible
- grading and archive/update actions return visible feedback
- empty-state teacher account renders safe empty widgets

## 6.7 Parent Portal

Route:

- `/portal/parent`

Requirements:

- linked child dashboard visible for seeded parent
- no-child state visible for onboarding parent
- page remains accessible and responsive

## 6.8 Admin Dashboard and Admin Tools

Primary routes:

- `/admin`
- `/admin/users`
- `/admin/tasks`
- `/admin/billing`
- `/admin/audit`
- `/admin/analytics`
- `/admin/security`
- `/admin/cms`
- `/admin/enquiries/[id]`
- `/admin/leads`
- `/admin/submissions`

Requirements:

- analytics summary on dashboard
- CRM summaries for enquiries/leads
- global search by reference ID
- user management
- task management
- billing visibility and refund/status UI behavior
- audit log visibility
- CMS editing surface
- no silent write actions

## 6.9 CMS

Current CMS areas:

- Pages
- Blog
- FAQ

Requirements:

- admin-only access
- list/edit flows
- published content appears on public routes
- reserved slug validation
- empty CMS states handled safely

## 6.10 Public Teachers Surface

Route:

- `/teachers`

Requirements:

- page uses `Teacher` marketing profiles, not `AppUser` records
- page must show active teacher profiles after seed/reset
- profiles must include:
  - `fullName`
  - `title`
  - `bio`
- seed must create at least 2 active `Teacher` records

## 7. Functional Requirements

### FR-1 Public lead capture

The system must allow guests to submit:

- contact enquiries
- enrolment requests

Expected outcome:

- submissions persist
- users receive visible confirmation
- admins can later work with resulting records

### FR-2 Role-based access control

The system must restrict access by role using middleware and session validation.

Expected outcome:

- guest access to protected routes redirects to login
- wrong-role access redirects to unauthorized/login handling
- role-specific header links remain accurate

### FR-3 Role-specific dashboards

Each role must have a meaningful dashboard or empty state.

Expected outcome:

- Student sees assignments/progress
- Teacher sees operational teaching data
- Parent sees linked-child overview
- Admin sees business and operational summaries

### FR-4 CMS-backed public content

The system must serve public content from DB-backed CMS entities where applicable.

Expected outcome:

- Pages, Blog, FAQ are manageable by Admin
- public routes show published content only

### FR-5 Admin operational tooling

The system must provide internal tools for:

- CRM follow-up
- user management
- task management
- audit visibility
- billing visibility
- CMS editing

### FR-6 Local QA readiness

The system must be locally testable using:

- seeded accounts
- seeded database data
- smoke E2E tests
- lint/typecheck/build checks

## 8. Non-Functional Requirements

### Accessibility

The product must:

- provide proper landmarks
- avoid misleading disabled fake controls
- expose accessible form feedback
- expose accessible table semantics
- support keyboard interaction for critical controls

### Responsive behavior

The product must remain usable on:

- mobile widths around 375px
- tablet widths
- desktop widths

### Error handling

The product must not silently fail on critical write actions.

Expected:

- loading feedback
- success feedback
- error feedback
- generic fallback on unexpected failure

### Security

The product must include:

- signed session cookies
- login rate limiting
- admin 2FA setup path
- protected cron/admin endpoints via secrets/tokens

### Local developer repeatability

The product should support:

- install
- env setup
- db seed/reset
- lint
- typecheck
- build
- smoke E2E

Note:

- there is still known migration/schema hygiene debt around Prisma lifecycle consistency

## 9. Seeded Local Development Expectations

The local product currently depends on seeded records for meaningful QA.

Expected seeded account groups:

- `fixed.student@uluglobalacademy.com`
- `fixed.teacher@uluglobalacademy.com`
- `fixed.parent@uluglobalacademy.com`
- `fixed.admin@uluglobalacademy.com`
- `freshstudent@uluglobalacademy.com`
- `newteacher@uluglobalacademy.com`
- `onboardingparent@uluglobalacademy.com`

Expected seeded public teacher profiles:

- `Jane Doe`
- `John Smith`
- `Alice Brown`

## 10. Success Criteria

The current product should be considered functionally healthy when all of the following are true:

1. Public pages render meaningful content without placeholder copy.
2. Contact and enrol forms validate and submit with user-visible feedback.
3. Auth flow works locally for all seeded roles.
4. Protected routes enforce RBAC correctly.
5. Student, Teacher, Parent, and Admin dashboards render either rich data or clear empty states.
6. Admin CRUD/write actions provide success/error feedback.
7. `/teachers` renders active teacher profiles after seed/reset.
8. Local quality checks pass:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run test:e2e`

## 11. Known Risks and Constraints

### 11.1 Prisma migration/schema consistency

Known technical debt exists around local DB lifecycle consistency.

Impact:

- `db:reset` / `db:seed` flows have historically shown drift behavior
- this should be treated as an active engineering concern

### 11.2 Local-first file storage

Uploads/materials currently rely on local-first storage behavior.

Impact:

- not yet production-grade for durable object storage

### 11.3 Billing scope

Billing UI and records exist, but full live processor integration is not current committed scope.

### 11.4 Email and external integrations

Local email and reminder behavior depend on environment configuration and may degrade to safe no-op/logging behavior in local development.

## 12. Deferred / Future Scope

The following are valid roadmap items but not required for current local completion:

1. Production object storage abstraction:
   - S3
   - Cloudflare R2
   - Vercel Blob
2. Full migration hygiene cleanup
3. More robust background job/runtime separation
4. Stronger reporting and BI depth
5. Broader CMS coverage beyond current content types

## 13. Developer Quality Gates

Before shipping meaningful changes, the minimum expected checks are:

```bash
npm run lint
npx tsc --noEmit
npm run test:e2e
```

For DB-sensitive changes:

```bash
npm run db:reset
npm run db:seed
npm run db:verify
```

For targeted contract verification:

```bash
npx vitest run <specific-test-file>
```

## 14. Supporting Documents

See also:

- `D:\2026\mathSchool\README.md`
- `D:\2026\mathSchool\docs\architecture.md`
- `D:\2026\mathSchool\docs\database.md`
- `D:\2026\mathSchool\docs\local-setup.md`
- `D:\2026\mathSchool\docs\qa-checklist.md`
- `D:\2026\mathSchool\docs\qa-matrix.md`
- `D:\2026\mathSchool\docs\known-limitations.md`
- `D:\2026\mathSchool\ai-progress.md`
