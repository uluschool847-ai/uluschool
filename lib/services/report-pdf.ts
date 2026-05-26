function text(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function fileSlug(value: unknown) {
  return String(value ?? "student")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getRows(value: unknown) {
  return Array.isArray(value) ? value.map(getRecord) : [];
}

function formatScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}

export async function renderReportSnapshotPdf(snapshotData: Record<string, unknown>) {
  const student = getRecord(snapshotData.student);
  const term = getRecord(snapshotData.academicTerm ?? snapshotData.term);
  const grades = getRecord(snapshotData.grades);
  const attendance = getRecord(snapshotData.attendance);
  const classGroup = getRecord(snapshotData.classGroup);
  const categoryRows = getRows(grades.categories);
  const homeworkRows = getRows(grades.homeworkGrades);
  const manualRows = getRows(grades.manualGrades);
  const attendanceHistory = getRows(snapshotData.attendanceHistory);
  const progressNotes = Array.isArray(snapshotData.progressNotes) ? snapshotData.progressNotes : [];
  const lines = [
    "ULU Online School",
    "Academic Progress Report",
    "----------------------------------------",
    `Report for ${student.fullName ?? "Student"}`,
    `Class/group: ${classGroup.name ?? "Class group"}`,
    `Term: ${term.name ?? "Academic term"}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Grade summary",
    `Weighted term average: ${formatScore(grades.weightedTermAverage)}`,
    ...categoryRows.map(
      (row) => `Category: ${row.label ?? row.category ?? "Category"} - ${formatScore(row.average)}`,
    ),
    "",
    "Homework grades",
    ...(homeworkRows.length
      ? homeworkRows
          .slice(0, 12)
          .map(
            (row) =>
              `${row.assignmentTitle ?? row.title ?? "Homework"} - ${formatScore(row.score)}`,
          )
      : ["No homework grades recorded."]),
    "",
    "Manual grades",
    ...(manualRows.length
      ? manualRows
          .slice(0, 12)
          .map((row) => `${row.title ?? "Manual grade"} - ${formatScore(row.score)}`)
      : ["No manual grades recorded."]),
    "",
    "Attendance summary",
    `Attendance: Present ${attendance.present ?? 0}, Late ${attendance.late ?? 0}, Absent ${
      attendance.absent ?? 0
    }`,
    ...attendanceHistory
      .slice(0, 8)
      .map(
        (row) =>
          `Attendance row: ${row.lessonTitle ?? row.title ?? "Lesson"} - ${row.status ?? ""}`,
      ),
    "",
    "Progress notes",
    ...(progressNotes.length ? [] : ["No progress notes recorded."]),
    ...progressNotes.slice(0, 8).map((note) => {
      const record = getRecord(note);
      return `Progress: ${record.content ?? record.teacherNotes ?? ""}`;
    }),
    "",
    "Teacher comment",
    `Teacher comment: ${snapshotData.teacherComment ?? "No comment"}`,
  ];

  const streamLines = lines.map(
    (line, index) => `BT /F1 12 Tf 50 ${760 - index * 24} Td (${text(line)}) Tj ET`,
  );
  const stream = streamLines.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ];
  const body = objects.join("\n");
  const pdf = `%PDF-1.4\n${body}\ntrailer << /Root 1 0 R >>\n%%EOF`;

  return {
    bytes: new Uint8Array(Buffer.from(pdf, "utf8")),
    contentType: "application/pdf",
    filename: `${fileSlug(student.fullName)}-report.pdf`,
  };
}
