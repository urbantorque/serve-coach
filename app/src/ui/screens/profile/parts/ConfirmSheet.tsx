import { WarningCircleIcon } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { Button, Sheet } from '../../../components/index.ts'

export interface ConfirmSheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** What goes (ARCHITECTURE §8.3: the sheet names exactly what goes and what stays). */
  removes: string
  /** What stays. */
  keeps?: string
  /** Destructive button label ("Delete video"). */
  confirmLabel: string
  /** "Delete everything" asks the player to type this word first (DESIGN §8.15). */
  typedWord?: string
  /** Uses the critical fill (only the final "Delete everything" confirm, DESIGN §8.3). */
  critical?: boolean
  onConfirm: () => Promise<void> | void
}

/**
 * Confirm delete sheet (DESIGN §8.15): names what goes and what stays, one destructive button (never
 * optic) and Cancel. Errors show inline with one retry; the sheet stays open.
 */
export function ConfirmSheet({ open, onClose, title, removes, keeps, confirmLabel, typedWord, critical, onConfirm }: ConfirmSheetProps) {
  const id = useId()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start clean each time the sheet opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTyped('')
      setError(null)
      setBusy(false)
    }
  }

  const ready = !typedWord || typed.trim().toLowerCase() === typedWord
  const run = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch {
      setError("We couldn't delete that. Try again.")
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!busy}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={critical ? 'critical' : 'destructive'}
            onClick={run}
            disabled={!ready || busy}
            aria-busy={busy || undefined}
            aria-describedby={!ready ? `${id}-need` : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body text-ink">{removes}</p>
        {keeps ? <p className="text-callout text-ink-2">{keeps}</p> : null}
        {typedWord ? (
          <div className="flex flex-col gap-2 pt-1">
            <label htmlFor={`${id}-typed`} className="text-footnote font-label text-ink-2">
              Type “{typedWord}” to confirm
            </label>
            <input
              id={`${id}-typed`}
              name="confirm-word"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run()
              }}
              className="h-13 rounded-control border-token border-line-strong bg-surface px-4 text-body text-ink"
            />
            {!ready ? (
              <p id={`${id}-need`} className="text-footnote text-ink-3">
                The button works once the word matches.
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-footnote text-critical">
            <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
