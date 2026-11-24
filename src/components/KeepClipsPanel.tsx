import { useEffect, useState } from 'react'
import { MAX_KEPT_CLIPS, clipStoreAvailable, forgetAllClips, keptClips } from '../lib/storage/clipStore'
import { Icon } from './primitives'
import { deviceNoun } from '../lib/device'

interface Props {
  keep: boolean
  onChange: (keep: boolean) => void
}

/**
 * The opt-in to keep each clip on this device (D6.4), in Settings beside the
 * history it serves. Off by default. Says what it keeps, where, and what goes
 * first when space runs short, before the tap rather than after it; shows what
 * is kept now, and lets the player clear it in one go.
 *
 * Absent where the browser has no private file system to keep a clip in.
 */
export default function KeepClipsPanel({ keep, onChange }: Props) {
  const [kept, setKept] = useState<{ count: number; bytes: number }>()
  const [busy, setBusy] = useState(false)

  const refresh = () =>
    void keptClips().then((list) => setKept({ count: list.length, bytes: list.reduce((s, c) => s + c.size, 0) }))
  useEffect(refresh, [keep])

  if (!clipStoreAvailable()) return null

  const clear = async () => {
    setBusy(true)
    await forgetAllClips()
    refresh()
    setBusy(false)
  }

  return (
    <section className="storage">
      <h3 className="block-title">Your videos</h3>
      <p className="sheet-note">
        Save each video on this {deviceNoun()}, never uploaded, so old reports can play it. I keep the newest {MAX_KEPT_CLIPS} and delete videos before reports if space runs low.
      </p>
      <div className="storage-actions">
        <button className="btn btn--ghost btn--full" aria-pressed={keep} onClick={() => onChange(!keep)}>
          <Icon name={keep ? 'check' : 'film'} size={17} />
          {keep ? `Keeping videos on this ${deviceNoun()}` : `Keep videos on this ${deviceNoun()}`}
        </button>
        {kept && kept.count > 0 && (
          <button className="btn btn--ghost btn--full" onClick={() => void clear()} disabled={busy}>
            <Icon name="trash" size={17} />
            {busy
              ? 'Clearing…'
              : `Delete ${kept.count} kept ${kept.count === 1 ? 'video' : 'videos'} (${Math.max(1, Math.round(kept.bytes / 1048576))} MB)`}
          </button>
        )}
      </div>
    </section>
  )
}
