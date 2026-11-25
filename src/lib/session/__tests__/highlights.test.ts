/**
 * The best and worst serves of a session, kept as stretches of the file and
 * never as copies of it (L2.11).
 *
 * A session's video can run to gigabytes, and the clip store (`clipStore.ts`)
 * keeps whole files. So what a session keeps is times, and the file is found
 * again by its identity when the player picks it. These checks hold the times,
 * the identity, and the source: nothing on the session's path writes the file.
 */
// No @types/node, the same shim `egress.test.ts` explains.
declare const process: { cwd(): string }
// @ts-expect-error: node's fs, untyped here.
import fsUntyped from 'fs'
// @ts-expect-error: node's path, untyped here.
import pathUntyped from 'path'
import { HIGHLIGHT_AFTER, HIGHLIGHT_BEFORE, extremes, highlightsOf } from '../stats'
import { normalisePracticeSession, sessionIdFor, type ServeLine } from '../session'
import { fileKeyOf } from '../../storage/sessionKey'
import { assert, check, heading, near, report } from '../../analysis/__tests__/harness'

const fs: {
  readdirSync: (p: string) => string[]
  readFileSync: (p: string, e: 'utf8') => string
} = fsUntyped
const path: { join: (...parts: string[]) => string } = pathUntyped

const lines: ServeLine[] = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1,
  t: 1 + i * 15,
  status: i === 5 ? 'unclear' : 'read',
  ...(i === 5 ? {} : { overall: 50 + ((i * 7) % 23) }),
}))

heading('Stretches of the file')

check('the best and worst serves become a stretch around each, inside the file', () => {
  const duration = 1 + 11 * 15 + 0.5
  const hs = highlightsOf(lines, duration)
  const { best, worst } = extremes(lines)
  assert(JSON.stringify(hs.map((h) => h.number)) === JSON.stringify([...best, ...worst]), 'not the best and worst serves')
  for (const h of hs) {
    const t = lines[h.number - 1].t
    near(h.from, Math.max(0, t - HIGHLIGHT_BEFORE), 1e-9, `serve ${h.number} starts`)
    near(h.to, Math.min(duration, t + HIGHLIGHT_AFTER), 1e-9, `serve ${h.number} ends`)
  }
  assert(hs.every((h) => h.from >= 0 && h.to <= duration && h.to > h.from), 'a stretch ran outside the file')
  assert(!hs.some((h) => h.number === 6), 'an unclear serve was kept as a highlight')
})

check('a stored row keeps its stretches and drops anything that isn’t one', () => {
  const back = normalisePracticeSession({
    id: sessionIdFor('k'),
    createdAt: 1,
    duration: 200,
    lines: [],
    phase: 'done',
    highlights: [
      { number: 3, kind: 'best', from: 29, to: 32 },
      { number: 4, kind: 'best', from: 32, to: 29 },
      { number: 'x', kind: 'worst', from: 1, to: 2 },
      { number: 9, kind: 'middling', from: 1, to: 2 },
    ],
  })!
  assert(back.highlights?.length === 1 && back.highlights[0].number === 3, JSON.stringify(back.highlights))
})

heading('The same file, found again')

check('a file is known by its name, size and time, and by nothing it doesn’t keep', () => {
  const clip = { name: 'Tuesday basket.mov', size: 2_147_483_648, lastModified: 1_760_000_000_000 }
  assert(fileKeyOf(clip) === fileKeyOf({ ...clip }), 'the same file was given two keys')
  for (const changed of [{ name: 'Wednesday.mov' }, { size: clip.size - 1 }, { lastModified: clip.lastModified + 1 }]) {
    assert(fileKeyOf({ ...clip, ...changed }) !== fileKeyOf(clip), `a changed file kept its key: ${JSON.stringify(changed)}`)
  }
  assert(sessionIdFor(fileKeyOf(clip)).startsWith('practice-'), 'a session id isn’t a session id')
})

heading('Never copied')

check('nothing on the session path writes the file anywhere', () => {
  const root = process.cwd()
  const dir = path.join(root, 'src', 'lib', 'session')
  const sources = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')] as const)
  // Moved out of App.tsx with the rest of the reading (L6.11).
  const app = fs.readFileSync(path.join(root, 'src', 'components', 'useAnalysisRun.ts'), 'utf8')
  const from = app.indexOf('const closeSessionVideo')
  const to = app.indexOf('const openClip = useCallback(')
  assert(from > 0 && to > from, 'the session functions in useAnalysisRun.ts weren’t found')
  sources.push(['useAnalysisRun.ts (session functions)', app.slice(from, to)])
  const writes = /keepClip\(|getDirectory\(|createWritable\(|\.arrayBuffer\(\)/
  for (const [name, text] of sources) {
    assert(!writes.test(text), `${name} writes or loads the whole file: ${text.match(writes)?.[0]}`)
  }
})

report()
