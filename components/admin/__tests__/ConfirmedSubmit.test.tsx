import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";

describe("ConfirmedSubmit", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires confirmation, identifies the entity, and lets cancel avoid mutation", () => {
    const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <ConfirmedSubmit
        title="Delete subject"
        description="Delete Biology? Dependencies will block deletion."
        confirmLabel="Confirm delete"
      >
        <form onSubmit={submit}>
          <button type="submit">Delete Biology</button>
        </form>
      </ConfirmedSubmit>,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete biology/i }));

    expect(submit).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: /delete subject/i });
    expect(dialog).toBeDefined();
    expect(within(dialog).getByText(/delete biology/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /delete biology/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("can require confirmation only when a named form field is present", () => {
    const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <ConfirmedSubmit
        title="Remove teacher photo"
        description="Remove current photo for Jane Doe?"
        confirmLabel="Remove photo"
        confirmWhenFieldName="clearPhoto"
      >
        <form onSubmit={submit}>
          <label>
            <input type="checkbox" name="clearPhoto" value="true" />
            Remove current photo
          </label>
          <button type="submit">Save Changes</button>
        </form>
      </ConfirmedSubmit>,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /remove current photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(submit).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", { name: /remove teacher photo/i });
    expect(within(dialog).getByText(/jane doe/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /remove photo/i }));
    expect(submit).toHaveBeenCalledTimes(2);
  });
});
