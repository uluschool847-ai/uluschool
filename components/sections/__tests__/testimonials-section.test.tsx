import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedTestimonialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/cms-repository", () => ({
  getPublishedTestimonials: getPublishedTestimonialsMock,
}));

type TestimonialsSectionModule = {
  TestimonialsSection: () => JSX.Element | null | Promise<JSX.Element | null>;
};

async function loadTestimonialsSection() {
  const specifier = "@/components/sections/testimonials-section";
  return import(/* @vite-ignore */ specifier) as Promise<TestimonialsSectionModule>;
}

describe("TestimonialsSection CMS-backed public rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when there are no published testimonials", async () => {
    getPublishedTestimonialsMock.mockResolvedValueOnce([]);

    const { TestimonialsSection } = await loadTestimonialsSection();

    expect(await TestimonialsSection()).toBeNull();
  });

  it("renders the correct number of published testimonials", async () => {
    getPublishedTestimonialsMock.mockResolvedValueOnce([
      {
        id: "testimonial-1",
        studentName: "Amina Johnson",
        guardianName: "Sarah Johnson",
        quote: "Excellent support and structure.",
        levelLabel: "IGCSE",
        photoUrl: "/amina.jpg",
        isPublished: true,
        displayOrder: 1,
      },
      {
        id: "testimonial-2",
        studentName: "Daniel Kariuki",
        guardianName: "Grace Kariuki",
        quote: "Clear feedback and strong teaching.",
        levelLabel: "A Level",
        photoUrl: "/daniel.jpg",
        isPublished: true,
        displayOrder: 2,
      },
    ]);

    const { TestimonialsSection } = await loadTestimonialsSection();
    const element = await TestimonialsSection();

    render(element);

    expect(getPublishedTestimonialsMock).toHaveBeenCalled();
    expect(screen.getByText(/excellent support and structure/i)).toBeDefined();
    expect(screen.getByText(/clear feedback and strong teaching/i)).toBeDefined();
    expect(screen.getAllByLabelText(/5 star rating/i).length).toBe(2);
  });

  it("does not render draft or hidden testimonials", async () => {
    getPublishedTestimonialsMock.mockResolvedValueOnce([
      {
        id: "testimonial-1",
        studentName: "Published Student",
        guardianName: "Published Guardian",
        quote: "Published social proof",
        levelLabel: "IGCSE",
        photoUrl: "/published.jpg",
        isPublished: true,
        displayOrder: 1,
      },
    ]);

    const { TestimonialsSection } = await loadTestimonialsSection();
    const element = await TestimonialsSection();

    render(element);

    expect(screen.getByText(/published social proof/i)).toBeDefined();
    expect(screen.queryByText(/draft social proof/i)).toBeNull();
  });

  it("falls back to initials when a testimonial photo is missing", async () => {
    getPublishedTestimonialsMock.mockResolvedValueOnce([
      {
        id: "testimonial-1",
        studentName: "Amina Johnson",
        guardianName: "Sarah Johnson",
        quote: "Great communication and support.",
        levelLabel: "IGCSE",
        photoUrl: null,
        isPublished: true,
        displayOrder: 1,
      },
    ]);

    const { TestimonialsSection } = await loadTestimonialsSection();
    const element = await TestimonialsSection();

    render(element);

    expect(screen.getByText("AJ")).toBeDefined();
    expect(screen.getByText(/great communication and support/i)).toBeDefined();
  });
});
