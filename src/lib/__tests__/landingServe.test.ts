/**
 * The landing's real serve (Apex F): the words beside it are its own read, on
 * today's rubric, and the replay draws what that read is about.
 *
 * `scripts/landing-serve.mjs` reads the licensed clip once with the engine and
 * saves the card beside a trimmed copy. Nothing re-runs the pose model here; the
 * card is re-scored with the code that scores every saved report, so a change
 * to the card's bands moves the read and fails this until the landing's words
 * follow, and a change to a measurement fails it until the script is run again.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { pickFocus } from '../analysis/analyze'
import { overallOf } from '../analysis/coaching'
import { rescoreStoredCard } from '../analysis/metrics'
import { SCORING_VERSION, rescorable, type Analysis, type Fundamental } from '../analysis/types'
import { rowParts } from '../figure/swing'
import { LANDING_CREDIT } from '../figure/modelCredit'
import { LANDING_PEEK } from '../samplePeek'
import type { LandingReplay } from '../../components/FirstRunStage'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e?: 'utf8') => string & { length: number }; existsSync: (p: string) => boolean }
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }
const at = (p: string) => path.join(process.cwd(), p)

interface Read {
  clip: string
  scoringVersion: number
  serveType: NonNullable<Analysis['serveType']>
  overall: number
  handedness: 'left' | 'right'
  focus: { title: string; drill: { name: string; reps: string } }
  row?: string
  fundamentals: Fundamental[]
}
const read = JSON.parse(fs.readFileSync(at('src/lib/__tests__/landingServe.read.json'), 'utf8')) as Read
const replay = JSON.parse(fs.readFileSync(at('public/landing/serve.json'), 'utf8')) as LandingReplay

heading('The words beside the landing’s serve are its own read')

const current = read.scoringVersion === SCORING_VERSION
const card = current ? read.fundamentals : rescoreStoredCard(read.fundamentals, read.serveType)

check('the read is on today’s rubric, or can be brought onto it', () => {
  assert(current || rescorable(read.scoringVersion), `saved on ${read.scoringVersion}, a measurement changed since: run node scripts/landing-serve.mjs`)
})

check('the score, the first fix and its drill are the read’s own', () => {
  const overall = overallOf(card)
  const focus = pickFocus(card)
  note(`${read.clip}: ${overall}, "${focus.title}", ${focus.drill.name} (${focus.drill.reps})`)
  assert(overall === LANDING_PEEK.score, `the read scores ${overall}, the landing says ${LANDING_PEEK.score}`)
  assert(focus.title === LANDING_PEEK.fix && read.focus.title === LANDING_PEEK.fix, `the read's first fix is "${focus.title}"`)
  assert(focus.drill.name === LANDING_PEEK.drill && focus.drill.reps === LANDING_PEEK.reps, `its drill is "${focus.drill.name}", ${focus.drill.reps}`)
})

heading('The replay draws what the read is about')

check('it holds at the fix’s own moment, with that row’s part picked out', () => {
  const row = card.flatMap((f) => f.metrics).find((m) => m.label === read.focus.title)
  assert(!!row && row.id === read.row, `no card row for "${read.focus.title}"`)
  assert(replay.moment === row!.phase, `held at ${replay.moment}, the row is read at ${row!.phase}`)
  assert(JSON.stringify(replay.work) === JSON.stringify(rowParts(row!.id, read.handedness)), `paints ${replay.work.join(' ')}`)
})

check('the stage’s words say what it shows: the racket drop and the hitting arm', () => {
  // FirstRunStage's label names both; this keeps them true if the read moves.
  assert(replay.moment === 'drop', `the moment is ${replay.moment}`)
  assert(replay.work.length > 0 && replay.work.every((w) => w.startsWith(replay.handedness)), `the part is ${replay.work.join(' ')}`)
})

check('the points fit the clip: whole bodies, in time, upright, the moment inside', () => {
  assert(replay.tilt === 0, 'a tilted clip needs its points put back on the raw picture first')
  assert(replay.frames.every((f) => f.image.length === 66), 'a frame without 33 points')
  assert(replay.frames.every((f, i) => i === 0 || f.t > replay.frames[i - 1].t), 'frames out of order')
  const held = replay.phases.find((p) => p.id === replay.moment)
  assert(!!held && held.frame >= 0 && held.frame < replay.frames.length, 'the moment is outside the frames kept')
  assert(Math.abs(replay.frames[held!.frame].t - held!.t) < 0.02, 'the moment’s frame is not at its time')
  assert(replay.phases.some((p) => p.id === 'toss'), 'no toss to slow down at')
  assert(replay.world.length === 33, 'the held moment has no 3D points for its near side')
})

heading('Small, credited, and not in every visitor’s download')

check('the clip is small, and fetched only by the landing', () => {
  const clip = fs.readFileSync(at('public/landing/serve.mp4'))
  note(`serve.mp4 ${(clip.length / 1024).toFixed(0)} kB, serve.json ${(fs.readFileSync(at('public/landing/serve.json')).length / 1024).toFixed(0)} kB`)
  assert(clip.length < 200 * 1024, `the clip is ${clip.length} bytes`)
  const config = fs.readFileSync(at('vite.config.ts'), 'utf8')
  const globs = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? ''
  assert(globs.length > 0 && !/mp4|json/.test(globs), `the worker would precache it: ${globs}`)
})

check('the clip’s author and licence are credited, on the stage and with the credits', () => {
  assert(LANDING_CREDIT.includes(replay.source.author) && LANDING_CREDIT.includes(replay.source.licence), LANDING_CREDIT)
  assert(/^https:\/\/commons\.wikimedia\.org\//.test(replay.source.url), replay.source.url)
  // bench-data is not in the repository, so the clip's own attribution file is
  // not read here: the script writes the same author and licence it lists.
})

report()
