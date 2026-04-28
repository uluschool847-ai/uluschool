import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/monitoring/alerts", () => ({
  sendOpsAlert: vi.fn(() => Promise.resolve({ id: "alert-1" })),
}));

// We must import the route handler
import { POST as alertTestPost } from "@/app/api/alerts/test/route";

describe("Strict Schema Validation - API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/alerts/test", () => {
    it("returns 400 Bad Request with structured errors when JSON body is malformed or missing required fields", async () => {
      // Create a request with an invalid/empty body
      const request = new Request("http://localhost/api/alerts/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer TEST_TOKEN", // Assume token is valid for the test
        },
        body: JSON.stringify({
          // missing 'message' and 'severity' which should be required
        }),
      });

      // Mock process.env to ensure auth passes
      process.env.ALERT_TEST_TOKEN = "TEST_TOKEN";

      const response = await alertTestPost(request);

      // We expect the API to strictly validate the payload using Zod and return 400
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.ok).toBe(false);
      expect(json.errors).toBeDefined();
    });

    it("returns 400 Bad Request when body is not valid JSON", async () => {
      const request = new Request("http://localhost/api/alerts/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer TEST_TOKEN",
        },
        body: "invalid-json-string{",
      });

      const response = await alertTestPost(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBeDefined(); // Should indicate invalid JSON
    });
  });
});
