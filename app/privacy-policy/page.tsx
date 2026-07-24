import type { Metadata } from "next";

import { PageHero } from "@/components/sections/page-hero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How ULU Online School handles personal data for its website and school platform.",
};

export default function PrivacyPolicyPage() {
  const privacyEmail = process.env.PRIVACY_CONTACT_EMAIL?.trim() || "info@uluglobalacademy.com";
  const emailProcessor =
    process.env.PRIVACY_EMAIL_PROCESSOR_NAME?.trim() || "the configured email delivery provider";

  return (
    <>
      <PageHero
        title="Privacy Policy"
        description="How ULU Online School collects, uses, shares, retains, and protects personal data."
      />
      <section className="section-shell">
        <div className="container max-w-4xl space-y-4 text-sm text-muted-foreground">
          <p className="text-foreground">Effective date: July 15, 2026</p>
          <h2 className="text-xl font-semibold text-foreground">1. Controller and contact</h2>
          <p>
            ULU Online School is the data controller for the personal data described in this notice.
            Questions and requests may be sent to{" "}
            <a className="font-medium text-primary underline" href={`mailto:${privacyEmail}`}>
              {privacyEmail}
            </a>
            .
          </p>
          <h2 className="text-xl font-semibold text-foreground">2. Data categories and purposes</h2>
          <p>
            We process identity and contact details, parent or guardian and child relationships,
            enrolment and educational records, selected subjects and curriculum, schedules,
            attendance, assignments, submissions, grades, feedback, progress information, account
            and authentication data, communications, and billing or administrative records where
            applicable. The service may also process request, attribution, usage, audit, security,
            and error-diagnostic data needed to operate and protect the platform.
          </p>
          <p>
            We use this information to handle admissions and enquiries; create and manage accounts;
            schedule and deliver education; provide materials; track attendance, assignments, and
            progress; communicate with families; send class and assignment reminders; maintain
            security and service reliability; meet applicable legal and operational obligations; and
            analyse admissions or service performance in an appropriate form.
          </p>
          <h2 className="text-xl font-semibold text-foreground">3. Lawful grounds and consent</h2>
          <p>
            The applicable ground depends on the activity and may include consent for a specified
            purpose, steps requested before or performance of a service agreement, a legal
            obligation, or a legitimate operational interest that is not overridden by the rights
            and freedoms of the data subject. Where processing relies on consent, consent may be
            withdrawn for future processing, subject to another applicable lawful basis and data
            that must still be retained.
          </p>
          <h2 className="text-xl font-semibold text-foreground">4. Children</h2>
          <p>
            For a child, we require consent from a parent or guardian and process the data in a way
            intended to protect and advance the best interests of the child. The enrolment process
            records parent or guardian consent and the age or year information provided. Our
            handling considers the service, the data involved, available technology, and the
            possible risk of harm. A parent or guardian may exercise the child&apos;s data-subject
            rights where applicable.
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            5. Processors and service providers
          </h2>
          <p>
            The platform uses Render for application hosting and managed PostgreSQL database
            services; private Cloudflare R2 object storage plus Cloudflare DNS and security
            services; Google services such as Calendar and Meet where configured; Sentry error and
            performance monitoring when enabled; and {emailProcessor} for SMTP email delivery. These
            providers may process data involved in the configured operational service. We may update
            providers when operations change and will update this notice when the change is
            material.
          </p>
          <h2 className="text-xl font-semibold text-foreground">6. International processing</h2>
          <p>
            Some configured providers may process personal data outside Kenya. Before an
            international transfer, the applicable basis must be identified, such as appropriate
            safeguards, an adequacy decision, necessity for a permitted purpose, or informed consent
            where that basis is available. Consent alone does not replace additional safeguards
            where the law requires them, including for transfers of sensitive personal data.
          </p>
          <h2 className="text-xl font-semibold text-foreground">7. Retention</h2>
          <p>
            Retention is based on how long the data is reasonably necessary for its stated purpose,
            the admissions or educational relationship, contractual and administrative needs,
            applicable legal or reporting duties, evidence and dispute needs, security and fraud
            prevention, and proportionate backup and log cycles. When data is no longer necessary
            and no retention ground remains, the applicable retention process may delete, anonymise,
            or pseudonymise it. Legal, evidentiary, security, or operational retention requirements
            can override or delay a deletion request where applicable.
          </p>
          <h2 className="text-xl font-semibold text-foreground">8. Your rights</h2>
          <p>
            You may ask to be informed about processing, access personal data, object to processing,
            correct inaccurate or misleading data, restrict processing in applicable cases, or
            request deletion or erasure where the data is no longer authorised or necessary to
            retain. A request does not guarantee deletion when an applicable retention ground
            remains. Contact us at the address above. You may also contact or complain to
            Kenya&apos;s Office of the Data Protection Commissioner.
          </p>
          <h2 className="text-xl font-semibold text-foreground">9. Security controls</h2>
          <p>
            Application administrators authenticate with email and password. Infrastructure provider
            accounts remain protected with provider-level 2FA. Additional controls include
            role-based access controls, server-side validation, rate limiting and anti-spam checks,
            private object storage with controlled access links, audit and security event logging,
            and service monitoring where enabled. Access is limited by role and operational need. No
            technical or organisational measure can remove every risk.
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            10. Legal references and updates
          </h2>
          <p>
            This notice is informed by Kenya&apos;s Data Protection Act, 2019, the Data Protection
            (General) Regulations, 2021, and the ODPC&apos;s published data-subject rights
            information. It describes current operations and is not a guarantee of legal compliance
            or automatic registration with the ODPC. Material changes will be published here with a
            revised effective date.
          </p>
          <p>
            Official information:{" "}
            <a
              className="font-medium text-primary underline"
              href="https://new.kenyalaw.org/akn/ke/act/2019/24"
            >
              Data Protection Act, 2019
            </a>
            ;{" "}
            <a
              className="font-medium text-primary underline"
              href="https://new.kenyalaw.org/akn/ke/act/ln/2021/263"
            >
              General Regulations, 2021
            </a>
            ; and{" "}
            <a
              className="font-medium text-primary underline"
              href="https://www.odpc.go.ke/rights-of-a-data-subject/"
            >
              ODPC data-subject rights
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
