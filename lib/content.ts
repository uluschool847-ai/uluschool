export const siteConfig = {
  name: "ULU Online School",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "ULU Online School delivers structured, interactive, and exam-focused Cambridge education to students anywhere in the world.",
  contact: {
    email: "info@uluglobalacademy.com",
    phone: "+254 XXX XXX XXX",
    whatsapp: "+254 XXX XXX XXX",
  },
};

export const mainNavItems = [
  { href: "/curriculum", label: "Curriculum" },
  { href: "/admissions", label: "Admissions" },
  { href: "/fees", label: "Fees" },
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
  { href: "/fees", label: "Fees" },
  { href: "/results", label: "Results" },
  { href: "/blog", label: "Blog" },
  { href: "/student-portal", label: "Student Portal" },
  { href: "/prospectus", label: "Prospectus" },
  { href: "/contact", label: "Contact" },
  { href: "/enrol", label: "Book Trial" },
];

export const trustLogos = [
  "Cambridge Curriculum",
  "Live Interactive Classes",
  "Recorded Lesson Access",
  "International Learning Community",
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
    subjects: ["English", "Mathematics", "Science", "Global Perspectives"],
  },
  {
    id: "lower-secondary",
    label: "Lower Secondary",
    years: "Years 7-9",
    summary: "Skill-based preparation for IGCSE with stronger analytical and exam-readiness habits.",
    subjects: [
      "English",
      "Mathematics",
      "Biology",
      "Chemistry",
      "Physics",
      "Geography",
      "ICT",
      "Global Perspectives",
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
    ],
  },
];

export const levels = [
  {
    key: "primary-years-1-6",
    label: "Primary (Years 1-6)",
    description:
      "Strong foundation in literacy, numeracy, and scientific thinking through guided online learning.",
    subjects: ["English", "Mathematics", "Science", "Global Perspectives", "ICT (optional)"],
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
    ],
    formats: ["Coursework support (where required)", "Mock examinations", "Final exam preparation"],
  },
];

export const teachers = [
  {
    name: "Ms. Grace Wambui",
    title: "Cambridge Primary & Lower Secondary Lead",
    credentials: "B.Ed, Cambridge-trained, 11 years experience",
    focus: "English, Global Perspectives, and learner development",
  },
  {
    name: "Mr. Daniel Mwangi",
    title: "Mathematics Subject Specialist",
    credentials: "BSc Mathematics, 10 years experience",
    focus: "Primary, Lower Secondary, and IGCSE Mathematics",
  },
  {
    name: "Dr. Amina Yusuf",
    title: "Science Department Coordinator",
    credentials: "MSc Education, 13 years experience",
    focus: "Biology, Chemistry, and Physics (Lower Secondary & IGCSE)",
  },
  {
    name: "Mr. Kelvin Otieno",
    title: "IGCSE Humanities & ICT Teacher",
    credentials: "BA + PGDE, 9 years experience",
    focus: "Business Studies, Geography, and ICT",
  },
];

export const testimonials = [
  {
    label: "Parent Testimonial",
    quote:
      "ULU has transformed our child’s learning experience.",
  },
  {
    label: "Parent Testimonial",
    quote: "The teachers are structured and professional.",
  },
  {
    label: "Family Feedback",
    quote:
      "We appreciate the live classes, recorded lessons, and regular progress reports.",
  },
];

export const faqItems = [
  {
    question: "Which curriculum do you follow?",
    answer: "We follow the Cambridge International Curriculum.",
  },
  {
    question: "Are classes live or recorded?",
    answer: "Students attend live interactive classes and can access recorded lessons for revision.",
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
