import { useEffect, useRef, useState } from 'react'

/**
 * DESIGN §4.1 / §13.7 item 6: confirms in the real browser that Archivo loaded and that tabular
 * figures are active (equal advance widths for "1" and "0" under tabular-nums).
 */
export function FontCheck() {
  const ones = useRef<HTMLSpanElement>(null)
  const zeros = useRef<HTMLSpanElement>(null)
  const [result, setResult] = useState<{ loaded: boolean; w1: number; w0: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    const measure = async () => {
      try {
        await document.fonts?.ready
      } catch {
        // Font loading API missing: measure anyway.
      }
      if (cancelled) return
      const loaded = document.fonts?.check?.('16px "Archivo Variable"') ?? false
      setResult({ loaded, w1: ones.current?.getBoundingClientRect().width ?? 0, w0: zeros.current?.getBoundingClientRect().width ?? 0 })
    }
    void measure()
    return () => {
      cancelled = true
    }
  }, [])

  const tabular = result ? Math.abs(result.w1 - result.w0) < 0.5 : null
  return (
    <div className="flex flex-col gap-1 text-footnote text-ink-2" data-font-check={tabular === null ? 'pending' : tabular ? 'tabular' : 'proportional'}>
      <span aria-hidden="true" className="absolute -left-[9999px] text-body tabular-nums">
        <span ref={ones}>1111111111</span>
        <span ref={zeros}>0000000000</span>
      </span>
      <span>Archivo loaded: {result ? (result.loaded ? 'yes' : 'no') : 'checking'}</span>
      <span className="tabular-nums">
        Tabular figures: {tabular === null ? 'checking' : tabular ? 'active' : 'not active'}
        {result ? ` (ten 1s ${result.w1.toFixed(1)} px, ten 0s ${result.w0.toFixed(1)} px)` : ''}
      </span>
    </div>
  )
}
