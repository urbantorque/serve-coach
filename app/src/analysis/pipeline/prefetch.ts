/**
 * Decode-ahead with a bounded queue. Frame sources are async generators: they only decode while
 * someone awaits next(), so a pose loop that waits for an inference result also stops the decoder.
 * In Pass A that serialised decode and pose (a 4 Hz scan decodes 15 frames per pose frame: about
 * 20 ms of decode, then about 28 ms of inference, one after the other). prefetch() pulls up to
 * `depth` items ahead in its own task, so decoding runs while the consumer works.
 *
 * Every item is handed to the consumer exactly once or released: items still queued when the
 * consumer stops (break, error, abort) go to `release` (close the frame or bitmap), and the source
 * iterator is returned. Memory is bounded by `depth` items plus the one the source is producing.
 */
export async function* prefetch<T>(source: AsyncIterable<T>, depth: number, release: (item: T) => void): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]()
  const limit = Math.max(1, Math.floor(depth))
  const queue: T[] = []
  let finished = false
  let failure: { error: unknown } | null = null
  let stopped = false
  let wakeConsumer: (() => void) | null = null
  let wakeProducer: (() => void) | null = null
  const signalConsumer = () => {
    const wake = wakeConsumer
    wakeConsumer = null
    wake?.()
  }
  const signalProducer = () => {
    const wake = wakeProducer
    wakeProducer = null
    wake?.()
  }
  const pump = (async () => {
    try {
      while (!stopped) {
        if (queue.length >= limit) {
          await new Promise<void>((resolve) => (wakeProducer = resolve))
          continue
        }
        const next = await iterator.next()
        if (next.done) break
        if (stopped) {
          release(next.value)
          break
        }
        queue.push(next.value)
        signalConsumer()
      }
    } catch (error) {
      failure = { error }
    } finally {
      finished = true
      signalConsumer()
    }
  })()
  try {
    for (;;) {
      if (queue.length > 0) {
        const item = queue.shift() as T
        signalProducer()
        yield item
        continue
      }
      if (failure) throw (failure as { error: unknown }).error
      if (finished) break
      await new Promise<void>((resolve) => (wakeConsumer = resolve))
    }
  } finally {
    stopped = true
    signalProducer()
    // The producer may be inside next(): let it settle (an aborted decoder rejects at once).
    await pump
    for (const item of queue.splice(0)) release(item)
    await iterator.return?.(undefined)
  }
}
