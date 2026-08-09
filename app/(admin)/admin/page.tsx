import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminCrmListControls } from "@/components/admin/crm/AdminCrmListControls";
import { ReminderDispatchControls } from "@/components/admin/reminders/ReminderDispatchControls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enquiryStatuses, getStatusLabel, parseStatus } from "@/lib/admin/enquiry-status";
import { requireRole } from "@/lib/auth/session";
import { listRecentAdminAuditLogs } from "@/lib/repositories/admin-audit-repository";
import { getSubmissions } from "@/lib/repositories/admin-submission-repository";
import { getAdminAnalyticsOverview } from "@/lib/repositories/analytics-repository";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

type AdminPageProps = {
  searchParams?: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
};

type AdminEnquiryListItem = {
  id: string;
  referenceId?: string | null;
  studentName?: string | null;
  parentGuardianName?: string | null;
  email?: string | null;
  phoneWhatsapp?: string | null;
  additionalNotes?: string | null;
  createdAt?: Date;
};

type AdminLeadListItem = {
  id: string;
  referenceId?: string | null;
  fullName?: string | null;
  email?: string | null;
  phoneWhatsapp?: string | null;
  studentGrade?: string | null;
  message?: string | null;
  createdAt?: Date;
};

function formatDate(date: Date) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).formatToParts(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const year = dateParts.find((part) => part.type === "year")?.value ?? "";

  return `${day} ${month} ${year}, ${time}`;
}

function withSearchParam(basePath: string, search: string) {
  if (!search) {
    return basePath;
  }

  return `${basePath}?search=${encodeURIComponent(search)}`;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filterStatus = parseStatus(resolvedSearchParams?.status);
  const search = resolvedSearchParams?.search?.trim() ?? "";
  const page = Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1;
  const searchIsActive = search.length > 0;

  const [rawEnquiries, rawContactLeads, analytics, auditLogs] = await Promise.all([
    getSubmissions({
      entityType: "enquiry",
      search: search || undefined,
      page,
      status: filterStatus,
    }) as Promise<AdminEnquiryListItem[] | undefined>,
    getSubmissions({
      entityType: "lead",
      search: search || undefined,
      page,
      status: filterStatus,
    }) as Promise<AdminLeadListItem[] | undefined>,
    getAdminAnalyticsOverview(),
    listRecentAdminAuditLogs(25),
  ]);
  const enquiries = rawEnquiries ?? [];
  const contactLeads = rawContactLeads ?? [];

  const hasNoMatchingResults =
    searchIsActive && enquiries.length === 0 && contactLeads.length === 0;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Review analytics, submissions, and recent admin activity.
        </p>
      </div>

      <section aria-label="Analytics overview">
        <Card>
          <CardHeader>
            <CardTitle>Analytics Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-secondary p-3">
              <p className="text-muted-foreground">Applications</p>
              <p className="text-xl font-semibold">{analytics.totalApplications}</p>
            </div>
            <div className="rounded-lg border border-secondary p-3">
              <p className="text-muted-foreground">Converted</p>
              <p className="text-xl font-semibold">{analytics.acceptedApplications}</p>
            </div>
            <div className="rounded-lg border border-secondary p-3">
              <p className="text-muted-foreground">Conversion</p>
              <p className="text-xl font-semibold">{analytics.conversionRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-secondary p-3">
              <p className="text-muted-foreground">Contact Leads</p>
              <p className="text-xl font-semibold">{analytics.totalContactLeads}</p>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <p className="mb-2 text-sm font-medium">Traffic Sources</p>
            {analytics.trafficSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source data yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm md:grid-cols-3">
                {analytics.trafficSources.map((source) => (
                  <li key={source.source} className="rounded-md border border-secondary px-3 py-2">
                    <strong>{source.source}</strong>: {source.count}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Admin actions and filters">
        <Card>
          <CardHeader>
            <CardTitle>MVP Admin Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Review and process enquiries from Enrol and Contact forms.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant={filterStatus ? "secondary" : "default"} size="sm">
                <Link href={withSearchParam("/admin", search)}>all</Link>
              </Button>
              {enquiryStatuses.map((status) => (
                <Button
                  key={status}
                  asChild
                  variant={filterStatus === status ? "default" : "secondary"}
                  size="sm"
                >
                  <Link
                    href={`/admin?status=${getStatusLabel(status)}${
                      searchIsActive ? `&search=${encodeURIComponent(search)}` : ""
                    }`}
                  >
                    {getStatusLabel(status)}
                  </Link>
                </Button>
              ))}
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/parents">Parents</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/cms">Content (CMS)</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/analytics">BI Analytics</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/ai-drafts">AI Drafts</Link>
              </Button>
            </div>
            <AdminCrmListControls
              basePath="/admin"
              initialPage={page}
              initialQuery={search}
              queryParam="search"
            />
            <div className="rounded-lg border border-secondary p-3">
              <p className="mb-2 font-medium">Reminder Dispatch</p>
              <p className="mb-3 text-muted-foreground">
                Production cron should call <code>/api/reminders/send-due</code>. You can also run
                it manually from here.
              </p>
              <ReminderDispatchControls />
              <Button asChild className="mt-2" size="sm" variant="secondary">
                <Link href="/admin/reminders">View Reminder Logs</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-label="School Setup">
        <Card>
          <CardHeader>
            <CardTitle>School Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Create accounts, publish teacher profiles, and prepare classes for lessons.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/users">User Accounts</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/admin/users?createRole=TEACHER">Create Teacher Account</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/teachers">Teacher Profiles</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/classes/new">Create Class Group</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/students">Students</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/subjects">Subjects</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {hasNoMatchingResults ? (
        <Card>
          <CardContent className="p-6">
            <output className="text-sm text-muted-foreground">No matching records found.</output>
          </CardContent>
        </Card>
      ) : null}

      <section aria-label="Recent submissions">
        <Card>
          <CardHeader>
            <CardTitle>Enrolment Enquiries ({enquiries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {enquiries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No enrolment enquiries found.</p>
            ) : (
              enquiries.map((item) => (
                <article key={item.id} className="rounded-xl border border-secondary p-4">
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <p>
                      <strong>Reference ID:</strong> {item.referenceId || "Pending"}
                    </p>
                    <p>
                      <strong>Case ID:</strong> {item.id}
                    </p>
                    <p>
                      <strong>Student:</strong> {item.studentName || "N/A"}
                    </p>
                    <p>
                      <strong>Parent:</strong> {item.parentGuardianName || "N/A"}
                    </p>
                    <p>
                      <strong>Email:</strong> {item.email || "N/A"}
                    </p>
                    <p>
                      <strong>Phone:</strong> {item.phoneWhatsapp || "N/A"}
                    </p>
                    <p className="md:col-span-2">
                      <strong>Additional Notes:</strong> {item.additionalNotes || "N/A"}
                    </p>
                    {item.createdAt ? (
                      <p className="text-muted-foreground md:col-span-2">
                        Submitted: {formatDate(item.createdAt)}
                      </p>
                    ) : null}
                    <p className="md:col-span-2">
                      <Link
                        href={withSearchParam(`/admin/enquiries/${item.id}`, search)}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open enquiry details
                      </Link>
                    </p>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Contact enquiries">
        <Card>
          <CardHeader>
            <CardTitle>Contact Enquiries ({contactLeads.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contactLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contact enquiries found.</p>
            ) : (
              contactLeads.map((item) => (
                <article key={item.id} className="rounded-xl border border-secondary p-4">
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <p>
                      <strong>Reference ID:</strong> {item.referenceId || "Pending"}
                    </p>
                    <p>
                      <strong>Case ID:</strong> {item.id}
                    </p>
                    <p>
                      <strong>Name:</strong> {item.fullName || "N/A"}
                    </p>
                    <p>
                      <strong>Email:</strong> {item.email || "N/A"}
                    </p>
                    <p>
                      <strong>Phone:</strong> {item.phoneWhatsapp || "N/A"}
                    </p>
                    <p>
                      <strong>Student Grade:</strong> {item.studentGrade || "N/A"}
                    </p>
                    <p className="md:col-span-2">
                      <strong>Message:</strong> {item.message || "N/A"}
                    </p>
                    {item.createdAt ? (
                      <p className="text-muted-foreground md:col-span-2">
                        Submitted: {formatDate(item.createdAt)}
                      </p>
                    ) : null}
                    <p className="md:col-span-2">
                      <Link
                        href={withSearchParam(`/admin/leads/${item.id}`, search)}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open lead details
                      </Link>
                    </p>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Audit log">
        <Card>
          <CardHeader>
            <CardTitle>Recent Admin Audit Logs ({auditLogs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin audit logs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {auditLogs.map((log) => (
                  <li key={log.id} className="min-w-0 rounded-lg border border-secondary p-3">
                    <p className="break-words">
                      <strong className="break-all">{log.action}</strong> by{" "}
                      {log.actorFullName ||
                        log.actorEmail ||
                        log.adminUser?.fullName ||
                        log.adminUser?.email ||
                        "Deleted account"}{" "}
                      (
                      <span className="break-all">
                        {log.actorEmail || log.adminUser?.email || "snapshot unavailable"}
                      </span>
                      )
                    </p>
                    <p className="break-all text-muted-foreground">
                      Target: {log.targetType}
                      {log.targetId ? ` (${log.targetId})` : ""}
                    </p>
                    <p className="text-muted-foreground">At: {formatDate(log.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
