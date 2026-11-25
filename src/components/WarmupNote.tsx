import { engineMegabytes } from '../lib/engineManifest'
import { NBSP } from '../lib/speedCopy'
import type { OfflineWarmup } from './useOfflineWarmup'

/**
 * The landing's line about the one-time download, with the download itself
 * one tap away (2026-11-25).
 *
 * It used to start only when a new player tapped Film or Upload, so on a slow
 * connection the first serve was filmed and then waited. Courts often have
 * little signal, so a player can now fetch it at home first, on Wi-Fi.
 *
 * A tap, never automatic: Safari doesn't say when a phone is on mobile data,
 * so a visitor who only came to look would pay for the download unasked.
 *
 * Its own chunk, because the landing sits in the entry bundle's budget.
 */
export default function WarmupNote({
  ready,
  warming,
  onGetReady,
}: {
  ready: boolean | undefined
  warming?: OfflineWarmup
  onGetReady?: () => void
}) {
  if (ready === undefined) return null
  const size = engineMegabytes()
  const line = ready
    ? 'The coach is downloaded, so it works with no signal.'
    : warming?.stage === 'downloading'
      ? warming.totalMb
        ? `Downloading the coach: ${warming.loadedMb ?? 0} of ${warming.totalMb}${NBSP}MB.`
        : `Downloading the coach: ${Math.round((warming.ratio ?? 0) * 100)}%.`
      : warming?.stage === 'starting'
        ? 'Setting up the coach.'
        : warming?.stage === 'failed'
          ? warming.stalled
            ? 'The download stopped.'
            : 'The download didn’t finish.'
          : warming?.stage === 'unkept'
            ? 'Downloaded, but this browser won’t keep it, so it downloads again next visit.'
            : `Your first serve needs a one-time download of ${size}${NBSP}MB, best done on Wi-Fi.`
  // Offered before it starts, and again after a failure; never while it runs.
  const offer = !ready && onGetReady && (!warming || warming.stage === 'failed')
  return (
    <>
      {' '}
      <span role="status" aria-live="polite">
        {line}
      </span>
      {offer && (
        <>
          <br />
          <button type="button" className="link-btn" onClick={onGetReady}>
            {warming?.stage === 'failed' ? 'Try again' : 'Download it now'}
          </button>
        </>
      )}
    </>
  )
}
