Current state
- RBAC already existed in middleware and page-level guards.
- middleware enforced authentication for /admin, /portal, and most /api routes.
- middleware had role checks for /admin, /portal/teacher, /portal/student, /portal/parent, plus API role prefixes.
- Page-level guards (requireRole) were still present across admin/portal pages and actions as defense in depth.

Gaps found
- middleware allowed any /api request with any Authorization header to bypass session checks, which weakened secure-by-default API protection.
- Role isolation was not strict: ADMIN was allowed into teacher/student/parent areas in middleware logic.
- /portal/admin was not explicitly included as admin-only in middleware admin path checks.
- Secondary guard mismatch: teacher page and grading server action still allowed ADMIN role.

Changes implemented
- Updated D:\2026\mathSchool\middleware.ts:
  - Added explicit role-to-route mapping (ROLE_ROUTE_RULES) as centralized route policy:
    - /admin, /api/admin, /portal/admin -> ADMIN
    - /portal/teacher, /api/teacher -> TEACHER
    - /portal/student, /api/student -> STUDENT
    - /portal/parent, /api/parent -> PARENT
  - Enforced strict role isolation (no cross-role access) using this centralized mapping.
  - Added /portal/admin to admin-path handling.
  - Replaced broad "any Authorization header bypasses all API auth" with a narrow allowlist for tokenized machine endpoints only:
    - /api/alerts/test
    - /api/reminders/send-due
    - /api/cron/automation
    and only when Bearer auth header is present.
  - Kept explicit public exceptions for:
    - /api/health
    - /api/auth/session
    - /api/auth/sso/callback
- Updated secondary page/action guards for consistency:
  - D:\2026\mathSchool\app\portal\teacher\page.tsx -> requireRole([TEACHER])
  - D:\2026\mathSchool\app\portal\actions.ts (gradeHomeworkAction) -> requireRole([TEACHER])

Final RBAC behavior
- Protected routes are secure by default at middleware level:
  - Any /portal*, /admin*, /api* route requires auth unless explicitly public exception.
- Unauthenticated users:
  - UI protected routes -> redirected to /student-portal with next param.
  - Protected API routes -> 401 JSON.
- Authenticated users:
  - Can access only role-allowed areas from centralized mapping.
  - Cross-role access is denied consistently (403 for APIs, redirect for UI).
- Nested protected routes are covered via prefix checks.
- /portal root still redirects by role centrally in middleware.
- Admin 2FA enforcement remains in middleware for admin sessions.
- Page-level guards remain as defense in depth, not primary enforcement.

Notes / follow-ups
- Verified with TypeScript check: npx tsc --noEmit passed.
- This change intentionally keeps page-level guards for safety; middleware is now the primary source of truth for route-level RBAC.
- If you later add new role-specific route groups, add their prefix/role mapping in middleware ROLE_ROUTE_RULES first.
