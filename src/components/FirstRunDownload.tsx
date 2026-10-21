import { Icon } from './primitives'
import { engineMegabytes } from '../lib/engineManifest'

interface Props {
  /** Whether the engines are stored on this device: undefined while the cache is asked. */
  ready: boolean | undefined
  /** A download under way. */
  busy: boolean
  onDownload: () => void
}

/**
 * The download, offered on the first-run sheet (N3.7).
 *
 * A first analysis used to start the 57 MB download itself, at the moment the
 * player was waiting for a report, often on a court's mobile data. Said here,
 * with its size, the player can take it on Wi-Fi before they go. Nothing is
 * drawn once the engines are stored, or while that is being asked.
 */
export default function FirstRunDownload({ ready, busy, onDownload }: Props) {
  if (ready !== false) return null
  return (
    <div className="first-download">
      <p>
        The coach is a one-time {engineMegabytes()} MB download. On Wi-Fi now? Take it before you go to court.
      </p>
      <button type="button" className="btn btn--ghost btn--full" onClick={onDownload} disabled={busy}>
        <Icon name="offline" size={17} />
        {busy ? 'Downloading…' : `Download now · ${engineMegabytes()} MB`}
      </button>
    </div>
  )
}
