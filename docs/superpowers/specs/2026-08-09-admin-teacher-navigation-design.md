# Admin And Teacher Navigation Design

## Goal

Make every existing teacher-onboarding and teacher-workspace route reachable through visible buttons. Administrators and teachers must not need to type application URLs manually.

## Scope

### Admin dashboard

Add a dedicated `School Setup` action group with these links:

- `User Accounts` -> `/admin/users`
- `Create Teacher Account` -> `/admin/users?createRole=TEACHER`
- `Teacher Profiles` -> `/admin/teachers`
- `Create Class Group` -> `/admin/classes/new`
- `Students` -> `/admin/students`
- `Subjects` -> `/admin/subjects`

The existing CRM status controls remain separate from school setup actions.

### User creation

Allow `/admin/users` to accept a safe `createRole` query parameter. When it is one of the existing `UserRole` values, pass it to `UserCreateForm` as the initial role. Invalid values fall back to `STUDENT`.

The `Create Teacher Account` action therefore opens the existing form with `TEACHER` already selected. Account creation, temporary credentials, role checks, audit logging, and password rotation remain unchanged.

### Teacher dashboard

Expand `Quick Navigation` so all existing teacher workspaces are reachable:

- `Classes` -> `/portal/teacher/classes`
- `Students` -> `/portal/teacher/students`
- `Schedule` -> `/portal/teacher/schedule`
- `Availability` -> `/portal/teacher/availability`
- `Assignments` -> `/portal/teacher/assignments`
- `Submissions` -> `/portal/teacher/submissions`
- `Progress` -> `/portal/teacher/progress`
- `Materials` -> `/portal/teacher/materials`
- `Gradebook` -> `/portal/teacher/gradebook`
- `Reports` -> `/portal/teacher/reports`
- `Activity` -> `/portal/teacher/activity`
- `Notifications` -> `/portal/teacher/notifications`

No new teacher capability or permission is introduced. Existing server-side `TEACHER` role and ownership checks remain authoritative.

## UI Rules

- Reuse the current `Button`, `Card`, and `Link` patterns.
- Keep school setup actions visually separate from enquiry status filters.
- Use concise action labels that describe the destination.
- Preserve responsive wrapping and existing page structure.

## Error Handling And Security

- Parse `createRole` through the existing `UserRole` enum.
- Ignore unsupported role values and default to `STUDENT`.
- Do not move authorization into navigation components.
- Admin pages continue to require `ADMIN`; teacher pages continue to require `TEACHER` and repository ownership scope.

## Tests

1. Admin dashboard renders every school setup link with the expected destination.
2. Admin users page passes `TEACHER` to the create form for `createRole=TEACHER`.
3. Admin users page falls back safely for an invalid `createRole`.
4. Teacher dashboard renders all existing teacher workspace links.
5. Run the focused admin and teacher page tests, lint/typecheck, and browser verification for desktop and mobile navigation.

## Out Of Scope

- A multi-step onboarding wizard.
- Automatic email delivery of temporary passwords.
- Automatic Google Meet creation.
- New gradebook forms or availability editing behavior.
- Changes to roles, repositories, Prisma models, or database migrations.
