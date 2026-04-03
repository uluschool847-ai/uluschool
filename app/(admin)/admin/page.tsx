import { EnquiryStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { updateContactLeadAction, updateEnquiryAction } from "@/app/(admin)/admin/actions";
import { enquiryStatuses, getStatusLabel, parseStatus } from "@/lib/admin/enquiry-status";
import { listContactLeads } from "@/lib/repositories/contact-lead-repository";
import { listEnquiries } from "@/lib/repositories/enquiry-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filterStatus = parseStatus(resolvedSearchParams?.status);
  const [enquiries, contactLeads] = await Promise.all([
    listEnquiries(filterStatus ?? undefined),
    listContactLeads(filterStatus ?? undefined),
  ]);

  return (
    <div className="space-y-6">
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
                <Link href={`/admin?status=${getStatusLabel(status)}`}>{getStatusLabel(status)}</Link>
              </Button>
            ))}
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
                </div>

                <form action={updateEnquiryAction} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
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
                  <label className="grid gap-1 text-sm">
                    <span>Admin notes</span>
                    <Textarea
                      name="adminNotes"
                      defaultValue={item.adminNotes || ""}
                      className="min-h-[88px]"
                      placeholder="Internal note for review workflow"
                    />
                  </label>
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
                  <label className="grid gap-1 text-sm">
                    <span>Admin notes</span>
                    <Textarea
                      name="adminNotes"
                      defaultValue={item.adminNotes || ""}
                      className="min-h-[88px]"
                      placeholder="Internal note for review workflow"
                    />
                  </label>
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
    </div>
  );
}
