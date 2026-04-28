export const siteConfig = {
  name: "ULU Online School",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "ULU Online School delivers structured, interactive, and exam-focused Cambridge education to students anywhere in the world.",
  contact: {
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "info@uluglobalacademy.com",
    phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "+254 XXX XXX XXX",
    whatsapp: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || "+254 XXX XXX XXX",
  },
};

export const mainNavItems = [
  { href: "/curriculum", label: "Curriculum" },
  { href: "/admissions", label: "Admissions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/teachers", label: "Teachers" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export const mobileNavItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/curriculum", label: "Curriculum" },
  { href: "/how-online-learning", label: "How It Works" },
  { href: "/subjects", label: "Subjects" },
  { href: "/teachers", label: "Teachers" },
  { href: "/admissions", label: "Admissions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/results", label: "Results" },
  { href: "/blog", label: "Blog" },
  { href: "/portal/login", label: "Portal Login" },
  { href: "/prospectus", label: "Prospectus" },
  { href: "/contact", label: "Contact" },
  { href: "/enrol", label: "Book Trial" },
];

export const trustLogos = [
  "Mathematics",
  "English Language",
  "Kiswahili",
  "Biology",
  "Chemistry",
  "Physics",
  "Business Studies",
  "ICT",
  "Geography",
];

export const whyChooseItems = [
  {
    title: "Certified Cambridge Teachers",
    description: "Experienced subject teachers trained to deliver Cambridge-aligned instruction.",
  },
  {
    title: "Live & Recorded Lessons",
    description: "Attend scheduled live classes and revisit recorded lessons for revision.",
  },
  {
    title: "Small Interactive Classes",
    description: "Focused class sizes support participation, feedback, and personal attention.",
  },
  {
    title: "Continuous Assessment & Mock Exams",
    description: "Weekly quizzes, monthly tests, term exams, and mock preparation build readiness.",
  },
  {
    title: "Parent Progress Tracking",
    description: "Parents receive structured updates, reports, and progress visibility.",
  },
  {
    title: "International Learning Community",
    description: "Students learn in a globally connected, technology-enabled environment.",
  },
  {
    title: "Affordable Global Fees",
    description: "Accessible fee options are designed for families in different regions.",
  },
];

export const classWorkflows = [
  {
    title: "Apply Online",
    description: "Submit your application and student details through our admissions process.",
  },
  {
    title: "Attend Live Classes",
    description: "Students join scheduled interactive lessons with qualified teachers.",
  },
  {
    title: "Complete Assignments",
    description: "Learners submit classwork and homework through the student portal.",
  },
  {
    title: "Sit Mock Exams",
    description: "Continuous assessment and mock exams prepare students for formal testing.",
  },
  {
    title: "Register for Cambridge Examinations",
    description: "Students proceed to Cambridge examinations through approved pathways.",
  },
];

export const academicJourney = [
  {
    id: "primary",
    label: "Primary",
    years: "Years 1-6",
    summary: "Strong foundations in literacy, numeracy, science, and global perspectives.",
    subjects: ["English", "Mathematics", "Science", "Global Perspectives", "Kiswahili"],
  },
  {
    id: "lower-secondary",
    label: "Lower Secondary",
    years: "Years 7-9",
    summary:
      "Skill-based preparation for IGCSE with stronger analytical and exam-readiness habits.",
    subjects: [
      "English",
      "Mathematics",
      "Biology",
      "Chemistry",
      "Physics",
      "Geography",
      "ICT",
      "Global Perspectives",
      "Kiswahili",
    ],
  },
  {
    id: "igcse",
    label: "IGCSE",
    years: "Years 10-11",
    summary: "Full subject preparation aligned with Cambridge standards and exam expectations.",
    subjects: [
      "Mathematics",
      "English Language",
      "Biology",
      "Chemistry",
      "Physics",
      "Business Studies",
      "ICT",
      "Geography",
      "Kiswahili",
    ],
  },
];

export const levels = [
  {
    key: "primary-years-1-6",
    label: "Primary (Years 1-6)",
    description:
      "Strong foundation in literacy, numeracy, and scientific thinking through guided online learning.",
    subjects: [
      "English",
      "Mathematics",
      "Science",
      "Global Perspectives",
      "ICT (optional)",
      "Kiswahili",
    ],
    formats: ["Weekly quizzes", "Monthly progress tests", "Term exams"],
  },
  {
    key: "lower-secondary-years-7-9",
    label: "Lower Secondary (Years 7-9)",
    description:
      "Skill-based preparation for IGCSE with a focus on analytical thinking and subject readiness.",
    subjects: [
      "English",
      "Mathematics",
      "Biology",
      "Chemistry",
      "Physics",
      "Geography",
      "ICT",
      "Global Perspectives",
      "Kiswahili",
    ],
    formats: ["Weekly quizzes", "Monthly tests", "Term exams"],
  },
  {
    key: "igcse-years-10-11",
    label: "IGCSE (Years 10-11)",
    description:
      "Full subject preparation aligned with Cambridge standards using mock exams and structured revision.",
    subjects: [
      "Mathematics",
      "English Language",
      "Biology",
      "Chemistry",
      "Physics",
      "Business Studies",
      "ICT",
      "Geography",
      "Kiswahili",
    ],
    formats: ["Coursework support (where required)", "Mock examinations", "Final exam preparation"],
  },
];

export const teachers = [
  {
    name: "Mr. Nick",
    title: "Math and Science Teacher",
    credentials: "Lower Secondary specialist",
    focus: "Math and Science",
    image: "/nick.jpg",
  },
  {
    name: "Mr. Alphonse",
    title: "English Teacher",
    credentials: "High School specialist",
    focus: "English Language",
    image: "/alphonse.jpg",
  },
  {
    name: "Ms. Cholette",
    title: "Primary Teacher",
    credentials: "Lower Primary specialist",
    focus: "Lower Primary Education",
    image: "/cholette.jpg",
  },
];

export const testimonials = [
  {
    label: "Parent Testimonial",
    quote: "ULU has transformed our child’s learning experience.",
  },
  {
    label: "Parent Testimonial",
    quote: "The teachers are structured and professional.",
  },
  {
    label: "Family Feedback",
    quote: "We appreciate the live classes, recorded lessons, and regular progress reports.",
  },
];

export const faqItems = [
  {
    question: "Which curriculum do you follow?",
    answer: "We follow the Cambridge International Curriculum.",
  },
  {
    question: "Are classes live or recorded?",
    answer:
      "Students attend live interactive classes and can access recorded lessons for revision.",
  },
  {
    question: "Do you offer a free trial class?",
    answer: "Yes. Families can book a free trial class before completing enrolment.",
  },
  {
    question: "How is student progress assessed?",
    answer: "We use weekly quizzes, monthly tests, term exams, and mock examinations.",
  },
  {
    question: "What payment methods are accepted?",
    answer: "We accept bank transfer, mobile money, and international transfer options.",
  },
];

export const safeguardingPoints = [
  "Secure student accounts and controlled class access.",
  "Recorded lessons available for revision and quality oversight.",
  "Structured parent communication and progress reporting.",
  "Teachers use approved platforms and supervised online delivery workflows.",
];
