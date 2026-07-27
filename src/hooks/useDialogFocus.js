import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function visibleFocusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter((element) => (
      element instanceof HTMLElement
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ))
}

/**
 * Traps keyboard focus inside a mounted dialog, closes it with Escape, locks
 * background scrolling, and restores focus to the control that opened it.
 */
export function useDialogFocus(open, onClose) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  const returnFocusRef = useRef(null)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || !dialogRef.current) return undefined

    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    document.body.style.overflow = 'hidden'

    const focusFrame = window.requestAnimationFrame(() => {
      const [first] = visibleFocusableElements(dialog)
      ;(dialog.querySelector('[data-dialog-autofocus]') || first || dialog).focus()
    })

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = visibleFocusableElements(dialog)
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      dialog.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      const returnTarget = returnFocusRef.current
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus()
      })
    }
  }, [open])

  return dialogRef
}
