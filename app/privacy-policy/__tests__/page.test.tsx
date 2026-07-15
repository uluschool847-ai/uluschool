import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PrivacyPolicyPage from "@/app/privacy-policy/page";

const originalPrivacyContactEmail = process.env.PRIVACY_CONTACT_EMAIL;
const originalPrivacyEmailProcessorName = process.env.PRIVACY_EMAIL_PROCESSOR_NAME;

describe("Privacy Policy", () => {
  beforeEach(() => {
    process.env.PRIVACY_CONTACT_EMAIL = "privacy@uluglobalacademy.com";
    process.env.PRIVACY_EMAIL_PROCESSOR_NAME = "Example Mail Provider";
  });

  afterEach(() => {
    cleanup();
    if (originalPrivacyContactEmail === undefined) {
      Reflect.deleteProperty(process.env, "PRIVACY_CONTACT_EMAIL");
    } else {
      process.env.PRIVACY_CONTACT_EMAIL = originalPrivacyContactEmail;
    }
    if (originalPrivacyEmailProcessorName === undefined) {
      Reflect.deleteProperty(process.env, "PRIVACY_EMAIL_PROCESSOR_NAME");
    } else {
      process.env.PRIVACY_EMAIL_PROCESSOR_NAME = originalPrivacyEmailProcessorName;
    }
  });

  it("publishes the deployed processor, data-use, rights, and contact contract", () => {
    render(<PrivacyPolicyPage />);

    const content = document.body.textContent ?? "";
    expect(content).toMatch(/ULU Online School.*data controller/i);
    expect(content).toMatch(/contact details/i);
    expect(content).toMatch(/enrolment|educational records/i);
    expect(content).toMatch(/account|authentication/i);
    expect(content).toMatch(/technical|security|usage/i);
    expect(content).toMatch(/admissions|deliver.*education|class reminders/i);
    expect(content).toMatch(/Render/i);
    expect(content).toMatch(/Cloudflare.*R2/i);
    expect(content).toMatch(/Cloudflare.*DNS|DNS.*Cloudflare/i);
    expect(content).toMatch(/Google.*Calendar|Google.*Meet/i);
    expect(content).toMatch(/Sentry.*enabled/i);
    expect(content).toMatch(/Example Mail Provider/);
    expect(content).toMatch(/international|outside Kenya/i);
    expect(content).toMatch(/safeguards|adequacy|necessity/i);
    expect(content).toMatch(/access.*correct|correction/i);
    expect(content).toMatch(/delete|deletion|erasure/i);
    expect(content).toMatch(/parent or guardian.*consent/i);
    expect(content).toMatch(/best interests of the child/i);
    expect(content).toMatch(/purpose.*retention|retained.*necessary/i);
    expect(content).toMatch(/legal.*operational.*retention|retention.*legal.*operational/i);
    expect(content).toMatch(/role-based access|access controls/i);
    expect(content).toMatch(/private object storage/i);
    expect(screen.getByRole("link", { name: "privacy@uluglobalacademy.com" })).toHaveAttribute(
      "href",
      "mailto:privacy@uluglobalacademy.com",
    );
    expect(content).not.toMatch(/automatically registered|guaranteed legal compliance/i);
    expect(content).not.toMatch(/we (?:will|can) guarantee deletion|deletion is guaranteed/i);
  });

  it("uses nonsecret development fallbacks when privacy variables are absent", () => {
    Reflect.deleteProperty(process.env, "PRIVACY_CONTACT_EMAIL");
    Reflect.deleteProperty(process.env, "PRIVACY_EMAIL_PROCESSOR_NAME");

    render(<PrivacyPolicyPage />);

    expect(screen.getByRole("link", { name: "info@uluglobalacademy.com" })).toHaveAttribute(
      "href",
      "mailto:info@uluglobalacademy.com",
    );
    expect(document.body.textContent).toMatch(/configured email delivery provider/i);
  });

  it.each([
    { contact: "", processor: "" },
    { contact: " \t ", processor: " \n " },
  ])("uses nonblank fallbacks for blank privacy values %#", ({ contact, processor }) => {
    process.env.PRIVACY_CONTACT_EMAIL = contact;
    process.env.PRIVACY_EMAIL_PROCESSOR_NAME = processor;

    render(<PrivacyPolicyPage />);

    expect(screen.getByRole("link", { name: "info@uluglobalacademy.com" })).toHaveAttribute(
      "href",
      "mailto:info@uluglobalacademy.com",
    );
    expect(document.body.textContent).toMatch(/configured email delivery provider/i);
    expect(document.querySelector('a[href="mailto:"]')).toBeNull();
  });

  it("trims configured privacy contact and processor disclosures", () => {
    process.env.PRIVACY_CONTACT_EMAIL = "  privacy@example.com  ";
    process.env.PRIVACY_EMAIL_PROCESSOR_NAME = "  Example Mail Provider  ";

    render(<PrivacyPolicyPage />);

    expect(screen.getByRole("link", { name: "privacy@example.com" })).toHaveAttribute(
      "href",
      "mailto:privacy@example.com",
    );
    expect(document.body.textContent).toContain("Example Mail Provider");
    expect(document.body.textContent).not.toContain("  Example Mail Provider  ");
  });
});
