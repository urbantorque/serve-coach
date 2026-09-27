import { useId, useState } from 'react'
import { cx } from '../../../components/cx.ts'
import { ChoiceList } from './ChoiceList.tsx'
import { LEVEL_OPTIONS, parseUtr, type LevelDescription } from './words.ts'

export interface LevelValue {
  /** The typed UTR ("4.5"), or empty. */
  utrText: string
  /** "I don't have one". */
  noUtr: boolean
  description: LevelDescription | null
}

/**
 * Level (PRODUCT O6, COACHING §9.1): a UTR field (1.00 to 16.50) with "I don't have one", which
 * reveals "Which sounds most like you?". Shared by onboarding and Profile → Your serve.
 */
export function LevelFields({ value, onChange }: { value: LevelValue; onChange: (patch: Partial<LevelValue>) => void }) {
  const id = useId()
  const parsed = parseUtr(value.utrText)
  const [touched, setTouched] = useState(false)
  const showError = touched && parsed.error
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-utr`} className="text-footnote font-label text-ink-2">
          Your UTR
        </label>
        <input
          id={`${id}-utr`}
          name="utr"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={value.noUtr ? '' : '4.50…'}
          disabled={value.noUtr}
          value={value.utrText}
          aria-invalid={showError ? true : undefined}
          aria-describedby={`${id}-help`}
          onChange={(e) => onChange({ utrText: e.target.value.replace(/[^\d.,]/g, '').slice(0, 5), noUtr: false })}
          onBlur={() => setTouched(true)}
          className={cx(
            'h-13 rounded-control border-token bg-surface px-4 text-title-2 font-wide tabular-nums text-ink placeholder:text-ink-3',
            'disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-disabled',
            showError ? 'border-critical' : 'border-line-strong',
          )}
        />
        <p id={`${id}-help`} className={cx('text-footnote', showError ? 'text-critical' : 'text-ink-3')}>
          {showError ? parsed.error : 'From 1.00 to 16.50, as shown in the UTR app.'}
        </p>
        {parsed.value !== null && parsed.value > 7 ? (
          <p className="text-footnote text-ink-2">Our drills are written for UTR 1 to 7, so some may feel easy.</p>
        ) : null}
      </div>
      <ChoiceList
        label="I don't have a UTR"
        mode="multi"
        size="compact"
        options={[{ value: 'none', label: "I don't have one" }]}
        value={value.noUtr ? ['none'] : []}
        onChange={(v) => onChange({ noUtr: v.includes('none'), utrText: v.includes('none') ? '' : value.utrText })}
      />
      {value.noUtr ? (
        <section aria-labelledby={`${id}-desc`} className="flex flex-col gap-3">
          <h2 id={`${id}-desc`} className="text-headline text-ink">
            Which sounds most like you?
          </h2>
          <ChoiceList
            labelledBy={`${id}-desc`}
            mode="single"
            options={LEVEL_OPTIONS.map(({ value: v, label }) => ({ value: v, label }))}
            value={value.description ? [value.description] : []}
            onChange={([v]) => onChange({ description: v })}
          />
        </section>
      ) : null}
    </div>
  )
}
