/**
 * The serve finder against serve times marked by eye (W6.11).
 *
 * `docs/apex/bench/serve-times.json` holds the contact of every serve in the
 * four licensed bench clips, marked from contact sheets, and the overheads and
 * high swings that are not serves. `scanSamples.json` holds what the app's scan
 * read in each clip (`scripts/scan-samples.mjs`, run in the dev server). Here
 * the judging that turns those readings into serves runs in Node, so a change
 * to it is scored against the marks without a browser.
 *
 * Only the judging is under test: the readings are fixed. The scan read twice
 * does not read the same numbers (the pose model follows the body from one
 * reading to the next), so a run in the app can still differ from this.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { MIN_SERVE_GAP, TOSS_TO_HIT, classifyServes, type ReachSample } from '../serves'
import { assert, check, heading, note, report } from './harness'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }
const at = (p: string) => path.join(process.cwd(), p)

interface Mark {
  t: number
  slow?: boolean
  part?: boolean
  what?: string
}
interface Marked {
  note: string
  serves: Mark[]
  notServes: Mark[]
}
interface Scanned {
  duration: number
  found?: number[]
  unsure: number[]
  onsets?: number[]
  samples: ReachSample[]
}
const marks = JSON.parse(fs.readFileSync(at('docs/apex/bench/serve-times.json'), 'utf8')) as {
  clips: Record<string, Marked>
}
const scans = JSON.parse(fs.readFileSync(at('src/lib/analysis/__tests__/scanSamples.json'), 'utf8')) as {
  clips: Record<string, Scanned>
}

/**
 * How far a found time may sit from a marked contact and still be that serve:
 * the reach peaks a little after contact, and the scan reads every twelfth of
 * a second at best. Under half the gap that keeps two serves apart.
 */
const MATCH = 0.6

interface Score {
  clip: string
  /** Serves at normal speed with the whole motion in the picture. */
  plain: Mark[]
  hit: Mark[]
  missed: Mark[]
  /** Found times near a mark that is not a serve. */
  wrong: { t: number; what: string }[]
  /** Found times near nothing marked. */
  stray: number[]
  /** Serves marked but judged not sure: the shape test turned them away. */
  doubted: Mark[]
}

function score(clip: string, judge = classifyServes): Score {
  const m = marks.clips[clip]
  const scan = scans.clips[clip]
  const finds = judge(scan.samples)
  const near = (t: number, mark: Mark) => Math.abs(t - mark.t) <= MATCH
  const plain = m.serves.filter((s) => !s.slow && !s.part)
  return {
    clip,
    plain,
    hit: plain.filter((s) => finds.serves.some((t) => near(t, s))),
    missed: plain.filter((s) => !finds.serves.some((t) => near(t, s))),
    wrong: finds.serves.flatMap((t) => {
      const o = m.notServes.find((x) => near(t, x))
      return o ? [{ t, what: o.what ?? 'not a serve' }] : []
    }),
    stray: finds.serves.filter((t) => ![...m.serves, ...m.notServes].some((x) => Math.abs(t - x.t) <= MIN_SERVE_GAP)),
    doubted: plain.filter((s) => finds.unsure.some((t) => near(t, s))),
  }
}

/** What the finder managed when the marks were made; raised as it improves, never lowered. */
const FLOOR = { hit: 12, wrong: 2 }

const clips = Object.keys(marks.clips).filter((c) => scans.clips[c])

heading('The serve finder against serve times marked by eye (W6.11)')

check('every marked clip has its scan saved, and every saved scan its marks', () => {
  for (const c of Object.keys(marks.clips)) assert(Boolean(scans.clips[c]), `${c} has marks but no saved scan`)
  for (const c of Object.keys(scans.clips)) assert(Boolean(marks.clips[c]), `${c} has a saved scan but no marks`)
})

check('the saved judging is the judging the scan ran', () => {
  // A change to the judging moves what it finds in the saved readings away
  // from what the scan reported when they were saved; that is the point, and
  // the script is then run again so the two agree.
  for (const c of clips) {
    const got = classifyServes(scans.clips[c].samples)
    const was = scans.clips[c].found ?? []
    note(`${c}: found ${got.serves.map((t) => t.toFixed(2)).join(', ') || 'none'}; not sure ${got.unsure.map((t) => t.toFixed(2)).join(', ') || 'none'}`)
    assert(
      JSON.stringify(got.serves.map((t) => t.toFixed(2))) === JSON.stringify(was.map((t) => t.toFixed(2))),
      `${c}: the judging now finds ${got.serves.map((t) => t.toFixed(2))} where the saved scan found ${was.map((t) => t.toFixed(2))}; run scripts/scan-samples.mjs again`,
    )
  }
})

check('how many marked serves the finder finds, and what else it takes for one', () => {
  const all = clips.map((c) => score(c))
  for (const s of all) {
    note(
      `${s.clip}: ${s.hit.length} of ${s.plain.length} serves` +
        (s.missed.length ? `, missed ${s.missed.map((x) => x.t).join(', ')}` : '') +
        (s.doubted.length ? ` (not sure of ${s.doubted.map((x) => x.t).join(', ')})` : '') +
        (s.wrong.length ? `; took ${s.wrong.map((w) => `${w.what} at ${w.t.toFixed(1)}`).join(', ')}` : '') +
        (s.stray.length ? `; ${s.stray.length} found near nothing marked (${s.stray.map((t) => t.toFixed(1)).join(', ')})` : ''),
    )
  }
  const hit = all.reduce((n, s) => n + s.hit.length, 0)
  const plain = all.reduce((n, s) => n + s.plain.length, 0)
  note(`in all: ${hit} of ${plain} serves at normal speed`)
  // The floor this change set, never to be lowered: a change that finds fewer
  // marked serves fails here.
  assert(hit >= FLOOR.hit, `found ${hit} of ${plain} marked serves, fewer than the ${FLOOR.hit} found before`)
  const taken = all.reduce((n, s) => n + s.wrong.length, 0)
  assert(taken <= FLOOR.wrong, `took ${taken} marked non-serves for serves, more than the ${FLOOR.wrong} before`)
})

check('a serve whose toss reached highest is found at its hit, and a caught toss isn’t (W6.11)', () => {
  // The hands as negated image y, the head at -0.35, feet still. The tossing
  // (left) arm peaks at 1.0 s, higher than the racket (right) hand at 1.5 s.
  const sample = (t: number, left: number, right: number): ReachSample => ({
    t,
    height: Math.max(left, right),
    pose: { left, right, head: -0.35, feetX: 0.5, feetY: 0.9 },
  })
  const serve = (at: number, hit = true) =>
    Array.from({ length: 25 }, (_, i) => {
      const t = i / 12
      const left = t < 0.3 ? -0.6 : t < 1.2 ? -0.2 - Math.abs(t - 1) * 0.3 : -0.6
      const right = hit && t > 1.3 && t < 1.7 ? -0.25 - Math.abs(t - 1.5) * 0.3 : -0.6
      return sample(at + t, left, right)
    })
  const rest = (from: number, to: number) => Array.from({ length: Math.round((to - from) * 12) }, (_, i) => sample(from + i / 12, -0.6, -0.6))
  const clip = [...rest(0, 2), ...serve(2), ...rest(4.1, 6), ...serve(6), ...rest(8.1, 10), ...serve(10, false), ...rest(12.1, 20)]
  const finds = classifyServes(clip)
  note(`found ${finds.serves.map((t) => t.toFixed(2)).join(', ')}; not sure ${finds.unsure.map((t) => t.toFixed(2)).join(', ')}`)
  assert(finds.serves.length === 2, `found ${finds.serves.length} serves, not 2`)
  assert(finds.serves.every((t, i) => Math.abs(t - [3.5, 7.5][i]) < 0.1), 'a serve wasn’t placed at its hit')
  assert(!finds.serves.some((t) => t > 9), 'a caught toss was called a serve')
  assert(TOSS_TO_HIT < MIN_SERVE_GAP, 'the hit after a toss can land past the next serve')
})

check('a clip where nobody tosses has no serves, however high the hands go (W6.11)', () => {
  // A receiver's swings: the racket hand high, the other never above the
  // head, feet still. Every peak fails the toss, which no camera can fake, so
  // none is a serve; they go to the not-sure list instead.
  const sample = (t: number, high: number): ReachSample => ({
    t,
    height: high,
    pose: { left: -0.6, right: high, head: -0.35, feetX: 0.5, feetY: 0.9 },
  })
  const clip = Array.from({ length: 20 * 12 }, (_, i) => {
    const t = i / 12
    const d = Math.min(...[4, 9, 14].map((p) => Math.abs(t - p)))
    return sample(t, d < 0.4 ? -0.2 - d * 0.5 : -0.6)
  })
  const finds = classifyServes(clip)
  note(`found ${finds.serves.length}; not sure ${finds.unsure.map((t) => t.toFixed(2)).join(', ')}`)
  assert(finds.serves.length === 0, `called ${finds.serves.length} swings with no toss serves`)
  assert(finds.unsure.length === 3, `${finds.unsure.length} of 3 swings were put on the not-sure list`)
})

check('the saved match clips: what the stricter shape took out, it took from the non-serves', () => {
  // The match clip's camera follows play, so its feet are not believed, and
  // the receiver's clip has no toss in it. Before W6.11 both were judged on
  // reach alone: seven non-serves called serves. A marked serve on the
  // not-sure list would mean the shape had cost a real one.
  for (const c of clips) {
    const s = score(c)
    assert(s.doubted.length === 0, `${c}: the marked serve at ${s.doubted.map((x) => x.t).join(', ')} was put aside as not sure`)
  }
})

report()
