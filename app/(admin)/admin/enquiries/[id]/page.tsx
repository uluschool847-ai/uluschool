import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NoteAddForm } from "@/components/admin/crm/NoteAddForm";
import { StatusUpdateForm } from "@/components/admin/crm/StatusUpdateForm";
import { Timeline } from "@/components/admin/crm/Timeline";
import { requireRole } from "@/lib/auth/session";
import { getEnquiryCaseById } from "@/lib/repositories/enquiry-repository";

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
};

const STATUSES = ["NEW", "IN_PROGRESS", "CONVERTED", "REJECTED"];

type AdminNote = {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date | string;
};

function AdminNotes({ notes }: { notes: AdminNote[] }) {
  if (notes.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
        No admin notes yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Admin notes">
      {notes.map((note) => (
        <li key={note.id} className="rounded-md border border-slate-200 bg-white p-4">
          <p className="whitespace-pre-wrap text-sm text-slate-900">{note.content}</p>
          <p className="mt-2 text-xs text-slate-500">
            Author: {note.authorId} - {new Date(note.createdAt).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function EnquiryCasePage({ params }: PageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const enquiry = await getEnquiryCaseById(resolvedParams.id);

  if (!enquiry) {
    notFound();
  }

  return (
    <main className="space-y-8">
      <Link
        href="/admin/submissions"
        className="inline-flex text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
      >
        Back to enrolment submissions
      </Link>
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm font-semibold uppercase text-slate-500">Enrolment enquiry</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{enquiry.studentName}</h1>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Reference ID: {enquiry.referenceId ?? "Pending"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">Case ID: {enquiry.id}</span>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
          <div>
            <span className="font-semibold">Parent</span>
            <p>{enquiry.parentGuardianName}</p>
          </div>
          <div>
            <span className="font-semibold">Email</span>
            <p>{enquiry.email}</p>
          </div>
          <div>
            <span className="font-semibold">Phone</span>
            <p>{enquiry.phoneWhatsapp}</p>
          </div>
          <div>
            <span className="font-semibold">Consent evidence</span>
            {enquiry.consentVersion && enquiry.consentGivenAt ? (
              <p>
                Captured: {enquiry.consentVersion} at{" "}
                {new Date(enquiry.consentGivenAt).toLocaleString()}
              </p>
            ) : (
              <p>Legacy record - consent evidence not captured.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-950">Timeline</h2>
          <Timeline events={enquiry.timeline ?? []} />
          <h2 className="text-xl font-semibold text-slate-950">Admin Notes</h2>
          <AdminNotes notes={enquiry.notes ?? []} />
        </div>
        <aside className="space-y-6 rounded-lg border border-slate-200 bg-white p-5">
          <StatusUpdateForm
            entityType="enquiry"
            entityId={enquiry.id}
            currentStatus={enquiry.status}
            statuses={STATUSES}
          />
          <NoteAddForm entityType="enquiry" entityId={enquiry.id} />
        </aside>
      </section>
    </main>
  );
}
