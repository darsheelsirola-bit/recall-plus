import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ContactEmailDialog from '../components/ContactEmailDialog'
import Logo from '../components/Logo'

const features = [
  {
    icon: BookOpenCheck,
    title: 'Turn study logs into practice',
    description:
      'Record what you studied, then build focused quizzes from the subjects and topics you are actually learning.',
  },
  {
    icon: Brain,
    title: 'Review before you forget',
    description:
      'Use spaced-recall prompts and a recall calendar to bring important topics back at useful intervals.',
  },
  {
    icon: CalendarClock,
    title: 'Plan around your real routine',
    description:
      'Generate a study timetable, track progress, and keep your plan available across signed-in devices.',
  },
] as const

export default function PublicLanding() {
  const [contactOpen, setContactOpen] = useState(false)

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label="Recall Plus homepage"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo outlined={false} />
          </Link>
          <nav className="flex items-center gap-3" aria-label="Public navigation">
            <a className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground sm:inline-flex" href="#features">
              Features
            </a>
            <Link className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex" to="/privacy">
              Privacy
            </Link>
            <Link className="btn-primary min-h-11 px-4" to="/auth">
              Sign in <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] lg:items-center lg:px-8 lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-secondary px-3 py-1.5 text-sm font-semibold text-primary">
              <CalendarClock className="size-4" aria-hidden="true" />
              A study system built around your routine
            </p>
            <h1 className="mt-6 max-w-3xl text-[clamp(3.25rem,9vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-ink">
              Remember more.
              <span className="block bg-gradient-to-r from-primary via-blue-500 to-mint bg-clip-text text-transparent">
                Stress less.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
              Recall+ turns your study logs into practice quizzes, spaced-recall plans,
              progress insights, and a timetable that follows your real routine.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-primary min-h-12 px-5" to="/auth">
                Start with Recall+ <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a className="btn-secondary min-h-12 px-5" href="#features">
                See how it works
              </a>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Use email and password or optional Google sign-in. Your Google password is
              never shared with Recall+.
            </p>
          </div>

          <div className="relative rounded-3xl bg-ink p-6 text-white shadow-lift sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-white">
              <Brain className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-8 text-3xl font-semibold tracking-[-0.04em]">
              One place for the full study loop
            </h2>
            <div className="mt-7 grid gap-3">
              {[
                'Capture each study session',
                'Practise with topic-based quizzes',
                'Schedule spaced recall',
                'Review progress and plan what comes next',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-medium text-white/80">
                  <CheckCircle2 className="size-5 shrink-0 text-mint" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">What Recall+ does</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Your study activity becomes the next useful action.
            </h2>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-border bg-background p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-3xl border border-border bg-secondary/45 p-6 sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-background text-primary shadow-sm">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Clear, limited Google sign-in access</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Google sign-in is optional and requests only basic account identity
              information—your name, email address, profile image, and Google account
              identifier—to authenticate you and connect your Recall+ account. Recall+
              does not request access to Gmail, Google Drive, Google Calendar, or your
              Google password.
            </p>
          </div>
          <Link className="btn-secondary min-h-11 justify-center px-4" to="/privacy">
            Read our Privacy Policy
          </Link>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Recall+ is an independent study platform and is not affiliated with or endorsed by CBSE or NCERT.
        </p>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© 2026 Recall+. Study planning, practice, and recall in one place.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal links">
            <Link className="font-semibold text-foreground hover:underline" to="/privacy">Privacy Policy</Link>
            <Link className="font-semibold text-foreground hover:underline" to="/terms">Terms of Service</Link>
            <button
              type="button"
              className="font-semibold text-foreground hover:underline"
              onClick={() => setContactOpen(true)}
            >
              Contact
            </button>
          </nav>
        </div>
      </footer>

      <ContactEmailDialog open={contactOpen} onClose={() => setContactOpen(false)} />
    </main>
  )
}
