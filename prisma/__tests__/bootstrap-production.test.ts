import { afterEach, describe, expect, it, vi } from "vitest";

const bootstrapProductionAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bootstrap/production-admin", () => ({
  bootstrapProductionAdmin: bootstrapProductionAdminMock,
}));

import { runProductionAdminBootstrap } from "@/prisma/bootstrap-production";

function createDatabase() {
  return {
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runProductionAdminBootstrap", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("logs the exact created message and disconnects", async () => {
    const database = createDatabase();
    const logger = { log: vi.fn(), error: vi.fn() };
    bootstrapProductionAdminMock.mockResolvedValue({ status: "created" });

    await runProductionAdminBootstrap({}, database, logger);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith("Production admin created.");
    expect(logger.error).not.toHaveBeenCalled();
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });

  it("logs the exact existing message and disconnects", async () => {
    const database = createDatabase();
    const logger = { log: vi.fn(), error: vi.fn() };
    bootstrapProductionAdminMock.mockResolvedValue({ status: "existing" });

    await runProductionAdminBootstrap({}, database, logger);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith("Production admin already exists.");
    expect(logger.error).not.toHaveBeenCalled();
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });

  it("logs one generic failure, sets a non-zero exit code, and disconnects", async () => {
    const database = createDatabase();
    const logger = { log: vi.fn(), error: vi.fn() };
    bootstrapProductionAdminMock.mockRejectedValue(
      new Error("BootstrapPassword123! sensitive-password-hash"),
    );

    await runProductionAdminBootstrap({}, database, logger);

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Production admin bootstrap failed.");
    expect(process.exitCode).toBe(1);
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });

  it("contains a disconnect failure in one generic message", async () => {
    const database = createDatabase();
    const logger = { log: vi.fn(), error: vi.fn() };
    database.$disconnect.mockRejectedValue(new Error("database connection details"));
    bootstrapProductionAdminMock.mockResolvedValue({ status: "existing" });

    await expect(runProductionAdminBootstrap({}, database, logger)).resolves.toBeUndefined();

    expect(logger.log).toHaveBeenCalledWith("Production admin already exists.");
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Production admin bootstrap failed.");
    expect(process.exitCode).toBe(1);
  });
});
