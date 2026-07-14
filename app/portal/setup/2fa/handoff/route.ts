import { z } from "zod";

import {
  type InitialTwoFactorActionState,
  confirmInitialTwoFactorSetupAction,
  recoverInitialTwoFactorHandoffAction,
} from "@/app/portal/setup/2fa/actions";

const operationSchema = z.enum(["confirm", "recover"]);
const initialState: InitialTwoFactorActionState = {
  phase: "idle",
  success: false,
  message: "",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ phase: "error", success: false, message: "Invalid request." }, 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ phase: "error", success: false, message: "Invalid request." }, 400);
  }

  const operation = operationSchema.safeParse(formData.get("operation"));
  if (!operation.success) {
    return json({ phase: "error", success: false, message: "Invalid request." }, 400);
  }
  formData.delete("operation");

  const state =
    operation.data === "confirm"
      ? await confirmInitialTwoFactorSetupAction(initialState, formData)
      : await recoverInitialTwoFactorHandoffAction(initialState, formData);

  return json(state);
}
