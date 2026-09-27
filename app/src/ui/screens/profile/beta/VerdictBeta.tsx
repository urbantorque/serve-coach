import { useEffect, useId, useState } from 'react'
import type { ExperimentRecord } from '../../../../data/records.ts'
import { noteVerdictViewed, rateUsefulness, skipUsefulness, usefulnessAnswered } from '../../../../platform/beta.ts'
import { Button } from '../../../components/index.ts'
import { cx } from '../../../components/cx.ts'

const RATINGS = [1, 2, 3, 4, 5] as const

/**
 * On "Did it work?" (CompareScreen): counts that the verdict was seen, then asks once per experiment
 * "How useful is this change for you?" (PRODUCT §6.8.1 item 8, §7.4 step 8; research 08 §8.2), 1 to 5,
 * skippable. Never for the sample, never while coaching is paused for pain, never for "Not comparable
 * yet". The answer is a local usage count (Profile > Beta data); nothing is sent.
 */
export function VerdictBeta({ experiment, verdict, sameSession, paused }: { experiment: ExperimentRecord; verdict: string; sameSession: boolean; paused: boolean }) {
  const demo = experiment.isDemo === 1
  const [state, setState] = useState<'checking' | 'ask' | 'thanks' | 'hidden'>('checking')

  useEffect(() => {
    if (demo) return
    void noteVerdictViewed(experiment, verdict, sameSession)
  }, [demo, experiment, verdict, sameSession])

  const eligible = !demo && !paused && verdict !== 'not-comparable'
  useEffect(() => {
    if (!eligible) return
    let live = true
    void usefulnessAnswered(experiment.id).then((done) => {
      if (live) setState((s) => (s === 'checking' ? (done ? 'hidden' : 'ask') : s))
    })
    return () => {
      live = false
    }
  }, [eligible, experiment.id])

  if (!eligible || state === 'checking' || state === 'hidden') return null
  if (state === 'thanks') {
    return (
      <p role="status" className="text-footnote text-ink-2">
        Thanks. Your answer stays on this phone, in Profile, Beta data.
      </p>
    )
  }
  return (
    <UsefulnessPrompt
      onRate={(n) => {
        setState('thanks')
        void rateUsefulness(experiment.id, n)
      }}
      onSkip={() => {
        setState('hidden')
        void skipUsefulness(experiment.id)
      }}
    />
  )
}

export function UsefulnessPrompt({ onRate, onSkip }: { onRate: (n: 1 | 2 | 3 | 4 | 5) => void; onSkip: () => void }) {
  const id = useId()
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby={`${id}-q`} data-usefulness>
      <h2 id={`${id}-q`} className="text-headline text-ink">
        How useful is this change for you?
      </h2>
      <div role="group" aria-labelledby={`${id}-q`} aria-describedby={`${id}-scale`} className="grid grid-cols-5 gap-2">
        {RATINGS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onRate(n)}
            aria-label={`${n} of 5${n === 1 ? ', not useful' : n === 5 ? ', very useful' : ''}`}
            className={cx(
              'btn h-13 rounded-control border-token border-line-strong bg-surface text-headline tabular-nums text-ink',
              'transition-transform duration-(--dur-press) hover:bg-surface-2 active:scale-[0.98] active:bg-surface-2 motion-reduce:transition-none',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p id={`${id}-scale`} className="flex justify-between text-footnote text-ink-2">
        <span>1 not useful</span>
        <span>5 very useful</span>
      </p>
      <Button variant="tertiary" onClick={onSkip} className="min-w-11 self-start">
        Skip
      </Button>
    </section>
  )
}
