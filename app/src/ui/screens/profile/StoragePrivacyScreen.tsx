import {
  CheckCircleIcon,
  CloudSlashIcon,
  DownloadSimpleIcon,
  FileCsvIcon,
  FileJsIcon,
  ShieldCheckIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  buildExportCSV,
  buildExportJSON,
  deleteAllVideos,
  deleteEverything,
  deleteSession,
  deleteVideo,
  listSessions,
  listVideosBySession,
  setSetting,
  setVideoRetention,
  showToast,
  sweepRetention,
  useSettingsStore,
} from '../../../data/index.ts'
import { useSetting } from '../../../data/hooks.ts'
import type { SessionRecord, SettingValues, VideoRecord } from '../../../data/records.ts'
import { Button, Card, DelayedSkeleton, ListGroup, ListRow, RowIcon, Screen, SectionLabel, Sheet, Skeleton } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { exportDate, shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { useOnboardingDraft } from '../onboarding/draftStore.ts'
import { EXPORT_FAILED, NO_NETWORK_LINE, STORAGE_FACTS } from './copy.ts'
import { ChoiceList } from './parts/ChoiceList.tsx'
import { ConfirmSheet } from './parts/ConfirmSheet.tsx'
import { datedName, saveFiles } from './parts/files.ts'
import { SwitchItem } from './parts/SwitchItem.tsx'
import {
  choiceOf,
  formatBytes,
  liveVideos,
  policyOf,
  RETENTION_DAYS,
  retentionFootnote,
  storageLine,
  storageTotals,
  wouldDeleteNow,
  type RetentionChoice,
} from './storageModel.ts'

const back = { to: paths.profile(), label: 'You' }

interface SessionRow {
  session: SessionRecord
  videos: VideoRecord[]
}

type Confirm =
  | { kind: 'video'; row: SessionRow }
  | { kind: 'session'; row: SessionRow }
  | { kind: 'all-videos' }
  | { kind: 'everything' }
  | { kind: 'retention'; next: SettingValues['retention']; count: number }

/** Browser storage facts (ARCHITECTURE §8.1). Unknown when the API is missing. */
function useStorageEstimate(): { usage: number | null; persisted: boolean | null } {
  const [state, setState] = useState<{ usage: number | null; persisted: boolean | null }>({ usage: null, persisted: null })
  useEffect(() => {
    const storage = globalThis.navigator?.storage
    if (!storage) return
    let live = true
    void Promise.all([storage.estimate?.().catch(() => undefined), storage.persisted?.().catch(() => undefined)]).then(([est, persisted]) => {
      if (live) setState({ usage: typeof est?.usage === 'number' ? est.usage : null, persisted: typeof persisted === 'boolean' ? persisted : null })
    })
    return () => {
      live = false
    }
  }, [])
  return state
}

/**
 * Storage and privacy (PRODUCT §6.13 item 4, §7.6; DESIGN §10.12; D8; ARCHITECTURE §8). What is on
 * this phone, how long videos stay, export (JSON and CSV), deletion of a session, its video, all
 * videos or everything, and what leaves this phone (nothing). The paywall never appears here.
 */
export function StoragePrivacyScreen() {
  const navigate = useNavigate()
  const id = useId()
  const retention = useSetting('retention')
  const hitSound = useSetting('hitSoundTiming')
  const rows = useLiveQuery(async (): Promise<SessionRow[]> => {
    const sessions = await listSessions({ includeDemo: false })
    return Promise.all(sessions.map(async (session) => ({ session, videos: await listVideosBySession(session.id) })))
  }, [])
  const estimate = useStorageEstimate()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [actionsFor, setActionsFor] = useState<SessionRow | null>(null)
  const [exportOpts, setExportOpts] = useState({ includeComfort: false, includePose: false, includeDemo: false })
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [deletedAt, setDeletedAt] = useState<Date | null>(null)

  if (deletedAt) {
    return (
      <Screen title="Storage and privacy" back={{ to: paths.today(), label: 'Today' }}>
        <div className="flex flex-col items-start gap-4 pt-8" role="status">
          <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-2">
            <CheckCircleIcon size={32} aria-hidden="true" />
          </span>
          <h2 className="text-title-1 text-ink">Everything is deleted</h2>
          <p className="text-body text-ink-2">
            On {exportDate(deletedAt)} at {deletedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}, Serve Coach deleted every
            video, session, stat, log and setting on this phone. Nothing was stored anywhere else.
          </p>
          <Button onClick={() => navigate(paths.today(), { replace: true })}>Start again</Button>
        </div>
      </Screen>
    )
  }

  if (!retention || hitSound === undefined || !rows) {
    return (
      <Screen title="Storage and privacy" back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-4">
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  const allVideos = rows.flatMap((r) => r.videos)
  const totals = storageTotals(allVideos, estimate.usage)
  const storedCount = totals.videoCount

  const applyRetention = async (next: SettingValues['retention']) => {
    await setSetting('retention', next)
    // Keep and auto-delete apply to the videos already here; delete-after-analysis applies to new ones.
    if (next.policy !== 'delete-after-analysis') {
      for (const v of liveVideos(allVideos)) await setVideoRetention(v.id, { policy: next.policy, days: next.days })
      await sweepRetention().catch(() => undefined)
    }
    showToast('Video setting saved.')
  }

  const changeRetention = (next: SettingValues['retention']) => {
    const count = wouldDeleteNow(allVideos, next)
    if (count > 0) setConfirm({ kind: 'retention', next, count })
    else void applyRetention(next)
  }

  const runExport = async (kind: 'json' | 'csv') => {
    setExporting(kind)
    setExportError(null)
    try {
      const now = new Date()
      let files: File[]
      if (kind === 'json') {
        const json = await buildExportJSON({ ...exportOpts, now })
        files = [new File([JSON.stringify(json, null, 2)], datedName('serve-coach-export', 'json', now), { type: 'application/json' })]
      } else {
        const csv = await buildExportCSV({ ...exportOpts, now })
        files = Object.entries(csv).map(([name, body]) => new File([body], name.endsWith('.csv') ? name : `${name}.csv`, { type: 'text/csv' }))
      }
      const r = await saveFiles(files, { title: 'Serve Coach export' })
      if (r === 'downloaded') showToast(files.length === 1 ? `Exported ${files[0].name}.` : `Exported ${files.length} files.`)
    } catch {
      setExportError(EXPORT_FAILED)
    } finally {
      setExporting(null)
    }
  }

  return (
    <Screen title="Storage and privacy" back={back}>
      <Card className="flex flex-col gap-2" label="On this phone">
        <p className="text-callout text-ink tabular-nums">{storageLine(totals)}</p>
        <p className="text-footnote text-ink-2 tabular-nums">
          {totals.videoCount === 1 ? '1 video stored' : `${totals.videoCount} videos stored`} from {rows.length === 1 ? '1 session' : `${rows.length} sessions`}.
        </p>
        <p className="text-footnote text-ink-2">
          {estimate.persisted === true
            ? 'Protected from automatic clean-up: Yes.'
            : estimate.persisted === false
              ? 'Protected from automatic clean-up: No. Add Serve Coach to your Home Screen, or export regularly.'
              : 'Protected from automatic clean-up: not known in this browser. Export regularly to keep a copy.'}
        </p>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-keep`}>
        <SectionLabel>
          <span id={`${id}-keep`}>Keep videos</span>
        </SectionLabel>
        <ChoiceList<RetentionChoice>
          labelledBy={`${id}-keep`}
          mode="single"
          size="compact"
          options={[
            { value: 'keep', label: 'Keep' },
            { value: 'auto', label: `Delete after ${retention.days} days`, detail: retention.days === 30 ? 'Default' : undefined },
            { value: 'after-analysis', label: 'Delete after analysis', detail: 'Keep stats and key frames' },
          ]}
          value={[choiceOf(retention.policy)]}
          onChange={([choice]) => changeRetention({ policy: policyOf(choice), days: retention.days })}
        />
        {retention.policy === 'auto-delete-days' ? (
          <div className="flex flex-col gap-2">
            <p id={`${id}-days`} className="text-footnote font-label text-ink-2">
              Other lengths
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-days`} className="flex gap-2">
              {RETENTION_DAYS.map((d) => {
                const on = retention.days === d
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => (on ? undefined : changeRetention({ policy: 'auto-delete-days', days: d }))}
                    className={cx(
                      'inline-flex h-11 min-w-[88px] items-center justify-center rounded-full px-4 text-subhead tabular-nums',
                      on ? 'bg-ink font-label text-ink-inverse' : 'border-token border-line-strong text-ink hover:bg-surface-2',
                    )}
                  >
                    {d} days
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <p className="text-footnote text-ink-2">{retentionFootnote(retention)}</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-sessions`}>
        <SectionLabel>
          <span id={`${id}-sessions`}>Your sessions</span>
        </SectionLabel>
        {rows.length ? (
          <ListGroup>
            {rows.map((row) => {
              const stored = row.videos.filter((v) => v.storage === 'idb' || v.storage === 'native')
              const bytes = stored.reduce((s, v) => s + (v.sizeBytes || 0), 0)
              return (
                <ListRow
                  key={row.session.id}
                  leading={
                    <RowIcon>
                      <VideoCameraIcon size={24} aria-hidden="true" />
                    </RowIcon>
                  }
                  title={shortDate(row.session.visitId)}
                  subtitle={`${row.session.view === 'rear' ? 'View from behind' : 'Side view'} · ${stored.length ? formatBytes(bytes) : 'Video deleted'}`}
                  onPress={() => setActionsFor(row)}
                />
              )
            })}
          </ListGroup>
        ) : (
          <p className="text-callout text-ink-2">No sessions yet. Sample data is not listed here; remove it from Profile.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-export`}>
        <SectionLabel>
          <span id={`${id}-export`}>Export</span>
        </SectionLabel>
        <ListGroup>
          <SwitchItem
            label="Include comfort notes"
            description="Areas to go easy on and body-check notes. Off unless you choose."
            checked={exportOpts.includeComfort}
            onChange={(v) => setExportOpts((o) => ({ ...o, includeComfort: v }))}
          />
          <SwitchItem
            label="Include pose data"
            description="Body tracking for every serve. Large files."
            checked={exportOpts.includePose}
            onChange={(v) => setExportOpts((o) => ({ ...o, includePose: v }))}
          />
          <SwitchItem
            label="Include sample data"
            description="The computer-generated player."
            checked={exportOpts.includeDemo}
            onChange={(v) => setExportOpts((o) => ({ ...o, includeDemo: v }))}
          />
        </ListGroup>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" icon={FileJsIcon} onClick={() => void runExport('json')} loading={exporting === 'json'} disabled={exporting !== null}>
            Export JSON
          </Button>
          <Button variant="secondary" icon={FileCsvIcon} onClick={() => void runExport('csv')} loading={exporting === 'csv'} disabled={exporting !== null}>
            Export CSV
          </Button>
        </div>
        <p className="flex items-start gap-2 text-footnote text-ink-2">
          <DownloadSimpleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Videos and images are not included. Practice notes never leave this phone. You choose where the files go.
        </p>
        {exportError ? (
          <p role="alert" className="flex items-center gap-1.5 text-footnote text-critical">
            <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
            {exportError}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-sound`}>
        <SectionLabel>
          <span id={`${id}-sound`}>Recording</span>
        </SectionLabel>
        <ListGroup>
          <SwitchItem
            label="Hit-sound timing"
            description="Times contact from the sound of the hit. We keep only the timings, never the sound."
            checked={hitSound}
            onChange={(v) => void setSetting('hitSoundTiming', v).then(() => showToast(v ? 'Hit-sound timing on.' : 'Hit-sound timing off.'))}
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-leaves`}>
        <SectionLabel>
          <span id={`${id}-leaves`}>What leaves this phone</span>
        </SectionLabel>
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-headline text-ink">
            <CloudSlashIcon size={20} aria-hidden="true" />
            Nothing.
          </p>
          <p className="text-callout text-ink-2">{NO_NETWORK_LINE}</p>
        </Card>
        <ListGroup label="Privacy facts">
          {STORAGE_FACTS.map((f) => (
            <ListRow
              key={f}
              leading={
                <RowIcon>
                  <ShieldCheckIcon size={24} aria-hidden="true" />
                </RowIcon>
              }
              title={<span className="text-body text-ink">{f}</span>}
            />
          ))}
        </ListGroup>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-delete`}>
        <SectionLabel>
          <span id={`${id}-delete`}>Delete</span>
        </SectionLabel>
        <Button variant="destructive" onClick={() => setConfirm({ kind: 'all-videos' })} disabled={storedCount === 0} aria-describedby={`${id}-del-help`}>
          Delete all videos
        </Button>
        <Button variant="destructive" onClick={() => setConfirm({ kind: 'everything' })}>
          Delete everything
        </Button>
        <p id={`${id}-del-help`} className="text-footnote text-ink-3">
          {storedCount === 0 ? 'No videos are stored right now. ' : ''}Deleting videos keeps your stats and key frames. Delete everything removes it all.
        </p>
      </section>

      <Sheet open={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor ? shortDate(actionsFor.session.visitId) : 'Session'}>
        {actionsFor ? (
          <div className="flex flex-col gap-3 pb-2">
            {actionsFor.videos.some((v) => v.storage === 'idb' || v.storage === 'native') ? (
              <Button
                variant="destructive"
                onClick={() => {
                  const row = actionsFor
                  setActionsFor(null)
                  setConfirm({ kind: 'video', row })
                }}
              >
                Delete video
              </Button>
            ) : (
              <p className="text-callout text-ink-2">The video is already deleted. Stats and key frames stay.</p>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                const row = actionsFor
                setActionsFor(null)
                setConfirm({ kind: 'session', row })
              }}
            >
              Delete session
            </Button>
            <Button variant="secondary" to={paths.sessionReport(actionsFor.session.id)}>
              Open report
            </Button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        {...confirmCopy(confirm)}
        onConfirm={async () => {
          if (!confirm) return
          switch (confirm.kind) {
            case 'video':
              for (const v of confirm.row.videos) await deleteVideo(v.id, 'player')
              showToast('Video deleted. Stats and key frames stay.')
              break
            case 'session':
              await deleteSession(confirm.row.session.id)
              showToast('Session deleted.')
              break
            case 'all-videos': {
              const n = await deleteAllVideos()
              showToast(n === 1 ? '1 video deleted.' : `${n} videos deleted.`)
              break
            }
            case 'retention':
              await applyRetention(confirm.next)
              break
            case 'everything': {
              await deleteEverything()
              useOnboardingDraft.getState().reset()
              await useSettingsStore.getState().hydrate()
              setDeletedAt(new Date())
              break
            }
          }
          setConfirm(null)
        }}
      />
    </Screen>
  )
}

function confirmCopy(c: Confirm | null): { title: string; removes: string; keeps?: string; confirmLabel: string; typedWord?: string; critical?: boolean } {
  if (!c) return { title: 'Delete', removes: '', confirmLabel: 'Delete' }
  switch (c.kind) {
    case 'video':
      return {
        title: 'Delete this video?',
        removes: `The video from ${shortDate(c.row.session.visitId)} is deleted from this phone.`,
        keeps: 'Stats, tags and key frames stay, so the report still works. Playback steps through frames.',
        confirmLabel: 'Delete video',
      }
    case 'session':
      return {
        title: 'Delete this session?',
        removes: `The session from ${shortDate(c.row.session.visitId)} is deleted: video, serves, stats, tags, key frames and its coaching.`,
        keeps: 'Practice and match logs stay. An experiment that used it will say the session was deleted.',
        confirmLabel: 'Delete session',
      }
    case 'all-videos':
      return {
        title: 'Delete all videos?',
        removes: 'Every video on this phone is deleted.',
        keeps: 'Sessions, stats, tags and key frames stay.',
        confirmLabel: 'Delete videos',
      }
    case 'retention':
      return {
        title: `Keep videos for ${c.next.days} days?`,
        removes: c.count === 1 ? '1 video is older than that and will be deleted now.' : `${c.count} videos are older than that and will be deleted now.`,
        keeps: 'Stats and key frames stay.',
        confirmLabel: 'Delete and save',
      }
    case 'everything':
      return {
        title: 'Delete everything?',
        removes: 'Every video, session, stat, tag, log, your profile, comfort notes and settings are deleted from this phone. This cannot be undone.',
        keeps: 'Export first if you want a copy.',
        confirmLabel: 'Delete',
        typedWord: 'delete',
        critical: true,
      }
  }
}
