import { useId, useState, type ReactNode } from 'react'
import { GLOSSARY, type GlossaryId } from '../lib/glossary'

/**
 * A word defined on a tap (L4.11): the word itself is the control, dotted
 * underneath, and its meaning opens under it until the next tap anywhere. The
 * meaning is in the page, not a title attribute, so a thumb and a screen
 * reader both reach it.
 */
export default function Term({ id, children }: { id: GlossaryId; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const meaningId = useId()
  const entry = GLOSSARY[id]
  return (
    <span className="term">
      <button
        type="button"
        className="term-word"
        aria-expanded={open}
        aria-controls={meaningId}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        {children ?? entry.word}
      </button>
      {open && (
        <span className="term-meaning" id={meaningId} role="note">
          {entry.meaning}
        </span>
      )}
    </span>
  )
}
