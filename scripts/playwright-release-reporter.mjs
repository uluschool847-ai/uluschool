import path from "node:path";

export default class PlaywrightReleaseReporter {
  constructor() {
    this.rootDir = process.cwd();
    this.tests = [];
  }

  onBegin(config, suite) {
    this.rootDir = config.rootDir;
    this.tests = suite.allTests();
  }

  onEnd(result) {
    const completedTests = this.tests.filter((test) => test.results.length > 0);
    const skippedTests = completedTests.filter(
      (test) =>
        test.expectedStatus === "skipped" &&
        test.results.some((testResult) => testResult.status === "skipped"),
    );
    const retriedOrFlakyTests = completedTests.filter(
      (test) =>
        test.outcome() === "flaky" || test.results.some((testResult) => testResult.retry > 0),
    );
    const nonPassingTests = completedTests.filter(
      (test) =>
        test.outcome() === "unexpected" ||
        test.results.some((testResult) => testResult.status === "interrupted"),
    );
    const passingResultHasNonPassingTests =
      result.status === "passed" && nonPassingTests.length > 0;

    if (
      skippedTests.length === 0 &&
      retriedOrFlakyTests.length === 0 &&
      !passingResultHasNonPassingTests
    ) {
      return;
    }

    for (const test of skippedTests) {
      const relativePath = path
        .relative(this.rootDir, test.location.file)
        .replaceAll(path.sep, "/");
      const title = test.titlePath().slice(3).join(" › ") || test.title;
      console.error(
        `Skipped release test: ${relativePath}:${test.location.line}:${test.location.column} › ${title}`,
      );
    }
    if (skippedTests.length > 0 || retriedOrFlakyTests.length > 0) {
      console.error(
        `Release browser gate rejected: ${skippedTests.length} skipped; ${retriedOrFlakyTests.length} retried or flaky.`,
      );
    }
    if (passingResultHasNonPassingTests) {
      console.error(
        `Release browser gate rejected: ${nonPassingTests.length} failed, timed out, or interrupted.`,
      );
    }
    if (result.status === "passed") return { status: "failed" };
  }

  printsToStdio() {
    return false;
  }
}
