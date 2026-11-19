import { Suspense, lazy } from 'react'
import '../styles/settings.css'
import '../styles/blocks.css'
import HandednessPicker from './HandednessPicker'
import { Icon, Sheet } from './primitives'
import { engineMegabytes } from '../lib/engineManifest'
import { NBSP, defaultSpeedUnit } from '../lib/speedCopy'
import type { OfflineWarmup } from './useOfflineWarmup'
import { writePrefs, type Prefs } from '../lib/storage/prefs'
import { deviceNoun } from '../lib/device'
import { INFO_PAGES, INFO_TITLES, type InfoPageId } from '../lib/routes'

const FilmingGuide = lazy(() => import('./FilmingGuide'))
const StoragePanel = lazy(() => import('./StoragePanel'))
const KeepClipsPanel = lazy(() => import('./KeepClipsPanel'))
const CadencePicker = lazy(() => import('./CadencePicker'))
const SpeedUnitPicker = lazy(() => import('./SpeedUnitPicker'))
const DeviceCheck = lazy(() => import('./DeviceCheck'))
const Credits = lazy(() => import('./Credits'))
const CorpusIngest = lazy(() => import('./CorpusIngest'))

export type AppSheet = 'guide' | 'settings' | 'check' | 'corpus' | null

interface Props {
  sheet: AppSheet
  onSheet: (sheet: AppSheet) => void
  prefs: Prefs
  onPrefs: (next: Prefs) => void
  serves: number
  onImported: () => void
  offline: { ready: boolean | undefined; warming?: OfflineWarmup; metered?: 'saveData' | 'cellular'; onDownload: () => void }
  /** What the automatic copy of the history covers, in a sentence. */
  protection?: string
  /** How sure I am, privacy, terms and credits (N6.3). */
  onPage?: (page: InfoPageId) => void
}

/** Whether the app works with no signal, and the way to make it so. */
export function OfflineRow({ ready, warming, metered, onDownload }: Props['offline']) {
  if (ready === undefined) return null
  if (ready) {
    return (
      <p className="storage-note storage-note--ok">
        <Icon name="check" size={16} />
        <span>Ready to use with no signal.</span>
      </p>
    )
  }
  const size = engineMegabytes()
  const busy = warming !== undefined && warming.stage !== 'failed'
  const label =
    warming?.stage === 'downloading'
      ? warming.totalMb
        ? `Downloading, ${warming.loadedMb ?? 0} of ${warming.totalMb}${NBSP}MB`
        : `Downloading, ${Math.round((warming.ratio ?? 0) * 100)}%`
      : warming?.stage === 'starting'
        ? 'Setting up'
        : warming?.stage === 'failed'
          ? warming.stalled
            ? 'The download stopped. Try again'
            : 'Download failed. Try again'
          : warming?.stage === 'unkept'
            ? 'This browser will not keep the download'
            : `Download for no signal, ${size}${NBSP}MB`
  return (
    <>
      <button className="btn btn--ghost btn--full" onClick={onDownload} disabled={busy}>
        <Icon name="offline" size={18} />
        {label}
      </button>
      {metered && !busy && <p className="sheet-note">You are on {metered === 'saveData' ? 'Data Saver' : 'mobile data'}, so wait for Wi-Fi if you can.</p>}
    </>
  )
}

/**
 * The sheets over every screen: how to film it, and Settings with the things
 * only Settings holds. Out of `App.tsx`, where they were a third of the file.
 */
export default function AppSheets({ sheet, onSheet, prefs, onPrefs, serves, onImported, offline, protection, onPage }: Props) {
  const save = (patch: Partial<Prefs>) => onPrefs(writePrefs(patch))
  return (
    <>
      <Sheet
        open={sheet === 'guide'}
        onClose={() => {
          save({ seenFilmingGuide: true })
          onSheet(null)
        }}
        title="How to film your serve"
      >
        <Suspense fallback={null}>
          <FilmingGuide racket={prefs.handedness ?? 'right'} />
        </Suspense>
      </Sheet>

      <Sheet open={sheet === 'settings'} onClose={() => onSheet(null)} title="Settings">
        <HandednessPicker value={prefs.handedness} onChange={(handedness) => save({ handedness })} />
        <Suspense fallback={null}>
          <SpeedUnitPicker value={prefs.speedUnit ?? defaultSpeedUnit()} onChange={(speedUnit) => save({ speedUnit })} />
          <CadencePicker value={prefs.cadence} onChange={(cadence) => save({ cadence })} />
          <fieldset className="hand-pick">
            <legend>Sounds</legend>
            <div className="hand-pick-options">
              {[true, false].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  className={`hand-option${(prefs.sounds ?? true) === on ? ' is-on' : ''}`}
                  aria-pressed={(prefs.sounds ?? true) === on}
                  onClick={() => save({ sounds: on })}
                >
                  {on ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          </fieldset>
          {protection && (
            <p className="storage-note storage-note--ok">
              <Icon name="shield" size={16} />
              <span>{protection}</span>
            </p>
          )}
          <StoragePanel count={serves} onImported={onImported} />
          <KeepClipsPanel keep={Boolean(prefs.keepClips)} onChange={(keepClips) => save({ keepClips })} />
        </Suspense>
        <OfflineRow {...offline} />
        <button className="btn btn--ghost btn--full" onClick={() => onSheet('guide')}>
          <Icon name="info" size={18} />
          How to film your serve
        </button>
        <button className="btn btn--ghost btn--full" onClick={() => onSheet('check')}>
          <Icon name="gauge" size={18} />
          What this {deviceNoun()} can do
        </button>
        {onPage ? (
          <nav className="settings-pages" aria-label="About Serve Coach">
            {INFO_PAGES.map((p) => (
              <button key={p} type="button" className="link-btn" onClick={() => onPage(p)}>
                {INFO_TITLES[p]}
              </button>
            ))}
          </nav>
        ) : (
          <Suspense fallback={null}>
            <Credits />
          </Suspense>
        )}
      </Sheet>

      <Sheet open={sheet === 'check'} onClose={() => onSheet(null)} title={`What this ${deviceNoun()} can do`}>
        <Suspense fallback={null}>
          <DeviceCheck />
        </Suspense>
      </Sheet>

      {/* Dev only. The import is dynamic so neither the ingest nor the pipeline
          it drives reaches the production bundle. */}
      {import.meta.env.DEV && sheet === 'corpus' && (
        <Sheet open onClose={() => onSheet(null)} title="Build a corpus">
          <Suspense fallback={null}>
            <CorpusIngest />
          </Suspense>
        </Sheet>
      )}
    </>
  )
}
