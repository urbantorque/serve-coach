import { CloudSlashIcon, ExportIcon, ShieldCheckIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { buildBetaReport, clearEvents, computeGates, listEvents, resetBetaInstallRef, showToast } from '../../../../data/index.ts'
import { useSetting } from '../../../../data/hooks.ts'
import { displayMode, isNativeShell } from '../../../../platform/pwa/register.ts'
import { Button, Card, DelayedSkeleton, ListGroup, ListRow, RowIcon, Screen, SectionLabel, Skeleton } from '../../../components/index.ts'
import { paths } from '../../../shell/paths.ts'
import { EXPORT_FAILED } from '../copy.ts'
import { ConfirmSheet } from '../parts/ConfirmSheet.tsx'
import { datedName, saveFiles } from '../parts/files.ts'
import { COUNT_ROWS, eventLine, gateLines, NEVER_RECORDED } from './betaWords.ts'

const back = { to: paths.profile(), label: 'You' }
const RECENT = 20

/**
 * Profile > Beta data (docs/MONETISATION.md §8; PRODUCT §9.4; D8). What Serve Coach counts on this
 * phone for the closed-beta checks, what it never records, and a JSON report the tester may choose to
 * send. The app sends nothing. "Clear usage counts" and "Delete everything" remove the counts.
 */
export function BetaDataScreen() {
  const id = useId()
  const events = useLiveQuery(() => listEvents(), [])
  const ref = useSetting('betaInstallRef')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const exportReport = async () => {
    setExporting(true)
    setError(null)
    try {
      const now = new Date()
      const mode = displayMode()
      const report = await buildBetaReport({ now, platform: isNativeShell() ? 'ios' : 'pwa', display: mode })
      const file = new File([JSON.stringify(report, null, 2)], datedName('serve-coach-beta-report', 'json', now), { type: 'application/json' })
      const r = await saveFiles([file], { title: 'Serve Coach beta report' })
      if (r === 'downloaded') showToast(`Saved ${file.name}.`)
    } catch {
      setError(EXPORT_FAILED)
    } finally {
      setExporting(false)
    }
  }

  if (events === undefined) {
    return (
      <Screen title="Beta data" back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-4">
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  const gates = computeGates(events)
  const lines = gateLines(gates)
  const recent = [...events].reverse().slice(0, RECENT)

  return (
    <Screen
      title="Beta data"
      back={back}
      bottomAction={
        <Button icon={ExportIcon} onClick={() => void exportReport()} loading={exporting}>
          Export report
        </Button>
      }
    >
      <Card className="flex flex-col gap-2" label="About beta data">
        <p className="text-callout text-ink">
          For the beta, Serve Coach counts a few things you do, like analysing a session or logging practice. That shows whether the app helps.
        </p>
        <p className="flex items-center gap-2 text-headline text-ink">
          <CloudSlashIcon size={20} aria-hidden="true" />
          Nothing is sent.
        </p>
        <p className="text-footnote text-ink-2">The counts stay on this phone. You choose whether to send the report, and to whom.</p>
      </Card>

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-checks`}>
        <SectionLabel>
          <span id={`${id}-checks`}>Beta checks</span>
        </SectionLabel>
        <ListGroup>
          {lines.map((l) => (
            <ListRow key={l.id} title={l.title} trailing={l.status} detail={l.detail} dataAttrs={{ 'data-gate': l.id }} />
          ))}
        </ListGroup>
        <p className="text-footnote text-ink-3">Counts of what happened in the app on this phone, not a score. Times are rounded to the hour.</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-counts`}>
        <SectionLabel>
          <span id={`${id}-counts`}>What is counted</span>
        </SectionLabel>
        <Card>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-callout">
            {COUNT_ROWS.map((row) => {
              const n = gates.counts[row.name]
              return (
                <div key={row.name} className="contents" data-count={row.name}>
                  <dt className="text-ink-2">{n === 1 ? row.one : row.many}</dt>
                  <dd className="text-right font-label tabular-nums text-ink">{n}</dd>
                </div>
              )
            })}
          </dl>
        </Card>
        {events.length === 0 ? <p className="text-footnote text-ink-2">Nothing counted yet.</p> : null}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-never`}>
        <SectionLabel>
          <span id={`${id}-never`}>Never recorded</span>
        </SectionLabel>
        <ListGroup>
          {NEVER_RECORDED.map((f) => (
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

      {recent.length ? (
        <section className="flex flex-col gap-2" aria-labelledby={`${id}-recent`}>
          <SectionLabel>
            <span id={`${id}-recent`}>Latest counts</span>
          </SectionLabel>
          <details className="group card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-card px-4 text-headline text-ink hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              {recent.length === events.length ? `Show all ${events.length}` : `Show the latest ${recent.length} of ${events.length}`}
            </summary>
            <ol className="flex flex-col gap-3 px-4 pb-4">
              {recent.map((e) => {
                const l = eventLine(e)
                return (
                  <li key={e.seq} className="flex flex-col">
                    <span className="text-subhead text-ink">{l.title}</span>
                    <span className="text-footnote tabular-nums text-ink-2">
                      {l.when}
                      {l.detail ? `: ${l.detail}` : ''}
                    </span>
                  </li>
                )
              })}
            </ol>
          </details>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-report`}>
        <SectionLabel>
          <span id={`${id}-report`}>Your report</span>
        </SectionLabel>
        <p className="text-callout text-ink-2">
          Export report makes a JSON file of these counts. Send it to the Serve Coach team only if you want to.
        </p>
        {ref ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-footnote text-ink-2">
              Report reference: <span translate="no" className="font-label tabular-nums text-ink">{ref}</span>
            </p>
            <Button variant="tertiary" onClick={() => void resetBetaInstallRef().then(() => showToast('New report reference made.'))}>
              New reference
            </Button>
          </div>
        ) : null}
        <p className="text-footnote text-ink-3">
          {ref ? '' : 'Your first export adds a report reference. '}It is a random code, not linked to you, so two reports from this phone can be told apart.
        </p>
        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-footnote text-critical">
            <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-delete`}>
        <SectionLabel>
          <span id={`${id}-delete`}>Delete</span>
        </SectionLabel>
        <Button variant="destructive" onClick={() => setConfirmClear(true)} disabled={events.length === 0}>
          Clear usage counts
        </Button>
        <p className="text-footnote text-ink-3">Delete everything (in Storage and privacy) removes them too. Counts older than 180 days are deleted on their own.</p>
      </section>

      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear usage counts?"
        removes="Every usage count on this phone is deleted, including the first-week and re-test checks."
        keeps="Your sessions, stats, logs and settings stay."
        confirmLabel="Clear counts"
        onConfirm={async () => {
          const n = await clearEvents()
          setConfirmClear(false)
          showToast(n === 1 ? '1 count cleared.' : `${n} counts cleared.`)
        }}
      />
    </Screen>
  )
}
