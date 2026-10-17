/**
 * A timeout that does not run out while the page is hidden (L6.4).
 *
 * A seek waits for the decoder's `seeked` and gives up after a few seconds,
 * carrying on as if it had landed. With the screen locked or the tab in the
 * background the browser stops decoding, so every seek ran its whole timeout
 * and came back somewhere else: the read lost sample after sample and the
 * player came back to a refusal for a clip that was fine. So a timeout that
 * falls due while the page is hidden waits for the page to come back, and
 * then starts its count again.
 *
 * DOM-free, with the document and the clock passed in, so a test can hide
 * the page and run the clock.
 */

export interface VisibilityLike {
  hidden: boolean
  addEventListener: (type: 'visibilitychange', fn: () => void) => void
  removeEventListener: (type: 'visibilitychange', fn: () => void) => void
}

export interface TimerClock {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

const REAL: TimerClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

/** The page's own document where there is one. */
export const pageVisibility = (): VisibilityLike | undefined =>
  typeof document === 'undefined' ? undefined : (document as unknown as VisibilityLike)

/**
 * Call `fn` after `ms` of the page being visible. Returns a cancel.
 *
 * Counted from the last time the page came back rather than paused and
 * resumed: a decoder that has just been woken needs its whole allowance, not
 * the remainder of one that ran out while it slept.
 */
export function timeoutWhileVisible(
  fn: () => void,
  ms: number,
  doc: VisibilityLike | undefined = pageVisibility(),
  clock: TimerClock = REAL,
): () => void {
  let timer: unknown
  let listening = false
  const onVisible = () => {
    if (doc?.hidden) return
    doc?.removeEventListener('visibilitychange', onVisible)
    listening = false
    arm()
  }
  const arm = () => {
    timer = clock.setTimeout(() => {
      timer = undefined
      if (doc?.hidden) {
        listening = true
        doc.addEventListener('visibilitychange', onVisible)
      } else fn()
    }, ms)
  }
  arm()
  return () => {
    if (timer !== undefined) clock.clearTimeout(timer)
    if (listening) doc?.removeEventListener('visibilitychange', onVisible)
    listening = false
  }
}
