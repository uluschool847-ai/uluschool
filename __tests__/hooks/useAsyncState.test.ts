import { useAsyncState } from "@/hooks/useAsyncState";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

type AsyncState<T> =
  | { status: "idle" }
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error; retry?: () => void }
  | { status: "empty" };

describe("useAsyncState", () => {
  it("returns idle before any action is triggered", () => {
    const asyncFn = vi.fn().mockResolvedValue("ready");

    const { result } = renderHook(() => useAsyncState(asyncFn));

    expect(result.current.state).toEqual({ status: "idle" });
    expect(typeof result.current.execute).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("transitions to loading after execute() and can lock while loading", async () => {
    let resolvePromise: (value: string) => void = () => {};
    const asyncFn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { result } = renderHook(() => useAsyncState(asyncFn, { lockOnLoading: true }));

    act(() => {
      void result.current.execute();
    });

    expect(result.current.state).toEqual({ status: "loading" });
    expect(result.current.disabled).toBe(true);

    act(() => {
      resolvePromise("done");
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "success", data: "done" });
    });
  });

  it("transitions to success with resolved data", async () => {
    const asyncFn = vi.fn().mockResolvedValue({ count: 42 });

    const { result } = renderHook(() => useAsyncState(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state).toEqual({ status: "success", data: { count: 42 } });
  });

  it("transitions to empty when resolver returns null, undefined, or empty array", async () => {
    const nullFn = vi.fn().mockResolvedValue(null);
    const undefinedFn = vi.fn().mockResolvedValue(undefined);
    const emptyArrayFn = vi.fn().mockResolvedValue([]);

    const nullHook = renderHook(() => useAsyncState(nullFn));
    await act(async () => {
      await nullHook.result.current.execute();
    });
    expect(nullHook.result.current.state).toEqual({ status: "empty" });

    const undefinedHook = renderHook(() => useAsyncState(undefinedFn));
    await act(async () => {
      await undefinedHook.result.current.execute();
    });
    expect(undefinedHook.result.current.state).toEqual({ status: "empty" });

    const arrayHook = renderHook(() => useAsyncState(emptyArrayFn));
    await act(async () => {
      await arrayHook.result.current.execute();
    });
    expect(arrayHook.result.current.state).toEqual({ status: "empty" });
  });

  it("supports a configurable isEmpty predicate", async () => {
    const asyncFn = vi.fn().mockResolvedValue({ rows: [] });

    const { result } = renderHook(() =>
      useAsyncState(asyncFn, {
        isEmpty: (value: { rows: unknown[] }) => value.rows.length === 0,
      }),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state).toEqual({ status: "empty" });
  });

  it("treats a plain object as non-empty by default when isEmpty is not provided", async () => {
    const asyncFn = vi.fn().mockResolvedValue({});

    const { result } = renderHook(() => useAsyncState(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state).toEqual({ status: "success", data: {} });
  });

  it("transitions to error when the async function rejects and exposes retry", async () => {
    const asyncFn = vi.fn().mockRejectedValue(new Error("Network failed"));

    const { result } = renderHook(() => useAsyncState(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.error).toBeInstanceOf(Error);
      expect(result.current.state.error.message).toBe("Network failed");
      expect(typeof result.current.state.retry).toBe("function");
    }
  });

  it("returns disabled state and execute() is a no-op when disabled=true", async () => {
    const asyncFn = vi.fn().mockResolvedValue("should-not-run");

    const { result } = renderHook(() => useAsyncState(asyncFn, { disabled: true }));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.disabled).toBe(true);
    expect(result.current.state).toEqual({ status: "disabled" });
    expect(asyncFn).not.toHaveBeenCalled();
  });

  it("retry() re-enters loading and re-attempts the async function", async () => {
    const asyncFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValueOnce("Recovered");

    const { result } = renderHook(() => useAsyncState(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.status).toBe("error");

    await act(async () => {
      if (result.current.state.status === "error") {
        await result.current.state.retry?.();
      }
    });

    expect(asyncFn).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ status: "success", data: "Recovered" });
  });

  it("reset() always returns the state to idle", async () => {
    const asyncFn = vi.fn().mockResolvedValue("done");

    const { result } = renderHook(() => useAsyncState(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state).toEqual({ status: "success", data: "done" });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("ignores or aborts the previous call while loading when abortPrevious=true", async () => {
    let firstResolve: (value: string) => void = () => {};
    let secondResolve: (value: string) => void = () => {};

    const asyncFn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            firstResolve = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            secondResolve = resolve;
          }),
      );

    const { result } = renderHook(() => useAsyncState(asyncFn, { abortPrevious: true }));

    act(() => {
      void result.current.execute();
    });

    act(() => {
      void result.current.execute();
    });

    act(() => {
      firstResolve("first-result");
      secondResolve("second-result");
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "success", data: "second-result" });
    });
  });

  it("supports a rapid success → error → retry → success lifecycle", async () => {
    const asyncFn = vi
      .fn()
      .mockResolvedValueOnce("first-success")
      .mockRejectedValueOnce(new Error("intermittent-failure"))
      .mockResolvedValueOnce("final-success");

    const { result } = renderHook(() => useAsyncState(asyncFn));

    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.state).toEqual({ status: "success", data: "first-success" });

    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.state.status).toBe("error");

    await act(async () => {
      if (result.current.state.status === "error") {
        await result.current.state.retry?.();
      }
    });
    expect(result.current.state).toEqual({ status: "success", data: "final-success" });
  });

  it("enters error state immediately when async function is undefined", async () => {
    const { result } = renderHook(() =>
      useAsyncState(undefined as unknown as () => Promise<string>),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.error.message).toMatch(/async function.*required|undefined/i);
    }
  });

  it("supports type narrowing across discriminated states", () => {
    const _idle: AsyncState<number> = { status: "idle" };
    const _disabledState: AsyncState<number> = { status: "disabled" };
    const _loading: AsyncState<number> = { status: "loading" };
    const _success: AsyncState<number> = { status: "success", data: 123 };
    const _error: AsyncState<number> = {
      status: "error",
      error: new Error("boom"),
      retry: () => undefined,
    };
    const _empty: AsyncState<number> = { status: "empty" };

    const consume = (state: AsyncState<number>) => {
      if ("status" in state && state.status === "success") {
        const value: number = state.data;
        expect(value).toBe(123);
      }

      if ("status" in state && state.status === "error") {
        const err: Error = state.error;
        expect(err).toBeInstanceOf(Error);
      }
    };

    consume(_success);
    consume(_error);
    expect(_idle).toEqual({ status: "idle" });
    expect(_disabledState).toEqual({ status: "disabled" });
    expect(_loading).toEqual({ status: "loading" });
    expect(_empty).toEqual({ status: "empty" });
  });
});
