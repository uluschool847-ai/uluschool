# Deployment Rollback and Database Recovery

Rollback is an incident action, not a substitute for the staging gate. Assign an incident owner,
preserve non-sensitive evidence, and announce each decision in the private operations channel.

## Immediate containment

1. Stop DNS promotion on any staging failure. Do not merge to `main` or attach production domains.
2. If production is affected, stop new deploys and determine whether the failure is application,
   environment, provider, object storage, DNS/TLS, or database related.
3. Put Cloudflare records back to DNS only when proxy rules or Cloudflare TLS are the suspected
   cause, then test the Render origin directly.
4. Do not expose an internal database URL or bypass authentication while diagnosing.

## Failed build or pre-deploy

Render keeps the last healthy application serving when a new build or pre-deploy command fails.
Inspect the first failing phase, correct the branch or environment, rerun CI, and deploy a new
commit. Never bypass `npm run env:check` or migrations to force a release through.

If a migration partially applied, inspect the Prisma migration table and database state before any
application rollback. Escalate to the database owner; do not guess or mark a migration applied
without evidence.

## Application rollback

A Render application rollback is allowed only when the target build is compatible with the schema
already applied to the database and with current storage records. Before clicking Rollback:

- compare migrations between the current and target commits;
- confirm the old code tolerates every applied table, column, enum, and data transformation;
- confirm current environment variables and R2 behavior remain compatible;
- record the target deploy ID, commit, owner, reason, and verification plan.

After rollback, run `/api/health`, deployment smoke, admin TOTP login, role/ownership checks, file
download checks, and the affected business workflow. Render rollback does not undo database data,
DNS, third-party state, or operator actions.

## Database correction and recovery

The normal database rollback is a **forward corrective migration** reviewed and deployed through
the same CI and pre-deploy path. Never use `prisma migrate reset`, `npm run db:reset`, `prisma db
push --force-reset`, or a destructive restore against staging or production.

Use point-in-time recovery only for confirmed destructive data loss or corruption under a recorded
incident decision. The incident record must include:

- decision owner and database owner;
- observed impact and affected time range;
- selected recovery point in UTC and Africa/Nairobi time;
- known writes that will be lost after that point;
- approval to create an isolated recovery database;
- validation queries and role/browser checks;
- connection cutover and rollback plan.

Render point-in-time recovery creates a separate database. Validate it in isolation before changing
any web service connection. Update `DATABASE_URL` and `DIRECT_URL` together, redeploy, run the full
health/smoke/role gate, and keep the original database unchanged until the recovery is accepted.

## Object storage, credentials, and DNS

- For a missing or unauthorized R2 object, stop writes to the affected workflow, preserve record
  and object identifiers privately, and correct authorization or restore the object through the
  approved storage recovery process. Do not make the bucket public.
- If a credential may be exposed, revoke and rotate it at the provider, update only the affected
  environment, redeploy, and verify logs/alerts remain sanitized.
- If domain promotion fails, restore the last known-good CNAME/proxy state, wait for propagation,
  and verify both the Render origin and canonical domain. Do not change database state for a DNS
  failure.

## Recovery completion

Close the incident only after health, deployment smoke, affected browser workflows, role/IDOR
denials, Nairobi schedule display, alert sanitization, and data reconciliation pass. Record the
final deploy/database IDs, cleanup actions, remaining risk, and follow-up owner without including
credentials or personal data.

Provider references:

- [Render rollbacks](https://render.com/docs/rollbacks)
- [Render PostgreSQL recovery and backups](https://render.com/docs/postgresql-backups)
