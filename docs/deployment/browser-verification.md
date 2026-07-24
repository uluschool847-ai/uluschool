# Launch Browser Verification Matrix

Run this matrix on isolated staging first and then on the production Render origin before DNS
promotion. Repeat the required production subset after Cloudflare proxying. Use disposable records
and never place credentials, student personal data, or webhook payloads in this file.

## Run record

| Field | Recorded value |
| --- | --- |
| Date and Africa/Nairobi time | |
| Environment and base URL | |
| Render service and deploy ID | |
| Branch and commit SHA | |
| Tester | |
| Browser and viewport/profile | |
| Result | |
| Evidence location | Private launch record only |

## Application authentication schema cleanup backup

| Field | Recorded value |
| --- | --- |
| Backup timestamp | 2026-07-24 12:58 UTC / 15:58 Africa/Nairobi |
| Source Render database | `ulu-school-staging-db` (`ulu_school_staging`) |
| Dump format | PostgreSQL custom |
| Restore target | Disposable PostgreSQL 18 database |
| Restore result | Pass; key table counts verified privately |
| Migration rehearsal | Pass; removed columns absent and challenge table removed |
| Verifier | Codex, under explicit user approval |

For every row record: role, starting route, actions, expected visible result, actual result, created
test record IDs, cleanup result, and issue reference. Do not record the one-time credential itself.

ULU Online School administrators authenticate to the application with email and password.
Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
accounts remain protected with provider-level 2FA.

## Required workflows

| ID | Role and start | Actions | Required visible result and evidence |
| --- | --- | --- | --- |
| B01 | Guest, `/enrol` | Complete all steps, read the privacy link, provide the required minor-data consent, submit once, and retain the reference ID. Then submit `/contact` and retain its reference ID. | Both forms show success once. Admin search finds both exact records and their consent/contact data. No private field appears in logs or alerts. |
| B02 | Bootstrap admin, `/portal/login` | Sign in with the bootstrap credential, rotate it, sign out, and sign in again with the new password. | Password rotation cannot be skipped, no authenticator prompt appears, and the second login reaches `/admin`. |
| B03 | Admin, `/admin/users` | Manually create one student, one linked parent, and one teacher. Observe each generated one-time credential, close the success state, and verify it cannot be displayed again. | Each credential is unique, appears once to the authorized admin, and is absent from audit metadata, browser history, and later user views. Record user IDs only. |
| B04 | Student, parent, teacher; `/portal/login` | Sign in separately with each temporary credential, rotate it, sign out, and sign in with the new credential. Try another role's dashboard URL in each session. | Each role reaches only its own portal. Password rotation is mandatory; another role's data and dashboard are denied. |
| B05 | Teacher, `/portal/teacher/materials` | Create and upload a disposable material for an assigned class. As its student and linked parent, open and download it. As an unrelated student, unrelated parent, and unassigned teacher, attempt the stable application URL. | Authorized roles download the material. Every unrelated user is denied without revealing object keys or signed storage details. Record material/file IDs and denial evidence. |
| B06 | Teacher, report route | Generate a disposable student report. Download it as the assigned student and linked parent; try the same record as unrelated users. | The teacher, student, and linked parent can download the report. Every unrelated user is denied. The file contains only the selected student's data. |
| B07 | Authorized file users | Keep B05's record, trigger one Render redeploy, then revisit the stable application download URL. | The same upload survives the redeploy and remains downloadable only by authorized roles. Delete the disposable material after evidence is recorded. |
| B08 | Teacher and student, schedule routes | Choose a class with a known UTC instant and independently convert it to Kenya local time. Compare teacher/student labels and the calendar event. | All schedule and availability labels use `Africa/Nairobi`; the known class matches Kenya local time on every role view and no `Europe/Kiev` label appears. |
| B09 | Guest and one portal role | At 360x800 with a Slow 4G browser profile, open `/`, `/enrol`, `/portal/login`, and one populated portal dashboard. Complete the main interaction on each page. | Controls remain usable with no horizontal overflow, no overlapping controls, no clipped long text, and no layout shift that blocks the workflow. Capture full-page screenshots. |
| B10 | Guest, `/robots.txt` and page source | Check staging and production robots plus the root page's robots metadata. | Staging is `noindex`/`nofollow` with a site-wide disallow. Production is indexable, follows links, and publishes the canonical sitemap only with `APP_ENV=production`. |
| B11 | Authorized operator, alert test endpoint | Trigger one sanitized alert using the environment's controlled test token, then inspect Sentry and the alert destination. | The alert reaches the configured private operations channel and correct Sentry environment without exposing request bodies, form data, session cookies, tokens, credentials, query values, or database URLs. |
| B12 | Admin and all portal roles | Sign out each session, revisit protected routes, use browser Back, and verify expired/invalid session handling. | Protected pages redirect to login, private content is not restored from cache, and Cloudflare never serves one user's response to another. |

## Production subset after DNS and proxy

Repeat B01 with clearly marked disposable records, B02 password-only administrator login, B04 route denial,
B05 authorized and unrelated downloads, B08, B09, B10, B11, and B12 on
`https://uluglobalacademy.com`. Also verify the `www` redirect, HTTPS, canonical metadata, and
Cloudflare cache status described in `launch-checklist.md`.

## Completion rule

The matrix passes only when every required row has an owner, timestamp, deploy/commit identity,
visible result, record IDs, cleanup status, and private evidence. Any authentication bypass, IDOR,
missing consent, private-file persistence failure, incorrect Nairobi time, cached private response,
or secret-bearing alert is a launch blocker.
