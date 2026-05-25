import { saveReportSnapshotAction } from "@/app/portal/teacher/actions/report-actions";
import { requireRole } from "@/lib/auth/session";
import { buildReportPreview } from "@/lib/repositories/report-repository";
import { UserRole } from "@prisma/client";

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveParams(searchParams: PageProps["searchParams"]) {
  return searchParams ? await searchParams : {};
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function TeacherReportPreviewPage({ searchParams }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveParams(searchParams);
  const preview =
    params.studentId && params.termId
      ? await buildReportPreview(session.uid, params.studentId, params.termId)
      : null;

  if (!preview) {
    return (
      <main>
        <h1>Report Preview</h1>
        <p>Report preview is not available.</p>
      </main>
    );
  }

  const grades = getRecord(preview.grades);
  const attendance = getRecord(preview.attendance);
  const classGroup = getRecord(preview.classGroup);
  const saveAction = async (formData: FormData) => {
    "use server";
    await saveReportSnapshotAction(formData);
  };

  return (
    <main>
      <h1>Report Preview</h1>
      <p>{preview.student.fullName}</p>
      <p>{String(classGroup.name ?? "")}</p>
      <p>{preview.academicTerm.name}</p>
      <p>Weighted term average: {String(grades.weightedTermAverage ?? "No average")}</p>
      <p>Present: {String(attendance.present ?? 0)}</p>
      <p>Late: {String(attendance.late ?? 0)}</p>
      <p>Absent: {String(attendance.absent ?? 0)}</p>
      <section>
        <h2>Progress notes</h2>
        {preview.progressNotes.map((note: Record<string, unknown>) => (
          <p key={String(note.id ?? note.content)}>
            {String(note.content ?? note.teacherNotes ?? "")}
          </p>
        ))}
      </section>
      <form action={saveAction}>
        <label>
          Teacher comment
          <textarea name="teacherComment" />
        </label>
        <input type="hidden" name="studentId" value={preview.student.id} />
        <input type="hidden" name="academicTermId" value={preview.academicTerm.id} />
        <input type="hidden" name="classGroupId" value={String(classGroup.id ?? "")} />
        <input type="hidden" name="snapshotData" value={JSON.stringify(preview)} />
        <button type="submit">Save report snapshot</button>
      </form>
    </main>
  );
}
