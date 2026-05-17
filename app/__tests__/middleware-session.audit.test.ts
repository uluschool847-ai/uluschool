import { describe, expect, it } from "vitest";

import { config, middleware } from "../../middleware";

describe("middleware session audit", () => {
  it("keeps the application middleware entrypoint and matcher available", () => {
    expect(typeof middleware).toBe("function");
    expect(config.matcher).toEqual(expect.arrayContaining([expect.stringContaining("_next")]));
  });
});
