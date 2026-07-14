const PDF_OBJECTS = [
  "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
  "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
  "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n",
  "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
] as const;

export function createTinyPdf() {
  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const parts = [header];
  const offsets: number[] = [];
  let byteOffset = header.length;

  for (const object of PDF_OBJECTS) {
    const bytes = Buffer.from(object, "ascii");
    offsets.push(byteOffset);
    parts.push(bytes);
    byteOffset += bytes.length;
  }

  const xrefOffset = byteOffset;
  const xrefEntries = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  parts.push(
    Buffer.from(
      `xref\n0 5\n0000000000 65535 f \n${xrefEntries}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "ascii",
    ),
  );

  return Buffer.concat(parts);
}
