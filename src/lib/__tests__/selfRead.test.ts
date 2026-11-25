/**
 * A serve read against the player's own record, as the screens use it, and the
 * headline each serve gets so a list of them can be told apart.
 *
 * `baseline.test.ts` proves the sums keep their rate. This proves what reaches a
 * player: nothing below the baseline's floor, no row said twice, and a headline
 * that is true of the serve it sits on.
 */
import { sampleAnalysis, sampleHistory } from '../../dev/sampleAnalysis'
import { ROW_WORDS } from '../baseline'
import { serveStory } from '../serveStory'
import { movedTitle, selfRead } from '../selfRead'
import type { ServeTag, Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

;(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null }) }

const NOW = new Date(2026, 10, 5, 12).getTime()
const { sessions } = sampleHistory(NOW)
const newest = [...sessions].sort((a, b) => b.createdAt - a.createdAt)[0]

const serve = (over: Partial<Session> & { id: string; createdAt: number }): Session => {
  const { frames: _f, ...a } = sampleAnalysis()
  void _f
  return { ...a, scoringVersion: 5, ...over } as Session
}

heading('Against the player, and only when the record can hold it')

check('a short history says nothing', () => {
  assert(selfRead(newest, sessions.slice(0, 6)) === undefined, 'a thin history was read against')
  assert(selfRead(newest, []) === undefined, 'an empty history was read against')
})

check('the season names the move dialled into its newest serve', () => {
  const read = selfRead(newest, sessions)
  assert(read !== undefined, 'the demo season didn’t reach a baseline')
  note(read!.usual.map((f) => f.line).join(' | '))
  const knees = read!.usual.find((f) => f.metricId === 'kneeBend')
  assert(knees?.direction === 'higher', 'the knee bend went unsaid')
  assert(knees!.line.includes('bend the knees further'), 'the line didn’t say so')
})

check('a row is said once, however it is read', () => {
  const read = selfRead(newest, sessions)!
  const ids = [...read.usual, ...read.best].map((f) => f.metricId)
  assert(new Set(ids).size === ids.length, `a row was named twice: ${ids.join(', ')}`)
})

check('a serve is never read against itself or anything after it', () => {
  const older = [...sessions].sort((a, b) => a.createdAt - b.createdAt)[20]
  const alone = selfRead(older, sessions.filter((s) => s.createdAt < older.createdAt))
  assert(JSON.stringify(selfRead(older, sessions)) === JSON.stringify(alone), 'a later serve moved an earlier read')
})

heading('A headline for what moved')

check('every row the baseline can name has a headline, either way', () => {
  for (const id of Object.keys(ROW_WORDS)) {
    for (const direction of ['higher', 'lower'] as const) {
      const title = movedTitle({ metricId: id, direction })
      assert(title !== undefined && title.endsWith('than usual'), `${id} ${direction} has no headline`)
      assert(!/[—–]/.test(title!) && title!.length <= 44, `${title} doesn’t fit a card`)
    }
  }
})

heading('Each serve its own line')

const OLD = serve({ id: 'a', createdAt: NOW - 4 * 86_400_000, overall: 70, focus: { ...sampleAnalysis().focus, title: 'The fix' } })
const SAME = serve({ id: 'b', createdAt: NOW, overall: 70, focus: { ...sampleAnalysis().focus, title: 'The fix' } })

check('a refused clip says so before anything else', () => {
  const refused = { ...SAME, triage: { ...SAME.triage!, status: 'rejected', reason: 'too_blurry' } } as Session
  assert(serveStory(refused, [OLD, refused]).title === 'Too unclear to score', 'a refused serve got a headline')
})

check('a speed record needs the whole range past every earlier range', () => {
  const fast = (ms: number, low: number, high: number) => ({ speed: { ms, low, high } }) as unknown as Session['speed']
  const before = { ...OLD, speed: fast(35, 33, 37) }
  assert(serveStory({ ...SAME, speed: fast(38, 36, 40) }, [before, SAME]).title !== 'Your fastest so far', 'an overlap was called a record')
  const story = serveStory({ ...SAME, speed: fast(41, 38, 44) }, [before, SAME])
  assert(story.title === 'Your fastest so far' && story.best, 'a clear record went unsaid')
})

check('the best of a trip must be alone at the top, of three or more', () => {
  const trip = [71, 75, 73].map((overall, i) => serve({ id: `t${i}`, createdAt: NOW + i * 60_000, overall }))
  const story = serveStory(trip[1], trip)
  assert(story.title === 'Best of that session' && story.best, 'the best of the trip went unsaid')
  const tied = [75, 75, 73].map((overall, i) => serve({ id: `t${i}`, createdAt: NOW + i * 60_000, overall }))
  assert(serveStory(tied[1], tied).title !== 'Best of that session', 'a tie was called the best')
  assert(serveStory(trip[1], trip.slice(0, 2)).title !== 'Best of that session', 'two serves were called a trip')
})

check('a tagged second serve says so', () => {
  const tags = new Map<string, ServeTag>([['b', { id: 'b', serveNumber: 2 } as unknown as ServeTag]])
  assert(serveStory(SAME, [OLD, SAME], tags).title === 'Second serve', 'the tag wasn’t used')
})

check('the newest serve of the season says what it did differently', () => {
  const story = serveStory(newest, sessions)
  note(story.title)
  assert(story.title === 'Deeper knee bend than usual' || story.best, `the season's newest serve said "${story.title}"`)
})

check('a rough read doesn’t claim a move, and says what it is', () => {
  const rough = { ...SAME, quality: { ...SAME.quality, confidence: 0.3 } }
  assert(serveStory(rough, [OLD, rough]).title === 'A rough read', 'a rough read was given a headline')
})

check('with nothing else to say, a serve keeps its fix', () => {
  assert(serveStory(SAME, [OLD, SAME]).title === 'The fix', 'the fix was lost')
})

report()
