import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemporaryCredentialsPanel } from "@/components/admin/users/TemporaryCredentialsPanel";

const writeTextMock = vi.fn();

describe("TemporaryCredentialsPanel", () => {
  beforeEach(() => {
    writeTextMock.mockReset();
    writeTextMock.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the account email and temporary password with a one-time warning", () => {
    render(
      <TemporaryCredentialsPanel
        email="student@example.com"
        temporaryPassword="UniqueTemporary123_A"
      />,
    );

    expect(screen.getByText("student@example.com").tagName).toBe("CODE");
    expect(screen.getByText("UniqueTemporary123_A").tagName).toBe("CODE");
    expect(screen.getByText(/will not be shown after leaving this page/i)).toBeDefined();
  });

  it("copies only the temporary password through the clipboard API", async () => {
    render(
      <TemporaryCredentialsPanel
        email="student@example.com"
        temporaryPassword="UniqueTemporary123_A"
      />,
    );

    fireEvent.click(screen.getByTitle("Copy temporary password"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("UniqueTemporary123_A");
    });
  });

  it("allows the in-memory credential display to be dismissed", () => {
    const onDismiss = vi.fn();
    render(
      <TemporaryCredentialsPanel
        email="student@example.com"
        temporaryPassword="UniqueTemporary123_A"
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
