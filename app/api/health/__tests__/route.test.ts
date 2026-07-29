import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.hoisted(() => vi.fn());
const enquiryFindFirstMock = vi.hoisted(() => vi.fn());
const pendingUploadFindFirstMock = vi.hoisted(() => vi.fn());
const sendOpsAlertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    enquiry: {
      findFirst: enquiryFindFirstMock,
    },
    pendingUpload: {
      findFirst: pendingUploadFindFirstMock,
    },
  },
}));

vi.mock("@/lib/monitoring/alerts", () => ({
  sendOpsAlert: sendOpsAlertMock,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
  enquiryFindFirstMock.mockResolvedValue(null);
  pendingUploadFindFirstMock.mockResolvedValue(null);
  sendOpsAlertMock.mockResolvedValue({ sent: true });
});

describe("GET /api/health", () => {
  it("checks connectivity and current schema sentinels before reporting readiness", async () => {
    const response = await GET();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const connectivityQuery = queryRawMock.mock.calls[0]?.[0] as TemplateStringsArray;
    expect(Array.from(connectivityQuery).join("")).toBe("SELECT 1");
    expect(enquiryFindFirstMock).toHaveBeenCalledTimes(1);
    expect(enquiryFindFirstMock).toHaveBeenCalledWith({
      select: { consentVersion: true },
    });
    expect(pendingUploadFindFirstMock).toHaveBeenCalledTimes(1);
    expect(pendingUploadFindFirstMock).toHaveBeenCalledWith({
      select: { claimedAt: true },
    });
    expect(sendOpsAlertMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      database: "ok",
    });
    expect(response.status).toBe(200);
  });

  it("returns a generic error and preserves alerting when the schema is not ready", async () => {
    const privateFailure = "column claimedAt is missing at private-host";
    pendingUploadFindFirstMock.mockRejectedValueOnce(new Error(privateFailure));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      status: "error",
      database: "error",
    });
    expect(JSON.stringify(payload)).not.toContain(privateFailure);
    expect(sendOpsAlertMock).toHaveBeenCalledWith({
      title: "Health Check Failed",
      message: "Database health endpoint returned an error.",
      severity: "critical",
    });
    expect(consoleError).toHaveBeenCalledWith("Health check failed", expect.any(Error));
  });
});
