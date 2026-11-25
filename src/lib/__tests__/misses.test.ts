/**
 * What a player's misses have in common (D5.2) — and, mostly, when to say
 * nothing at all.
 *
 * Serves are built by the real engine on the rig, each with a little tracker
 * noise so a group has a spread, then tagged. One history has a difference
 * planted between the serves that went in and the ones that found the net; the
 * others have none, or too few serves, and must come back empty.
 */
import { MIN_SERVES_EACH_SIDE, missesInCommon } from '../progress'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import type { ServeDials } from '../analysis/syntheticServe'
import type { Analysis } from '../analysis/types'
import type { ServeOutcome, ServeTag, Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

let clock = 0

function served(dials: Partial<ServeDials>, seed: number): Session {
  const a = sampleAnalysis({ noise: 0.004, seed, ...dials })
  const { frames: _f, ...rest } = a as Analysis
  void _f
  clock += 86_400_000
  return { ...rest, id: `serve-${clock}`, createdAt: clock } as Session
}

function history(groups: { outcome: ServeOutcome; dials: Partial<ServeDials>; n: number }[]) {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  let seed = 11
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      const s = served(g.dials, seed++)
      sessions.push(s)
      tags.push({ id: s.id, outcome: g.outcome, taggedAt: s.createdAt })
    }
  }
  return { sessions, tags }
}

heading('What the misses share')

check('a planted difference is found, and said in plain words', () => {
  // The net serves are struck lower: a shorter reach at contact.
  const { sessions, tags } = history([
    { outcome: 'in', dials: { contactReach: 1.25 }, n: 6 },
    { outcome: 'net', dials: { contactReach: 1.05 }, n: 6 },
  ])
  const found = missesInCommon(sessions, tags)
  note(found.map((f) => `${f.line} (${f.signal}, ${f.strength}×)`).join(' · ') || 'nothing')
  const net = found.find((f) => f.miss === 'net')
  assert(Boolean(net), 'a real difference between the net serves and the rest went unsaid')
  assert(net!.signal === 'contact_height_ratio', `the net serves were described by ${net!.signal}`)
  assert(net!.line === 'Your serves into the net had contact lower.', `the line read "${net!.line}"`)
})

check('the same serve, tagged two ways, has nothing in common to report', () => {
  // A null history: in and net drawn from one serve. Anything said here would
  // be the noise talking.
  const { sessions, tags } = history([
    { outcome: 'in', dials: {}, n: 7 },
    { outcome: 'net', dials: {}, n: 7 },
  ])
  const found = missesInCommon(sessions, tags)
  assert(found.length === 0, `a null history produced: ${found.map((f) => f.line).join(' / ')}`)
})

check('too few serves on one side says nothing, however big the gap', () => {
  const { sessions, tags } = history([
    { outcome: 'in', dials: { contactReach: 1.25 }, n: 6 },
    { outcome: 'net', dials: { contactReach: 1.05 }, n: MIN_SERVES_EACH_SIDE - 1 },
  ])
  assert(missesInCommon(sessions, tags).length === 0, 'four net serves were enough to say something')
})

check('a kick is never compared with flat serves', () => {
  const flat = history([{ outcome: 'in', dials: { contactReach: 1.25 }, n: 6 }])
  const kick = history([{ outcome: 'net', dials: { contactReach: 1.05 }, n: 6 }])
  const sessions = [...flat.sessions, ...kick.sessions.map((s) => ({ ...s, serveType: 'kick' as const }))]
  const found = missesInCommon(sessions, [...flat.tags, ...kick.tags], 'flat')
  assert(found.length === 0, 'flat serves that went in were set against kicks that didn’t')
})

report()
