import { ArrowRight, Brain, Clock3, Moon, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageHeader from '../components/PageHeader'
import { psychologyTechniques } from '../data/psychologyTechniques'

export default function Psychology() {
  return (
    <>
      <PageHeader title="Psychology techniques" description="Practical methods to improve focus, sleep, and consistent study behavior." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {psychologyTechniques.map((item, index) => (
          <Card key={item.id} className="transition hover:-translate-y-0.5 hover:shadow-md">
            <Link to={`/psychology/${item.id}`} className="block w-full text-left">
              <CardHeader>
              <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                {index % 4 === 0 ? <Brain className="size-4" /> : index % 4 === 1 ? <Clock3 className="size-4" /> : index % 4 === 2 ? <Moon className="size-4" /> : <Repeat className="size-4" />}
              </span>
              <CardTitle className="mt-3 text-lg">{item.name}</CardTitle>
              <CardDescription>{item.summary}</CardDescription>
              <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open detailed guide <ArrowRight className="size-4" />
              </p>
              </CardHeader>
            </Link>
          </Card>
        ))}
      </section>
    </>
  )
}
