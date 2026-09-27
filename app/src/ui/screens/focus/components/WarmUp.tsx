import { CaretRightIcon, FlagPennantIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import type { CueChoice, WarmUpRoutine } from '../../../../coaching/index.ts'
import { Button, Card, Sheet } from '../../../components/index.ts'
import { WARMUP_COPY } from '../copy.ts'

/** The warm-up routine (COACHING §11.1): at most 10 serves, easy to firm, comfort notes applied. */
export function WarmUpSteps({ routine, cue }: { routine: WarmUpRoutine; cue?: CueChoice }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-callout text-ink-2">{routine.setup}</p>
      <ol className="flex flex-col gap-3">
        {routine.steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-body text-ink">
            <span className="w-5 shrink-0 text-right tabular-nums text-ink-3" aria-hidden="true">
              {i + 1}.
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {routine.comfortNotes.map((n) => (
        <p key={n} className="text-footnote text-ink-2">
          {n}
        </p>
      ))}
      <p className="text-headline text-ink">{routine.closing}</p>
      {cue ? <p className="text-footnote text-ink-3">Your cue: {cue.text}</p> : null}
    </div>
  )
}

/**
 * Pre-match card (DESIGN §8.8 variant; COACHING §7.9): a slim card with the current cue and the
 * 5-minute warm-up. No new focus, no stats, no primary button. Hidden while a referral is active.
 */
export function PreMatchCard({ cue, routine }: { cue: CueChoice; routine: WarmUpRoutine }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="flex flex-col gap-2" label={WARMUP_COPY.matchNight}>
      <p className="flex items-center gap-2 text-footnote font-label text-ink-2">
        <FlagPennantIcon size={18} aria-hidden="true" />
        {WARMUP_COPY.matchNight}
      </p>
      <p className="text-title-2 text-ink" data-cue>
        “{cue.text}”
      </p>
      <p className="text-footnote text-ink-3">{WARMUP_COPY.noNew}</p>
      <Button variant="tertiary" onClick={() => setOpen(true)} className="-ml-1 self-start">
        <span className="inline-flex items-center gap-1">
          {WARMUP_COPY.openRoutine}
          <CaretRightIcon size={16} aria-hidden="true" />
        </span>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={routine.title} closeStyle="done">
        <p className="mb-4 text-footnote text-ink-3">{WARMUP_COPY.serves(routine.maxServes)}</p>
        <WarmUpSteps routine={routine} cue={cue} />
      </Sheet>
    </Card>
  )
}
