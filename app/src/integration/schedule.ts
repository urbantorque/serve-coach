/**
 * Debounced coaching sync for edits that come in bursts (tagging a serve a second, include/exclude,
 * a practice log). The sync module (and the coaching engine) loads on first use, so screens that
 * only write data stay small.
 */
let timer: ReturnType<typeof setTimeout> | undefined

export function scheduleCoachingSync(delayMs = 600): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    void import('./coachingSync.ts').then((m) => m.syncCoaching()).catch(() => undefined)
  }, delayMs)
}
