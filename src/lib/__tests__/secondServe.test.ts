/**
 * The second serve that slows down (L5.8): tagged first and second serves
 * compared on the time from the racket drop to the ball, said only past the
 * camera's own noise on that reading and the player's spread.
 *
 * Serves are built by the real engine on the rig with a little tracker noise,
 * the tempo set by `motionSeconds`, then tagged with a serve number.
 */
import { MIN_SERVES_EACH_SIDE, secondServeSlower } from '../progress'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { CARD_NOISE_SD } from '../analysis/cardNoise'
import { cueIssues } from '../analysis/voice'
import type { ServeDials } from '../analysis/syntheticServe'
import type { Analysis } from '../analysis/types'
import type { ServeTag, Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

let clock = 0

function served(dials: Partial<ServeDials>, seed: number): Session {
  const a = sampleAnalysis({ noise: 0.004, seed, ...dials })
  const { frames: _f, ...rest } = a as Analysis
  void _f
  clock += 86_400_000
  return { ...rest, id: `serve-${clock}`, createdAt: clock } as Session
}

function basket(firstSeconds: number, secondSeconds: number, n = 6, m = n) {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  let seed = 31
  for (const [serveNumber, motionSeconds, count] of [
    [1, firstSeconds, n],
    [2, secondSeconds, m],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const s = served({ motionSeconds }, seed++)
      sessions.push(s)
      tags.push({ id: s.id, serveNumber, taggedAt: s.createdAt })
    }
  }
  return { sessions, tags }
}

heading('The second serve that slows down')

check('a second serve swung slower is said, in words rather than milliseconds', () => {
  // 1.35 s and 1.9 s of motion read about 165 and 205 ms from the drop to
  // contact on the rig, both inside the card's own band.
  const { sessions, tags } = basket(1.35, 1.9)
  const said = secondServeSlower(sessions, tags)
  note(said ? `${said.firstMs} → ${said.secondMs} ms: ${said.line}` : 'nothing')
  assert(said !== undefined, 'a second serve 40 ms slower went unsaid')
  assert(said!.secondMs - said!.firstMs > CARD_NOISE_SD.dropToContact, 'the gap said is inside one take of noise')
  assert(cueIssues(said!.line).length === 0, `the line breaks the copy rules: ${cueIssues(said!.line).join(', ')}`)
  assert(/slower/.test(said!.line) && !/\d/.test(said!.line), `the line reads "${said!.line}"`)
})

check('the same tempo tagged both ways says nothing', () => {
  const { sessions, tags } = basket(1.35, 1.35, 7)
  const said = secondServeSlower(sessions, tags)
  assert(said === undefined, `a null basket said: ${said?.line}`)
})

check('a gap inside one take of the camera’s noise says nothing', () => {
  // 1.35 s against 1.65 s is about 10 ms of drop to contact on the rig,
  // under one take's 16.4.
  const { sessions, tags } = basket(1.35, 1.65, 8)
  const said = secondServeSlower(sessions, tags)
  assert(said === undefined, `a 10 ms gap was said: ${said?.line}`)
})

check('a faster second serve is not a fault', () => {
  const { sessions, tags } = basket(1.9, 1.35)
  assert(secondServeSlower(sessions, tags) === undefined, 'a faster second serve was called slow')
})

check('too few second serves says nothing, however big the gap', () => {
  const { sessions, tags } = basket(1.35, 2.2, 6, MIN_SERVES_EACH_SIDE - 1)
  assert(secondServeSlower(sessions, tags) === undefined, 'four second serves were enough to say it')
})

check('untagged serves are left out, not counted as first serves', () => {
  const { sessions, tags } = basket(1.35, 1.9)
  const fast = [0, 1, 2, 3, 4, 5].map((i) => served({ motionSeconds: 1.1 }, 90 + i))
  const said = secondServeSlower([...sessions, ...fast], tags)
  const alone = secondServeSlower(sessions, tags)
  assert(said?.firstMs === alone?.firstMs, 'untagged serves moved the first-serve time')
})

report()
