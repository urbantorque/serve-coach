import { CheckCircleIcon, EyeIcon, ListBulletsIcon, VideoCameraIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router'
import type { ExperimentRecord, SessionRecord } from '../../../data/records.ts'
import {
  Button,
  DelayedSkeleton,
  EmptyState,
  ListGroup,
  ListRow,
  RowIcon,
  SampleBanner,
  Screen,
  SectionLabel,
  SegmentedControl,
  Skeleton,
  VerdictChip,
} from '../../components/index.ts'
import { CAPTURE_EXPERIMENTAL, CAPTURE_WORDS } from '../../copy/strings.ts'
import { monthYear, shortDate } from '../../format/dates.ts'
import { headlineFor } from '../../format/sessionValues.ts'
import { paths } from '../../shell/paths.ts'
import type { SessionBundle } from '../progress/insights/history.ts'
import { useExperiments, useSessionBundles, useSessionThumbUrl } from '../progress/insights/hooks.ts'

function CaptureGlyph({ overall }: { overall: 'good' | 'usable' | 'poor' }) {
  const G = overall === 'good' ? CheckCircleIcon : overall === 'usable' ? WarningCircleIcon : WarningIcon
  return (
    <span className="inline-flex items-center">
      <G size={20} aria-hidden="true" className={overall === 'good' ? 'text-ink-2' : 'text-attention'} />
      <span className="sr-only">
        Capture {CAPTURE_WORDS[overall]}, {CAPTURE_EXPERIMENTAL.toLowerCase()}
      </span>
    </span>
  )
}

function Thumb({ s }: { s: SessionRecord }) {
  const url = useSessionThumbUrl(s.id)
  if (url) return <img src={url} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10 rounded-media object-cover" />
  return <RowIcon>{s.view === 'rear' ? <EyeIcon size={20} aria-hidden="true" /> : <VideoCameraIcon size={20} aria-hidden="true" />}</RowIcon>
}

const TEMPLATE_WORD: Partial<Record<NonNullable<SessionRecord['template']>, string>> = {
  retest: 'Re-test',
  'check-in': 'Check-in',
  'second-serve-check-in': 'Second-serve check-in',
  experiment: 'Experiment',
  'both-sides': 'Both sides',
  outcomes: 'Outcomes',
  import: 'Imported',
}

function subtitle(s: SessionRecord): string {
  const view = s.view === 'rear' ? 'From behind' : 'Side view'
  if (s.status === 'failed') return `${view} · Couldn't analyse: ${s.error?.message ?? 'something went wrong'}`
  if (s.status !== 'ready' || !s.analysis) return `${view} · Analysing`
  const c = s.analysis.counts
  return `${view} · ${c.included} of ${c.analysed} measured`
}

function SessionRow({ b, verdict }: { b: SessionBundle; verdict?: ExperimentRecord['result'] }) {
  const s = b.session
  const a = s.analysis
  const tmpl = s.template ? TEMPLATE_WORD[s.template] : undefined
  const processing = s.status === 'queued' || s.status === 'analysing' || s.status === 'paused' || s.status === 'importing'
  return (
    <ListRow
      to={processing ? paths.processing(s.id) : paths.sessionReport(s.id)}
      leading={<Thumb s={s} />}
      title={
        <span className="flex flex-wrap items-center gap-x-2">
          {shortDate(s.visitId)}
          {tmpl ? <span className="text-footnote font-normal text-ink-3">{tmpl}</span> : null}
        </span>
      }
      subtitle={subtitle(s)}
      wrap
      detail={
        verdict && s.isRetest === 1 ? (
          <span className="mt-1 flex">
            <VerdictChip verdict={verdict.verdict} />
          </span>
        ) : (
          (headlineFor(s, b.stats) ?? undefined)
        )
      }
      trailing={a && s.status === 'ready' ? <CaptureGlyph overall={a.capture.quality.overall} /> : undefined}
    />
  )
}

function groupByMonth(rows: SessionBundle[]): [string, SessionBundle[]][] {
  const groups = new Map<string, SessionBundle[]>()
  for (const b of rows) {
    const key = monthYear(b.session.visitId)
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  return [...groups.entries()]
}

type ViewFilter = 'all' | 'side' | 'rear'

/**
 * Sessions tab root (DESIGN §10.5, PRODUCT §6.12): month groups of session rows (key-frame
 * thumbnail, date and template, view and "X of N measured", the headline or the re-test verdict, a
 * capture glyph). A view filter appears once both views exist. Sample sessions sit last under "Sample".
 */
export function SessionsScreen() {
  const bundles = useSessionBundles({ includeDemo: true })
  const experiments = useExperiments()
  // The view filter lives in the URL (?view=) so it survives reloads and can be linked.
  const [search, setSearch] = useSearchParams()
  const raw = search.get('view')
  const filter: ViewFilter = raw === 'side' || raw === 'rear' ? raw : 'all'
  const setFilter = (v: ViewFilter) =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev)
      if (v === 'all') next.delete('view')
      else next.set('view', v)
      return next
    }, { replace: true })
  const verdictFor = (id: string) => experiments?.find((e) => e.retestSessionIds.includes(id) && e.result)?.result
  const byView = (b: SessionBundle) => filter === 'all' || (filter === 'rear' ? b.session.view === 'rear' : b.session.view !== 'rear')
  const own = bundles?.filter((b) => b.session.isDemo === 0) ?? []
  const sample = bundles?.filter((b) => b.session.isDemo === 1) ?? []
  const views = new Set((bundles ?? []).map((b) => (b.session.view === 'rear' ? 'rear' : 'side')))
  const ownShown = own.filter(byView)
  const sampleShown = sample.filter(byView)

  return (
    <Screen title="Sessions" variant="root" banner={sample.length ? <SampleBanner /> : undefined}>
      {bundles === undefined ? (
        <DelayedSkeleton>
          <div className="flex flex-col gap-2">
            <Skeleton variant="row" />
            <Skeleton variant="row" />
            <Skeleton variant="row" />
          </div>
        </DelayedSkeleton>
      ) : bundles.length === 0 ? (
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
          {views.size > 1 ? (
            <SegmentedControl
              label="Show sessions from"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'side', label: 'Side view' },
                { value: 'rear', label: 'From behind' },
              ]}
              className="-mt-2"
            />
          ) : null}
          {groupByMonth(ownShown).map(([month, rows]) => (
            <section key={month} className="flex flex-col gap-2">
              <SectionLabel>{month}</SectionLabel>
              <ListGroup>
                {rows.map((b) => (
                  <SessionRow key={b.session.id} b={b} verdict={verdictFor(b.session.id)} />
                ))}
              </ListGroup>
            </section>
          ))}
          {sampleShown.length ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Sample</SectionLabel>
              <ListGroup>
                {sampleShown.map((b) => (
                  <SessionRow key={b.session.id} b={b} verdict={verdictFor(b.session.id)} />
                ))}
              </ListGroup>
            </section>
          ) : null}
          {!ownShown.length && !sampleShown.length ? (
            <EmptyState
              icon={ListBulletsIcon}
              title="No sessions match"
              body="Try a different view."
              action={
                <Button variant="tertiary" onClick={() => setFilter('all')}>
                  Clear filters
                </Button>
              }
            />
          ) : null}
        </>
      )}
    </Screen>
  )
}
