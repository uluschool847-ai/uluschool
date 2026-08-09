# Production Launch Checklist

Use this checklist only after the staging gate in `browser-verification.md` is complete. Record the
operator, UTC and Africa/Nairobi timestamps, commit SHA, Render deploy ID, DNS values, and evidence
links in the private launch record. Never record credentials.

## 1. Restore operational readiness

- [ ] Reactivate the Render workspace and confirm billing before scheduling launch.
- [ ] Confirm the production web service is paid and the Render PostgreSQL database is paid.
- [ ] Verify PostgreSQL backup and point-in-time recovery status on the Recovery page.
- [ ] Record the visible recovery window, restore-drill owner, and scheduled drill date.
- [ ] Confirm the Cloudflare zone, registrar account, R2 account, SMTP account, Sentry project,
      Turnstile widget, and private operations channel have named owners.
- [ ] Confirm provider-level 2FA is enabled on Render, GitHub, Cloudflare, Resend/email, and Sentry.

ULU Online School administrators authenticate to the application with email and password.
Temporary passwords must be changed on first login. Login rate limiting, signed sessions,
audit logging, and server-side role enforcement remain mandatory. Infrastructure provider
accounts remain protected with provider-level 2FA.

## 2. Pass staging

- [ ] Deploy the approved commit from the `staging` branch to the isolated Frankfurt staging web
      service and staging database.
- [ ] Confirm `APP_ENV=staging`, a non-production HTTPS site origin, separate R2/Turnstile/Sentry
      configuration, and no production personal data.
- [ ] Confirm alert and Sentry URLs use the intended environment-specific provider endpoints.
      Validation rejects loopback hosts and IANA-reserved `.invalid`, `.example`, and `.test` names
      or suffixes, but does not reject private, link-local, or unspecified addresses. Confirm
      provider ownership separately; leave `SEED_PORTAL_PASSWORD` and `DEFAULT_PORTAL_PASSWORD`
      absent or empty.
- [ ] Run the deployment smoke and every row in `browser-verification.md`.
- [ ] Stop here on any failed security, ownership, upload persistence, administrator authentication,
      consent, email, Nairobi
      time, monitoring, responsive-layout, or indexing check.

## 3. Deploy the production origin

- [ ] Run a Codex Security diff scan for the exact pull request and stop the merge if any confirmed
      Critical or High finding remains.
- [ ] Confirm the `verify` CI job passes, including `npm audit --audit-level=high`.
- [ ] Merge the approved branch to `main` only after the security scan, CI, and staging evidence are
      complete.
- [ ] Verify Render deploys that exact `main` commit with `APP_ENV=production`.
- [ ] Notify users that the regular-session version 3 cutover logs out every existing user once,
      including users holding older password or SSO sessions.
- [ ] Keep `AUTH_SESSION_SECRET` unchanged for this cutover and keep its value out of all launch
      evidence, logs, screenshots, tickets, and repository files.
- [ ] Confirm an older `ulu_session` is rejected and redirected to login, then prove a fresh
      password-only administrator login works with the deployed release.
- [ ] Complete smoke and role checks on the production `onrender.com` URL before changing DNS.
- [ ] Confirm the previous healthy deploy and the database recovery decision are identifiable.

## 4. Attach the canonical domains

Follow this order exactly:

1. In Render, add `uluglobalacademy.com` to the production web service first. This makes the apex
   canonical and causes Render to add `www.uluglobalacademy.com` as its redirect companion.
2. In Cloudflare DNS, remove AAAA records for the apex and `www` because Render currently serves
   the custom origin over IPv4.
3. Create a root CNAME: name `@`, target the exact Render `onrender.com` hostname shown by the
   production service, and set Proxy status to **DNS only**.
4. Create a `www` CNAME to the same Render hostname and keep it **DNS only**.
5. Wait for DNS propagation, return to Render Custom Domains, and verify the domain. Require the
   certificate status to be issued and valid for both names.
6. Verify direct HTTPS on both names and verify `www.uluglobalacademy.com` redirects to
   `https://uluglobalacademy.com` without a loop.
7. In Cloudflare SSL/TLS Overview, select **Full (strict)** only after the valid Render origin
   certificate exists.
8. Enable the Cloudflare proxy only after origin HTTPS, the canonical redirect, and smoke checks are
   healthy while DNS-only. Recheck them immediately after proxying.

Do not disable the Render `onrender.com` hostname during launch; it is the controlled origin and
rollback verification path.

## 5. Protect dynamic and authenticated traffic

In Cloudflare Cache Rules, create a high-priority **Bypass cache** rule for:

- `/admin*`;
- `/portal*`, including login and password-change routes;
- `/api*`, including authentication, setup, upload, download, alerts, cron, and health routes;
- any request carrying the `ulu_session` cookie;
- any additional authentication or account-setup route introduced later.

Keep responses that set the `ulu_session` cookie dynamic. Verify the proxy does not cache a response
carrying `Set-Cookie`, private data, or authorization-dependent content. Cache only public static
assets such as versioned `/_next/static/*` files, public fonts, and public images, while respecting
origin cache-control headers.

## 6. Verify scheduled cleanup

- [ ] Deploy both additive pending-upload migrations and confirm `PendingUpload` claim fields and
      `ActiveStorageObject` exist before enabling uploads.
- [ ] Inventory pre-existing report PDF and teacher-photo references. Backfill only exact,
      owner-attributed byte sizes into `ActiveStorageObject`; remove or migrate unattributed legacy
      photos before launch. Confirm no conservative quota block remains for launch users.
- [ ] Configure one environment-scoped Render Cron Job on `*/10 * * * *` to call
      `GET /api/cron/automation` with `Authorization: Bearer <CRON_SECRET>`.
- [ ] Confirm the job has only the matching environment origin and secret, returns HTTP 2xx, and
      never logs the authorization header, a raw storage URL, or object key.
- [ ] Verify the job remains enabled after the first deploy and configure an operations alert for
      non-2xx results. A durability failure intentionally returns non-2xx and requires investigation;
      do not delete or edit the retained lease row merely to clear the alert.

## 7. Verify DNS, TLS, canonical behavior, and the app

Run from PowerShell and save only non-sensitive output:

```powershell
Resolve-DnsName uluglobalacademy.com
Resolve-DnsName www.uluglobalacademy.com
curl.exe -I https://uluglobalacademy.com
curl.exe -I https://www.uluglobalacademy.com
npm run smoke:deployment -- --base-url https://uluglobalacademy.com --environment production
```

- [ ] Apex and `www` resolve to the intended Render service through the selected Cloudflare mode.
- [ ] HTTP redirects to HTTPS.
- [ ] `www` redirects to the apex; the apex does not redirect back to `www`.
- [ ] TLS is valid and Cloudflare is in Full (strict) mode after proxying.
- [ ] `/api/health`, public pages, enrolment, contact, admin login, and each portal role pass.
- [ ] `/robots.txt` and page metadata are indexable only because `APP_ENV=production`.
- [ ] Dynamic routes return `DYNAMIC` or `BYPASS`, never a cached private response.
- [ ] Static assets load through the proxy without browser console or network errors.
- [ ] Alerts reach the private operations channel without form, session, or credential payloads.

## 8. Launch decision

The launch owner records **GO** only when every checkbox has evidence and no Critical or Important
issue remains. On **NO-GO**, stop DNS promotion or return the DNS records to DNS only, keep the last
healthy origin available, and follow `rollback.md`.

Provider references:

- [Render custom domains](https://render.com/docs/custom-domains)
- [Render Cloudflare DNS configuration](https://render.com/docs/configure-cloudflare-dns)
- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
