import { EnquiryStatus } from "@prisma/client";

export const enquiryStatuses = [
  EnquiryStatus.NEW,
  EnquiryStatus.IN_REVIEW,
  EnquiryStatus.ACCEPTED,
  EnquiryStatus.REJECTED,
] as const;

export function getStatusLabel(status: EnquiryStatus) {
  switch (status) {
    case EnquiryStatus.NEW:
      return "new";
    case EnquiryStatus.IN_REVIEW:
      return "in_review";
    case EnquiryStatus.ACCEPTED:
      return "accepted";
    case EnquiryStatus.REJECTED:
      return "rejected";
  }
}

export function parseStatus(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const alias = normalized === "IN_REVIEW" ? "IN_REVIEW" : normalized;
  return enquiryStatuses.find((status) => status === alias) ?? null;
}
