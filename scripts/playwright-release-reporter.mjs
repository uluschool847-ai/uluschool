export default class PlaywrightReleaseReporter {
  constructor() {
    this.tests = [];
  }

  onBegin(_config, suite) {
    this.tests = suite.allTests();
  }

  onEnd(result) {
    if (result.status !== "passed") return;

    const completedTests = this.tests.filter((test) => test.results.length > 0);
    const skippedTests = completedTests.filter(
      (test) =>
        test.outcome() === "skipped" ||
        test.results.some((testResult) => testResult.status === "skipped"),
    );
    const retriedOrFlakyTests = completedTests.filter(
      (test) =>
        test.outcome() === "flaky" || test.results.some((testResult) => testResult.retry > 0),
    );

    if (skippedTests.length === 0 && retriedOrFlakyTests.length === 0) return;

    console.error(
      `Release browser gate rejected: ${skippedTests.length} skipped; ${retriedOrFlakyTests.length} retried or flaky.`,
    );
    return { status: "failed" };
  }

  printsToStdio() {
    return false;
  }
}
