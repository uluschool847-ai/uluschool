import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightRunner = path.join(projectRoot, "scripts", "playwright-test.mjs");
const storageSpecPaths = new Set([
  "e2e/portals/admin-teachers.spec.ts",
  "e2e/portals/teacher-academics.spec.ts",
  "e2e/portals/teacher-materials.spec.ts",
]);
const signedDeliverySpecPath = "e2e/storage/signed-file-delivery.spec.ts";
const playwrightOptionsWithRequiredValues = new Set([
  "--browser",
  "--global-timeout",
  "--grep",
  "--grep-invert",
  "--max-failures",
  "--output",
  "--project",
  "--repeat-each",
  "--reporter",
  "--retries",
  "--run-agents",
  "--shard",
  "--test-list",
  "--test-list-invert",
  "--timeout",
  "--trace",
  "--tsconfig",
  "--ui-host",
  "--ui-port",
  "--update-source-method",
  "--workers",
  "-g",
  "-j",
]);

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  const source = normalized.split("*").map(escapeRegExp).join("[^/]*");
  return new RegExp(`^${source}$`);
}

function staticSearchRoot(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  const wildcardIndex = normalized.indexOf("*");
  if (wildcardIndex === -1) return path.dirname(normalized);
  const prefix = normalized.slice(0, wildcardIndex);
  const slashIndex = prefix.lastIndexOf("/");
  return slashIndex === -1 ? "." : prefix.slice(0, slashIndex);
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const fullPath = path.join(root, entry);
    return statSync(fullPath).isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function normalizeProjectPath(filePath, projectDirectory) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectDirectory, filePath);
  const relativePath = path.relative(projectDirectory, absolutePath);
  return relativePath.startsWith("..")
    ? absolutePath.replaceAll("\\", "/")
    : relativePath.replaceAll("\\", "/");
}

function expandSpecArg(arg, projectDirectory) {
  if (!arg.includes("*")) return [normalizeProjectPath(arg, projectDirectory)];

  const normalizedPattern = arg.replaceAll("\\", "/");
  const matcher = globToRegExp(normalizedPattern);
  const searchRoot = path.resolve(projectDirectory, staticSearchRoot(normalizedPattern));
  const matches = walkFiles(searchRoot)
    .map((file) => normalizeProjectPath(file, projectDirectory))
    .filter((file) => matcher.test(file))
    .sort();

  return matches.length > 0 ? matches : [normalizedPattern];
}

function specPartition(spec) {
  const normalized = spec.replaceAll("\\", "/");
  if (normalized === signedDeliverySpecPath) return "signed-delivery";
  if (storageSpecPaths.has(normalized)) return "storage";
  return "standard";
}

export function partitionPlaywrightArgs(args, projectDirectory = process.cwd()) {
  const options = [];
  const specArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("-")) {
      options.push(arg);
      if (playwrightOptionsWithRequiredValues.has(arg) && args[index + 1] !== undefined) {
        options.push(args[index + 1]);
        index += 1;
      }
      continue;
    }
    specArgs.push(arg);
  }

  const expandedSpecs = specArgs.flatMap((arg) => expandSpecArg(arg, projectDirectory));

  return {
    options,
    runAll: specArgs.length === 0,
    signedDeliverySpecs: expandedSpecs.filter((spec) => specPartition(spec) === "signed-delivery"),
    standardSpecs: expandedSpecs.filter((spec) => specPartition(spec) === "standard"),
    storageSpecs: expandedSpecs.filter((spec) => specPartition(spec) === "storage"),
  };
}

function runPartition(label, flags, specs, options) {
  console.log(`Running ${label} Playwright partition.`);
  const result = spawnSync(
    process.execPath,
    [playwrightRunner, "--isolated-server", ...flags, ...specs, ...options],
    {
      cwd: projectRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runSelectedPlaywright(args) {
  const selection = partitionPlaywrightArgs(args, projectRoot);
  const partitions = selection.runAll
    ? [
        {
          flags: ["--standard-partition", "--next-start"],
          label: "standard",
          specs: [],
        },
        {
          flags: ["--signed-delivery-partition", "--next-start"],
          label: "signed-delivery",
          specs: [signedDeliverySpecPath],
        },
        {
          flags: ["--storage-partition"],
          label: "storage",
          specs: [...storageSpecPaths],
        },
      ]
    : [
        {
          flags: ["--standard-partition", "--next-start"],
          label: "standard",
          specs: selection.standardSpecs,
        },
        {
          flags: ["--signed-delivery-partition", "--next-start"],
          label: "signed-delivery",
          specs: selection.signedDeliverySpecs,
        },
        {
          flags: ["--storage-partition"],
          label: "storage",
          specs: selection.storageSpecs,
        },
      ];

  for (const partition of partitions) {
    if (!selection.runAll && partition.specs.length === 0) continue;
    const status = runPartition(
      partition.label,
      partition.flags,
      partition.specs,
      selection.options,
    );
    if (status !== 0) return status;
  }

  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exit(runSelectedPlaywright(process.argv.slice(2)));
}
