export type ActionResult<T = void> = {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
  error?: string;
};

export function normalizeActionResult<T = void>(
  result: Partial<ActionResult<T>> | null | undefined,
  fallbackMessage = "Something went wrong",
): ActionResult<T> {
  if (!result) {
    return { success: false, message: fallbackMessage };
  }

  const success = result.success === true;
  const message =
    typeof result.message === "string" && result.message.trim().length > 0
      ? result.message
      : typeof result.error === "string" && result.error.trim().length > 0
        ? result.error
        : success
          ? ""
          : fallbackMessage;

  return {
    success,
    message,
    data: result.data,
    errors: result.errors,
    error: typeof result.error === "string" ? result.error : undefined,
  };
}
