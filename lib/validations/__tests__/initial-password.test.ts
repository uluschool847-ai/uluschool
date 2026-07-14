import { describe, expect, it } from "vitest";

import * as initialPasswordValidation from "@/lib/validations/initial-password";

const validPasswords = {
  currentPassword: "CurrentPass123!",
  newPassword: "NewPassword123!",
  confirmPassword: "NewPassword123!",
};

describe("initialPasswordSchema", () => {
  it("exports a single 256-character maximum", () => {
    expect(initialPasswordValidation).toHaveProperty("INITIAL_PASSWORD_MAX_LENGTH", 256);
  });

  it.each(["currentPassword", "newPassword", "confirmPassword"] as const)(
    "rejects a 257-character %s with a safe bounded field error",
    (field) => {
      const overlongPassword = "a".repeat(257);
      const parsed = initialPasswordValidation.initialPasswordSchema.safeParse({
        ...validPasswords,
        [field]: overlongPassword,
      });

      expect(parsed.success).toBe(false);
      if (parsed.success) return;

      const errors = initialPasswordValidation.getSafeInitialPasswordFieldErrors(parsed.error);
      expect(errors[field]).toContain("Use 256 characters or fewer.");
      expect(JSON.stringify(errors)).not.toContain(overlongPassword);
    },
  );
});
