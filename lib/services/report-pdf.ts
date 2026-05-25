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

export async function renderReportSnapshotPdf(snapshotData: Record<string, unknown>) {
  const student = getRecord(snapshotData.student);
  const term = getRecord(snapshotData.academicTerm ?? snapshotData.term);
  const grades = getRecord(snapshotData.grades);
  const attendance = getRecord(snapshotData.attendance);
  const progressNotes = Array.isArray(snapshotData.progressNotes) ? snapshotData.progressNotes : [];
  const lines = [
    `Report for ${student.fullName ?? "Student"}`,
    `Term: ${term.name ?? "Academic term"}`,
    `Weighted term average: ${grades.weightedTermAverage ?? "No average"}`,
    `Attendance: Present ${attendance.present ?? 0}, Late ${attendance.late ?? 0}, Absent ${
      attendance.absent ?? 0
    }`,
    `Teacher comment: ${snapshotData.teacherComment ?? "No comment"}`,
    ...progressNotes.slice(0, 4).map((note) => {
      const record = getRecord(note);
      return `Progress: ${record.content ?? record.teacherNotes ?? ""}`;
    }),
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
