import { CaretDownIcon } from '@phosphor-icons/react'
import type { MetricId } from '../../../analysis/types.ts'
import { detailRows, keyNumberLines, NIGHT_WORDS, PASS_MARK_WORDS, RUN, SPIN_WORDS, STATE_WORDS, validationStateOf, type ResultRow } from './validationWords.ts'

function ResultList({ title, rows }: { title: string; rows: ResultRow[] }) {
  if (!rows.length) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-footnote font-label text-ink-2">{title}</h3>
      <dl className="flex flex-col">
        {rows.map((r) => (
          // A long value drops onto its own line (still right-aligned) instead of squeezing the label.
          <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-line py-1.5 first:border-t-0">
            <dt className="text-footnote text-ink-2">{r.label}</dt>
            <dd className="ml-auto text-right text-footnote tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Metric info "How sure we are" (DESIGN §3.2, §10.14; PRODUCT §6.14 item 4): the validation state in
 * plain words, the lights caveat, the key numbers from simulated serves with the pass mark, and a
 * native disclosure with the full figures for both clip sets. Numbers from validationWords.ts.
 */
export function HowSure({ id, heightM }: { id: MetricId; heightM?: number }) {
  const state = validationStateOf(id)
  const lines = keyNumberLines(id, heightM)
  const d1 = detailRows(id, 'd1', heightM)
  const all = detailRows(id, 'all', heightM)
  const mark = PASS_MARK_WORDS[id]
  return (
    <div className="flex flex-col gap-2" data-validation-state={state}>
      <p className="text-callout text-ink">{id === 'spin' ? SPIN_WORDS : STATE_WORDS[state]}</p>
      {state.startsWith('V1-synthetic-pass') ? <p className="text-footnote text-ink-2">{NIGHT_WORDS}</p> : null}
      {lines.map((t) => (
        <p key={t} className="text-callout text-ink-2">
          {t}
        </p>
      ))}
      {d1.length || all.length ? (
        <details className="group card mt-1 overflow-hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-card px-4 py-2.5 text-headline text-ink hover:bg-surface-2 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Test details</span>
            <CaretDownIcon size={20} aria-hidden="true" className="shrink-0 text-ink-3 transition-transform duration-(--dur-fast) group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <ResultList title="Recommended set-ups, 7 to 9 m away" rows={d1} />
            <ResultList title="Every simulated side view in daylight, 60 fps or more" rows={all} />
            {mark ? <p className="text-footnote text-ink-2">Pass mark: {mark}.</p> : null}
            <p className="text-footnote text-ink-3">
              From {RUN.clips} computer-generated clips run through the app&apos;s own tracking and measurements, {RUN.date}. No real footage yet.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  )
}
