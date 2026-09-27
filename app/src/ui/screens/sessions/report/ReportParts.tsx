import { CheckCircleIcon, FlaskIcon, HardDrivesIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { QualityReport } from '../../../../analysis/types.ts'
import type { ExperimentRecord, VideoRecord } from '../../../../data/records.ts'
import { listVideosBySession, setVideoRetention } from '../../../../data/repos/videos.ts'
import { showToast } from '../../../../data/stores/toast.ts'
import { Button, CaptureQualityLine, MetricValue, Sheet } from '../../../components/index.ts'
import { metricName } from '../../../copy/metricNames.ts'
import { CAPTURE_SIMULATED_ONLY } from '../../../copy/strings.ts'
import { shortDate } from '../../../format/dates.ts'
import { paths } from '../../../shell/paths.ts'
import { compareExperiment, type SessionData } from '../../progress/insights/compare.ts'
import { VerdictLine } from '../../progress/insights/ui.tsx'
import { moreServesText } from '../../progress/insights/words.ts'
import { tiltHint } from '../../record/import/hints.ts'

/**
 * Capture line (DESIGN §3.6) with the capture detail sheet: every non-passing check with its message
 * and fix, plus a link to the set-up guide.
 */
export function CaptureLine({ quality, measured, detected }: { quality: QualityReport; measured: number; detected: number }) {
  const [open, setOpen] = useState(false)
  const failing = quality.checks.filter((c) => !c.pass)
  const tip = tiltHint(failing.find((c) => c.fix)?.fix?.replace(/^Next time,?\s*/i, ''))
  return (
    <>
      <CaptureQualityLine overall={quality.overall} measured={measured} detected={detected} tip={tip} onOpen={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Capture details">
        <div className="flex flex-col gap-3 pb-2">
          {failing.length ? (
            <ul className="flex flex-col gap-3">
              {failing.map((c) => {
                const G = c.severity === 'block' ? XCircleIcon : WarningCircleIcon
                return (
                  <li key={c.id} className="flex items-start gap-2">
                    <G size={20} aria-hidden="true" className={c.severity === 'info' ? 'mt-0.5 shrink-0 text-ink-2' : 'mt-0.5 shrink-0 text-attention'} />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-callout text-ink">{c.message}</span>
                      {c.fix ? <span className="text-footnote text-ink-2">{tiltHint(c.fix)}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="flex items-start gap-2 text-callout text-ink">
              <CheckCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
              Every automatic capture check passed.
            </p>
          )}
          <p className="text-footnote text-ink-3">
            {measured} of {detected} serves were measured. Serves we couldn't see clearly stay in the list with the reason.
          </p>
          <p className="flex items-start gap-1.5 text-footnote text-ink-2" data-status="experimental">
            <FlaskIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{CAPTURE_SIMULATED_ONLY}</span>
          </p>
          <Button variant="secondary" to={paths.setupChoice()}>
            See set-up tips
          </Button>
        </div>
      </Sheet>
    </>
  )
}

/**
 * "Did it work?" card on a re-test report (PRODUCT §6.5 item 5): the verdict in words with the
 * effect and n, linking to Compare.
 */
export function ExperimentResultCard({ experiment, baseline, retests, heightM }: { experiment: ExperimentRecord; baseline: SessionData[]; retests: SessionData[]; heightM?: number }) {
  const model = compareExperiment(experiment, baseline, retests, heightM)
  const id = model.metricId
  // The same values Compare shows: each one-session side is that session's own stored value, so the
  // re-test's number here equals its headline and toss tile (ui/format/sessionValues.ts).
  const before = model.beforeValue
  const after = model.afterValue
  return (
    <section aria-labelledby="did-it-work" className="card flex flex-col items-start gap-3 p-4">
      <h3 id="did-it-work" className="text-headline text-ink">
        Did it work?
      </h3>
      <VerdictLine verdict={model.verdict} more={moreServesText(model.moreServes, model.verdict)} />
      {model.verdict !== 'not-comparable' ? (
        <p className="text-callout text-ink-2">
          {metricName(id)}: <MetricValue metricId={id} value={before} chip={false} /> then <MetricValue metricId={id} value={after} compactChip /> ({model.before.n}{' '}
          and {model.after.n} serves, same set-up).
        </p>
      ) : (
        <p className="text-callout text-ink-2">Not comparable yet: {model.reason}.</p>
      )}
      <Button variant="tertiary" to={paths.compare(experiment.id)}>
        See the comparison
      </Button>
    </section>
  )
}

function storageLine(v: VideoRecord): string {
  if (v.storage === 'deleted') return 'Video deleted. Key frames and stats kept.'
  if (v.storage === 'not-kept') return v.isDemo ? 'Sample session: no video file is kept.' : 'Video not kept after analysis. Key frames and stats kept.'
  if (v.retention.pinned === 1 || v.retention.policy === 'keep') return 'Video kept on this phone.'
  if (v.retainUntil) return `Video kept until ${shortDate(new Date(v.retainUntil))}.`
  return 'Video kept on this phone.'
}

/** Storage line (DESIGN §1 principle 7, §10.6): where the footage is and how long it stays. */
export function StorageLine({ sessionId }: { sessionId: string }) {
  const videos = useLiveQuery(() => listVideosBySession(sessionId), [sessionId])
  const v = videos?.find((x) => x.role !== 'second-angle') ?? videos?.[0]
  if (!v) return null
  const canPin = v.storage === 'idb' || v.storage === 'native'
  const pinned = v.retention.pinned === 1 || v.retention.policy === 'keep'
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="flex items-start gap-2 text-footnote text-ink-2">
        <HardDrivesIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>{storageLine(v)}</span>
      </p>
      {canPin && !pinned ? (
        <Button
          variant="tertiary"
          onClick={async () => {
            await setVideoRetention(v.id, { pinned: true })
            showToast('This video will be kept.')
          }}
        >
          Keep this video
        </Button>
      ) : null}
    </div>
  )
}
