import { ExternalLink } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageHeader from '../components/PageHeader'
import { getPsychologyTechnique } from '../data/psychologyTechniques'

export default function PsychologyTechniqueDetail() {
  const { techniqueId } = useParams()
  const technique = getPsychologyTechnique(techniqueId)

  if (!technique) return <Navigate to="/psychology" replace />

  return (
    <>
      <PageHeader
        title={technique.name}
        description={technique.summary}
        actions={<BackButton to="/psychology" label="Back to all techniques" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>What to do</CardTitle>
          <CardDescription>Use this as your quick start action</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">{technique.action}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Focus on consistency over intensity. Start with a small version of this method for 7 days, then scale the duration
            or difficulty once you can execute it without friction.
          </p>
          <h3 className="mt-4 text-sm font-semibold">Execution checklist</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            {technique.steps.slice(0, 3).map((step) => <li key={step}>{step}</li>)}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Weekly success signal</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            If you can follow this approach on at least 5 days this week, it is working. Improve one small part next week
            instead of changing the whole system.
          </p>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Why this works</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">{technique.whyItWorks}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The real benefit comes from repetition: when this pattern is repeated across days, your brain spends less energy
            deciding and more energy learning, recalling, and solving.
          </p>
          <h3 className="mt-4 text-sm font-semibold">What you should notice</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Faster session starts with less procrastination resistance.</li>
            <li>Better recall quality during quizzes and weekly revisions.</li>
            <li>Lower stress because study becomes predictable and trackable.</li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Why students fail with it</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            {technique.mistakes.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CardContent>
      </Card>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Step-by-step method</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              {technique.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily and weekly routine</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              {technique.routine.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </CardContent>
        </Card>
      </section>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Common mistakes to avoid</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            {technique.mistakes.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="mt-4 text-sm">
            <a href={technique.youtube} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline">
              Suggested YouTube video
              <ExternalLink className="size-3.5" />
            </a>
          </p>
        </CardContent>
      </Card>
    </>
  )
}
