# 1. Executive Summary
The `mathSchool` project is in a **late-MVP / early-Scale** phase. The data layer (Prisma schema) is robust and correctly models the intended target architecture (CMS, Portals, Automation, BI). However, there is a significant **implementation gap** between the database schema and the application layer. While admin interfaces exist for content management, they are not yet integrated into the public-facing marketing site. The role-based portals (Teacher, Student, Parent) are currently skeletal, with routing structures and some data retrieval in place, but lacking the critical interaction depth (grading workflows, material management) required for production. Process automation and BI are functional but basic, lacking advanced logic like automated task triggering for stale enquiries or modern charting libraries.

# 2. Implemented vs Planned

| Domain | Implemented | Partial | Missing | Needs Verification |
| :--- | :---: | :---: | :---: | :---: |
| **CMS** | Admin routes for Blog/FAQ | Public site integration | Dynamic `PageContent` rendering | |
| **Admin Panel** | Basic lead management | Analytics dashboard | Full CRM workflows | |
| **Teacher Portal** | Routing, Schedule | Grading flow (shell) | Material upload UI | |
| **Student Portal** | Login, Schedule | Homework submission | Results/Feedback UI | |
| **Parent Portal** | Routing | | Read-only views | |
| **Automation** | Cron route, Reminders | Task generation | Retry logic, Idempotency | |
| **BI / Analytics** | SQL-based metrics | Basic CSS charts | Recharts/Tremor UI | |
| **Auth / RBAC** | Session/2FA logic | `requireRole` in pages | Middleware-level RBAC | |
| **Infra / Ops** | Prisma, Sentry (config) | Health checks | Audit log UI | Backup validation |

# 3. Gaps Between Docs and Code
- **CMS Integration:** Docs claim the CMS handles marketing pages (Pricing, About Us), but `app/fees/page.tsx` and others use hardcoded content or static files (`lib/content.ts`).
- **Analytics UI:** `architecture.md` mentions Recharts/Tremor, but `app/(admin)/admin/analytics/page.tsx` uses manual CSS `div` bars for visualization.
- **Portal Consistency:** There is confusing duplication between `/portal/student` and `/student-portal`. The latter acts as a login hub, while the former is intended to be the dashboard.
- **Parent Portal:** Documented as a core component, but `app/portal/parent` is an empty directory or a basic shell with no data-driven components.
- **Automated Task Generation:** While `app/api/cron/automation/route.ts` exists, the logic in `automation-repository` for detecting "stale" enquiries is simplistic.

# 4. Technical Debt / Risks
- **Hardcoded Content:** Marketing site relies on static `lib/content.ts` instead of `PageContent` models, creating a developer dependency for every copy change.
- **Middleware Security:** RBAC is enforced at the page level (`requireRole`), not at the middleware level. A developer forgetting to add `requireRole` to a new route creates a potential security hole.
- **Interaction Shells:** Many portal features (e.g., "Recent Submissions to Grade") are UI placeholders with text explaining what *would* happen.
- **Missing File Upload Logic:** Homework and material models expect file URLs, but there is no integrated flow for S3/R2/Vercel Blob uploads in the actions.

# 5. Remaining Technical Tasks

### CMS & Marketing
- **Title:** Integrate `PageContent` into Marketing Pages
- **Module:** CMS / Frontend
- **Current state:** Hardcoded copy in `app/fees`, `app/about`, etc.
- **Required work:** Create a dynamic route or helper to fetch `PageContent` by slug and render JSON content blocks. Update page components to consume this data.
- **Value:** Marketing team autonomy.
- **Priority:** High | **Complexity:** Medium
- **Evidence:** `app/fees/page.tsx`, `lib/content.ts`

### Educational Portals
- **Title:** Complete Teacher Grading Workflow
- **Module:** Teacher Portal
- **Current state:** Basic list of assignments; grading UI is a placeholder.
- **Required work:** Implement assignment detail view, submission listing, and integration of `gradeHomeworkAction`.
- **Value:** Core product utility for teachers.
- **Priority:** Critical | **Complexity:** Medium
- **Evidence:** `app/portal/teacher/page.tsx`

- **Title:** Consolidate Student Portal Routing
- **Module:** Auth / Portal
- **Current state:** `/portal/student` and `/student-portal` overlap.
- **Required work:** Move login logic to a unified `/login` or keep `/student-portal` strictly for auth, ensuring `/portal/student` is the protected dashboard.
- **Value:** UX clarity.
- **Priority:** Medium | **Complexity:** Small
- **Evidence:** Folder structure listing.

### Automation & BI
- **Title:** Upgrade Analytics UI to Recharts/Tremor
- **Module:** Admin Analytics
- **Current state:** Manual CSS bars.
- **Required work:** Install `recharts` or `tremor` and replace CSS charts with interactive components.
- **Value:** Professional-grade BI for stakeholders.
- **Priority:** Low | **Complexity:** Small
- **Evidence:** `app/(admin)/admin/analytics/page.tsx`

- **Title:** Implement Automated "Stale Enquiry" ManagerTasks
- **Module:** CRM / Automation
- **Current state:** Basic repo function exists but lacks robust business logic.
- **Required work:** Define "stale" (e.g., 48h with no status change) and ensure the cron job creates `ManagerTask` items correctly.
- **Value:** Operational efficiency.
- **Priority:** Medium | **Complexity:** Medium
- **Evidence:** `lib/repositories/automation-repository.ts`

# 6. Recommended Next Execution Plan

### Phase A: Security & Cleanup (Must-do)
1. **Centralize RBAC:** Move role checking logic into `middleware.ts` to ensure "secure by default" routing.
2. **Route Consolidation:** Resolve the `/student-portal` vs `/portal/student` ambiguity.
3. **Validation:** Audit all Server Actions for Zod schema coverage.

### Phase B: Core Portal Functionality
1. **Teacher Materials:** Implement file upload and management for `CourseMaterial`.
2. **Grading System:** Finish the submission review and grading UI.
3. **Student Homework:** Add file upload capability to the homework submission form.

### Phase C: CMS Integration
1. **Dynamic FAQs:** Replace `lib/content.ts` data with `FaqItem` database queries on the `/faq` page.
2. **Marketing CMS:** Migrating `Pricing` and `About` content to the `PageContent` model.

### Phase D: Automation & BI Hardening
1. **Reporting:** Implement the Recharts/Tremor UI for the BI dashboard.
2. **Reliability:** Add retry logic and idempotency keys to the reminder processing system.

# 7. Questions for Stakeholders
1. **File Storage:** Which provider (S3, Vercel Blob, Uploadcare) should be used for material and homework uploads?
2. **Parent Portal Scope:** What is the specific list of data points parents need? Is attendance tracking required in Phase 1?
3. **SSO Provider:** The code mentions "Organization SSO". Which provider (Google, Azure AD) needs to be integrated?
4. **Task Assignment:** Should `ManagerTask` items be auto-assigned to specific admins, or should they go into a general pool?