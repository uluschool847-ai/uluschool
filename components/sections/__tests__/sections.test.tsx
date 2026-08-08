import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedFaqItemsMock = vi.hoisted(() => vi.fn());
const getLevelsMock = vi.hoisted(() => vi.fn());
const getCatalogueDataMock = vi.hoisted(() => vi.fn());
const getActiveTeachersMock = vi.hoisted(() => vi.fn());
const getPublishedTestimonialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/cms-repository", () => ({
  getPublishedFaqItems: getPublishedFaqItemsMock,
  getActiveTeachers: getActiveTeachersMock,
  getPublishedTestimonials: getPublishedTestimonialsMock,
}));

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getLevels: getLevelsMock,
  getCatalogueData: getCatalogueDataMock,
}));

import { AcademicJourneySection } from "@/components/sections/academic-journey-section";
import { CurriculumOverviewSection } from "@/components/sections/curriculum-overview-section";
import { FaqSection } from "@/components/sections/faq-section";
import { FreeTrialCtaSection } from "@/components/sections/free-trial-cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { HowClassesWorkSection } from "@/components/sections/how-classes-work-section";
import { PageHero } from "@/components/sections/page-hero";
import { SafeguardingSection } from "@/components/sections/safeguarding-section";
import { SubjectsLevelsSection } from "@/components/sections/subjects-levels-section";
import { TeachersPreviewSection } from "@/components/sections/teachers-preview-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { TrustBarSection } from "@/components/sections/trust-bar-section";
import { WhyChooseSection } from "@/components/sections/why-choose-section";

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

function textFrom(node: ParentNode) {
  return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("Section components misleading UI safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublishedFaqItemsMock.mockResolvedValue([
      {
        id: "faq-1",
        question: "Do you offer live classes?",
        answer: "Yes, with scheduled teacher support.",
        status: "published",
      },
    ]);
    getLevelsMock.mockResolvedValue([
      { id: "level-1", name: "Primary" },
      { id: "level-2", name: "IGCSE" },
    ]);
    getCatalogueDataMock.mockResolvedValue({
      levels: [
        { id: "level-1", name: "Primary" },
        { id: "level-2", name: "IGCSE" },
      ],
      subjects: [
        { id: "subject-1", name: "Mathematics" },
        { id: "subject-2", name: "English Language" },
      ],
    });
    getActiveTeachersMock.mockResolvedValue([
      {
        id: "teacher-1",
        fullName: "Mary Teacher",
        title: "Mathematics Teacher",
        bio: "Supports Cambridge mathematics classes with live feedback.",
      },
    ]);
    getPublishedTestimonialsMock.mockResolvedValue([
      {
        id: "testimonial-1",
        studentName: "Amina K",
        guardianName: "Parent A",
        levelLabel: "IGCSE",
        quote: "Stronger exam confidence and better problem solving.",
        photoUrl: null,
        status: "published",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render placeholder, sample, or decorative markers across section components", async () => {
    const sections = [
      { element: <AcademicJourneySection />, waitForText: /the academic journey/i, async: false },
      {
        element: <CurriculumOverviewSection />,
        waitForText: /cambridge curriculum overview/i,
        async: true,
      },
      { element: <FaqSection />, waitForText: /frequently asked questions/i, async: true },
      {
        element: <FreeTrialCtaSection />,
        waitForText: /start your child's global education journey today/i,
        async: false,
      },
      { element: <HeroSection />, waitForText: /world-class cambridge education/i, async: false },
      {
        element: <HowClassesWorkSection />,
        waitForText: /how online learning works/i,
        async: false,
      },
      {
        element: (
          <PageHero
            title="About ULU"
            description="Operational page description for public users."
          />
        ),
        waitForText: /about ulu/i,
        async: false,
      },
      {
        element: <SafeguardingSection />,
        waitForText: /safe online learning environment/i,
        async: false,
      },
      { element: <SubjectsLevelsSection />, waitForText: /our programmes/i, async: true },
      { element: <TeachersPreviewSection />, waitForText: /our teaching team/i, async: true },
      { element: <TestimonialsSection />, waitForText: /testimonials/i, async: true },
      { element: <TrustBarSection />, waitForText: /mathematics/i, async: false },
      { element: <WhyChooseSection />, waitForText: /why choose ulu/i, async: false },
    ];

    for (const section of sections) {
      const renderResult = section.async
        ? await renderServerComponent(section.element)
        : render(section.element);
      await screen.findByText(section.waitForText);

      const text = textFrom(renderResult.container);
      expect(text).not.toMatch(/lorem ipsum|placeholder|coming soon|under construction/i);
      expect(renderResult.container.querySelector('[data-testid*="placeholder"]')).toBeNull();
      expect(renderResult.container.querySelector('[data-testid*="decorative"]')).toBeNull();
      expect(renderResult.container.querySelector('[data-testid*="sample"]')).toBeNull();

      renderResult.unmount();
    }
  });

  it("does not expose disabled interactive controls inside section components", async () => {
    const asyncSections = [
      <CurriculumOverviewSection key="curriculum" />,
      <FaqSection key="faq" />,
      <SubjectsLevelsSection key="subjects" />,
      <TeachersPreviewSection key="teachers" />,
      <TestimonialsSection key="testimonials" />,
    ];

    for (const element of asyncSections) {
      const { container, unmount } = await renderServerComponent(element);
      expect(
        container.querySelector(
          "button[disabled], input[disabled], select[disabled], textarea[disabled], [aria-disabled='true']",
        ),
      ).toBeNull();
      unmount();
    }

    const { container } = render(
      <>
        <AcademicJourneySection />
        <FreeTrialCtaSection />
        <HeroSection />
        <HowClassesWorkSection />
        <PageHero title="About ULU" description="Operational page description for public users." />
        <SafeguardingSection />
        <TrustBarSection />
        <WhyChooseSection />
      </>,
    );

    expect(
      container.querySelector(
        "button[disabled], input[disabled], select[disabled], textarea[disabled], [aria-disabled='true']",
      ),
    ).toBeNull();
  });

  it("does not present decorative fake dashboard blocks as real product functionality", () => {
    render(<HeroSection />);

    expect(screen.queryByText(/live class dashboard/i)).toBeNull();
  });

  it("renders the hero lion as theme-coloured line art at the enlarged aspect ratio", () => {
    render(<HeroSection />);

    const lion = screen.getByRole("img", { name: /geometric lion illustration/i });
    expect(lion.className.split(/\s+/)).toContain("bg-secondary-foreground");
    expect(lion.style.aspectRatio).toBe("10 / 9");
    expect(lion.style.maskImage).toContain("/lion-hero-lineart.png");
    expect(lion.style.maskRepeat).toBe("no-repeat");
    expect(lion.style.maskSize).toBe("contain");
    expect(document.querySelector('img[src="/lion-hero.png"]')).toBeNull();
  });

  it("renders either real section content or nothing", async () => {
    const { container } = render(<FreeTrialCtaSection />);
    expect(textFrom(container).length).toBeGreaterThan(25);

    const faq = await renderServerComponent(<FaqSection />);
    expect(textFrom(faq.container).length).toBeGreaterThan(25);
  });
});
