import { EnquiryStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getStatusLabel, parseStatus } from "@/lib/admin/enquiry-status";

describe("Enquiry status label formatting", () => {
  it("returns human-readable title case labels for dashboard filters", () => {
    expect(getStatusLabel(EnquiryStatus.NEW)).toBe("New");
    expect(getStatusLabel(EnquiryStatus.IN_PROGRESS)).toBe("In Progress");
    expect(getStatusLabel(EnquiryStatus.CONVERTED)).toBe("Converted");
    expect(getStatusLabel(EnquiryStatus.REJECTED)).toBe("Rejected");
  });

  it("parses human-readable labels back into enum values", () => {
    expect(parseStatus("New")).toBe(EnquiryStatus.NEW);
    expect(parseStatus("In Progress")).toBe(EnquiryStatus.IN_PROGRESS);
    expect(parseStatus("Converted")).toBe(EnquiryStatus.CONVERTED);
    expect(parseStatus("Rejected")).toBe(EnquiryStatus.REJECTED);
  });
});
