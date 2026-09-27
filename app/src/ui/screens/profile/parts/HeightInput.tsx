import { MinusIcon, PlusIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '../../../components/cx.ts'
import { checkHeightCm, HEIGHT_COPY, HEIGHT_MAX_CM, HEIGHT_MIN_CM, metresText } from './words.ts'

export interface HeightInputProps {
  /** Whole centimetres, or null until the player sets it (it starts empty, PRODUCT O5). */
  valueCm: number | null
  onChange: (cm: number | null) => void
  /** Show the reason line straight away (Profile) instead of behind "Why?" (onboarding). */
  reasonOpen?: boolean
}

/** First value a stepper tap gives an empty field (then ±1 cm per tap). */
const START_CM = 175

/**
 * Height input (DESIGN §8.22): a cm stepper from 140 to 210 whose value is also typeable. Stored in
 * metres by the caller. A soft-flagged value asks "Just checking: 1.43 m?" inline; nothing outside
 * 140 to 210 can be saved.
 */
export function HeightInput({ valueCm, onChange, reasonOpen = false }: HeightInputProps) {
  const id = useId()
  const [text, setText] = useState(valueCm === null ? '' : String(valueCm))
  const [error, setError] = useState<string | null>(null)
  const [why, setWhy] = useState(reasonOpen)

  // The last value this input reported; a different incoming value came from outside (a reset).
  const emitted = useRef<number | null>(valueCm)
  const emit = (cm: number | null) => {
    emitted.current = cm
    onChange(cm)
  }
  useEffect(() => {
    if (valueCm !== emitted.current) {
      emitted.current = valueCm
      setText(valueCm === null ? '' : String(valueCm))
    }
  }, [valueCm])

  const commit = (raw: string) => {
    if (!raw.trim()) {
      setError(null)
      emit(null)
      return
    }
    const r = checkHeightCm(raw)
    if (r.ok) {
      setError(null)
      emit(r.cm)
    } else {
      setError(r.error)
      emit(null)
    }
  }

  const step = (delta: number) => {
    const base = valueCm ?? START_CM - delta
    const next = Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, base + delta))
    setError(null)
    setText(String(next))
    emit(next)
  }

  const check = valueCm !== null ? checkHeightCm(String(valueCm)) : null
  const softFlag = Boolean(check && check.ok && check.softFlag)
  const atMin = valueCm !== null && valueCm <= HEIGHT_MIN_CM
  const atMax = valueCm !== null && valueCm >= HEIGHT_MAX_CM
  const btn =
    'grid size-11 shrink-0 place-items-center rounded-full border-token border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2 aria-disabled:text-ink-disabled aria-disabled:hover:bg-surface'
  const described = [error ? `${id}-err` : null, softFlag ? `${id}-soft` : null, why ? `${id}-why` : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={`${id}-in`} className="text-footnote font-label text-ink-2">
          {HEIGHT_COPY.label}
        </label>
        {reasonOpen ? null : (
          <button
            type="button"
            aria-expanded={why}
            aria-controls={`${id}-why`}
            onClick={() => setWhy((w) => !w)}
            className="-mr-1 h-11 rounded-control px-1 text-subhead font-label text-ink underline decoration-1 underline-offset-[3px] hover:bg-surface-2"
          >
            Why?
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} aria-label="Shorter by 1 cm" aria-disabled={atMin || undefined} onClick={() => (atMin ? undefined : step(-1))}>
          <MinusIcon size={20} aria-hidden="true" />
        </button>
        <div
          className={cx(
            'flex h-13 min-w-0 flex-1 items-center gap-2 rounded-control border-token bg-surface px-4',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
            error ? 'border-critical' : 'border-line-strong',
          )}
        >
          <input
            id={`${id}-in`}
            name="height-cm"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={3}
            spellCheck={false}
            value={text}
            placeholder="178…"
            aria-invalid={error ? true : undefined}
            aria-describedby={described || undefined}
            onChange={(e) => {
              const t = e.target.value.replace(/\D/g, '').slice(0, 3)
              setText(t)
              if (t.length === 3) {
                commit(t)
              } else {
                // Incomplete: no value yet, and no error while the player is still typing.
                setError(null)
                if (emitted.current !== null) emit(null)
              }
            }}
            onBlur={(e) => commit(e.target.value)}
            className="w-full min-w-0 bg-transparent text-title-2 font-wide tabular-nums text-ink outline-none placeholder:text-ink-3"
          />
          <span className="text-subhead text-ink-2" aria-hidden="true">
            cm
          </span>
        </div>
        <button type="button" className={btn} aria-label="Taller by 1 cm" aria-disabled={atMax || undefined} onClick={() => (atMax ? undefined : step(1))}>
          <PlusIcon size={20} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} aria-live="polite" className="flex items-center gap-1.5 text-footnote text-critical">
          <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      ) : null}
      {softFlag && valueCm !== null ? (
        <p id={`${id}-soft`} className="text-footnote text-ink-2">
          Just checking: {metresText(valueCm / 100)}?
        </p>
      ) : null}
      {why ? (
        <p id={`${id}-why`} className="text-footnote text-ink-3">
          {HEIGHT_COPY.why}
        </p>
      ) : null}
    </div>
  )
}
