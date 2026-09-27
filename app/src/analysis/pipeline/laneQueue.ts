/**
 * A keyed job queue over a fixed set of lanes: the Pass B pose workers, which take serve windows in
 * parallel (orchestrator). Jobs are keyed by everything their result depends on, and a job can be
 * queued ahead as speculative (wanted later, maybe) and then asked for as final.
 *
 * - `request(key, payload, final)` returns the job's result. A key already requested returns the same
 *   job (queued, running or done), so a window whose inputs came out the same as a speculative guess
 *   reuses that work; a request with final = true promotes a queued speculative job.
 * - Each lane runs one job at a time: queued final jobs first (in request order), then speculative
 *   ones. A job's result depends only on its payload, never on the lane that ran it (the caller
 *   gives every lane the same settings).
 * - `close()` (after the last request) drops speculative jobs nobody asked for as final that have not
 *   started, and stops the lanes once the final ones are done. A new key after close() is refused.
 */
export class LaneQueue<L, P, T> {
  private readonly jobs = new Map<string, Job<P, T>>()
  private readonly waiting: Job<P, T>[] = []
  private readonly idleLanes: (() => void)[] = []
  private closed = false
  private readonly done: Promise<void>

  constructor(
    lanes: readonly L[],
    private readonly run: (payload: P, lane: L) => Promise<T>,
  ) {
    this.done = Promise.all(lanes.map((lane) => this.pump(lane))).then(() => undefined)
  }

  /** The job for `key` (created from `payload` if new). final = true marks it needed by the result. */
  request(key: string, payload: P, final: boolean): Promise<T> {
    let job = this.jobs.get(key)
    if (!job) {
      if (this.closed) return Promise.reject(new Error('lane queue is closed'))
      job = newJob(key, payload, final)
      this.jobs.set(key, job)
      this.waiting.push(job)
      this.wake()
    } else if (final) {
      job.final = true
    }
    return job.promise
  }

  /** Removes a job that has not started (its requests reject); false when it ran or is running. */
  drop(key: string): boolean {
    const k = this.waiting.findIndex((job) => job.key === key)
    if (k < 0) return false
    const [job] = this.waiting.splice(k, 1)
    this.jobs.delete(key)
    job.reject(new Error('job dropped'))
    return true
  }

  /** Whether a job for this key exists (queued, running or done). */
  has(key: string): boolean {
    return this.jobs.has(key)
  }

  /** Jobs that ran (or are running) and were never requested as final. */
  get wasted(): number {
    let n = 0
    for (const job of this.jobs.values()) if (job.started && !job.final) n++
    return n
  }

  /** Drops queued speculative jobs; lanes finish what they hold and stop when nothing final is left. */
  close(): Promise<void> {
    this.closed = true
    for (let k = this.waiting.length - 1; k >= 0; k--) {
      const job = this.waiting[k]
      if (!job.final) {
        this.waiting.splice(k, 1)
        this.jobs.delete(job.key)
        job.reject(new Error('speculative job dropped'))
      }
    }
    this.wake()
    return this.done
  }

  private next(): Job<P, T> | undefined {
    const k = this.waiting.findIndex((job) => job.final)
    return this.waiting.splice(k >= 0 ? k : 0, 1)[0]
  }

  private wake(): void {
    for (const resolve of this.idleLanes.splice(0)) resolve()
  }

  private async pump(lane: L): Promise<void> {
    for (;;) {
      const job = this.next()
      if (!job) {
        if (this.closed) return
        await new Promise<void>((resolve) => this.idleLanes.push(resolve))
        continue
      }
      job.started = true
      try {
        job.resolve(await this.run(job.payload, lane))
      } catch (error) {
        job.reject(error)
      }
    }
  }
}

interface Job<P, T> {
  key: string
  payload: P
  final: boolean
  started: boolean
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function newJob<P, T>(key: string, payload: P, final: boolean): Job<P, T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  promise.catch(() => undefined) // a dropped or failed job is observed only by those who asked for it
  return { key, payload, final, started: false, promise, resolve, reject }
}
