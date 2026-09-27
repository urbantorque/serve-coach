/**
 * Sheets for "Check this serve": who is marking (initials and role, remembered on the phone), and the
 * validation export (a JSON file saved on the phone; nothing is sent anywhere).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { showToast } from '../../../../data/index.ts'
import { isSample } from '../../../../validation/annotation/export.ts'
import { cleanInitials, cleanSubjectCode } from '../../../../validation/annotation/marks.ts'
import { gatherChecks } from '../../../../validation/annotation/store.ts'
import type { AnnotatorRole } from '../../../../validation/annotation/types.ts'
import { Button, SegmentedControl, Sheet } from '../../../components/index.ts'
import { exportChecks, ROLE_LABEL, type Annotator } from './data.ts'

export function WhoSheet({
  open,
  onClose,
  value,
  studyCode,
  onSave,
}: {
  open: boolean
  onClose: () => void
  value: Annotator
  /** The session's study participant code ('' on a player's own phone). */
  studyCode: string
  onSave: (a: Annotator, studyCode: string) => void
}) {
  const id = useId()
  const [initials, setInitials] = useState(value.initials)
  const [role, setRole] = useState<AnnotatorRole>(value.role)
  const [code, setCode] = useState(studyCode)
  return (
    <Sheet open={open} onClose={onClose} title="Who is marking?">
      <div className="flex flex-col gap-4 pb-2">
        <SegmentedControl
          label="Role"
          options={(Object.keys(ROLE_LABEL) as AnnotatorRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          value={role}
          onChange={setRole}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-initials`} className="text-footnote font-label text-ink-2">
            Initials (optional)
          </label>
          <input
            id={`${id}-initials`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            maxLength={4}
            value={initials}
            aria-describedby={`${id}-help`}
            onChange={(e) => setInitials(cleanInitials(e.target.value))}
            className="h-13 w-full rounded-control border-token border-line-strong bg-surface px-4 text-body text-ink uppercase"
          />
          <p id={`${id}-help`} className="text-footnote text-ink-3">
            Up to 4 letters, never a name. When two people check the same serve, initials keep their marks apart.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-code`} className="text-footnote font-label text-ink-2">
            Player's study code (optional)
          </label>
          <input
            id={`${id}-code`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            maxLength={8}
            value={code}
            aria-describedby={`${id}-code-help`}
            onChange={(e) => setCode(cleanSubjectCode(e.target.value))}
            className="h-13 w-full rounded-control border-token border-line-strong bg-surface px-4 text-body text-ink uppercase"
          />
          <p id={`${id}-code-help`} className="text-footnote text-ink-3">
            Only for a study phone that holds several players, for example P07. It keeps each player's serves together in the export. Leave it empty for your own serves.
          </p>
        </div>
        <Button
          onClick={() => {
            onSave({ initials, role }, code)
            onClose()
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  )
}

export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useLiveQuery(async () => {
    if (!open) return null
    const all = await gatherChecks()
    const real = all.filter((g) => !isSample(g))
    return { real: real.length, sample: all.length - real.length, people: new Set(real.map((g) => g.annotation.annotator)).size }
  }, [open])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await exportChecks()
      onClose()
      showToast(`Exported 1 file with ${r.entries} checked ${r.entries === 1 ? 'serve' : 'serves'}.`)
    } catch {
      setError("The file couldn't be saved on this phone. Try again, or free up some space first.")
    } finally {
      setBusy(false)
    }
  }

  const n = preview?.real ?? 0
  return (
    <Sheet open={open} onClose={onClose} title="Export checks">
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-callout text-ink-2" aria-live="polite">
          {preview === undefined || preview === null
            ? 'Counting your checks…'
            : n
              ? `${n} checked ${n === 1 ? 'serve' : 'serves'} on this phone${preview.people > 1 ? `, marked by ${preview.people} people` : ''}.`
              : 'No checked serves to export yet.'}
          {preview?.sample ? ` Sample serves are left out (${preview.sample}).` : ''}
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-callout text-ink-2">
          <li>Your marks and the app's own values for the same serves.</li>
          <li>Each clip's frame rate, set-up and light, and the height the app used.</li>
          <li>No video, no images and no names. Initials only.</li>
        </ul>
        <p className="text-footnote text-ink-3">The file is saved on this phone and nothing is sent. Share it with the person running the check if you want it pooled.</p>
        {error ? <p className="text-footnote text-critical">{error}</p> : null}
        <Button disabled={!n} loading={busy} onClick={() => void save()}>
          Save file
        </Button>
      </div>
    </Sheet>
  )
}
