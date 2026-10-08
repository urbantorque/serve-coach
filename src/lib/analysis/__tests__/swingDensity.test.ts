/**
 * The swing read at the file's own rate inside a 32 fps clip (D1.2), on the
 * rig: what the detector does with a clip that is dense from the trophy to just
 * past contact and sparse everywhere else, against the instants the rig posed.
 *
 * The engine half of D1.2, held here so the browser pass can be wired against
 * it. It settled the question the wiring was waiting on: the drop's spread
 * widens on a dense window because its bottom is flat for tens of milliseconds
 * and more samples land on it, not because its smoothing is counted in samples
 * — smoothing it over a span of time instead was measured and made the error
 * no smaller (9.1 ms against 8.3 at 120 fps, 15.0 against 11.7 at 240).
 */
import { detectServe } from '../phases'
import { buildServe } from '../syntheticServe'
import type { Frame } from '../types'
import { assert, check, heading, note, report } from './harness'

/** The rig's posed instants for its default 1.35 s motion: 0.35 s of preroll, then `U`. */
const POSED = { drop: 0.35 + 0.89 * 1.35, contact: 0.35 + 1.35 }
const BUDGET = 120

function read(source: number, seed: number, dense: boolean) {
  const full = buildServe({ noise: 0.004, seed }, source)
  const step = source / 32
  const picked = new Set<number>()
  for (let i = 0; i < full.length; i += step) picked.add(Math.round(i))
  let frames: Frame[] = [...picked].sort((a, b) => a - b).map((i) => full[i])
  if (dense) {
    const first = detectServe(frames, 32)
    const from = frames[first.keys.trophy].t
    const to = frames[first.keys.contact].t + 0.1
    const window = full.filter((f) => f.t >= from && f.t <= to)
    // Every sample the file has in the window, thinned evenly to what is left
    // of the budget once the rest of the clip is paid for.
    const room = BUDGET - frames.filter((f) => f.t < from || f.t > to).length
    const n = Math.max(1, Math.min(window.length, room))
    const kept = Array.from({ length: n }, (_, k) => window[Math.min(window.length - 1, Math.round((k * window.length) / n))])
    const byT = new Map(frames.map((f) => [f.t, f]))
    for (const f of kept) byT.set(f.t, f)
    frames = [...byT.values()].sort((a, b) => a.t - b.t)
  }
  const s = detectServe(frames, 32)
  return { n: frames.length, contact: (s.times.contact - POSED.contact) * 1000, drop: (s.times.drop - POSED.drop) * 1000 }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const rms = (xs: number[]) => Math.sqrt(mean(xs.map((x) => x * x)))

heading('The swing at the file’s own rate')

check('a dense swing window times contact far closer, inside the frame budget', () => {
  for (const source of [60, 120, 240]) {
    const sparse = [1, 2, 3, 4, 5, 6].map((seed) => read(source, seed, false))
    const dense = [1, 2, 3, 4, 5, 6].map((seed) => read(source, seed, true))
    const c = (rs: typeof sparse) => rms(rs.map((r) => r.contact))
    const d = (rs: typeof sparse) => rms(rs.map((r) => r.drop))
    note(
      `${source} fps source: contact ${c(sparse).toFixed(1)} → ${c(dense).toFixed(1)} ms, ` +
        `drop ${d(sparse).toFixed(1)} → ${d(dense).toFixed(1)} ms, ${dense[0].n} frames`,
    )
    assert(dense.every((r) => r.n <= BUDGET + 12), `${source} fps: the dense read spent ${dense[0].n} frames`)
    // Under 4 ms at every rate, and well under the sparse read's error. At
    // 240 fps the budget thins the window to about 110 a second, which is what
    // holds it at 3.5 ms rather than 1.5.
    assert(c(dense) < 4, `${source} fps: contact still ${c(dense).toFixed(1)} ms off on the dense read`)
    assert(c(dense) < 0.6 * c(sparse), `${source} fps: the dense read timed contact little better`)
    // The drop's bottom is flat, so more samples on it spread its timing; it
    // stays inside one 32 fps sample, where nothing read at it can tell.
    assert(d(dense) < 1000 / 32, `${source} fps: the drop moved ${d(dense).toFixed(1)} ms on the dense read`)
  }
})

report()
