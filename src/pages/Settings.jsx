import { Download, GraduationCap, ShieldCheck, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ContactEmailDialog from '../components/ContactEmailDialog'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../auth/AuthProvider'
import { useAcademicProfile } from '../academic/AcademicProfileProvider'
import {
  exportAllDataForUser,
  importAllDataForUser,
  MAX_BACKUP_BYTES,
} from '../utils/storage'
import { getTodayDate } from '../utils/dateUtils'
import { INDIA_TIMEZONE_DETAIL, INDIA_TIMEZONE_NAME } from '../utils/profile'

export default function Settings() {
  const { profile, syncing, user } = useAuth()
  const { workspace } = useAcademicProfile()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [contactOpen, setContactOpen] = useState(false)

  function exportBackup() {
    setError('')
    setNotice('')
    try {
      if (!user?.id) throw new Error('Sign in again before exporting a backup.')
      const blob = new Blob([JSON.stringify(exportAllDataForUser(user.id), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `recall-plus-backup-${getTodayDate()}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setNotice('Your Recall+ backup was downloaded.')
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : 'Could not create your backup.')
    }
  }

  async function importBackup(event) {
    const [file] = event.target.files || []
    event.target.value = ''
    if (!file) return
    if (!window.confirm('Replace this account’s local Recall+ data with the selected backup?')) return

    setError('')
    setNotice('')
    try {
      const ownerId = user?.id
      if (!ownerId) throw new Error('Sign in again before importing a backup.')
      if (file.size > MAX_BACKUP_BYTES) throw new Error('This Recall Plus backup is larger than 1 MiB.')
      const parsed = JSON.parse(await file.text())
      importAllDataForUser(ownerId, parsed)
      setNotice('Backup imported. Your restored data will sync to your account.')
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : 'Could not import this backup.')
    }
  }

  return (
    <>
      <PageHeader title="Settings & backup" description="Keep a portable copy of your study history and restore it when needed." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.55fr)]">
        <Card>
          <CardHeader>
            <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><ShieldCheck className="size-5" /></span>
            <CardTitle className="mt-3">Your Recall+ data</CardTitle>
            <CardDescription>Backups contain this signed-in account’s study logs, quizzes, recalls, profile, and timetable. They do not include your password.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button type="button" onClick={exportBackup}>
              <Download data-icon="inline-start" /> Download backup
            </Button>
            <label className="btn-secondary cursor-pointer">
              <Upload className="size-4" /> Import backup
              <input className="sr-only" type="file" accept="application/json,.json" onChange={importBackup} />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your synced profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Name</p><p className="mt-1 font-semibold">{profile?.displayName || 'Student'}</p></div>
            <div><p className="text-xs text-muted-foreground">Email</p><p className="mt-1 break-all font-semibold">{profile?.email || 'Not available'}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Daily reset timezone</p>
              <p className="mt-1 font-semibold">{INDIA_TIMEZONE_NAME}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{INDIA_TIMEZONE_DETAIL}</p>
            </div>
            <p className="rounded-xl bg-secondary/60 p-3 text-xs leading-5 text-muted-foreground">
              {syncing ? 'Syncing your latest local changes…' : 'Changes are saved locally first, then synced securely to your account.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><GraduationCap className="size-5" /></span>
          <CardTitle className="mt-3">Academic profile and subjects</CardTitle>
          <CardDescription>
            Your confirmed subject IDs control the syllabus, study tools and future recommendations shown by Recall+.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Board', workspace?.profile.board],
              ['Class', workspace?.profile.grade],
              ['Academic year', workspace?.profile.academicYear],
              ['Pathway', workspace?.profile.pathway],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 capitalize font-semibold">{value || 'Not confirmed'}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            {workspace?.subjects.map((selection) => (
              <div key={selection.curriculumSubjectId} className="flex min-h-16 items-center gap-3 border-b border-border p-4 last:border-b-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary">
                  {selection.subjectPosition}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block break-words text-sm">{selection.subject.name}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {selection.selectionType === 'main' ? 'Main subject' : 'Additional subject'} · Group {selection.subject.subjectGroup}
                  </span>
                </span>
                <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold">
                  {selection.subject.subjectCode}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl bg-muted/30 p-4 sm:flex-row sm:items-center">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              Subject changes are validated as a complete CBSE combination. Removed selections are archived, and existing study history is preserved. Recall+ will show record counts and ask for confirmation before saving.
            </p>
            <Link className="btn-primary shrink-0" to="/onboarding?mode=edit">
              Review or edit subjects
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><ShieldCheck className="size-5" /></span>
          <CardTitle className="mt-3">Privacy &amp; Google sign-in</CardTitle>
          <CardDescription>
            Optional Google sign-in uses only your basic account identity—name, email, profile image, and Google account identifier—to authenticate you. Recall+ does not receive your Google password or request access to Gmail, Drive, Calendar, or contacts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link className="font-semibold text-primary hover:underline" to="/privacy">Read the Privacy Policy</Link>
          <Link className="font-semibold text-primary hover:underline" to="/terms">Read the Terms of Service</Link>
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => setContactOpen(true)}
          >
            Request account-data help
          </button>
        </CardContent>
      </Card>

      <ContactEmailDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Account-data help"
        description="Email us from the address connected to your Recall+ account for access, correction, or deletion requests."
      />

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Backup action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="mt-4">
          <AlertTitle>Backup ready</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
