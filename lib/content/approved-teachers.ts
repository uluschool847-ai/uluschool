export type ApprovedPublicTeacher = {
  fullName: string;
  title: string;
  bio: string;
  photoUrl: string;
  displayOrder: number;
  isActive: true;
  subjectSlugs: readonly string[];
};

export const APPROVED_PUBLIC_TEACHERS = [
  {
    fullName: "Sir Nickson Onyango",
    title: "Founder and Mathematics & Science Teacher",
    bio: "Sir Nickson Onyango is the founder of ULU Online School and a Mathematics and Science educator committed to structured, student-centred learning.",
    photoUrl: "/nick.jpg",
    displayOrder: 1,
    isActive: true,
    subjectSlugs: ["mathematics", "science"],
  },
  {
    fullName: "Sir Alphonse",
    title: "English High School Teacher",
    bio: "Sir Alphonse holds a Bachelor's Degree in Education (English and Literature). He has extensive experience teaching the Cambridge Curriculum and preparing students for Cambridge Checkpoint and IGCSE examinations.",
    photoUrl: "/alphonse.jpg",
    displayOrder: 2,
    isActive: true,
    subjectSlugs: ["english-language"],
  },
  {
    fullName: "Ms. Cholette",
    title: "Lower Primary Teacher",
    bio: "Ms. Cholette holds a Bachelor's Degree in Education, specialising in Psychology. She is committed to fostering student development through a supportive, learner-centred approach and a strong foundation in educational practice.",
    photoUrl: "/cholette.jpg",
    displayOrder: 3,
    isActive: true,
    subjectSlugs: [],
  },
  {
    fullName: "Sir Bernard",
    title: "Chemistry and Biology Teacher",
    bio: "Sir Bernard holds a Bachelor's Degree in Education, specialising in Biology and Chemistry.",
    photoUrl: "/bernard.png",
    displayOrder: 4,
    isActive: true,
    subjectSlugs: ["biology", "chemistry"],
  },
] as const satisfies readonly ApprovedPublicTeacher[];
