import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import {
  generateReportCommentDraftAction,
  reviewTeacherAiDraftAction,
} from "@/app/portal/teacher/actions/ai-draft-actions";
import { exportReportSnapshotPdfAction } from "@/app/portal/teacher/actions/report-actions";
import { requireRole } from "@/lib/auth/session";
import { listReportCommentDraftsForTeacher } from "@/lib/repositories/ai-draft-repository";
import { getReportSnapshotForTeacher } from "@/lib/repositories/report-repository";
import { preferredStoredFileHref } from "@/lib/security/storage-links";

type PageProps = {
  params: Promise<{ snapshotId: string }> | { snapshotId: string };
};

async function resolveParams(params: PageProps["params"]) {
  return await params;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pdfHref(storageKey?: string | null) {
  return preferredStoredFileHref(storageKey, storageKey);
}

export default async function TeacherReportSnapshotPage({ params }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { snapshotId } = await resolveParams(params);
  const [snapshot, aiDrafts] = await Promise.all([
    getReportSnapshotForTeacher(session.uid, snapshotId),
    listReportCommentDraftsForTeacher(session.uid, snapshotId),
  ]);
  if (!snapshot) notFound();

  const data = getRecord(snapshot.snapshotData);
  const student = getRecord(data.student);
  const term = getRecord(data.academicTerm ?? data.term);
  const grades = getRecord(data.grades);
  const pdf = pdfHref(snapshot.pdfStorageKey);
  const exportAction = async () => {
    "use server";
    await exportReportSnapshotPdfAction(snapshot.id);
  };
  const generateDraftAction = async () => {
    "use server";
    await generateReportCommentDraftAction({ snapshotId: snapshot.id });
  };

  return (
    <main>
      <h1>Saved Report</h1>
      <p>{String(student.fullName ?? "Student")}</p>
      <p>{String(term.name ?? "Academic term")}</p>
      <p>Weighted term average: {String(grades.weightedTermAverage ?? "No average")}</p>
      <p>{String(data.teacherComment ?? snapshot.teacherComment ?? "No teacher comment")}</p>
      <p>Snapshot version: {snapshot.snapshotVersion}</p>
      {pdf ? (
        <p>
          <a href={pdf}>Download PDF report</a>
        </p>
      ) : (
        <p>PDF has not been generated yet.</p>
      )}
      <form action={exportAction}>
        <button type="submit">Export PDF</button>
      </form>
      <section aria-label="AI report comment drafts">
        <h2>AI draft assistant</h2>
        <p>
          Drafts are suggestions only. They are not published to students or parents until a teacher
          reviews and approves final report text.
        </p>
        <form action={generateDraftAction}>
          <button type="submit">Generate report comment draft</button>
        </form>
        {aiDrafts.length === 0 ? (
          <p>No AI drafts yet.</p>
        ) : (
          <ul>
            {aiDrafts.map((draft) => (
              <li key={draft.id}>
                <p>{draft.outputText}</p>
                <p>Status: {draft.status}</p>
                {draft.status === "DRAFT" ? (
                  <div>
                    <form
                      action={async () => {
                        "use server";
                        await reviewTeacherAiDraftAction({
                          draftId: draft.id,
                          status: "APPROVED",
                        });
                      }}
                    >
                      <button type="submit">Approve draft</button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await reviewTeacherAiDraftAction({
                          draftId: draft.id,
                          status: "REJECTED",
                        });
                      }}
                    >
                      <button type="submit">Reject draft</button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
