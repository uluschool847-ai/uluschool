import { EnquiryStatus, UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import {
  runReminderDispatchAction,
  updateContactLeadAction,
  updateEnquiryAction,
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { enquiryStatuses, getStatusLabel, parseStatus } from "@/lib/admin/enquiry-status";
import { requireRole } from "@/lib/auth/session";
import { listRecentAdminAuditLogs } from "@/lib/repositories/admin-audit-repository";
import { getAdminAnalyticsOverview } from "@/lib/repositories/analytics-repository";
import { listContactLeads } from "@/lib/repositories/contact-lead-repository";
import { listEnquiries } from "@/lib/repositories/enquiry-repository";

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
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusOptions() {
  return (
    <>
      {enquiryStatuses.map((status) => (
        <option key={status} value={status}>
          {getStatusLabel(status)}
        </option>
      ))}
    </>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filterStatus = parseStatus(resolvedSearchParams?.status);
  const [enquiries, contactLeads, analytics, auditLogs] = await Promise.all([
    listEnquiries(filterStatus ?? undefined),
    listContactLeads(filterStatus ?? undefined),
    getAdminAnalyticsOverview(),
    listRecentAdminAuditLogs(25),
  ]);

  return (
    <div className="space-y-6">
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
            <p className="text-muted-foreground">Accepted</p>
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
              <Link href="/admin">all</Link>
            </Button>
            {enquiryStatuses.map((status) => (
              <Button
                key={status}
                asChild
                variant={filterStatus === status ? "default" : "secondary"}
                size="sm"
              >
                <Link href={`/admin?status=${getStatusLabel(status)}`}>
                  {getStatusLabel(status)}
                </Link>
              </Button>
            ))}
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/security">Security</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/cms">Content (CMS)</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/analytics">BI Analytics</Link>
            </Button>
          </div>
          <div className="rounded-lg border border-secondary p-3">
            <p className="mb-2 font-medium">Reminder Dispatch</p>
            <p className="mb-3 text-muted-foreground">
              Production cron should call <code>/api/reminders/send-due</code>. You can also run it
              manually from here.
            </p>
            <form action={runReminderDispatchAction}>
              <Button type="submit" size="sm">
                Run Reminder Job Now
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

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
                    <strong>Student:</strong> {item.studentName}
                  </p>
                  <p>
                    <strong>Parent:</strong> {item.parentGuardianName}
                  </p>
                  <p>
                    <strong>Email:</strong> {item.email}
                  </p>
                  <p>
                    <strong>Phone:</strong> {item.phoneWhatsapp}
                  </p>
                  <p>
                    <strong>Level:</strong> {item.curriculumLevel.name}
                  </p>
                  <p>
                    <strong>Schedule:</strong> {item.preferredSchedule}
                  </p>
                  <p className="md:col-span-2">
                    <strong>Subjects:</strong> {item.subjects.join(", ")}
                  </p>
                  <p className="md:col-span-2">
                    <strong>Additional Notes:</strong> {item.additionalNotes || "N/A"}
                  </p>
                  <p className="text-muted-foreground md:col-span-2">
                    Submitted: {formatDate(item.createdAt)}
                  </p>
                  <p className="text-muted-foreground md:col-span-2">
                    Source: {item.utmSource || "direct"} / {item.utmMedium || "n/a"} /{" "}
                    {item.utmCampaign || "n/a"}
                  </p>
                </div>

                <form
                  action={updateEnquiryAction}
                  className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <label className="grid gap-1 text-sm">
                    <span>Status</span>
                    <select
                      name="status"
                      defaultValue={item.status}
                      className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <StatusOptions />
                    </select>
                  </label>
                  <div className="grid gap-1 text-sm">
                    <label htmlFor={`enquiry-notes-${item.id}`}>Admin notes</label>
                    <Textarea
                      id={`enquiry-notes-${item.id}`}
                      name="adminNotes"
                      defaultValue={item.adminNotes || ""}
                      className="min-h-[88px]"
                      placeholder="Internal note for review workflow"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                  </div>
                </form>
              </article>
            ))
          )}
        </CardContent>
      </Card>

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
                    <strong>Name:</strong> {item.fullName}
                  </p>
                  <p>
                    <strong>Email:</strong> {item.email}
                  </p>
                  <p>
                    <strong>Phone:</strong> {item.phoneWhatsapp || "N/A"}
                  </p>
                  <p>
                    <strong>Student Grade:</strong> {item.studentGrade || "N/A"}
                  </p>
                  <p className="md:col-span-2">
                    <strong>Message:</strong> {item.message}
                  </p>
                  <p className="text-muted-foreground md:col-span-2">
                    Submitted: {formatDate(item.createdAt)}
                  </p>
                  <p className="text-muted-foreground md:col-span-2">
                    Source: {item.utmSource || "direct"} / {item.utmMedium || "n/a"} /{" "}
                    {item.utmCampaign || "n/a"}
                  </p>
                </div>

                <form
                  action={updateContactLeadAction}
                  className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <label className="grid gap-1 text-sm">
                    <span>Status</span>
                    <select
                      name="status"
                      defaultValue={item.status}
                      className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <StatusOptions />
                    </select>
                  </label>
                  <div className="grid gap-1 text-sm">
                    <label htmlFor={`contact-notes-${item.id}`}>Admin notes</label>
                    <Textarea
                      id={`contact-notes-${item.id}`}
                      name="adminNotes"
                      defaultValue={item.adminNotes || ""}
                      className="min-h-[88px]"
                      placeholder="Internal note for review workflow"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                  </div>
                </form>
              </article>
            ))
          )}
        </CardContent>
      </Card>

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
                <li key={log.id} className="rounded-lg border border-secondary p-3">
                  <p>
                    <strong>{log.action}</strong> by {log.adminUser.fullName} ({log.adminUser.email}
                    )
                  </p>
                  <p className="text-muted-foreground">
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
    </div>
  );
}
