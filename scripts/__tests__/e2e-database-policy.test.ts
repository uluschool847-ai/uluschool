import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadProjectEnvironment,
  prepareE2EDatabase,
  resolveE2EDatabaseEnvironment,
  resolveNpmCliPath,
} from "../e2e-database-policy.mjs";

const safeEnvironment = {
  E2E_DATABASE_RESET_ALLOWED: "1",
  E2E_DATABASE_URL:
    "postgresql://runtime-user:runtime-secret@localhost:5432/ulu_school_e2e?schema=public&connection_limit=1",
  E2E_DIRECT_URL:
    "postgresql://migration-user:migration-secret@localhost:5432/ulu_school_e2e?schema=public",
};
const SUBPROCESS_TEST_TIMEOUT_MS = 30_000;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("E2E database policy", () => {
  it("requires both dedicated E2E database URLs", () => {
    expect(() =>
      resolveE2EDatabaseEnvironment({
        E2E_DATABASE_RESET_ALLOWED: "1",
        E2E_DATABASE_URL: safeEnvironment.E2E_DATABASE_URL,
      }),
    ).toThrow("E2E_DIRECT_URL is required");
  });

  it.each([
    ["runtime", "E2E_DATABASE_URL", "not-a-url"],
    [
      "remote runtime",
      "E2E_DATABASE_URL",
      "postgresql://runtime-user:runtime-secret@db.example.com:5432/ulu_school_e2e?schema=public",
    ],
    [
      "remote direct",
      "E2E_DIRECT_URL",
      "postgresql://migration-user:migration-secret@db.example.com:5432/ulu_school_e2e?schema=public",
    ],
    [
      "non-test database",
      "E2E_DATABASE_URL",
      "postgresql://runtime-user:runtime-secret@localhost:5432/ulu_school?schema=public",
    ],
  ])("rejects an unsafe %s URL without exposing it", (_caseName, variableName, value) => {
    const environment = { ...safeEnvironment, [variableName]: value };
    let message = "";

    try {
      resolveE2EDatabaseEnvironment(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(variableName);
    expect(message).not.toContain("runtime-secret");
    expect(message).not.toContain("migration-secret");
    expect(message).not.toContain("db.example.com");
    expect(message).not.toContain("schema=public");
  });

  it("rejects different runtime and migration database names", () => {
    expect(() =>
      resolveE2EDatabaseEnvironment({
        ...safeEnvironment,
        E2E_DIRECT_URL:
          "postgresql://migration-user:migration-secret@localhost:5432/other_test?schema=public",
      }),
    ).toThrow("same disposable database");
  });

  it.each([
    [
      "host",
      "postgresql://migration-user:migration-secret@127.0.0.1:5432/ulu_school_e2e?schema=public",
    ],
    [
      "port",
      "postgresql://migration-user:migration-secret@localhost:5433/ulu_school_e2e?schema=public",
    ],
  ])("rejects a different runtime and migration %s", (_caseName, directUrl) => {
    expect(() =>
      resolveE2EDatabaseEnvironment({
        ...safeEnvironment,
        E2E_DIRECT_URL: directUrl,
      }),
    ).toThrow("same loopback endpoint");
  });

  it("treats an omitted Prisma schema as public", () => {
    const resolved = resolveE2EDatabaseEnvironment({
      ...safeEnvironment,
      E2E_DATABASE_URL: "postgresql://runtime-user:runtime-secret@localhost:5432/ulu_school_e2e",
    });

    expect(resolved.DATABASE_URL).not.toContain("schema=");
    expect(resolved.DIRECT_URL).toContain("schema=public");
  });

  it("rejects different normalized Prisma schemas", () => {
    expect(() =>
      resolveE2EDatabaseEnvironment({
        ...safeEnvironment,
        E2E_DIRECT_URL:
          "postgresql://migration-user:migration-secret@localhost:5432/ulu_school_e2e?schema=e2e_private",
      }),
    ).toThrow("same Prisma schema");
  });

  it.each(["", "true", "yes"])("requires the exact reset opt-in instead of %j", (value) => {
    expect(() =>
      resolveE2EDatabaseEnvironment({
        ...safeEnvironment,
        E2E_DATABASE_RESET_ALLOWED: value,
      }),
    ).toThrow("E2E_DATABASE_RESET_ALLOWED=1");
  });

  it("overrides ambient Prisma URLs with the dedicated E2E URLs", () => {
    const resolved = resolveE2EDatabaseEnvironment({
      ...safeEnvironment,
      DATABASE_URL: "postgresql://ambient:secret@shared.example.com:5432/production",
      DIRECT_URL: "postgresql://ambient:secret@shared.example.com:5432/production",
    });

    expect(resolved.DATABASE_URL).toBe(safeEnvironment.E2E_DATABASE_URL);
    expect(resolved.DIRECT_URL).toBe(safeEnvironment.E2E_DIRECT_URL);
  });

  it("runs reset, migration, and seed in order with only the E2E Prisma URLs", () => {
    const execute = vi.fn(() => ({ status: 0 }));

    prepareE2EDatabase(
      {
        ...safeEnvironment,
        DATABASE_URL: "postgresql://ambient:secret@shared.example.com:5432/production",
        DIRECT_URL: "postgresql://ambient:secret@shared.example.com:5432/production",
      },
      execute,
    );

    expect(execute.mock.calls.map(([step]) => step)).toEqual([
      ["run", "db:reset", "--", "--skip-seed"],
      ["run", "db:deploy"],
      ["run", "db:seed"],
    ]);
    for (const [, environment] of execute.mock.calls) {
      expect(environment.DATABASE_URL).toBe(safeEnvironment.E2E_DATABASE_URL);
      expect(environment.DIRECT_URL).toBe(safeEnvironment.E2E_DIRECT_URL);
    }
  });

  it("reports a failed preparation step without exposing child output", () => {
    const execute = vi.fn(() => ({
      status: 1,
      stderr:
        "postgresql://migration-user:migration-secret@localhost:5432/ulu_school_e2e?schema=public",
    }));

    expect(() => prepareE2EDatabase(safeEnvironment, execute)).toThrow(
      "E2E database preparation failed during reset",
    );
    expect(() => prepareE2EDatabase(safeEnvironment, execute)).not.toThrow(/migration-secret/);
  });

  it("loads .env.local over .env while preserving explicit shell values", () => {
    const directory = mkdtempSync(join(tmpdir(), "ulu-e2e-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env"),
      [
        "E2E_DATABASE_URL=postgresql://base:secret@localhost:5432/base_e2e?schema=public",
        "E2E_DIRECT_URL=postgresql://base:secret@localhost:5432/base_e2e?schema=public",
        "E2E_DATABASE_RESET_ALLOWED=1",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, ".env.local"),
      [
        "E2E_DATABASE_URL=postgresql://local:secret@localhost:5432/local_e2e?schema=public",
        "E2E_DIRECT_URL=postgresql://local:secret@localhost:5432/local_e2e?schema=public",
      ].join("\n"),
    );

    const fromFiles = loadProjectEnvironment({}, directory);
    const fromShell = loadProjectEnvironment(
      {
        E2E_DATABASE_URL: "postgresql://shell:secret@localhost:5432/shell_e2e?schema=public",
        E2E_DIRECT_URL: "postgresql://shell:secret@localhost:5432/shell_e2e?schema=public",
      },
      directory,
    );

    expect(fromFiles.E2E_DATABASE_URL).toContain("/local_e2e?");
    expect(fromFiles.E2E_DIRECT_URL).toContain("/local_e2e?");
    expect(fromFiles.E2E_DATABASE_RESET_ALLOWED).toBe("1");
    expect(fromShell.E2E_DATABASE_URL).toContain("/shell_e2e?");
    expect(fromShell.E2E_DIRECT_URL).toContain("/shell_e2e?");
  });

  it("resolves npm CLI beside Node without npm_execpath", () => {
    const directory = mkdtempSync(join(tmpdir(), "ulu-node-install-"));
    temporaryDirectories.push(directory);
    const nodeExecutable = join(directory, "node.exe");
    const npmCli = join(dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js");
    mkdirSync(dirname(npmCli), { recursive: true });
    writeFileSync(npmCli, "");

    expect(resolveNpmCliPath({}, nodeExecutable)).toBe(npmCli);
  });

  it(
    "executes the npm CLI JS fallback without npm_execpath",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "ulu-npm-prefix-"));
      temporaryDirectories.push(directory);
      const npmCli = join(directory, "node_modules", "npm", "bin", "npm-cli.js");
      const marker = join(directory, "npm-calls.txt");
      mkdirSync(dirname(npmCli), { recursive: true });
      writeFileSync(
        npmCli,
        `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)) + "\\n");
`,
      );

      prepareE2EDatabase({
        ...safeEnvironment,
        npm_config_prefix: directory,
        npm_execpath: undefined,
      });

      expect(
        readFileSync(marker, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      ).toEqual([
        ["run", "db:reset", "--", "--skip-seed"],
        ["run", "db:deploy"],
        ["run", "db:seed"],
      ]);
    },
    SUBPROCESS_TEST_TIMEOUT_MS,
  );
});
