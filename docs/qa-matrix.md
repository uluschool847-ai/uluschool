# Role-Based QA Matrix

Use `SEED_PORTAL_PASSWORD` only for disposable locally seeded accounts. Hosted staging and
production accounts are created through the production bootstrap and admin workflow instead.

## Guest (Unauthenticated)

| # | Flow | Happy Path | Empty State | Validation Error | Access Denied |
|---|------|------------|-------------|------------------|---------------|
| 1 | Public site | Visit `/` and verify the landing page loads, header navigation works, theme toggle is usable, and the skip link points to `#main-content`. | — | — | — |
| 2 | Contact form | Visit `/contact`, complete the form, submit, and verify the success state shows a reference ID and next-step message. | — | Submit with missing required fields or an invalid email and verify field-level errors are shown. | — |
| 3 | Enrol form | Visit `/enrol`, complete the multi-step flow, submit, and verify the success state shows a reference ID and next-step message. | — | Leave required step fields blank or enter an invalid email and verify validation errors are shown before completion. | — |
| 4 | Login | Visit `/portal/login`, sign in with a valid seeded account such as `fixed.student@uluglobalacademy.com`, and verify redirect to the role dashboard. | — | Try an invalid email format or wrong password and verify the form shows a visible error message. | — |
| 5 | Protected portal route | Happy-path expectation for a guest is to remain on public pages only; use this row to verify protection on `/portal/student`. | — | — | Visit `/portal/student` while signed out and verify redirect to `/portal/login?reason=invalid&callbackUrl=%2Fportal%2Fstudent`. |
| 6 | Admin route | Happy-path expectation for a guest is to remain on public pages only; use this row to verify protection on `/admin`. | — | — | Visit `/admin` while signed out and verify redirect to `/portal/login?reason=invalid&callbackUrl=%2Fadmin`. |
| 7 | Blog | Visit `/blog` and verify published posts render with title, excerpt, and published date. | Clear published blog posts locally and verify `/blog` shows `No posts found.` | — | — |
| 8 | CMS pages | Visit `/pages` and `/pages/{slug}` for any published page and verify the page loads. | With no published `PageContent` records, verify `/pages` shows `No published CMS pages are available yet.` | — | Visit a nonexistent slug such as `/pages/nonexistent` and verify a 404 response. |

## Student

Use `fixed.student@uluglobalacademy.com` for data-rich checks and `freshstudent@uluglobalacademy.com` for empty-state checks.

| # | Flow | Happy Path | Empty State | Validation Error | Access Denied |
|---|------|------------|-------------|------------------|---------------|
| 1 | Login | Sign in as `fixed.student@uluglobalacademy.com` and verify redirect to `/portal/student`. | — | Enter the wrong password or invalid email format and verify the login form shows an error. | — |
| 2 | Dashboard | Open `/portal/student` as `fixed.student@uluglobalacademy.com` and verify assignments, submissions, grades, and progress notes render. | Sign in as `freshstudent@uluglobalacademy.com` and verify the dashboard shows empty-state messages instead of crashing. | — | — |
| 3 | Schedule | Open `/portal/schedule` as `fixed.student@uluglobalacademy.com` and verify class times and live lesson links render. | Sign in as `freshstudent@uluglobalacademy.com` and verify `No classes scheduled for this period.` | — | — |
| 4 | Submit homework | From `/portal/student`, find an unsubmitted assignment, paste a valid URL, submit, and verify the submission shows as submitted. | — | Submit without a URL or with missing hidden assignment context and verify the action returns an error state instead of silent failure. | — |
| 5 | Teacher route protection | Happy-path expectation is to remain within student routes only. | — | — | While signed in as `fixed.student@uluglobalacademy.com`, visit `/portal/teacher` and verify redirect to `/portal/unauthorized`. |
| 6 | Admin route protection | Happy-path expectation is to remain within student routes only. | — | — | While signed in as `fixed.student@uluglobalacademy.com`, visit `/admin` and verify redirect to `/portal/unauthorized`. |

## Teacher

Use `fixed.teacher@uluglobalacademy.com` for data-rich checks and `newteacher@uluglobalacademy.com` for empty-state checks.

| # | Flow | Happy Path | Empty State | Validation Error | Access Denied |
|---|------|------------|-------------|------------------|---------------|
| 1 | Login | Sign in as `fixed.teacher@uluglobalacademy.com` and verify redirect to `/portal/teacher`. | — | Enter the wrong password or invalid email format and verify the login form shows an error. | — |
| 2 | Dashboard | Open `/portal/teacher` as `fixed.teacher@uluglobalacademy.com` and verify metrics, classes, assignments, upcoming lessons, and pending submissions render. | Sign in as `newteacher@uluglobalacademy.com` and verify the dashboard widgets show empty-state messages such as `No classes assigned`. | — | — |
| 3 | Grade homework | From `/portal/teacher`, open a pending submission, submit a grade/feedback update, and verify success feedback is shown. | — | Submit an invalid grade payload through the grading form and verify a visible error is returned instead of a silent failure. | — |
| 4 | Schedule | Open `/portal/schedule` as `fixed.teacher@uluglobalacademy.com` and verify class times match the teacher dashboard. | Sign in as `newteacher@uluglobalacademy.com` and verify `No classes scheduled for this period.` | — | — |
| 5 | Student route protection | Happy-path expectation is to remain within teacher routes only. | — | — | While signed in as `fixed.teacher@uluglobalacademy.com`, visit `/portal/student` and verify redirect to `/portal/unauthorized`. |
| 6 | Admin route protection | Happy-path expectation is to remain within teacher routes only. | — | — | While signed in as `fixed.teacher@uluglobalacademy.com`, visit `/admin` and verify redirect to `/portal/unauthorized`. |

## Parent

Use `fixed.parent@uluglobalacademy.com` for linked-child checks and `onboardingparent@uluglobalacademy.com` for empty-state checks.

| # | Flow | Happy Path | Empty State | Validation Error | Access Denied |
|---|------|------------|-------------|------------------|---------------|
| 1 | Login | Sign in as `fixed.parent@uluglobalacademy.com` and verify redirect to `/portal/parent`. | — | Enter the wrong password or invalid email format and verify the login form shows an error. | — |
| 2 | Dashboard | Open `/portal/parent` as `fixed.parent@uluglobalacademy.com` and verify the linked child, upcoming classes, homework status, grades, and progress cards render. | Sign in as `onboardingparent@uluglobalacademy.com` and verify `No linked students found. Please contact administration.` | — | — |
| 3 | Student route protection | Happy-path expectation is to remain within parent routes only. | — | — | While signed in as `fixed.parent@uluglobalacademy.com`, visit `/portal/student` and verify redirect to `/portal/unauthorized`. |
| 4 | Admin route protection | Happy-path expectation is to remain within parent routes only. | — | — | While signed in as `fixed.parent@uluglobalacademy.com`, visit `/admin` and verify redirect to `/portal/unauthorized`. |

## Admin

Use `fixed.admin@uluglobalacademy.com` or `admin@uluglobalacademy.com`.

ULU Online School administrators authenticate to the application with email and password.
Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
accounts remain protected with provider-level 2FA.

| # | Flow | Happy Path | Empty State | Validation Error | Access Denied |
|---|------|------------|-------------|------------------|---------------|
| 1 | Login | Sign in as `fixed.admin@uluglobalacademy.com` or `admin@uluglobalacademy.com` with email and password. When a temporary password is used, rotate it before access to `/admin`; no authenticator prompt appears. | — | Enter the wrong password and verify the login form shows an error. | — |
| 2 | Dashboard | Open `/admin` and verify analytics, CRM summaries, enquiries, leads, reminder controls, and recent audit logs render. | Use a reset/minimal local DB state and verify empty CRM/dashboard regions show readable empty states instead of crashing. | — | — |
| 3 | Global search | From `/admin`, search for a known `referenceId` and verify the matching enquiry or lead is shown. | Search for a nonexistent reference ID and verify `No matching records found.` | — | — |
| 4 | Users | Open `/admin/users`, review the seeded list, and change a user role/status through the UI. | — | Submit an invalid update and verify the UI shows an error state instead of silent failure. | — |
| 5 | Tasks | Open `/admin/tasks`, review manager tasks, and update a task status. | Reset or clear local tasks and verify the page shows an empty state instead of crashing. | Submit an invalid status transition and verify the UI surfaces an error message. | — |
| 6 | Billing | Open `/admin/billing`, review seeded payments/subscriptions, and trigger a refund/status update. | Clear billing data and verify the empty state `No payments found.` | Trigger a failed billing action and verify the table surfaces an error with retry. | — |
| 7 | Audit | Open `/admin/audit` and verify audit entries render in descending timestamp order. | If the DB has no audit rows, verify the page handles an empty result without crashing. | — | — |
| 8 | CMS pages | Open `/admin/cms/pages`, create or edit a page, and verify published pages appear under `/pages/{slug}`. | With no `PageContent` rows, verify the pages list loads and `/pages` shows the published-pages empty state. | Try a reserved slug like `blog` or malformed JSON content and verify a validation error is shown. | — |
| 9 | CMS blog | Open `/admin/cms/blog`, create or edit a published blog post, and verify it appears on `/blog`. | Clear blog posts and verify `/blog` shows `No posts found.` | Submit an invalid slug or missing required fields and verify the editor shows an error state. | — |
| 10 | CMS FAQ | Open `/admin/cms/faq`, create or edit FAQ items, and verify they appear in FAQ-driven public sections. | Clear FAQ items and verify affected sections/pages handle the empty list without crashing. | Submit missing question/answer fields and verify validation errors are returned. | — |
| 11 | Student route protection | Happy-path expectation is to remain on admin routes only. | — | — | While signed in as `fixed.admin@uluglobalacademy.com`, visit `/portal/student` and verify redirect to `/portal/unauthorized`. |
| 12 | Teacher route protection | Happy-path expectation is to remain on admin routes only. | — | — | While signed in as `fixed.admin@uluglobalacademy.com`, visit `/portal/teacher` and verify redirect to `/portal/unauthorized`. |

## Session & Cross-Role

| # | Flow | Happy Path | Empty State | Validation Error | Access Denied |
|---|------|------------|-------------|------------------|---------------|
| 1 | Logout | Sign in as any seeded role, use the site header logout action, and verify redirect to `/` with the session cleared. | — | — | — |
| 2 | Session expiry | Use a valid signed-in session and verify protected routes work before expiry. | — | — | After the session expires, visit a protected route such as `/portal/student` and verify redirect to `/portal/login?reason=expired&callbackUrl=%2Fportal%2Fstudent`. |
| 3 | Invalid session | Use a valid signed-in session and verify protected routes work before tampering. | — | — | Tamper with the `ulu_session` cookie or remove it, then visit a protected route such as `/portal/student` and verify redirect to `/portal/login?reason=invalid&callbackUrl=%2Fportal%2Fstudent`. |
| 4 | Role-based navigation | Verify the site header shows the correct portal link for the signed-in role: Student Portal, Teacher Portal, Parent Portal, or Admin Dashboard. | — | — | Verify a teacher does not see the Admin link, a student does not see the Teacher link, and a signed-out user does not see portal-only links. |
