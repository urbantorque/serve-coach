/**
 * Personal bests as body positions (L3.8), on seeded readings and on the rig.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { bodyBestLine, bodyBests } from '../bests'
import { CARD_NOISE_SD } from '../analysis/cardNoise'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import Progress from '../../screens/Progress'
import type { Session } from '../storage/db'
import type { ServeDials } from '../analysis/syntheticServe'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let n = 0
/** A serve whose racket drop read `value`, the card's band and confidence included. */
function serve(at: number, value: number, confidence = 1): Session {
  return {
    id: `serve-b${n++}-0`,
    createdAt: at,
    overall: 70,
    serveType: 'flat',
    scoringVersion: 5,
    triage: { status: 'ok' },
    fundamentals: [
      { id: 'swing', score: 70, metrics: [{ id: 'dropDepth', label: 'Racket drop', value, ideal: [-0.1, 0.3], confidence, score: 70 }] },
    ],
  } as unknown as Session
}
const trip = (day: number, values: number[], confidence = 1) => values.map((v, i) => serve(day * DAY + i * HOUR, v, confidence))

heading('A best is a new rung, towards the target, past the camera')

check('a first trip has nothing to be a best against', () => {
  assert(bodyBests(trip(0, [0.2, 0.2, 0.2])).length === 0, 'a first trip set a best')
})

check('reaching the target rung for the first time is a best, said as the body position', () => {
  const bests = bodyBests([...trip(0, [-0.2, -0.18, -0.22]), ...trip(3, [0.15, 0.18, 0.2])])
  note(bests.map(bodyBestLine).join(' | ') || 'none')
  assert(bests.length === 1 && bodyBestLine(bests[0]) === 'Racket drop: first trip at "Hand below the shoulder".', JSON.stringify(bests))
})

check('a rung reached before is not a best again', () => {
  const sessions = [...trip(0, [0.15, 0.16, 0.17]), ...trip(3, [-0.2, -0.2, -0.2]), ...trip(6, [0.2, 0.2, 0.2])]
  assert(bodyBests(sessions).length === 0, 'a rung already reached was celebrated twice')
})

check('a crossing inside the camera\'s own wobble is not a best', () => {
  // The rung edge is 0.1; the earlier trip sat just below it and this one just above.
  const edge = 0.1
  const wobble = 1.5 * CARD_NOISE_SD.dropDepth
  const sessions = [...trip(0, [edge - 0.004, edge - 0.004, edge - 0.004]), ...trip(3, [edge + 0.002, edge + 0.002, edge + 0.002])]
  note(`margin ${wobble.toFixed(4)}`)
  assert(bodyBests(sessions).length === 0, 'a crossing smaller than the camera moves the reading was a best')
})

check('moving away from the target is never a best', () => {
  const sessions = [...trip(0, [0.15, 0.15, 0.15]), ...trip(3, [0.5, 0.5, 0.5])]
  assert(bodyBests(sessions).length === 0, 'going past the band to a new rung was called a best')
})

check('approximate readings and thin trips do not count', () => {
  assert(bodyBests([...trip(0, [-0.2, -0.2, -0.2]), ...trip(3, [0.2, 0.2, 0.2], 0.3)]).length === 0, 'readings the card did not stand behind set a best')
  assert(bodyBests([...trip(0, [-0.2, -0.2, -0.2]), ...trip(3, [0.2, 0.2])]).length === 0, 'a trip of two set a best')
})

heading('On the rig')

function rigTrip(day: number, dials: Partial<ServeDials>): Session[] {
  return Array.from({ length: 3 }, (_, i) => {
    const { frames: _f, ...a } = sampleAnalysis({ ...dials, seed: day * 10 + i + 1 })
    void _f
    return { ...a, id: `serve-rb${day}x${i}-0`, createdAt: day * DAY + i * HOUR, scoringVersion: 5 } as Session
  })
}

const before = rigTrip(0, { dropBelowShoulder: -0.25 })
const after = rigTrip(3, { dropBelowShoulder: 0.35 })

check('a racket that starts falling sets the best, on its own rung', () => {
  const bests = bodyBests([...before, ...after])
  note(bests.map(bodyBestLine).join(' | ') || 'none')
  assert(bests.some((b) => b.metricId === 'dropDepth' && b.tag === 'Hand below the shoulder'), 'the rig\'s drop did not set its best')
  assert(bodyBests([...before, ...rigTrip(3, { dropBelowShoulder: -0.25 })]).length === 0, 'the same serve again set a best')
})

check('the progress screen lists it with the records', () => {
  const sessions = [...before, ...after].sort((a, b) => b.createdAt - a.createdAt)
  const html = renderToStaticMarkup(
    createElement(Progress, { sessions, onBack: () => {}, onLogDrill: () => {}, onUndoDrill: () => {}, seeded: false }),
  )
  assert(html.includes('first trip at &quot;Hand below the shoulder&quot;'), 'the best did not render')
})

report()
