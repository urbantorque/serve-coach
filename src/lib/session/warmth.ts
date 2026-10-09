/**
 * Pause a long reading when the phone says it is running hot (L2.5).
 *
 * A session is minutes of seeking and pose detection back to back, which is
 * the load that makes a phone throttle, and a throttled phone reads every
 * remaining serve slower than the estimate the player was given. Chrome reports
 * the strain through the Compute Pressure API; at `critical` the reading stops
 * and keeps its place, the same as any other stop. Safari and Firefox expose no
 * such signal, and there this does nothing.
 */

type PressureState = 'nominal' | 'fair' | 'serious' | 'critical'

interface PressureRecordLike {
  state: PressureState
}

interface PressureObserverLike {
  observe(source: 'cpu', options?: { sampleInterval?: number }): Promise<void>
  disconnect(): void
}

type PressureObserverCtor = new (callback: (records: PressureRecordLike[]) => void) => PressureObserverLike

/** How often to be told, in milliseconds. A serve takes several seconds to read. */
const SAMPLE_INTERVAL_MS = 2000

/**
 * Call `onHot` the first time the CPU is reported `critical`. Returns the
 * function that stops watching. `scope` is handed in for the tests.
 */
export function watchWarmth(
  onHot: () => void,
  scope: { PressureObserver?: unknown } = globalThis as { PressureObserver?: unknown },
): () => void {
  const Observer = scope.PressureObserver as PressureObserverCtor | undefined
  if (typeof Observer !== 'function') return () => {}
  let fired = false
  let observer: PressureObserverLike
  try {
    observer = new Observer((records) => {
      if (fired || !records.some((r) => r.state === 'critical')) return
      fired = true
      onHot()
    })
    observer.observe('cpu', { sampleInterval: SAMPLE_INTERVAL_MS }).catch(() => {})
  } catch {
    // Refused by a permissions policy, or a shape this does not know.
    return () => {}
  }
  return () => {
    try {
      observer.disconnect()
    } catch {
      // Already gone.
    }
  }
}
