# Infrastructure and Security Policies

This policy defines the current production controls for ULU Online School. Exact operator steps
live under `docs/deployment/`.

## 1. Hosting, data, and recovery

- **Application:** A paid Render Web Service runs the approved `main` commit in Frankfurt.
- **Database:** Paid Render PostgreSQL runs in Frankfurt and is reached from the web service through
  the environment's Internal Database URL.
- **Private files:** Cloudflare R2 buckets are private. Downloads flow through role- and
  relationship-scoped application routes; provider object URLs and credentials are not public.
- **Isolation:** Staging has a separate database, R2 bucket or equivalently isolated prefix,
  Turnstile widget, Sentry environment, and no production personal data.
- **Recovery:** The owner verifies Render point-in-time recovery, records the actual recovery
  window, and schedules restore drills. Recovery creates an isolated database for validation before
  cutover. Normal schema rollback is a reviewed forward corrective migration, never a reset.
- **Exports:** Any logical backup export is encrypted, access-controlled, retention-limited, and
  tested before it is considered a recovery control.

## 2. Access control

- Production provider access follows least privilege and requires individual accounts with
  provider-level 2FA on Render, GitHub, Cloudflare, Resend/email, and Sentry.
- ULU Online School administrators authenticate to the application with email and password.
  Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
  audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
  accounts remain protected with provider-level 2FA.
- `ADMIN` has authorized administration scope; `TEACHER`, `STUDENT`, and `PARENT` remain constrained
  by server-enforced assignment, enrollment, and parent-child ownership.
- Database and provider credentials are entered only in the relevant environment dashboard. They
  are not committed, pasted into chat, or placed in screenshots and deploy evidence.
- Local development and CI use disposable databases. They never connect to the production database.
- Access is reviewed at launch, on role change, and after any credential incident.

## 3. Deployments and monitoring

- GitHub Actions is the required verification gate. Render deploys the approved staging or `main`
  branch only after checks pass.
- Render runs the repository's exact build, environment validation, migration, bootstrap, start,
  and health-check contract from `docs/deployment/render-production.md`.
- Sentry receives sanitized application errors only when explicitly enabled. Alert tests must reach
  the configured private operations channel without request bodies, session data, credentials,
  database URLs, or student data.
- A failed build or pre-deploy does not justify bypassing validation. Operators correct the cause
  and deploy a new reviewed commit.
- Incidents and rollback decisions follow `docs/deployment/rollback.md` with a named owner,
  timestamps, recovery point when relevant, verification evidence, and follow-up actions.

## 4. Privacy and school operations

- Application-managed administrator 2FA is not used in staging or production; provider-level 2FA
  remains mandatory for provider accounts.
- Enrolment records retain the required consent evidence and link to the current privacy notice.
- Staff access only the student and parent information needed for their assigned work.
- Audit and monitoring metadata exclude credentials and unnecessary personal data.
- Retention, correction, access, and deletion requests follow the published privacy policy and the
  school's documented legal/operational decision process.
