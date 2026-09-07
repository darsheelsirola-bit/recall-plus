/**
 * Server-safe Class XI subject name list for timetable validation.
 * Kept as plain JS so Vercel serverless functions do not import TypeScript
 * curriculum modules (Node type-stripping is not reliable on all runtimes).
 */
export const VALID_TIMETABLE_SUBJECTS = Object.freeze([
  'English Core',
  'Hindi Core',
  'French',
  'History',
  'Political Science',
  'Geography',
  'Economics',
  'Hindustani Music Vocal',
  'Psychology',
  'Sociology',
  'Mathematics',
  'Applied Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Physical Education',
  'Painting',
  'Business Studies',
  'Accountancy',
  'Entrepreneurship',
  'Legal Studies',
  'Computer Science',
  'Artificial Intelligence',
  'Fashion Studies',
])
