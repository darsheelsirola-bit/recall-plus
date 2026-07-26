import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import PageHeader from '../components/PageHeader'
import StudyLogList from '../components/StudyLogList'
import { useAppData } from '../hooks/useAppData'
import { getData, STORAGE_KEYS } from '../utils/storage'

export default function StudyLogsPage() {
  useAppData()
  const navigate = useNavigate()
  const logs = getData(STORAGE_KEYS.logs, [])
  return <><PageHeader title="Study history" description={`${logs.length} session${logs.length === 1 ? '' : 's'} recorded, newest first.`} actions={<Button render={<Link to="/add-log" />}><Plus data-icon="inline-start" /> Add log</Button>} /><Card><CardContent className="pt-0"><StudyLogList logs={logs} onEdit={(log) => navigate(`/add-log?id=${log.id}`)} /></CardContent></Card></>
}
