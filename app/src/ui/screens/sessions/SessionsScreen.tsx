import { CheckCircleIcon, ListBulletsIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { useSessions } from '../../../data/hooks.ts'
import type { SessionRecord } from '../../../data/records.ts'
import { Button, DelayedSkeleton, EmptyState, ListGroup, ListRow, SampleBanner, Screen, SectionLabel, Skeleton } from '../../components/index.ts'
import { CAPTURE_WORDS } from '../../copy/strings.ts'
import { monthYear, shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'

function CaptureGlyph({ overall }: { overall: 'good' | 'usable' | 'poor' }) {
  const G = overall === 'good' ? CheckCircleIcon : overall === 'usable' ? WarningCircleIcon : WarningIcon
  return (
    <span className="inline-flex items-center">
      <G size={20} aria-hidden="true" className={overall === 'good' ? 'text-ink-2' : 'text-attention'} />
      <span className="sr-only">Capture {CAPTURE_WORDS[overall]}</span>
    </span>
  )
}

function SessionRow({ s }: { s: SessionRecord }) {
  const a = s.analysis
  return (
    <ListRow
      to={paths.sessionReport(s.id)}
      title={shortDate(s.visitId)}
      subtitle={`${s.view === 'rear' ? 'View from behind' : 'Side view'} · ${a?.counts.analysed ?? 0} serves`}
      trailing={a ? <CaptureGlyph overall={a.capture.quality.overall} /> : undefined}
    />
  )
}

function groupByMonth(rows: SessionRecord[]): [string, SessionRecord[]][] {
  const groups = new Map<string, SessionRecord[]>()
  for (const s of rows) {
    const key = monthYear(s.visitId)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups.entries()]
}

/**
 * Sessions tab root (DESIGN §10.5). STUB: month groups and session rows from the data layer; demo
 * sessions go last under "Sample". Filter row, overflow (Export, Delete) and the key-frame thumbnails
 * are for the Sessions builder.
 */
export function SessionsScreen() {
  const sessions = useSessions()
  const own = sessions?.filter((s) => s.isDemo === 0) ?? []
  const sample = sessions?.filter((s) => s.isDemo === 1) ?? []
  return (
    <Screen title="Sessions" variant="root" banner={sample.length ? <SampleBanner /> : undefined}>
      {sessions === undefined ? (
        <DelayedSkeleton>
          <div className="flex flex-col gap-2">
            <Skeleton variant="row" />
            <Skeleton variant="row" />
          </div>
        </DelayedSkeleton>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={ListBulletsIcon}
          title="No sessions yet"
          body="Your sessions will appear here after your first recording."
          action={
            <Button variant="secondary" to={paths.record()}>
              Go to Record
            </Button>
          }
        />
      ) : (
        <>
          {groupByMonth(own).map(([month, rows]) => (
            <section key={month} className="flex flex-col gap-2">
              <SectionLabel>{month}</SectionLabel>
              <ListGroup>
                {rows.map((s) => (
                  <SessionRow key={s.id} s={s} />
                ))}
              </ListGroup>
            </section>
          ))}
          {sample.length ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Sample</SectionLabel>
              <ListGroup>
                {sample.map((s) => (
                  <SessionRow key={s.id} s={s} />
                ))}
              </ListGroup>
            </section>
          ) : null}
        </>
      )}
    </Screen>
  )
}
