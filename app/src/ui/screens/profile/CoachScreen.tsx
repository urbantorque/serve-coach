import { ChalkboardTeacherIcon, FileHtmlIcon, InfoIcon, FileTextIcon, PushPinIcon, PushPinSlashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useMemo, useState } from 'react'
import { FOCUS_ITEMS, getItem } from '../../../coaching/library.ts'
import { getStats, latestDecision, listSessions, saveProfile, showToast } from '../../../data/index.ts'
import { useProfile } from '../../../data/hooks.ts'
import type { SessionRecord } from '../../../data/records.ts'
import {
  Badge,
  Button,
  Card,
  DelayedSkeleton,
  EmptyState,
  EvidenceTierChip,
  ListGroup,
  ListRow,
  MetricValue,
  Screen,
  SectionLabel,
  Sheet,
  Skeleton,
} from '../../components/index.ts'
import { PHASE_LABEL } from '../../copy/strings.ts'
import { shortDate } from '../../format/dates.ts'
import { headlineFor } from '../../format/sessionValues.ts'
import { paths } from '../../shell/paths.ts'
import { buildCoachSummary, pickStats } from './coachSummary.ts'
import { EXPORT_FAILED } from './copy.ts'
import { ChoiceList } from './parts/ChoiceList.tsx'
import { saveFiles } from './parts/files.ts'
import { REGION_LABEL } from './parts/words.ts'

const back = { to: paths.profile(), label: 'You' }

/**
 * My coach's focus and sharing (PRODUCT §6.8.5, §6.13 item 3; research 10 M8, M12). Pin a focus your
 * coach gave you (free), and share a one-page summary of any session with them as a file you choose
 * where to send. Nothing is uploaded; the share sheet or a download hands the file to the player.
 */
export function CoachFocusScreen() {
  const profile = useProfile()
  const sessions = useLiveQuery(async () => (await listSessions({ includeDemo: true })).filter((s) => s.status === 'ready'), [])

  if (profile === undefined || sessions === undefined) {
    return (
      <Screen title="My coach's focus" back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-4">
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  return (
    <Screen title="My coach's focus" back={back}>
      <PinSection pinnedId={profile?.pinnedFocusItemId} comfort={profile?.comfortRegions ?? []} />
      <ShareSection sessions={sessions} />
      <section className="flex flex-col gap-2" aria-labelledby="coach-progress">
        <SectionLabel>
          <span id="coach-progress">For your coach, with Plus</span>
        </SectionLabel>
        <ListGroup>
          <ListRow
            leading={<ChalkboardTeacherIcon size={24} aria-hidden="true" className="text-ink-3" />}
            title="Progress summary"
            subtitle="Several sessions at once. Coming later."
            trailing={<Badge>Plus</Badge>}
          />
        </ListGroup>
      </section>
    </Screen>
  )
}

function PinSection({ pinnedId, comfort }: { pinnedId?: string; comfort: string[] }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string | null>(pinnedId ?? null)
  const pinned = pinnedId ? getItem(pinnedId) : undefined
  const ruledOut = pinned?.contraindications.filter((r) => comfort.includes(r)) ?? []

  const pin = async (itemId: string | undefined) => {
    await saveProfile({ pinnedFocusItemId: itemId })
    showToast(itemId ? 'Focus pinned.' : 'Focus unpinned.')
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-pin`}>
      <SectionLabel>
        <span id={`${id}-pin`}>Working on something with your coach?</span>
      </SectionLabel>
      {pinned ? (
        <Card className="flex flex-col gap-3" label="Pinned focus">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
              <PushPinIcon size={24} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-headline text-ink">{pinned.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {pinned.evidence.keyFramePhase ? (
                  <span className="text-footnote text-ink-2">{PHASE_LABEL[pinned.evidence.keyFramePhase]}</span>
                ) : null}
                <EvidenceTierChip tier={pinned.evidenceTier} />
              </div>
            </div>
          </div>
          <p className="text-callout text-ink-2">
            It becomes your focus from your next analysed session. Evidence from your serves still shows beside it, and the body check still comes first.
          </p>
          {ruledOut.length ? (
            <p className="flex items-start gap-2 text-footnote text-ink-2">
              <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-attention" />
              Your comfort settings ({ruledOut.map((r) => REGION_LABEL[r as keyof typeof REGION_LABEL].toLowerCase()).join(', ')}) rule this focus out. Check with a
              physio before working on it.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" compact onClick={() => setOpen(true)}>
              Change
            </Button>
            <Button variant="secondary" compact icon={PushPinSlashIcon} onClick={() => void pin(undefined)}>
              Unpin
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-callout text-ink-2">Pin the focus your coach set. It becomes your focus, and evidence from your serves still shows beside it.</p>
          <Button variant="secondary" icon={PushPinIcon} onClick={() => setOpen(true)}>
            Choose a focus
          </Button>
        </Card>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Your coach's focus"
        detent="large"
        footer={
          <Button
            disabled={!choice || choice === pinnedId}
            onClick={async () => {
              if (!choice) return
              await pin(choice)
              setOpen(false)
            }}
          >
            Pin focus
          </Button>
        }
      >
        <ChoiceList
          label="Focus from the coaching library"
          mode="single"
          size="compact"
          options={FOCUS_ITEMS.map((i) => ({
            value: i.id,
            label: i.title,
            detail: i.evidence.keyFramePhase ? PHASE_LABEL[i.evidence.keyFramePhase] : undefined,
          }))}
          value={choice ? [choice] : []}
          onChange={([v]) => setChoice(v)}
        />
      </Sheet>
    </section>
  )
}

function ShareSection({ sessions }: { sessions: SessionRecord[] }) {
  const id = useId()
  const recent = sessions.slice(0, 6)
  const [chosen, setChosen] = useState<string | null>(recent[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const session = recent.find((s) => s.id === chosen) ?? null
  const bundle = useLiveQuery(
    async () => (session ? { stats: (await getStats(session.id)) ?? null, decision: (await latestDecision(session.id)) ?? null } : null),
    [session?.id],
  )
  const stats = useMemo(() => (bundle ? pickStats(bundle.stats, bundle.decision) : []), [bundle])
  const headline = session && bundle ? headlineFor(session, bundle.stats) : null

  if (!recent.length) {
    return (
      <section className="flex flex-col gap-2" aria-labelledby={`${id}-share`}>
        <SectionLabel>
          <span id={`${id}-share`}>Share a session with your coach</span>
        </SectionLabel>
        <EmptyState icon={FileHtmlIcon} title="No sessions yet" body="After your first analysed session you can share a one-page summary here." />
      </section>
    )
  }

  const share = async (kind: 'html' | 'json') => {
    if (!session || !bundle) return
    setError(null)
    try {
      const s = buildCoachSummary({ session, stats: bundle.stats, decision: bundle.decision })
      const file =
        kind === 'html'
          ? new File([s.html], `${s.fileBase}.html`, { type: 'text/html' })
          : new File([s.json], `${s.fileBase}.json`, { type: 'application/json' })
      const r = await saveFiles([file], { title: s.title })
      if (r === 'downloaded') showToast(`Saved ${file.name}.`)
    } catch {
      setError(EXPORT_FAILED)
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-share`}>
      <SectionLabel>
        <span id={`${id}-share`}>Share a session with your coach</span>
      </SectionLabel>
      <ChoiceList
        labelledBy={`${id}-share`}
        mode="single"
        size="compact"
        options={recent.map((s) => ({
          value: s.id,
          label: shortDate(s.visitId),
          detail: [s.view === 'rear' ? 'View from behind' : 'Side view', s.isDemo === 1 ? 'Sample data' : null].filter(Boolean).join(' · '),
        }))}
        value={chosen ? [chosen] : []}
        onChange={([v]) => setChosen(v)}
      />
      {session ? (
        <Card className="flex flex-col gap-3" label="What your coach will see">
          <h3 className="text-footnote font-label text-ink-3">What your coach will see</h3>
          {session.isDemo === 1 ? (
            <p className="-mt-1 flex items-center gap-1.5 text-footnote text-ink-2">
              <InfoIcon size={16} aria-hidden="true" />
              Sample data · synthetic player
            </p>
          ) : null}
          {bundle === undefined ? (
            <Skeleton variant="text" className="h-12" />
          ) : (
            <>
              {headline ? <p className="text-callout text-ink">{headline}</p> : null}
              {bundle?.decision?.focus && bundle.decision.gate !== 'pain-referral' ? (
                <p className="text-callout text-ink-2">Focus: {bundle.decision.focus.title}</p>
              ) : null}
              {stats.length ? (
                <ul className="flex flex-col gap-2">
                  {stats.map((st) => (
                    <li key={st.metricId} className="flex flex-col">
                      <span className="text-footnote text-ink-2">
                        {st.name}
                        {st.nLine ? <span className="tabular-nums text-ink-3"> · {st.nLine}</span> : null}
                      </span>
                      <MetricValue metricId={st.metricId} value={st.value} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-callout text-ink-2">No stats could be measured in this session.</p>
              )}
              <p className="text-footnote text-ink-3">Not included: video, pain or comfort answers, notes and your name.</p>
            </>
          )}
        </Card>
      ) : null}
      <div className="flex flex-col gap-3">
        <Button variant="secondary" icon={FileHtmlIcon} onClick={() => void share('html')} disabled={!bundle}>
          Share summary
        </Button>
        <Button variant="secondary" icon={FileTextIcon} onClick={() => void share('json')} disabled={!bundle}>
          Share data file
        </Button>
      </div>
      <p className="text-footnote text-ink-3">
        A one-page summary to open in any browser, or the same content as JSON. You choose where to send it; nothing is uploaded.
      </p>
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-footnote text-critical">
          <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      ) : null}
    </section>
  )
}
