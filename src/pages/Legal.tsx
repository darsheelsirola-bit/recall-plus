import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

type LegalDocument = 'privacy' | 'terms'

const EFFECTIVE_DATE = '29 July 2026'
const SUPPORT_EMAIL = 'darsheel.sirola@gmail.com'

const documents = {
  privacy: {
    title: 'Privacy Policy',
    introduction:
      'Recall+ helps students organise study activity, generate practice material, and plan future review. This policy explains what information the service uses and why.',
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'When you create an account or sign in with Google, Recall+ receives account information such as your name, email address, profile image, and provider account identifier. Recall+ never receives your Google password.',
          'We store the study information you choose to add, including subjects, syllabus details, study logs, quiz answers and results, recall schedules, timetable preferences, and application settings.',
          'The service may process essential technical information needed for authentication, security, reliability, rate limiting, and troubleshooting.',
        ],
      },
      {
        heading: 'Google sign-in and Google user data',
        paragraphs: [
          'Google sign-in is optional. Recall+ requests only the OpenID, email, and profile permissions needed to authenticate you and connect the correct Recall+ account. These permissions may provide your Google account identifier, name, email address, and profile image. Recall+ does not request access to Gmail, Google Drive, Google Calendar, contacts, or other Google product content.',
          'We use Google account information only for account authentication, account matching, security, and displaying your profile in Recall+. Supabase processes and stores authentication records on our behalf. Recall+ does not sell Google user data, use it for advertising or credit decisions, or use it to train AI models.',
          'Recall+’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.',
        ],
      },
      {
        heading: 'How we use information',
        paragraphs: [
          'We use your information to authenticate your account, synchronise your study plan across signed-in devices, provide quizzes and study recommendations, maintain generation limits, secure the service, and respond to support requests.',
          'Study content may be sent to an AI service when you ask Recall+ to generate a quiz, timetable, or insight. Only the information needed to complete that request is sent.',
        ],
      },
      {
        heading: 'Service providers',
        paragraphs: [
          'Recall+ uses Supabase for authentication and data storage, Vercel for application hosting, Google for optional sign-in, and configured AI providers for requested generation features. These providers process data only to deliver their respective services under their own terms and privacy commitments.',
          'We do not sell your personal information.',
        ],
      },
      {
        heading: 'Retention, access, and deletion',
        paragraphs: [
          'Account and study information is retained while your account is active or as needed to operate and secure the service. You may sign out at any time and download a portable copy of your study data from Settings.',
          `To request access, correction, or deletion of your Recall+ account and associated information, email ${SUPPORT_EMAIL} from the address connected to your account. We may retain limited records when required for security, fraud prevention, legal compliance, or dispute resolution.`,
        ],
      },
      {
        heading: 'Security and younger users',
        paragraphs: [
          'We use account-scoped access controls and encrypted network connections. No online service can guarantee absolute security.',
          'If local law requires parental or guardian consent for a student to use an online service, the student should use Recall+ only with that consent.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          `For privacy questions or account-data requests, email ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    introduction:
      'These terms govern your use of Recall+. By creating an account or using the service, you agree to use it responsibly and in accordance with applicable law.',
    sections: [
      {
        heading: 'Study service',
        paragraphs: [
          'Recall+ provides tools for study planning, practice quizzes, spaced recall, and generated learning suggestions. It is a study aid and does not guarantee academic results, grades, or the accuracy of generated material.',
        ],
      },
      {
        heading: 'Your account and content',
        paragraphs: [
          'You are responsible for maintaining the security of your account and for the accuracy and legality of content you submit. Do not share access credentials or use another person’s account without permission.',
          'You retain ownership of the study content you enter. You allow Recall+ and its service providers to process that content only as needed to operate, secure, and improve the requested service.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Do not attempt to disrupt the service, bypass usage limits, access another user’s information, upload unlawful or harmful material, or use generated content to deceive, harass, or infringe the rights of others.',
        ],
      },
      {
        heading: 'AI-generated material',
        paragraphs: [
          'Generated questions, schedules, and insights may be incomplete or incorrect. Review important material against reliable educational sources and use your own judgement.',
        ],
      },
      {
        heading: 'Availability and changes',
        paragraphs: [
          'Features may change, be interrupted, or be discontinued. We may restrict access when necessary to protect users, comply with law, or prevent abuse. These terms may be updated as the service evolves, with the effective date shown on this page.',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: [
          'To the extent permitted by law, Recall+ is provided without warranties and is not liable for indirect or consequential losses arising from use of the service. Nothing in these terms excludes rights or liabilities that cannot legally be excluded.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          `Questions about these terms may be sent to ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
} satisfies Record<LegalDocument, {
  title: string
  introduction: string
  sections: Array<{ heading: string; paragraphs: string[] }>
}>

export default function Legal({ document }: { document: LegalDocument }) {
  const content = documents[document]

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl">
        <header className="border-b border-border pb-8">
          <Link to="/" className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <Link
            to="/"
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary transition hover:bg-secondary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Recall+
          </Link>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em]">{content.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
          <p className="mt-5 text-base leading-7 text-muted-foreground">{content.introduction}</p>
        </header>

        <div className="space-y-9 py-9">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">{section.heading}</h2>
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border py-8 text-sm">
          <Link className="font-semibold text-primary hover:underline" to="/privacy">Privacy Policy</Link>
          <Link className="font-semibold text-primary hover:underline" to="/terms">Terms of Service</Link>
          <a className="font-semibold text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            Contact
          </a>
        </footer>
      </article>
    </main>
  )
}
