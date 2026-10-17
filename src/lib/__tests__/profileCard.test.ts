/**
 * The serve profile and the graduation card (L3.12).
 *
 * The profile describes a trip without grading it, so the test is that it
 * tells serves apart: distinct rig dials give distinct profiles. The card is a
 * retired fault's then and now, drawn from the poses every report keeps and
 * shared only through its button.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { serveProfile } from '../serveProfile'
import { graduationCard } from '../graduationCard'
import { graduation } from '../graduation'
import { renderGraduationCard } from '../share/reportCard'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import Progress from '../../screens/Progress'
import type { ServeDials } from '../analysis/syntheticServe'
import type { Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function rigTrip(day: number, dials: Partial<ServeDials>, count = 3): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const { frames: _f, ...a } = sampleAnalysis({ ...dials, seed: day * 10 + i + 1 })
    void _f
    return { ...a, id: `serve-pc${day}x${i}-0`, createdAt: day * DAY + i * HOUR, scoringVersion: 5 } as Session
  })
}

heading('How you serve: described, and different for different serves')

const SERVES: Record<string, Partial<ServeDials>> = {
  'straight legs': {},
  'loaded legs': { trophyKneeAngle: 133, contactHipHeight: 1.09 },
  'low reach': { contactReach: 1.0 },
  'arm held up': { tossArmHold: 0.85 },
  'full drop': { trophyKneeAngle: 133, contactHipHeight: 1.09, dropBelowShoulder: 0.3 },
}

check('distinct rig dials give distinct profiles', () => {
  const profiles = Object.entries(SERVES).map(([name, dials]) => ({ name, lines: serveProfile(rigTrip(0, dials)) }))
  for (const p of profiles) note(`${p.name}: ${p.lines.map((l) => l.tag).join(' · ')}`)
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = JSON.stringify(profiles[i].lines)
      const b = JSON.stringify(profiles[j].lines)
      assert(a !== b, `"${profiles[i].name}" and "${profiles[j].name}" read the same`)
    }
  }
})

check('a profile is words, and a reading seen on too few serves is left out', () => {
  const lines = serveProfile(rigTrip(0, {}))
  assert(lines.length >= 6, `only ${lines.length} rows described`)
  assert(lines.every((l) => !/\d/.test(l.tag)), 'a number reached the profile')
  assert(lines.every((l) => !('status' in l) && !('score' in l)), 'a profile row carries a grade')
  assert(serveProfile([]).length === 0, 'an empty trip was described')
})

heading('The graduation card')

const NO_DROP: Partial<ServeDials> = { dropBelowShoulder: -0.25 }
const history = [...rigTrip(0, NO_DROP), ...rigTrip(3, {}), ...rigTrip(6, {})]

check('a fixed fault draws a serve that showed it beside a clean one, each dated', () => {
  const g = graduation(history, 'shallow_drop')
  assert(g !== undefined, 'the drop did not graduate on the rig history')
  const card = graduationCard(history, g!)!
  note(`${card.name} at ${card.moment}: then ${new Date(card.then.at).toISOString()}, now ${new Date(card.now.at).toISOString()}`)
  assert(card !== undefined && card.then.at < g!.since && card.now.at >= g!.since, 'the two halves are on the wrong sides of the fix')
  assert(card.then.frame.image.length === 33 && card.now.frame.image.length === 33, 'a figure is missing its landmarks')
  // A history whose reports kept no poses has nothing to draw.
  const bare = history.map((s) => ({ ...s, track: undefined, poses: undefined }) as Session)
  assert(graduationCard(bare, g!) === undefined, 'a card was made with no figure to draw')
})

await check('the card renders its name, its line and both dates', async () => {
  const card = graduationCard(history, graduation(history, 'shallow_drop')!)!
  const texts: string[] = []
  let strokes = 0
  let fills = 0
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (key === 'fillText') return (t: string) => texts.push(String(t))
      if (key === 'measureText') return (t: string) => ({ width: String(t).length * 14 })
      if (key === 'stroke') return () => strokes++
      if (key === 'fill') return () => fills++
      if (key in target) return target[key as string]
      return () => {}
    },
    set(target, key, value) {
      target[key as string] = value
      return true
    },
  })
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: unknown) => void) => cb({ size: 1 }) }
  const doc = globalThis as unknown as { document?: { createElement: (t: string) => unknown } }
  const had = doc.document
  doc.document = { createElement: () => canvas }
  try {
    assert((await renderGraduationCard(card)) !== undefined, 'no image came back')
  } finally {
    doc.document = had
  }
  const all = texts.join(' | ')
  note(all)
  assert(texts.includes('FIXED') && texts.includes(card.name), 'the heading or the fault is missing')
  assert(/THEN · \d{4}-\d{2}-\d{2}/.test(all) && /NOW · \d{4}-\d{2}-\d{2}/.test(all), 'a half is undated')
  assert(/clean on/.test(all), 'the graduation line is missing')
  // Limbs are filled bands since L4.4, the racket and the ball stroked.
  assert(strokes + fills > 10, `only ${strokes} strokes and ${fills} fills: the figures were not drawn`)
})

check('the progress screen offers the card, and the profile, without a grade in either', () => {
  const sessions = [...history].sort((a, b) => b.createdAt - a.createdAt)
  const html = renderToStaticMarkup(
    createElement(Progress, { sessions, onBack: () => {}, onLogDrill: () => {}, onUndoDrill: () => {}, seeded: false }),
  )
  // Inside the one share button since L4.9.
  assert(html.includes('Share your progress') && html.includes('Racket drop fixed'), 'the share for the fixed drop is missing')
  assert(html.includes('How you served'), 'the profile is missing')
})

report()
