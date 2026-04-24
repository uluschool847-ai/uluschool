# RBAC and API Authorization Verdict

## Files Reviewed
- `middleware.ts`
- `lib/auth/session.ts`

## Files Changed
- `middleware.ts`

## Exact Issue Found
The previous `middleware.ts` implementation had a logical flaw where API-specific `403 Forbidden` responses were placed inside an `if (isAdminPath)` block. Since `isAdminPath` and `isApiPath` were mutually exclusive (starting with `/admin` vs `/api`), the API-specific error branch was unreachable. Additionally, API routes lacked centralized role-aware protection (e.g., `/api/teacher/**` would not have been blocked for a student if it existed).

## Exact Fix Implemented
1. **Consolidated Denial Logic**: Introduced a `denyAccess` helper function that detects `isApiPath` and returns either a JSON error (401/403) or a UI redirect.
2. **Role-Aware Area Protection**: Grouped UI and API paths into functional areas (e.g., `isTeacherArea` includes `/portal/teacher` and `/api/teacher`).
3. **Robust Path Matching**: Updated `isAdminPath` and `isPortalPath` to include their respective `/api` subpaths.
4. **Guaranteed 403 Response**: Ensured that any role mismatch on an API route definitively returns a `403 Forbidden` JSON payload.

## Confirmed Correct Behavior
- **Secure by Default**: All `/api` routes (except health and SSO callback) require a session.
- **Role Enforcement**: `/api/admin/**`, `/api/teacher/**`, etc., are now correctly protected by the centralized RBAC logic.
- **Token Bypass**: Cron and internal endpoints using the `Authorization` header still bypass middleware session checks as intended.
- **Single Redirects**: The `/portal` root still handles direct redirection to specific dashboards in a single turn.

## Remaining Limitations
- **Granular API Action Protection**: While the middleware protects path-based roles (e.g., `/api/admin`), it does not inspect the request method or specific action payload; those remain the responsibility of the route handler or server action.
- **Public API Exceptions**: Any new public API must be manually added to the exception list in `middleware.ts`.

## Final Verdict
**Status: COMPLETED**

The RBAC model is now fully centralized, role-aware for both UI and API, and free of logical dead ends.

## Manual Verification Checklist
- [x] Access `/admin` as guest -> Redirect to `/student-portal`.
- [x] Access `/api/any-route` as guest -> `401 Unauthorized` JSON.
- [x] Access `/api/admin/test` (hypothetical) as Student -> `403 Forbidden` JSON.
- [x] Access `/api/health` as guest -> `200 OK`.
- [x] Access `/portal` as Teacher -> Redirect directly to `/portal/teacher`.
- [x] Access `/api/reminders/send-due` with Bearer token -> Pass through (Internal Auth).
