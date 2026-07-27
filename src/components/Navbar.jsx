import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Check,
  Globe2,
  Home,
  Lightbulb,
  Loader2,
  LogOut,
  Mail,
  NotebookPen,
  Pencil,
  Settings,
  Timer,
  UserCircle2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useDialogFocus } from '../hooks/useDialogFocus'
import {
  INDIA_TIMEZONE_DETAIL,
  INDIA_TIMEZONE_NAME,
  PROFILE_NAME_MAX_LENGTH,
  validateProfileName,
} from '../utils/profile'
import { getData, STORAGE_KEYS } from '../utils/storage'
import Logo from './Logo'

const navItems = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'AI Insight', path: '/dashboard', icon: Bot },
  { label: 'Syllabus', path: '/syllabus', icon: BookOpen },
  { label: 'Add Study Log', path: '/add-log', icon: NotebookPen },
  { label: 'Recall Calendar', path: '/recall-calendar', icon: Brain },
  { label: 'Practice Test', path: '/quiz', icon: Timer },
  { label: 'Psychology', path: '/psychology', icon: Lightbulb },
  { label: 'Progress', path: '/progress', icon: BarChart3 },
]

function normalizeProfile(raw = {}, user = null, syncedProfile = null) {
  const metadata = user?.user_metadata || {}
  const fallbackName = user?.email?.split('@')[0] || 'Aarav'
  const name = String(
    syncedProfile?.displayName
    || raw.name
    || metadata.display_name
    || metadata.full_name
    || metadata.name
    || fallbackName,
  ).trim() || 'Aarav'
  return {
    name,
    className: String(syncedProfile?.className || raw.className || metadata.class_name || 'Class 11 PCM').trim() || 'Class 11 PCM',
    email: String(syncedProfile?.email || user?.email || raw.email || '').trim(),
  }
}

export default function Navbar() {
  const {
    user,
    profile: syncedProfile,
    configured,
    signOut,
    signingOut,
    updateProfileName,
    updatingProfileName,
  } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [showProfileDetails, setShowProfileDetails] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState('')
  const [nameNotice, setNameNotice] = useState('')
  const [, setProfileVersion] = useState(0)
  const accountDialogRef = useDialogFocus(showProfileDetails, () => setShowProfileDetails(false))
  const profile = normalizeProfile(getData(STORAGE_KEYS.profile, {}), user, syncedProfile)

  function openMenu() {
    setExpanded(true)
  }

  function closeMenu() {
    if (showProfileDetails) return
    setExpanded(false)
    setShowProfileDetails(false)
  }

  function resetNameEditor() {
    setEditingName(false)
    setNameDraft(profile.name)
    setNameError('')
    setNameNotice('')
  }

  function closeAccountDetails() {
    setShowProfileDetails(false)
    resetNameEditor()
  }

  function closeAfterNavigation(event) {
    event.currentTarget.blur()
    setExpanded(false)
    closeAccountDetails()
  }

  function toggleProfileDetails() {
    setExpanded(true)
    if (showProfileDetails) closeAccountDetails()
    else {
      setNameDraft(profile.name)
      setNameError('')
      setNameNotice('')
      setEditingName(false)
      setShowProfileDetails(true)
    }
    setSignOutError('')
  }

  function editName() {
    setNameDraft(profile.name)
    setNameError('')
    setNameNotice('')
    setEditingName(true)
  }

  function cancelNameEdit() {
    setNameDraft(profile.name)
    setNameError('')
    setNameNotice('')
    setEditingName(false)
  }

  async function saveName(event) {
    event.preventDefault()
    if (updatingProfileName) return
    const validationError = validateProfileName(nameDraft)
    if (validationError) {
      setNameError(validationError)
      setNameNotice('')
      return
    }
    if (nameDraft.trim() === profile.name) {
      setNameError('')
      setNameNotice('Your name is already up to date.')
      setEditingName(false)
      return
    }
    setNameError('')
    setNameNotice('')
    const result = await updateProfileName(nameDraft)
    if (result.error) {
      setNameError(result.error)
      return
    }
    setEditingName(false)
    setNameNotice('Name saved.')
  }

  async function handleSignOut() {
    if (signingOut) return
    setSignOutError('')
    const result = await signOut()
    if (result.error) setSignOutError(result.error)
    else setShowProfileDetails(false)
  }

  useEffect(() => {
    function onDataChange(event) {
      const changedKey = event.detail?.key
      if (changedKey === STORAGE_KEYS.profile || changedKey === '*') {
        setProfileVersion((value) => value + 1)
      }
    }
    window.addEventListener('recall-plus:data-change', onDataChange)
    return () => window.removeEventListener('recall-plus:data-change', onDataChange)
  }, [])

  const revealClass = expanded ? 'max-w-44 opacity-100' : 'max-w-0 opacity-0'
  const initial = (profile.name || 'A').charAt(0).toUpperCase()

  return (
    <>
      <aside
        className={`peer fixed inset-y-3 left-3 z-30 hidden flex-col overflow-hidden rounded-2xl bg-ink px-3 py-4 text-white shadow-lift transition-[width] duration-500 ease-in-out lg:flex ${expanded ? 'w-72' : 'w-20'}`}
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
        onFocus={openMenu}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) closeMenu()
        }}
      >
        <Link to="/" onClick={closeAfterNavigation} className="flex items-center px-2 py-1.5" aria-label="Recall Plus home"><Logo compact={!expanded} inverse /></Link>
        <p className={`mt-2 overflow-hidden whitespace-nowrap px-2 text-xs font-medium text-white/45 transition-all ${expanded ? 'max-w-48 opacity-100' : 'max-w-0 opacity-0'}`}>Class 11 PCM workspace</p>
        <nav className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto pr-1" aria-label="Primary navigation">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === '/'} title={label} onClick={closeAfterNavigation} className={({ isActive }) => `flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-[15px] font-semibold transition-all duration-300 ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
              <span className="grid size-8 shrink-0 place-items-center"><Icon className="size-5" strokeWidth={1.8} /></span>
              <span className={`overflow-hidden truncate whitespace-nowrap transition-all duration-300 ${revealClass}`}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="relative mt-3 rounded-xl border border-white/10 bg-white/[0.06] p-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleProfileDetails}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary font-semibold text-white transition hover:bg-primary/90"
              title="Show account details"
              aria-label="Show account details"
              aria-expanded={showProfileDetails}
            >
              {initial}
            </button>
            <div className={`min-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 ${expanded ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'}`}>
              <p className="truncate text-sm font-semibold">{profile.name}</p>
              <p className="truncate text-xs text-white/50">{profile.className}</p>
            </div>
          </div>
        </div>
      </aside>

      {showProfileDetails ? (
        <div ref={accountDialogRef} tabIndex="-1" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/35 p-3 backdrop-blur-sm outline-none sm:p-5" role="dialog" aria-modal="true" aria-label="Account details">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4 text-foreground shadow-lift sm:max-h-[calc(100dvh-2.5rem)] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Profile</p>
                <h2 className="mt-1 text-xl font-semibold">Account details</h2>
              </div>
              <button type="button" data-dialog-autofocus className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-secondary" onClick={closeAccountDetails} aria-label="Close account details">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              <section className="rounded-xl bg-secondary/60 p-3" aria-labelledby="account-name-label">
                {editingName ? (
                  <form onSubmit={saveName}>
                    <label id="account-name-label" className="text-xs font-medium text-muted-foreground" htmlFor="account-name-input">Name</label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        id="account-name-input"
                        className="field min-w-0 flex-1"
                        type="text"
                        autoComplete="name"
                        value={nameDraft}
                        onChange={(event) => {
                          setNameDraft(event.target.value)
                          setNameError('')
                          setNameNotice('')
                        }}
                        minLength={2}
                        maxLength={PROFILE_NAME_MAX_LENGTH}
                        disabled={updatingProfileName}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary min-h-11 flex-1 justify-center px-3 sm:flex-none" disabled={updatingProfileName}>
                          {updatingProfileName ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                          {updatingProfileName ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="btn-secondary min-h-11 flex-1 justify-center px-3 sm:flex-none" onClick={cancelNameEdit} disabled={updatingProfileName}>Cancel</button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-3">
                    <UserCircle2 className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p id="account-name-label" className="text-xs text-muted-foreground">Name</p>
                      <p className="break-words font-semibold">{profile.name}</p>
                    </div>
                    <button type="button" className="btn-secondary min-h-11 shrink-0 px-3" onClick={editName}>
                      <Pencil className="size-4" /> Edit
                    </button>
                  </div>
                )}
                {nameError ? <p role="alert" className="mt-2 text-sm font-medium text-coral">{nameError}</p> : null}
                {nameNotice ? <p role="status" className="mt-2 text-sm font-medium text-emerald-700">{nameNotice}</p> : null}
              </section>
              <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
                <Mail className="size-5 shrink-0 text-primary" />
                <div className="min-w-0"><p className="text-xs text-muted-foreground">Email</p><p className="break-all font-semibold">{profile.email || 'Email not added'}</p></div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-secondary/60 p-3">
                <Globe2 className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Daily reset timezone</p>
                  <p className="font-semibold">{INDIA_TIMEZONE_NAME}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{INDIA_TIMEZONE_DETAIL}</p>
                </div>
              </div>
            </div>
            {signOutError ? <p role="alert" className="mt-4 rounded-lg border border-coral/25 bg-coral/10 px-3 py-2 text-sm text-coral">{signOutError}</p> : null}
            <Link to="/settings" className="btn-secondary mt-5 w-full justify-center" onClick={closeAccountDetails}>
              <Settings className="size-4" /> Settings &amp; backup
            </Link>
            {configured && user ? (
              <button type="button" className="btn-secondary mt-3 w-full justify-center" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link to="/" className="flex min-h-11 items-center" aria-label="Recall Plus home"><Logo /></Link>
        <button type="button" onClick={toggleProfileDetails} className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-semibold text-white" aria-label="Show account details">{initial}</button>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] shadow-lift md:grid-cols-8 lg:hidden" aria-label="Mobile navigation">
        {navItems.map(({ label, path, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-semibold ${isActive ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}>
            <Icon className="size-4" />
            <span className="max-w-full truncate">{label === 'Recall Calendar' ? 'Calendar' : label.replace(' Study', '')}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
