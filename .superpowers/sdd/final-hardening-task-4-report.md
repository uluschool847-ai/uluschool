# Task 4: Nairobi, Monitoring, and Environment Hardening

Branch: `launch/mvp-production-readiness`

## Implemented

- Added one shared `Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })` formatter for class start, class end, and assignment due dates.
- Sanitized dynamic token path segments for `/api/files/:token` and `/api/public-files/:token` in Sentry request URLs and transaction names. HTTP methods and route families remain available for grouping.
- Treated both file-route families as sensitive routes, preserving the existing removal of request query data, bodies, and sensitive headers/cookies.
- Rejected every non-empty `SEED_PORTAL_PASSWORD` and `DEFAULT_PORTAL_PASSWORD` value in staging and production, including whitespace-only values.
- Rejected loopback and IANA-reserved `.invalid`, `.example`, and `.test` monitoring hosts for alert webhooks and Sentry DSNs using parsed `URL` hostnames. Valid provider-shaped webhook URLs and Sentry DSNs remain accepted.
- Replaced reserved-domain pretend-valid Sentry fixtures and updated the local environment example plus Render launch guidance.

## RED Evidence

1. `npx vitest run tests/lib/services/email.test.ts`
   - Failed as intended: 1 of 16 tests failed.
   - The `America/Los_Angeles` subprocess rendered class/assignment times in that host timezone instead of matching the Nairobi subprocess.
2. `npx vitest run lib/monitoring/__tests__/sentry-sanitize.test.ts`
   - Failed as intended: 2 of 69 tests failed.
   - Both private and public signed-file transactions retained their dynamic token segment.
3. `npx vitest run lib/config/__tests__/production-env.test.ts`
   - Failed as intended: 17 of 276 tests failed.
   - Non-empty seed/default portal passwords and loopback/reserved monitoring hosts were accepted before the validator change.

## GREEN Evidence

- `npx vitest run tests/lib/services/email.test.ts lib/monitoring/__tests__/sentry-sanitize.test.ts lib/config/__tests__/production-env.test.ts`
  - 3 files passed, 361 tests passed.
- Focused regression slice covering email, sanitizer, environment/CI/deployment audits, privacy, alerts, and storage configuration:
  - 11 files passed, 509 tests passed.
- `npm run lint`
  - Passed; Biome checked 849 files with no fixes needed.
- `npm run typecheck`
  - Passed.
- `npm run test`
  - 372 files passed, 6 skipped; 3,681 tests passed, 40 skipped.
- `npm run build`
  - Passed; production build compiled and generated 88 static pages.
- `git diff --check`
  - Passed with no whitespace errors.

## Security and Scope Notes

- This task changes no database data, mutations, roles, ownership checks, or audit-log domains.
- Validation uses the platform `URL` parser before evaluating the normalized hostname. Rejected values are represented only by stable validation messages, not echoed URLs or credentials.
- The timezone contract test uses an ephemeral local loopback SMTP capture inside isolated subprocesses. It does not access a database or remote service.

## Documentation Changed

- `.env.example`: identifies `SEED_PORTAL_PASSWORD` as local-only and rejected when non-empty in hosted environments.
- `docs/deployment/render-production.md`: documents hosted password restrictions, the enforced non-loopback/IANA-reserved hostname rules, and manual provider ownership confirmation because validation does not reject private, link-local, or unspecified addresses.
- `docs/deployment/launch-checklist.md`: adds staging verification for those environment restrictions.

## Browser Verification

Not applicable. Task 4 has no UI or browser-facing workflow change.

## Residual Risks

- Alert delivery and Sentry ingestion remain provider-controlled operational checks and must be exercised through the documented staging launch matrix with real environment values.
- The successful Next build emitted non-blocking webpack cache serialization performance warnings only.

## Final Review Correction

The final hardening review corrections are represented coherently:

- I-1: malformed percent encodings, raw trailing `%`, and over-encoded file-route prefixes are treated as sensitive; recognized private/public route families retain `/api/files/:token` or `/api/public-files/:token`, while unclassifiable route values use a stable filtered value. The complete serialized Sentry event excludes the signed token, with request payload/query/body/header/cookie filtering preserved.
- M-1: the timezone renderer subprocess now has a 15-second `spawnSync` timeout and `SIGKILL`; startup errors, non-zero status, and stderr are asserted with bounded diagnostics.
- M-2: validator messages and deployment docs state the enforced guarantee precisely: non-loopback hosts outside IANA-reserved `.invalid`, `.example`, and `.test` namespaces. The docs explicitly state that private, link-local, and unspecified addresses are not rejected and require separate provider-ownership confirmation.

### Prior Broad Evidence

Inherited evidence from the previous worker, not rerun for this closeout:

- Focused 11-file slice: 566/566 passed.
- Full suite: 3,738 passed, 40 skipped.
- Production build: passed; 88 pages generated.

### Fresh Focused Evidence

- `npx vitest run tests/lib/services/email.test.ts`: 1 file passed; 20 tests passed.
- `npx vitest run lib/monitoring/__tests__/sentry-sanitize.test.ts`: 1 file passed; 117 tests passed.
- `npx vitest run lib/config/__tests__/production-env.test.ts`: 1 file passed; 280 tests passed.
- `git diff --check`: passed with no whitespace errors.

### Correction Residual Risk

- Monitoring validation still does not establish that a private, link-local, or unspecified literal belongs to the intended provider; deployment operators must verify provider ownership separately.
- No database or network access was used, and no browser verification was required because Task 4 has no UI or browser-facing workflow change.
