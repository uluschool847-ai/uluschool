import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error; retry?: () => void }
  | { status: "empty" };

export type UseAsyncStateOptions<T> = {
  disabled?: boolean;
  lockOnLoading?: boolean;
  abortPrevious?: boolean;
  isEmpty?: (data: T) => boolean;
};

export type UseAsyncStateReturn<T> = {
  state: AsyncState<T>;
  disabled: boolean;
  execute: () => Promise<void>;
  reset: () => void;
};

function getInitialState<T>(disabled?: boolean): AsyncState<T> {
  return disabled ? { status: "disabled" } : { status: "idle" };
}

function defaultIsEmpty<T>(value: T) {
  if (value == null) {
    return true;
  }

  return Array.isArray(value) && value.length === 0;
}

export function useAsyncState<T>(
  asyncFunction: (() => Promise<T>) | null | undefined,
  options: UseAsyncStateOptions<T> = {},
): UseAsyncStateReturn<T> {
  const { disabled = false, lockOnLoading = false, abortPrevious = false, isEmpty } = options;
  const [state, setState] = useState<AsyncState<T>>(() => getInitialState<T>(disabled));
  const callIdRef = useRef(0);
  const mountedRef = useRef(true);

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  const execute = useCallback(async () => {
    if (disabled) {
      setState({ status: "disabled" });
      return;
    }

    if (!asyncFunction) {
      setState({
        status: "error",
        error: new Error("Async function is required and cannot be undefined."),
        retry: undefined,
      });
      return;
    }

    const nextCallId = callIdRef.current + 1;
    const currentStatus = state.status;

    if (currentStatus === "loading" && !abortPrevious) {
      return;
    }

    callIdRef.current = nextCallId;
    setState({ status: "loading" });

    try {
      const result = await asyncFunction();
      if (!mountedRef.current || (abortPrevious && callIdRef.current !== nextCallId)) {
        return;
      }

      const empty = isEmpty ? isEmpty(result) : defaultIsEmpty(result);
      if (empty) {
        setState({ status: "empty" });
        return;
      }

      setState({ status: "success", data: result });
    } catch (error) {
      if (!mountedRef.current || (abortPrevious && callIdRef.current !== nextCallId)) {
        return;
      }

      const normalizedError =
        error instanceof Error
          ? error
          : new Error(typeof error === "string" ? error : "Unknown error");

      setState({
        status: "error",
        error: normalizedError,
        retry: () => execute(),
      });
    }
  }, [abortPrevious, asyncFunction, disabled, isEmpty, state.status]);

  useEffect(() => {
    setState((current) => {
      if (disabled) {
        return current.status === "disabled" ? current : { status: "disabled" };
      }

      return current.status === "disabled" ? { status: "idle" } : current;
    });
  }, [disabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      callIdRef.current += 1;
    };
  }, []);

  return {
    state,
    disabled: state.status === "disabled" || (lockOnLoading && state.status === "loading"),
    execute,
    reset,
  };
}
