# Manual QA Checklist

> For role-based testing with happy path, empty state, validation error, and access denied scenarios, see [QA Matrix](./qa-matrix.md).

## Guest (Unauthenticated)
- [ ] Landing page loads without console/runtime errors
- [ ] Header navigation works on desktop and mobile
- [ ] Theme toggle works and is not rendered as a disabled control
- [ ] Skip-to-content link is present and targets `#main-content`
- [ ] Contact form submits successfully and shows a reference ID
- [ ] Enrol form multi-step flow completes and shows a reference ID
- [ ] Public blog list and blog detail pages render published content
- [ ] Public CMS page index (`/pages`) loads even if there are no pages yet
- [ ] Login page validates email/password and shows session-expired / invalid-session messages when query params are present

## Student
Use `fixed.student@uluglobalacademy.com` for data-rich checks.

- [ ] Login works with the local seeded password from `SEED_PORTAL_PASSWORD`
- [ ] `D:\2026\mathSchool\app\portal\student\page.tsx` shows assignments
- [ ] Existing grade/feedback is visible on the student dashboard
- [ ] Progress notes render on the dashboard
- [ ] `D:\2026\mathSchool\app\portal\schedule\page.tsx` shows classes and join links
- [ ] Dates render in `DD Month YYYY` format
- [ ] Grades render in compact format (for example `A+`)

## Teacher
Use `fixed.teacher@uluglobalacademy.com` for data-rich checks.

- [ ] Login works with the local seeded password from `SEED_PORTAL_PASSWORD`
- [ ] `D:\2026\mathSchool\app\portal\teacher\page.tsx` shows metrics
- [ ] Classes and upcoming lessons render consistent local times
- [ ] Assignment due dates render in the same `DD Month YYYY` format used elsewhere
- [ ] Recent submissions are visible
- [ ] Grade submission form works from the teacher dashboard
- [ ] `D:\2026\mathSchool\app\portal\schedule\page.tsx` matches the dashboard lesson times

## Parent
Use `fixed.parent@uluglobalacademy.com` for the linked-child flow and `onboardingparent@uluglobalacademy.com` for the empty-state flow.

- [ ] Login works with the local seeded password from `SEED_PORTAL_PASSWORD`
- [ ] Parent dashboard shows one linked child with classes, homework status, grades, and progress cards
- [ ] Empty state appears for the onboarding parent with no linked student
- [ ] Child sections are readable and stack correctly on mobile

## Admin
Use `fixed.admin@uluglobalacademy.com` or `admin@uluglobalacademy.com`.

- [ ] Admin login works
- [ ] In local development with `ADMIN_REQUIRE_2FA=true`, post-login redirect to `/admin/security?setup2fa=required` is handled as expected
- [ ] `D:\2026\mathSchool\app\(admin)\admin\page.tsx` shows analytics, enquiries, leads, and audit logs
- [ ] CRM status filter renders human-readable labels (`In Review`, not `in_review`)
- [ ] Global search by `referenceId` works from the admin dashboard and submission screens
- [ ] `D:\2026\mathSchool\app\(admin)\admin\users\page.tsx` lists users and supports role/status changes
- [ ] `D:\2026\mathSchool\app\(admin)\admin\tasks\page.tsx` lists manager tasks and supports status changes
- [ ] `D:\2026\mathSchool\app\(admin)\admin\billing\page.tsx` shows payments and subscriptions
- [ ] `D:\2026\mathSchool\app\(admin)\admin\audit\page.tsx` shows audit entries
- [ ] `D:\2026\mathSchool\app\(admin)\admin\cms\page.tsx` links to CMS Pages, Blog, and FAQ management

## CMS
- [ ] Pages list loads at `/admin/cms/pages`
- [ ] Blog posts list loads at `/admin/cms/blog`
- [ ] FAQ items list loads at `/admin/cms/faq`
- [ ] Creating or editing a CMS page respects reserved slug validation
- [ ] Published CMS pages are visible under `/pages/{slug}`
- [ ] Unpublished CMS pages are not publicly visible

## Cross-Role
- [ ] Logout works from the site header on desktop and mobile
- [ ] Role-based portal navigation shows the correct portal link for the signed-in user
- [ ] Unauthorized access redirects users away from routes for other roles
- [ ] Session expiry redirects to `/portal/login?reason=expired&callbackUrl=...`
- [ ] Invalid or missing session redirects to `/portal/login?reason=invalid&callbackUrl=...`

## Responsive
- [ ] Core pages are usable at 375px width
- [ ] Core pages are usable at 768px width
- [ ] Core pages are usable at 1440px width
- [ ] No horizontal scroll on mobile except intentionally scrollable tables
- [ ] Admin billing table remains usable via horizontal scroll on mobile
- [ ] Parent dashboard progress cards stack vertically on mobile

## Accessibility
- [ ] Pages expose a main landmark
- [ ] Each dashboard page has exactly one `h1`
- [ ] Forms have labels, required indicators, and linked errors
- [ ] Tables expose captions / accessible names and correct header scope
- [ ] Keyboard navigation works across header, forms, and dashboard actions
- [ ] Empty states use `role="status"`
- [ ] Error states use `role="alert"`
