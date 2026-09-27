import { CaretDownIcon, CheckCircleIcon, CircleDashedIcon, InfoIcon, type Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { MetricId } from '../../../analysis/types.ts'
import { Card, SectionLabel } from '../../components/index.ts'
import { metricName } from '../../copy/metricNames.ts'
import { paths } from '../../shell/paths.ts'
import { LIMITS } from '../metric/metricCopy.ts'
import { RUN, stateCounts, typicalError, VALIDATION_LIMIT, validationStateOf, type ValidationState } from '../metric/validationWords.ts'

/**
 * How we measure: the validation layer (PRODUCT §6.13 item 5 "Validation results"; DESIGN §3.2;
 * METRICS §1.3, §5, §6). Everything here is from computer-generated serves and says so.
 */

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group card overflow-hidden">
      {/* Inset focus ring: the card's overflow-hidden would clip the default 2 px outer offset. */}
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3 hover:bg-surface-2 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-headline text-ink">{title}</span>
        <CaretDownIcon size={20} aria-hidden="true" className="shrink-0 text-ink-3 transition-transform duration-(--dur-fast) group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  )
}

const STEPS: { title: string; body: string; now: boolean; glyph: Icon }[] = [
  {
    title: 'Simulated serves',
    body: 'Computer-generated serves where we know the exact answer, run through the same tracking and measurements as the app.',
    now: true,
    glyph: CheckCircleIcon,
  },
  {
    title: 'Hand-marked real video',
    body: 'Real players film their serves, and we mark each moment by hand, frame by frame, without seeing our numbers first.',
    now: false,
    glyph: CircleDashedIcon,
  },
  {
    title: 'A physical reference',
    body: 'A radar, a measuring pole or a second camera gives an independent answer.',
    now: false,
    glyph: CircleDashedIcon,
  },
]

/** The three steps of METRICS §1.3 (V1 to V3), and where the app is today. */
export function CheckSteps() {
  const counts = stateCounts()
  const passed = counts['V1-synthetic-pass'].length + counts['V1-synthetic-pass-limited'].length
  return (
    <section className="flex flex-col gap-2" aria-labelledby="hwm-steps">
      <SectionLabel>
        <span id="hwm-steps">How far our checks have gone</span>
      </SectionLabel>
      <Card>
        <ol className="flex flex-col gap-3">
          {STEPS.map((s) => (
            <li key={s.title} className="flex items-start gap-3">
              <s.glyph size={20} aria-hidden="true" className={s.now ? 'mt-0.5 shrink-0 text-ink' : 'mt-0.5 shrink-0 text-ink-3'} />
              <div className="flex flex-col gap-0.5">
                <p className="text-headline text-ink">
                  {s.title}
                  <span className="sr-only">{s.now ? ', done for some measurements' : ', not started'}</span>
                </p>
                <p className="text-footnote text-ink-2">{s.body}</p>
                <p className="text-footnote font-label text-ink-2">{s.now ? `${passed} measurements have passed this step.` : 'Not started yet.'}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-footnote text-ink-2">
        A measurement that passes on simulated serves shows as an estimate in daylight. In a session you mark as under lights (or, for an import, not sure of the light), and until it passes, it shows as experimental.
      </p>
    </section>
  )
}

const RESULT_WORDS: Record<ValidationState, string> = {
  'V1-synthetic-pass': 'Passed',
  'V1-synthetic-pass-limited': 'Passed, limited evidence',
  'V1-synthetic-fail': 'Not passed yet',
  'V0-synthetic-inconclusive': 'Not conclusive',
  'V0-unvalidated': 'Not tested yet',
  'not-applicable': 'You log this',
}

/** Measurements the synthetic run scored, in the order of the report (docs/VALIDATION.md §3). */
const SCORED: MetricId[] = [
  'serve-count',
  'toss-apex-height',
  'toss-drop',
  'toss-height-spread',
  'toss-forward-spread',
  'contact-height-ratio',
  'contact-height-spread',
  'rhythm-release-to-contact',
  'rhythm-spread',
  'leg-drive',
  'loading-depth',
  'toss-forward',
  'contact-forward',
  'trophy-pause',
  'drive-time',
  'landing-distance',
  'shoulder-tilt-trophy',
  'speed-experimental',
  'deep-bend-flag',
  'knee-bend-band',
  'capture-quality',
]

/** PRODUCT §6.13 item 5: the latest validation summary, scenarios tested and what is not tested. */
export function ValidationResults() {
  const counts = stateCounts()
  const passed = counts['V1-synthetic-pass'].length + counts['V1-synthetic-pass-limited'].length
  const limited = counts['V1-synthetic-pass-limited'].length
  const notYet = counts['V1-synthetic-fail'].length
  const open = counts['V0-synthetic-inconclusive'].length + counts['V0-unvalidated'].length
  return (
    <section className="flex flex-col gap-2" aria-labelledby="hwm-results">
      <SectionLabel>
        <span id="hwm-results">Validation results</span>
      </SectionLabel>
      <Card className="flex flex-col gap-2">
        <p className="text-callout text-ink">
          We ran {RUN.clips} computer-generated serve clips through the app&apos;s own body tracking, ball tracking and measurements, and compared every number
          with the exact answer.
        </p>
        <p className="text-callout text-ink-2">
          {passed} measurements passed ({limited} on limited evidence). {notYet} haven&apos;t passed yet and stay experimental. {open} aren&apos;t settled or tested yet.
        </p>
        <p className="text-callout text-ink-2">
          We tried 30 to 240 fps, slow-motion files, phones 4 to 12 m away, side views, views from behind and angled front views, dusk and floodlights with flicker, heavy video
          compression, a shaky phone, left-handers, and players from 1.60 to 1.95 m.
        </p>
        <p className="flex items-start gap-2 text-callout text-ink">
          <InfoIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
          Not tested yet: real players, real phones and courts, real court lights, other people in the picture, and radar speed.
        </p>
      </Card>
      <Disclosure title="Results by measurement">
        <ul className="flex flex-col" aria-label="Results by measurement">
          {SCORED.map((id) => {
            const state = validationStateOf(id)
            const typ = state.startsWith('V1') && id !== 'serve-count' && id !== 'shoulder-tilt-trophy' ? typicalError(id) : null
            return (
              <li key={id} className="border-t border-line first:border-t-0" data-result-metric={id} data-validation-state={state}>
                <Link to={paths.metricInfo(id)} className="flex min-h-11 flex-col justify-center py-2 hover:bg-surface-2">
                  <span className="text-subhead text-ink">{metricName(id)}</span>
                  <span className="text-footnote text-ink-2">
                    {RESULT_WORDS[state]}
                    {typ ? `. Typical error: ${typ}` : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="text-footnote text-ink-3">
          Typical error is at the recommended set-ups, 7 to 9 m away. Tap a measurement for the pass mark and full figures. Updated {RUN.date}.
        </p>
      </Disclosure>
    </section>
  )
}

/** METRICS §6 in player words: every limit once, plus the synthetic-only limit. */
export function KnownLimits() {
  const texts = [VALIDATION_LIMIT, ...new Set(LIMITS.map((l) => l.text))]
  return (
    <section className="flex flex-col gap-2" aria-labelledby="hwm-limits">
      <SectionLabel>
        <span id="hwm-limits">Known limits</span>
      </SectionLabel>
      <Disclosure title={`${texts.length} things that can shift a number`}>
        <ul className="flex flex-col gap-2">
          {texts.map((t) => (
            <li key={t} className="flex items-start gap-2 text-callout text-ink-2">
              <InfoIcon size={16} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="text-footnote text-ink-3">Each measurement&apos;s own page lists the limits that apply to it.</p>
      </Disclosure>
    </section>
  )
}
