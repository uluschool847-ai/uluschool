type GenerateReferenceIdInput = {
  prefix: string;
  year: number;
  submissionId?: number | string;
  recordType?: string;
};

function normalizeSubmissionId(submissionId: number | string) {
  const numericId =
    typeof submissionId === "number"
      ? submissionId
      : Number.parseInt(String(submissionId).replace(/\D/g, ""), 10);

  if (Number.isFinite(numericId) && numericId > 0) {
    return numericId;
  }

  return 0;
}

export function generateReferenceId(
  prefix: string,
  id: number | string,
  year = new Date().getFullYear(),
) {
  return `${prefix}-${year}-${String(normalizeSubmissionId(id)).padStart(4, "0")}`;
}

export function generateSubmissionReferenceId(input: GenerateReferenceIdInput) {
  const fallbackId = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0")}`;
  return generateReferenceId(input.prefix, input.submissionId ?? fallbackId, input.year);
}
