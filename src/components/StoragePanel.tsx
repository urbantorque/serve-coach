import { useEffect, useRef, useState } from 'react'
import { downloadBackup, isIOS, isInstalled, isPersisted } from '../lib/storage/backup'
import { importBackup, type ImportResult } from '../lib/storage/restore'
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
      setOutcome('The export didn’t work. Your reports are still here.')
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
        // Counted apart from the reports, because they are not serves and a
        // player reading "nine added" wants that to be nine serves.
        r.logs ? `${r.logs} ${r.logs === 1 ? 'drill' : 'drills'}` : '',
        // Same rule again for the taps: a player reading "nine added" wants
        // that to be nine serves, not seven serves and two things they tapped.
        //
        // The skipped ones are deliberately not shown. Most are tags for
        // reports the prune dropped on the way in, which is a normal outcome
        // rather than something to act on — and "12 taps skipped" beside a
        // successful restore reads as a loss the player is expected to do
        // something about, when the serves those taps described are gone too.
        r.tags ? `${r.tags} ${r.tags === 1 ? 'serve result' : 'serve results'}` : '',
      ].filter(Boolean)
      setOutcome(
        (parts.length ? parts.join(', ') + '.' : 'Nothing new in that file.') +
          // Said separately from the tally above: this is not "up to date", it
          // is storage refusing the write, and the fix is different — free up
          // room and import the same file again, which only re-adds what still
          // is not on the device.
          (r.failed
            ? ` ${r.failed} couldn’t be saved, because your phone is out of storage. Free up space and import this file again.`
            : '') +
          // Said rather than left to be found (L3.3): the restore counted these
          // in, and the store then had to make room.
          (r.pruned
            ? ` ${r.pruned} of your oldest ${r.pruned === 1 ? 'report was' : 'reports were'} removed to make room. Your progress chart still shows ${r.pruned === 1 ? 'that visit' : 'those visits'}.`
            : ''),
      )
      onImported()
    } catch (err) {
      setOutcome((err as Error).message)
    }
    setBusy(null)
  }

  return (
    <section className="storage">
      <h3 className="block-title">Keeping your history</h3>

      {/* The coloured state bar that used to sit here reported nothing the
          sentence under it did not already say, and it said it louder. One
          line of plain text is both the honest version and the quiet one. */}

      {showIOSNudge && (
        <p className="storage-warn">
          <Icon name="warn" size={15} />
          <span>
            Safari clears saved data after a week away. Add Serve Coach to your home screen: tap Share, then <strong>Add to Home Screen</strong>.
          </span>
        </p>
      )}

      {!showIOSNudge && persisted === false && (
        <p className="storage-note">
          Your browser may clear this data. Export a copy to keep it safe.
        </p>
      )}

      {persisted === true && (
        <p className="storage-note storage-note--ok">
          <Icon name="check" size={15} />
          {/* "Marked as worth keeping" is what the browser API says, and it
              read as a guarantee. This says the same thing in the terms the
              player has — and keeps the export as the only real answer. */}
          <span>
            Your phone is holding onto your serves for now. Exporting is still the only way to keep
            them for good.
          </span>
        </p>
      )}

      {/* Said before the button, not after it. The old copy for this lived
          below the buttons in a sentence mainly about moving the file to a
          new phone, so the one fact that changes what a player is actually
          agreeing to — this is not just a table of numbers — was the thing
          least likely to be read before the tap that creates it. */}
      <p className="sheet-note">
        The export is one file with your scores and photos of you serving.
      </p>

      <div className="storage-actions">
        <button
          className="btn btn--ghost btn--full"
          onClick={() => void doExport()}
          disabled={busy !== null || count === 0}
        >
          <Icon name="share" size={17} />
          {busy === 'export'
            ? 'Saving…'
            : count === 0
              ? 'Nothing to export yet'
              : `Export ${count} ${count === 1 ? 'serve' : 'serves'}`}
        </button>
        <button
          className="btn btn--ghost btn--full"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Icon name="offline" size={17} />
          {busy === 'import' ? 'Importing…' : 'Import from a file'}
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
        To move it to a new phone, send the file to yourself by email or AirDrop. Then tap Import from a file there.
      </p>
    </section>
  )
}
