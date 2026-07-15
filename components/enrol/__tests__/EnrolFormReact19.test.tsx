import { fireEvent, screen, waitFor } from "@testing-library/dom";
import * as ReactRuntime from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitEnrolmentMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  return module.default;
});

vi.mock("react/jsx-runtime", async () => {
  const specifier = "next/dist/compiled/react/jsx-runtime";
  const module = await import(/* @vite-ignore */ specifier);
  return module.default;
});

vi.mock("react/jsx-dev-runtime", async () => {
  const specifier = "next/dist/compiled/react/jsx-dev-runtime";
  const module = await import(/* @vite-ignore */ specifier);
  return module.default;
});

vi.mock("react-dom", async () => {
  const specifier = "next/dist/compiled/react-dom";
  const module = await import(/* @vite-ignore */ specifier);
  return module.default;
});

vi.mock("react-dom/client", async () => {
  const specifier = "next/dist/compiled/react-dom/client";
  const module = await import(/* @vite-ignore */ specifier);
  return module.default;
});

vi.mock("next/link", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  const react = module.default;
  return {
    default: ({ href, ...props }: { href: string } & Record<string, unknown>) =>
      react.createElement("a", { href, ...props }),
  };
});

vi.mock("@/components/ui/button", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  const react = module.default;
  return {
    Button: ({ variant: _variant, ...props }: Record<string, unknown>) =>
      react.createElement("button", props),
  };
});

vi.mock("@/components/ui/card", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  const react = module.default;
  const element = (tag: string) => (props: Record<string, unknown>) =>
    react.createElement(tag, props);
  return {
    Card: element("div"),
    CardContent: element("div"),
    CardHeader: element("div"),
    CardTitle: element("h2"),
  };
});

vi.mock("@/components/ui/input", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  const react = module.default;
  return { Input: (props: Record<string, unknown>) => react.createElement("input", props) };
});

vi.mock("@/components/ui/label", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  const react = module.default;
  return { Label: (props: Record<string, unknown>) => react.createElement("label", props) };
});

vi.mock("@/components/ui/textarea", async () => {
  const specifier = "next/dist/compiled/react";
  const module = await import(/* @vite-ignore */ specifier);
  const react = module.default;
  return { Textarea: (props: Record<string, unknown>) => react.createElement("textarea", props) };
});

vi.mock("@/app/enrol/actions", () => ({
  submitEnrolment: submitEnrolmentMock,
}));

vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => null,
}));

import { EnrolForm } from "@/components/enrol/enrol-form";

const reactDomClientSpecifier = "next/dist/compiled/react-dom/client";
const reactDomClientModule = await import(/* @vite-ignore */ reactDomClientSpecifier);
const reactDomClient = reactDomClientModule.default ?? reactDomClientModule;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ReactRoot = {
  render(children: ReactRuntime.ReactNode): void;
  unmount(): void;
};

let root: ReactRoot | undefined;

function renderWithReact19(children: ReactRuntime.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);

  ReactRuntime.act(() => {
    root = reactDomClient.createRoot(container) as ReactRoot;
    root.render(children);
  });
}

const props = {
  subjects: [{ id: "subject-1", name: "Biology" }],
  levels: [{ id: "level-1", name: "Grade 6", slug: "grade-6" }],
};

function fillText(label: RegExp, value: string) {
  ReactRuntime.act(() => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

function fillAllSteps() {
  fillText(/parent\/guardian name/i, "Parent Preserve");
  fillText(/email address/i, "preserve@example.com");
  fillText(/phone \/ whatsapp/i, "+254700123456");
  ReactRuntime.act(() => {
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
  });

  fillText(/student name/i, "Student Preserve");
  fillText(/age \/ year level/i, "Grade 6");
  ReactRuntime.act(() => {
    fireEvent.change(screen.getByLabelText(/curriculum level/i), {
      target: { value: "grade-6" },
    });
    fireEvent.click(screen.getByLabelText(/biology/i));
  });
  ReactRuntime.act(() => {
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
  });

  fillText(/preferred schedule/i, "Weekday evenings");
  fillText(/additional notes/i, "Preserve these family notes");
  ReactRuntime.act(() => {
    fireEvent.click(screen.getByRole("checkbox", { name: /i am the parent or guardian/i }));
  });
}

describe("EnrolForm with the Next React 19 host runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitEnrolmentMock.mockResolvedValue({
      success: false,
      message: "Unable to submit enquiry right now.",
    });
  });

  afterEach(() => {
    ReactRuntime.act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
  });

  it("preserves entered values when a checked-consent action resolves with failure", async () => {
    expect(ReactRuntime.version).toMatch(/^19\./);
    renderWithReact19(ReactRuntime.createElement(EnrolForm, props));
    fillAllSteps();

    await ReactRuntime.act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit enrolment/i }));
    });

    await screen.findByText("Unable to submit enquiry right now.");
    expect(submitEnrolmentMock).toHaveBeenCalledTimes(1);
    const submittedData = submitEnrolmentMock.mock.calls[0]?.[1] as FormData;
    expect(submittedData.get("consentAccepted")).toBe("true");
    expect(screen.getByRole("button", { name: /submit enrolment/i })).toBeDefined();

    await waitFor(() => {
      expect((screen.getByLabelText(/parent\/guardian name/i) as HTMLInputElement).value).toBe(
        "Parent Preserve",
      );
      expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe(
        "preserve@example.com",
      );
      expect((screen.getByLabelText(/phone \/ whatsapp/i) as HTMLInputElement).value).toBe(
        "+254700123456",
      );
      expect((screen.getByLabelText(/student name/i) as HTMLInputElement).value).toBe(
        "Student Preserve",
      );
      expect((screen.getByLabelText(/age \/ year level/i) as HTMLInputElement).value).toBe(
        "Grade 6",
      );
      expect((screen.getByLabelText(/curriculum level/i) as HTMLSelectElement).value).toBe(
        "grade-6",
      );
      expect((screen.getByLabelText(/biology/i) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByLabelText(/preferred schedule/i) as HTMLInputElement).value).toBe(
        "Weekday evenings",
      );
      expect((screen.getByLabelText(/additional notes/i) as HTMLTextAreaElement).value).toBe(
        "Preserve these family notes",
      );
      expect(
        (screen.getByRole("checkbox", { name: /i am the parent or guardian/i }) as HTMLInputElement)
          .checked,
      ).toBe(true);
    });
  });

  it("dispatches only once when a valid form is submitted repeatedly before settling", async () => {
    let resolveAction!: (state: { success: boolean; message: string }) => void;
    submitEnrolmentMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderWithReact19(ReactRuntime.createElement(EnrolForm, props));
    fillAllSteps();
    const form = screen
      .getByRole("button", { name: /submit enrolment/i })
      .closest("form") as HTMLFormElement;

    ReactRuntime.act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /submit enrolment/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe("Submitting...");
    });
    expect(submitEnrolmentMock).toHaveBeenCalledTimes(1);

    await ReactRuntime.act(async () => {
      resolveAction({
        success: false,
        message: "Unable to submit enquiry right now.",
      });
    });

    await screen.findByText("Unable to submit enquiry right now.");
    expect(submitEnrolmentMock).toHaveBeenCalledTimes(1);
  });
});
