# Infrastructure & Security Policies

As mathSchool scales, establishing robust operational procedures is critical to ensure data integrity, security, and uninterrupted service.

## 1. Database Backups and Recovery

We utilize **Neon Serverless Postgres** for our database infrastructure. Neon provides built-in mechanisms that we must configure and monitor.

- **Automated Backups:**
  - Neon automatically handles continuous storage backups.
  - We retain PITR (Point-In-Time Recovery) data for at least 7 days in production.
- **Recovery Procedure:**
  - In the event of catastrophic data loss or accidental deletion, the lead engineer will utilize Neon's branching feature to instantly restore the database state to a point just before the incident.
  - The restored branch will then be promoted to the primary production endpoint.
- **Data Export:**
  - Weekly logical dumps (`pg_dump`) will be executed via a secure cron job and stored in encrypted S3 buckets for cold storage compliance.

## 2. Team Access Control (RBAC)

Access to the mathSchool platform and infrastructure is strictly governed by the principle of least privilege.

- **Application Roles (`UserRole` enum):**
  - `ADMIN`: Full access to CMS, BI dashboards, CRM, and system settings.
  - `TEACHER`: Access limited to assigned classes, materials, and specific student data.
  - `STUDENT` & `PARENT`: Access restricted exclusively to their own educational data.
- **Infrastructure Access:**
  - Production database access is restricted to Lead Engineers via VPN or secure Bastion hosts.
  - Developers utilize separate Neon branches for development and testing. Never connect local environments to the production database URL.

## 3. Incident Response and "Firefighting" Mitigation

The goal of scaling is to move away from constant firefighting.

- **Error Tracking:** All application errors are logged via **Sentry** (`@sentry/nextjs`). High-severity errors trigger immediate Slack alerts to the engineering team.
- **Automated Triage:** The `ManagerTask` system automatically flags anomalous business events (e.g., consecutive failed payments) for the admin team to review proactively, rather than waiting for customer complaints.
- **Deployments:** Vercel is used for CI/CD. All pull requests generate preview environments. Code is only merged to `main` (production) after passing automated Prisma schema validation and visual review.

## 4. Privacy & Compliance

- **2FA (Two-Factor Authentication):** Enabled and required for all `ADMIN` accounts.
- **PII Protection:** Student names, contact details, and payment information are strictly segregated. Only authorized personnel can export lists of PII.
