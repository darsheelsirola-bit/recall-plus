import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useActiveCurriculum } from '../academic/activeCurriculum'
import BackButton from '../components/BackButton'
import PageHeader from '../components/PageHeader'
import StudyLogList from '../components/StudyLogList'
import { useAppData } from '../hooks/useAppData'
import { getData, STORAGE_KEYS } from '../utils/storage'

export default function StudyLogsPage() {
  useAppData()
  const navigate = useNavigate()
  const logs = getData(STORAGE_KEYS.logs, [])
  const { isActiveRecord } = useActiveCurriculum()
  const archivedCount = logs.filter((log) => !isActiveRecord(log)).length
  const description = `${logs.length} session${logs.length === 1 ? '' : 's'} recorded, newest first.${archivedCount ? ` ${archivedCount} from removed subjects ${archivedCount === 1 ? 'is' : 'are'} kept as archived history.` : ''}`
  return (
    <>
      <PageHeader
        title="Study history"
        description={description}
        actions={
          <>
            <Button render={<Link to="/add-log" />}><Plus data-icon="inline-start" /> Add log</Button>
            <BackButton to="/" />
          </>
        }
      />
      <Card>
        <CardContent className="pt-0">
          <StudyLogList logs={logs} isActiveRecord={isActiveRecord} onEdit={(log) => navigate(`/add-log?id=${log.id}`)} />
        </CardContent>
      </Card>
    </>
  )
}

