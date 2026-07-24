import { afterEach, describe, expect, it, vi } from "vitest";

const bootstrapProductionAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bootstrap/production-admin", () => ({
  bootstrapProductionAdmin: bootstrapProductionAdminMock,
}));

import { runProductionAdminBootstrap } from "@/prisma/bootstrap-production";

function createDatabase() {
  return {
    $disconnect: vi.fn().mockResolvedValue(undefined),
    level: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    subject: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("runProductionAdminBootstrap", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("initializes the public enrolment catalogue before the administrator", async () => {
    const database = createDatabase();
    const logger = { log: vi.fn(), error: vi.fn() };
    bootstrapProductionAdminMock.mockResolvedValue({ status: "existing" });

    await runProductionAdminBootstrap({}, database, logger);

    expect(database.level.upsert).toHaveBeenCalledTimes(3);
    expect(database.level.upsert).toHaveBeenCalledWith({
      where: { slug: "primary-years-1-6" },
      update: {},
      create: expect.objectContaining({
        slug: "primary-years-1-6",
        name: "Primary (Years 1-6)",
      }),
    });
    expect(database.subject.upsert).toHaveBeenCalledTimes(12);
    expect(database.subject.upsert).toHaveBeenCalledWith({
      where: { slug: "mathematics" },
      update: {},
      create: expect.objectContaining({
        slug: "mathematics",
        name: "Mathematics",
      }),
    });
    expect(database.subject.upsert.mock.invocationCallOrder.at(-1)).toBeLessThan(
      bootstrapProductionAdminMock.mock.invocationCallOrder[0],
    );
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
    expect(database.$disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      logger.log.mock.invocationCallOrder[0],
    );
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

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Production admin bootstrap failed.");
    expect(process.exitCode).toBe(1);
  });

  it("does not attempt administrator bootstrap when catalogue initialization fails", async () => {
    const database = createDatabase();
    const logger = { log: vi.fn(), error: vi.fn() };
    database.level.upsert.mockRejectedValueOnce(new Error("database connection details"));

    await expect(runProductionAdminBootstrap({}, database, logger)).resolves.toBeUndefined();

    expect(bootstrapProductionAdminMock).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Production admin bootstrap failed.");
    expect(process.exitCode).toBe(1);
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });
});
