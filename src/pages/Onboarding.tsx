import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Languages,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Logo from '../components/Logo'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAcademicProfile } from '../academic/AcademicProfileProvider.tsx'
import {
  academicSubjectCatalogueFor,
} from '../academic/academicProfile.ts'
import {
  arrangeSubjectSelections,
  defaultOnboardingDraft,
  ONBOARDING_STEP_COUNT,
  PATHWAY_PRESETS,
  presetSubjectIds,
  readOnboardingDraft,
  recommendedSubjects,
  shouldPersistOnboardingProgress,
  subjectCategoryLabel,
  writeOnboardingDraft,
  type OnboardingDraft,
} from '../academic/onboarding.ts'
import { subjectById } from '../data/curriculum/registry.ts'
import type {
  AcademicPathway,
  CurriculumGrade,
  CurriculumSubject,
} from '../data/curriculum/types.ts'
import {
  countSubjectHistory,
  totalSubjectHistory,
} from '../utils/subjectHistory.js'

const pathwayOptions: Array<{
  id: AcademicPathway
  title: string
  description: string
}> = [
  {
    id: 'science',
    title: 'Science',
    description: 'Start with common Science combinations, then confirm every subject.',
  },
  {
    id: 'commerce',
    title: 'Commerce',
    description: 'Organise common Commerce subjects while keeping valid electives flexible.',
  },
  {
    id: 'humanities',
    title: 'Humanities',
    description: 'Build a flexible combination from Humanities and cross-disciplinary electives.',
  },
]

const requiredLanguageCodes = new Set(['301', '302', '118'])

function languagesForGrade(grade: CurriculumGrade): CurriculumSubject[] {
  return academicSubjectCatalogueFor(grade).filter((subject) =>
    requiredLanguageCodes.has(subject.subjectCode ?? ''))
}

function SubjectCode({ subject }: { subject: CurriculumSubject }) {
  return (
    <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
      {subject.subjectCode}
    </span>
  )
}

function SelectionCard({
  checked,
  onChange,
  subject,
}: {
  checked: boolean
  onChange: () => void
  subject: CurriculumSubject
}) {
  return (
    <label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
      checked
        ? 'border-primary bg-secondary/70 shadow-sm'
        : 'border-border bg-card hover:border-primary/35'
    }`}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border ${
          checked
            ? 'border-primary bg-primary text-white'
            : 'border-input bg-white text-transparent'
        }`}
      >
        <Check className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <strong className="min-w-0 text-sm leading-5">{subject.name}</strong>
          <SubjectCode subject={subject} />
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {subjectCategoryLabel(subject)}
        </span>
      </span>
    </label>
  )
}

function StepOne({
  draft,
  email,
  name,
  update,
}: {
  draft: OnboardingDraft
  email: string
  name: string
  update: (patch: Partial<OnboardingDraft>) => void
}) {
  const fixedDetails = [
    ['Board', 'CBSE'],
    ['Academic year', '2026–27'],
    ['Timezone', 'Asia/Kolkata'],
  ]
  const gradeOptions: Array<{ id: CurriculumGrade; label: string }> = [
    { id: 'XI', label: 'Class XI' },
    { id: 'XII', label: 'Class XII' },
  ]
  return (
    <div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground">Student</p>
          <p className="mt-1 truncate text-sm font-semibold">{name}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground">Account email</p>
          <p className="mt-1 truncate text-sm font-semibold">{email}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fixedDetails.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs font-medium text-muted-foreground">Class</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {gradeOptions.map((option) => {
          const selected = draft.grade === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => update({
                grade: option.id,
                subjectIds: [],
                preset: 'custom',
              })}
              className={`rounded-2xl border p-4 text-left transition ${
                selected
                  ? 'border-primary bg-secondary shadow-sm'
                  : 'border-border bg-card hover:border-primary/35'
              }`}
            >
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                CBSE senior secondary {option.id === 'XII' ? 'board year' : 'first year'}
              </p>
            </button>
          )
        })}
      </div>
      <label className="field-label mt-5" htmlFor="school-name">
        School name <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <input
        id="school-name"
        className="field"
        maxLength={160}
        placeholder="Your school"
        value={draft.schoolName}
        onChange={(event) => update({ schoolName: event.target.value })}
      />
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Recall+ uses India Standard Time for daily study limits and reminders.
      </p>
    </div>
  )
}

function StepTwo({
  draft,
  update,
}: {
  draft: OnboardingDraft
  update: (patch: Partial<OnboardingDraft>) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {pathwayOptions.map((option) => {
        const selected = draft.pathway === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => update({
              pathway: option.id,
              preset: draft.pathway === option.id ? draft.preset : 'custom',
            })}
            className={`min-h-44 rounded-2xl border p-5 text-left transition ${
              selected
                ? 'border-primary bg-secondary shadow-sm'
                : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/35'
            }`}
          >
            <span className={`grid size-10 place-items-center rounded-xl ${
              selected ? 'bg-primary text-white' : 'bg-muted text-foreground'
            }`}>
              {selected ? <Check className="size-5" /> : <GraduationCap className="size-5" />}
            </span>
            <strong className="mt-5 block text-lg">{option.title}</strong>
            <span className="mt-2 block text-sm leading-6 text-muted-foreground">
              {option.description}
            </span>
          </button>
        )
      })}
      <p className="md:col-span-3 mt-1 text-sm leading-6 text-muted-foreground">
        Your pathway only organises suggestions. Your confirmed subject IDs—not the pathway label—control what appears in Recall+.
      </p>
    </div>
  )
}

function StepThree({
  draft,
  selectPreset,
}: {
  draft: OnboardingDraft
  selectPreset: (preset: string) => void
}) {
  if (!draft.pathway) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PATHWAY_PRESETS[draft.pathway].map((preset) => {
        const selected = draft.preset === preset.id
        const subjects = presetSubjectIds(draft.pathway!, preset.id, draft.grade)
          .map(subjectById)
          .filter((subject): subject is CurriculumSubject => Boolean(subject))
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selected}
            onClick={() => selectPreset(preset.id)}
            className={`min-h-36 rounded-2xl border p-5 text-left transition ${
              selected
                ? 'border-primary bg-secondary shadow-sm'
                : 'border-border bg-card hover:border-primary/35'
            }`}
          >
            <span className="flex items-start justify-between gap-3">
              <strong className="text-base">{preset.label}</strong>
              {selected ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <Check className="size-4" />
                </span>
              ) : null}
            </span>
            <span className="mt-2 block text-sm leading-5 text-muted-foreground">
              {preset.description}
            </span>
            {subjects.length ? (
              <span className="mt-3 block text-xs leading-5 text-muted-foreground">
                {subjects.map((subject) => subject.shortName).join(' · ')}
              </span>
            ) : null}
          </button>
        )
      })}
      <p className="sm:col-span-2 mt-1 text-sm leading-6 text-muted-foreground">
        Presets add only the subjects listed. Optional subjects such as Computer Science, Physical Education and Artificial Intelligence are chosen separately.
      </p>
    </div>
  )
}

function StepFour({
  draft,
  selectLanguage,
}: {
  draft: OnboardingDraft
  selectLanguage: (subjectId: string) => void
}) {
  return (
    <div>
      <Alert>
        <Languages className="size-4" />
        <AlertTitle>Choose the required primary language</AlertTitle>
        <AlertDescription>
          Subject 1 must be English Core, Hindi Core, or French. These are the only language subjects in Recall+.
        </AlertDescription>
      </Alert>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {languagesForGrade(draft.grade).map((subject) => {
          const checked = draft.subjectIds.includes(subject.id)
          return (
            <button
              key={subject.id}
              type="button"
              aria-pressed={checked}
              onClick={() => selectLanguage(subject.id)}
              className={`flex min-h-16 items-start gap-3 rounded-2xl border p-4 text-left transition ${
                checked
                  ? 'border-primary bg-secondary'
                  : 'border-border bg-card hover:border-primary/35'
              }`}
            >
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border ${
                checked
                  ? 'border-primary bg-primary text-white'
                  : 'border-input bg-white text-transparent'
              }`}>
                <Check className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm leading-5">{subject.name}</strong>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Official code {subject.subjectCode}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepFive({
  draft,
  toggleSubject,
}: {
  draft: OnboardingDraft
  toggleSubject: (subjectId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const recommended = useMemo(
    () => draft.pathway
      ? recommendedSubjects(draft.pathway, draft.grade)
        .filter((subject) => subject.subjectGroup !== 'L')
      : [],
    [draft.grade, draft.pathway],
  )
  const catalogue = academicSubjectCatalogueFor(draft.grade)
  const visibleSubjects = useMemo(() => {
    const source = showAll ? catalogue : recommended
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return source
    return source.filter((subject) => (
      subject.name.toLowerCase().includes(normalizedQuery)
      || subject.shortName.toLowerCase().includes(normalizedQuery)
      || subject.subjectCode?.includes(normalizedQuery)
    ))
  }, [catalogue, query, recommended, showAll])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {draft.subjectIds.length} of 5–6 subjects selected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The first five become main subjects; a sixth becomes additional.
          </p>
        </div>
        <span className={`status-chip ${
          [5, 6].includes(draft.subjectIds.length)
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-800'
        }`}>
          {[5, 6].includes(draft.subjectIds.length) ? 'Count ready' : 'Select 5 or 6'}
        </span>
      </div>

      <div className="relative mt-5">
        <label className="sr-only" htmlFor="subject-search">Search subjects</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="subject-search"
          type="search"
          className="field mt-0 pl-10"
          placeholder={showAll ? 'Search all subjects by name or code' : 'Search recommended subjects'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {visibleSubjects.map((subject) => (
          <SelectionCard
            key={subject.id}
            subject={subject}
            checked={draft.subjectIds.includes(subject.id)}
            onChange={() => toggleSubject(subject.id)}
          />
        ))}
      </div>
      {!visibleSubjects.length ? (
        <div className="empty-state mt-4 min-h-28">
          <p className="text-sm text-muted-foreground">No subjects match this search.</p>
        </div>
      ) : null}

      <Button
        type="button"
        nativeButton
        render={undefined}
        variant="outline"
        className="mt-5 w-full justify-between"
        onClick={() => {
          setShowAll((value) => !value)
          setQuery('')
        }}
      >
        <span>{showAll ? 'Show pathway recommendations' : 'More CBSE subjects'}</span>
        <ChevronDown className={`size-4 transition ${showAll ? 'rotate-180' : ''}`} />
      </Button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        “More CBSE subjects” includes all {catalogue.length} approved Class {draft.grade} subjects in this Recall+ catalogue.
      </p>
    </div>
  )
}

function StepSix({
  confirmed,
  draft,
  onConfirm,
  removedSubjects,
  selections,
}: {
  confirmed: boolean
  draft: OnboardingDraft
  onConfirm: (value: boolean) => void
  removedSubjects: Array<{
    name: string
    history: ReturnType<typeof countSubjectHistory>
  }>
  selections: NonNullable<ReturnType<typeof arrangeSubjectSelections>>
}) {
  const main = selections.filter((selection) => selection.selectionType === 'main')
  const additional = selections.find(
    (selection) => selection.selectionType === 'additional',
  )
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs leading-5 text-muted-foreground">Class</p>
          <p className="mt-2 text-sm font-semibold leading-5">{draft.grade}</p>
        </div>
        <div className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs leading-5 text-muted-foreground">Pathway</p>
          <p className="mt-2 text-sm font-semibold capitalize leading-5">{draft.pathway}</p>
        </div>
        <div className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs leading-5 text-muted-foreground">Main subjects</p>
          <p className="mt-2 text-sm font-semibold leading-5">{main.length}</p>
        </div>
        <div className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs leading-5 text-muted-foreground">Additional</p>
          <p className="mt-2 text-sm font-semibold leading-5">{additional ? '1' : 'None'}</p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        {selections.map((selection) => {
          const subject = subjectById(selection.curriculumSubjectId)
          if (!subject) return null
          return (
            <div
              key={selection.curriculumSubjectId}
              className="flex min-h-16 items-start gap-3 border-b border-border p-4 last:border-b-0"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary">
                {selection.subjectPosition}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block break-words text-sm leading-5">{subject.name}</strong>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {selection.selectionType === 'main' ? 'Main subject' : 'Additional subject'} · {subjectCategoryLabel(subject)}
                </span>
              </span>
              <span className="mt-0.5 shrink-0">
                <SubjectCode subject={subject} />
              </span>
            </div>
          )
        })}
      </div>

      <Alert className="mt-5">
        <ShieldCheck className="size-4" />
        <AlertTitle>Confirm with your school records</AlertTitle>
        <AlertDescription>
          “CBSE lists these subjects, but your school may not offer every subject. Select only subjects officially registered by your school.”
        </AlertDescription>
      </Alert>

      {removedSubjects.length ? (
        <Alert variant="destructive" className="mt-5">
          <BookOpenCheck className="size-4" />
          <AlertTitle className="">Removed subjects will be archived, not deleted</AlertTitle>
          <AlertDescription className="">
            <span className="block">
              Historical records remain available. New quizzes, revisions and recommendations stop for removed subjects.
            </span>
            <span className="mt-3 grid gap-2">
              {removedSubjects.map(({ history, name }) => (
                <span key={name} className="block rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <strong className="block text-foreground">{name}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {history.studyLogs} study logs · {history.quizzes} quizzes · {history.revisions} revisions · {history.progressRecords} progress records · {history.timetableEntries} timetable entries
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {totalSubjectHistory(history)} historical learning records will be preserved.
                  </span>
                </span>
              ))}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <label className="mt-5 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={confirmed}
          onChange={(event) => onConfirm(event.target.checked)}
        />
        <span className="text-sm leading-6">
          I confirm these are the subjects registered by my school, and I understand that Recall+ will use these selections across my study workspace.
        </span>
      </label>
    </div>
  )
}

const stepCopy = [
  {
    title: 'Set up your academic year',
    description: 'Confirm your CBSE class and academic year details for this Recall+ release.',
  },
  {
    title: 'Choose your pathway',
    description: 'This organises suggestions without restricting your valid subject choices.',
  },
  {
    title: 'Start with a combination',
    description: 'Use a common starting point or build a custom combination.',
  },
  {
    title: 'Choose your language',
    description: 'Select the required English or Hindi option for Subject 1.',
  },
  {
    title: 'Confirm every subject',
    description: 'Select exactly five main subjects and, optionally, one additional subject.',
  },
  {
    title: 'Review your workspace',
    description: 'Check subject positions and codes before Recall+ personalises the app.',
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editing = searchParams.get('mode') === 'edit'
  const { profile: accountProfile, signOut, user } = useAuth()
  const {
    completeProfile,
    saveProgress,
    saving,
    workspace,
  } = useAcademicProfile()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const ownerId = user?.id ?? ''
  const initialSubjectIds = workspace?.subjects.length
    ? workspace.subjects.map((selection) => selection.curriculumSubjectId)
    : workspace?.migrationCandidates.flatMap((candidate) =>
      candidate.curriculumSubjectId ? [candidate.curriculumSubjectId] : []) ?? []
  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const stored = readOnboardingDraft(window.localStorage, ownerId)
    if (stored) return stored
    return defaultOnboardingDraft(
      workspace?.profile.pathway ?? null,
      workspace?.profile.schoolName ?? '',
      initialSubjectIds,
      workspace?.profile.grade === 'XII' ? 'XII' : 'XI',
    )
  })
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const selections = useMemo(
    () => arrangeSubjectSelections(draft.subjectIds, draft.grade),
    [draft.grade, draft.subjectIds],
  )
  const removedSubjects = useMemo(() => {
    if (!editing || !workspace) return []
    return workspace.subjects
      .filter((selection) => (
        !draft.subjectIds.includes(selection.curriculumSubjectId)
      ))
      .map((selection) => ({
        name: selection.subject.name,
        history: countSubjectHistory(selection.subject.name),
      }))
  }, [draft.subjectIds, editing, workspace])

  function replaceDraft(next: OnboardingDraft) {
    setDraft(next)
    writeOnboardingDraft(window.localStorage, ownerId, next)
  }

  function update(patch: Partial<OnboardingDraft>) {
    replaceDraft({ ...draft, ...patch })
    setError('')
  }

  function focusHeading() {
    window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function selectPreset(preset: string) {
    if (!draft.pathway) return
    const languageIds = draft.subjectIds.filter((id) =>
      subjectById(id)?.subjectGroup === 'L')
    update({
      preset,
      subjectIds: [...new Set([
        ...languageIds,
        ...presetSubjectIds(draft.pathway, preset, draft.grade),
      ])].slice(0, 6),
    })
  }

  function selectLanguage(subjectId: string) {
    const withoutPrimary = draft.subjectIds.filter((id) => {
      const code = subjectById(id)?.subjectCode ?? ''
      return !requiredLanguageCodes.has(code)
    })
    update({ subjectIds: [subjectId, ...withoutPrimary].slice(0, 6) })
  }

  function toggleSubject(subjectId: string) {
    if (draft.subjectIds.includes(subjectId)) {
      update({
        subjectIds: draft.subjectIds.filter((id) => id !== subjectId),
      })
      return
    }
    if (draft.subjectIds.length >= 6) {
      setError('You can select at most six subjects. Remove one before adding another.')
      return
    }
    update({ subjectIds: [...draft.subjectIds, subjectId] })
  }

  function validationForStep(): string {
    if (
      draft.step === 1
      && draft.schoolName.trim()
      && draft.schoolName.trim().length < 2
    ) return 'Enter at least 2 characters for the school name, or leave it blank.'
    if (draft.step === 2 && !draft.pathway) return 'Choose a pathway to continue.'
    if (
      draft.step === 3
      && (!draft.pathway || !PATHWAY_PRESETS[draft.pathway].some(
        (preset) => preset.id === draft.preset,
      ))
    ) return 'Choose a suggested combination or Custom.'
    if (
      draft.step === 4
      && !draft.subjectIds.some((id) =>
        requiredLanguageCodes.has(subjectById(id)?.subjectCode ?? ''))
    ) return 'Choose English or Hindi at Core or Elective level.'
    if (draft.step === 5) {
      if (![5, 6].includes(draft.subjectIds.length)) {
        return 'Select exactly five subjects, or five main subjects plus one additional subject.'
      }
      if (!selections) {
        return 'This selection cannot be placed into a valid CBSE combination. Check the language, subject groups, and conflicting subjects.'
      }
    }
    return ''
  }

  async function continueFlow() {
    const validation = validationForStep()
    if (validation) {
      setError(validation)
      return
    }
    if (draft.step >= ONBOARDING_STEP_COUNT) return

    if (shouldPersistOnboardingProgress(editing)) {
      const saveError = await saveProgress(draft.pathway, draft.schoolName)
      if (saveError) {
        setError(saveError)
        return
      }
    }
    replaceDraft({ ...draft, step: draft.step + 1 })
    setError('')
    focusHeading()
  }

  function goBack() {
    if (draft.step === 1) {
      if (editing) navigate('/settings')
      return
    }
    replaceDraft({ ...draft, step: draft.step - 1 })
    setError('')
    focusHeading()
  }

  async function finish() {
    if (!confirmed) {
      setError('Confirm that these subjects match your school registration.')
      return
    }
    if (!draft.pathway || !selections) {
      setError('Review your subject combination before finishing.')
      return
    }
    if (editing && workspace) {
      const currentIds = new Set(
        workspace.subjects.map((subject) => subject.curriculumSubjectId),
      )
      const removed = workspace.subjects
        .filter((subject) => !draft.subjectIds.includes(subject.curriculumSubjectId))
        .map((subject) => subject.subject.name)
      const added = draft.subjectIds
        .filter((id) => !currentIds.has(id))
        .map((id) => subjectById(id)?.name)
        .filter(Boolean)
      if (
        (removed.length || added.length)
        && !window.confirm(
          `Change your active subjects?\n\nRemoved selections: ${removed.join(', ') || 'None'}\nAdded selections: ${added.join(', ') || 'None'}\n\nHistorical study logs, quizzes, revisions and progress will be preserved. Removed subjects will stop receiving new quizzes, revisions and recommendations. Existing timetable entries are not deleted; review your future timetable after saving.`,
        )
      ) return
    }

    const saveError = await completeProfile(
      draft.pathway,
      draft.schoolName,
      selections,
      draft.grade,
    )
    if (saveError) {
      setError(saveError)
      return
    }
    window.localStorage.removeItem(
      `recall-plus:onboarding:${encodeURIComponent(ownerId)}`,
    )
    navigate('/', { replace: true })
  }

  function handleStepKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      if (event.target.type === 'search') return
      event.preventDefault()
      void continueFlow()
    }
  }

  const copy = stepCopy[draft.step - 1]
  const unresolvedCandidates = workspace?.migrationCandidates.filter(
    (candidate) => !candidate.curriculumSubjectId,
  ) ?? []

  return (
    <main className="min-h-dvh bg-[#f7f7fb] text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo outlined={false} />
          <Button
            type="button"
            nativeButton
            render={undefined}
            variant="ghost"
            onClick={() => { void signOut() }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-10">
        <aside className="rounded-3xl bg-sidebar p-5 text-white lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <BookOpenCheck className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Academic setup</p>
              <p className="mt-0.5 text-xs text-white/60">CBSE · XI · 2026–27</p>
            </div>
          </div>
          <ol className="mt-6 grid grid-cols-6 gap-1 lg:grid-cols-1 lg:gap-2" aria-label="Onboarding progress">
            {stepCopy.map((step, index) => {
              const number = index + 1
              const active = number === draft.step
              const complete = number < draft.step
              return (
                <li
                  key={step.title}
                  aria-current={active ? 'step' : undefined}
                  className={`flex min-h-11 items-center justify-center gap-3 rounded-xl p-0 lg:justify-start lg:px-3 lg:py-2 ${
                    active ? 'bg-white/12 text-white' : 'text-white/55'
                  }`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    active
                      ? 'bg-primary text-white'
                      : complete
                        ? 'bg-emerald-400/20 text-emerald-200'
                        : 'bg-white/10'
                  }`}>
                    {complete ? <Check className="size-4" /> : number}
                  </span>
                  <span className="hidden text-xs font-medium lg:block">
                    {step.title}
                  </span>
                </li>
              )
            })}
          </ol>
          <div
            className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(draft.step / ONBOARDING_STEP_COUNT) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-white/55">
            Step {draft.step} of {ONBOARDING_STEP_COUNT}
          </p>
        </aside>

        <section
          className="min-w-0 rounded-3xl border border-border bg-white p-5 shadow-soft sm:p-8 lg:p-10"
          onKeyDown={handleStepKeyDown}
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
              {draft.step === 4
                ? <Languages className="size-5" />
                : draft.step === 6
                  ? <CheckCircle2 className="size-5" />
                  : <Sparkles className="size-5" />}
            </span>
            {(draft.step > 1 || editing) ? (
              <Button
                type="button"
                nativeButton
                render={undefined}
                variant="outline"
                className="shrink-0"
                onClick={goBack}
                disabled={saving}
              >
                <ArrowLeft data-icon="inline-start" />
                {draft.step === 1 && editing ? 'Back to settings' : 'Back'}
              </Button>
            ) : null}
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-5 text-2xl font-semibold tracking-[-0.03em] outline-none sm:text-3xl"
          >
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {copy.description}
          </p>

          {workspace?.migrationCandidates.length && !workspace.profile.onboardingCompleted ? (
            <Alert className="mt-6">
              <BookOpenCheck className="size-4" />
              <AlertTitle>Confirm subjects from your existing Recall+ history</AlertTitle>
              <AlertDescription>
                We found {workspace.migrationCandidates.length} previous subject {workspace.migrationCandidates.length === 1 ? 'name' : 'names'}. Mapped suggestions are preselected where possible; nothing becomes active until you confirm a complete valid combination.
                {unresolvedCandidates.length
                  ? ` ${unresolvedCandidates.length} name(s) could not be mapped safely and remain preserved for review.`
                  : ''}
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive" className="mt-6" role="alert">
              <AlertTitle>Check this step</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-7 min-w-0">
            {draft.step === 1 ? (
              <StepOne
                draft={draft}
                name={accountProfile?.displayName || 'Recall+ student'}
                email={accountProfile?.email || user?.email || ''}
                update={update}
              />
            ) : null}
            {draft.step === 2 ? <StepTwo draft={draft} update={update} /> : null}
            {draft.step === 3 ? (
              <StepThree draft={draft} selectPreset={selectPreset} />
            ) : null}
            {draft.step === 4 ? (
              <StepFour draft={draft} selectLanguage={selectLanguage} />
            ) : null}
            {draft.step === 5 ? (
              <StepFive draft={draft} toggleSubject={toggleSubject} />
            ) : null}
            {draft.step === 6 && selections ? (
              <StepSix
                confirmed={confirmed}
                draft={draft}
                onConfirm={setConfirmed}
                removedSubjects={removedSubjects}
                selections={selections}
              />
            ) : null}
          </div>

          <div className="mt-8 flex justify-end border-t border-border pt-6">
            {draft.step < ONBOARDING_STEP_COUNT ? (
              <Button
                type="button"
                nativeButton
                render={undefined}
                onClick={() => { void continueFlow() }}
                disabled={saving}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save and continue
                <ArrowRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button
                type="button"
                nativeButton
                render={undefined}
                onClick={() => { void finish() }}
                disabled={saving || !confirmed}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {editing ? 'Save subject changes' : 'Open my Recall+ workspace'}
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
