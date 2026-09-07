import { Check, Copy, Mail, X } from 'lucide-react'
import { useState } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'

export const SUPPORT_EMAIL = 'recallplus.website@gmail.com'

export default function ContactEmailDialog({
  open,
  onClose,
  title = 'Contact Recall+',
  description = 'Reach us at this email for support, privacy questions, or account-data requests.',
}) {
  const dialogRef = useDialogFocus(open, onClose)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-ink/35 p-3 backdrop-blur-sm outline-none sm:place-items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-email-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
              <Mail className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="contact-email-title" className="text-lg font-semibold tracking-[-0.02em]">
                {title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close contact panel"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-background px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Email</p>
          <p className="mt-1 break-all text-base font-semibold text-foreground">{SUPPORT_EMAIL}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary min-h-11 flex-1 px-4" onClick={copyEmail}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy email'}
          </button>
          <a className="btn-secondary min-h-11 flex-1 justify-center px-4" href={`mailto:${SUPPORT_EMAIL}`}>
            Open mail app
          </a>
        </div>
      </div>
    </div>
  )
}
