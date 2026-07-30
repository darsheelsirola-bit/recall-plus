import { Download, ShieldCheck, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../auth/AuthProvider'
import {
  exportAllDataForUser,
  importAllDataForUser,
  MAX_BACKUP_BYTES,
} from '../utils/storage'
import { getTodayDate } from '../utils/dateUtils'
import { INDIA_TIMEZONE_DETAIL, INDIA_TIMEZONE_NAME } from '../utils/profile'

export default function Settings() {
  const { profile, syncing, user } = useAuth()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><ShieldCheck className="size-5" /></span>
          <CardTitle className="mt-3">Privacy &amp; Google sign-in</CardTitle>
          <CardDescription>
            Optional Google sign-in uses only your basic account identity—name, email, profile image, and Google account identifier—to authenticate you. Recall+ does not receive your Google password or request access to Gmail, Drive, Calendar, or contacts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link className="font-semibold text-primary hover:underline" to="/privacy">Read the Privacy Policy</Link>
          <Link className="font-semibold text-primary hover:underline" to="/terms">Read the Terms of Service</Link>
          <a className="font-semibold text-primary hover:underline" href="mailto:darsheel.sirola@gmail.com">Request account-data help</a>
        </CardContent>
      </Card>

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
