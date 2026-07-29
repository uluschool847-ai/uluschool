import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { partitionPlaywrightArgs } from "../filtered-playwright-test.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createProjectFixture() {
  const directory = mkdtempSync(join(tmpdir(), "ulu-filtered-playwright-"));
  temporaryDirectories.push(directory);

  for (const file of [
    "e2e/portals/admin-alpha.spec.ts",
    "e2e/portals/admin-teachers.spec.ts",
    "e2e/portals/teacher-academics.spec.ts",
    "e2e/storage/signed-file-delivery.spec.ts",
  ]) {
    const filePath = join(directory, ...file.split("/"));
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "");
  }

  return directory;
}

describe("filtered Playwright partition selection", () => {
  it("splits an expanded admin glob between standard and storage partitions", () => {
    const projectDirectory = createProjectFixture();

    const selection = partitionPlaywrightArgs(
      ["e2e/portals/admin*.spec.ts", "--reporter=line"],
      projectDirectory,
    );

    expect(selection).toEqual({
      options: ["--reporter=line"],
      runAll: false,
      signedDeliverySpecs: [],
      standardSpecs: ["e2e/portals/admin-alpha.spec.ts"],
      storageSpecs: ["e2e/portals/admin-teachers.spec.ts"],
    });
  });

  it("preserves option values without treating them as spec filters", () => {
    const projectDirectory = createProjectFixture();

    const selection = partitionPlaywrightArgs(
      ["e2e/portals/admin-alpha.spec.ts", "--grep", "admin flow", "--reporter=line"],
      projectDirectory,
    );

    expect(selection.options).toEqual(["--grep", "admin flow", "--reporter=line"]);
    expect(selection.standardSpecs).toEqual(["e2e/portals/admin-alpha.spec.ts"]);
    expect(selection.storageSpecs).toEqual([]);
    expect(selection.signedDeliverySpecs).toEqual([]);
  });

  it("selects the signed-delivery partition only for its exact spec", () => {
    const projectDirectory = createProjectFixture();

    const selection = partitionPlaywrightArgs(
      ["e2e/storage/signed-file-delivery.spec.ts"],
      projectDirectory,
    );

    expect(selection.standardSpecs).toEqual([]);
    expect(selection.storageSpecs).toEqual([]);
    expect(selection.signedDeliverySpecs).toEqual(["e2e/storage/signed-file-delivery.spec.ts"]);
  });

  it("marks an option-only invocation as an unfiltered release run", () => {
    const projectDirectory = createProjectFixture();

    const selection = partitionPlaywrightArgs(["--reporter=line"], projectDirectory);

    expect(selection).toEqual({
      options: ["--reporter=line"],
      runAll: true,
      signedDeliverySpecs: [],
      standardSpecs: [],
      storageSpecs: [],
    });
  });
});
