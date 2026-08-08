import { useEffect, useRef, useState } from 'react'
import {
  downloadBackup,
  importBackup,
  isIOS,
  isInstalled,
  isPersisted,
  type ImportResult,
} from '../lib/storage/backup'
import { Icon } from './primitives'

interface Props {
  /** How many reports are on file, so the buttons can say what they will do. */
  count: number
  /** Re-read the database after an import. */
  onImported: () => void
}

/**
 * Where the training history lives, and how to keep it.
 *
 * Deliberately plain about the risk rather than reassuring. A player who has
 * filmed twenty serves has something worth losing, and "this is kept on your
 * device" reads as a guarantee when it is closer to the opposite — browsers
 * evict site storage, and iOS does it on a seven-day timer unless the app has
 * been added to the home screen.
 */
export default function StoragePanel({ count, onImported }: Props) {
  const [persisted, setPersisted] = useState<boolean | undefined>()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [outcome, setOutcome] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void isPersisted().then(setPersisted)
  }, [])

  const installed = isInstalled()
  const showIOSNudge = isIOS() && !installed

  const doExport = async () => {
    setBusy('export')
    setOutcome(undefined)
    try {
      const n = await downloadBackup()
      setOutcome(`Saved ${n} ${n === 1 ? 'serve' : 'serves'} to a file.`)
    } catch {
      setOutcome('That did not work. Your reports are untouched.')
    }
    setBusy(null)
  }

  const doImport = async (file: File) => {
    setBusy('import')
    setOutcome(undefined)
    try {
      const r: ImportResult = await importBackup(await file.text())
      const parts = [
        r.added ? `${r.added} added` : '',
        r.updated ? `${r.updated} updated` : '',
        r.skipped ? `${r.skipped} already up to date` : '',
      ].filter(Boolean)
      setOutcome(parts.length ? parts.join(', ') + '.' : 'Nothing new in that file.')
      onImported()
    } catch (err) {
      setOutcome((err as Error).message)
    }
    setBusy(null)
  }

  return (
    <section className="storage">
      <h3 className="block-title">Keeping your history</h3>

      {/* A state rule rather than a fill level. The app is not allowed to ask
          the browser how full the disk is, so the bar reports the one thing it
          genuinely knows: whether this data has been promised a life. */}
      <span className="storage-meter" aria-hidden="true">
        <span
          className={`storage-meter-fill storage-meter-fill--${
            persisted === true ? 'kept' : persisted === false ? 'risk' : 'unknown'
          }`}
        />
      </span>

      {showIOSNudge && (
        <p className="storage-warn">
          <Icon name="warn" size={16} />
          <span>
            Safari deletes saved data after a week away. Add Serve Coach to your home screen —
            Share, then <strong>Add to Home Screen</strong>.
          </span>
        </p>
      )}

      {!showIOSNudge && persisted === false && (
        <p className="storage-note">
          Your browser has not promised to keep this data. Exporting is the only certainty.
        </p>
      )}

      {persisted === true && (
        <p className="storage-note storage-note--ok">
          <Icon name="check" size={15} />
          <span>Your browser has marked this data as worth keeping.</span>
        </p>
      )}

      <div className="storage-actions">
        <button
          className="btn btn--ghost btn--full"
          onClick={() => void doExport()}
          disabled={busy !== null || count === 0}
        >
          <Icon name="share" size={17} />
          {busy === 'export' ? 'Saving…' : `Export ${count || 'no'} ${count === 1 ? 'serve' : 'serves'}`}
        </button>
        <button
          className="btn btn--ghost btn--full"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Icon name="offline" size={17} />
          {busy === 'import' ? 'Reading…' : 'Import from a file'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void doImport(file)
          }}
        />
      </div>

      {outcome && <p className="storage-outcome">{outcome}</p>}

      <p className="sheet-note">
        An export is one file holding your scores and keyframe pictures. Moving it is the only way
        your history follows you to a new phone.
      </p>
    </section>
  )
}
