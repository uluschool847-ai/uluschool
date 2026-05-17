import { EnquiryStatus } from "@prisma/client";

export const enquiryStatuses = [
  EnquiryStatus.NEW,
  EnquiryStatus.IN_PROGRESS,
  EnquiryStatus.CONVERTED,
  EnquiryStatus.REJECTED,
] as const;

export function getStatusLabel(status: EnquiryStatus) {
  switch (status) {
    case EnquiryStatus.NEW:
      return "New";
    case EnquiryStatus.IN_PROGRESS:
      return "In Progress";
    case EnquiryStatus.CONVERTED:
      return "Converted";
    case EnquiryStatus.REJECTED:
      return "Rejected";
  }
}

export function parseStatus(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  return enquiryStatuses.find((status) => status === normalized) ?? null;
}
