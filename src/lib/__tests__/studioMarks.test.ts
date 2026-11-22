/**
 * Studio marks (E1.2): what they read, and that they survive the store, a
 * reload and a backup, refusing what cannot be drawn.
 */
import { markDegrees, markLabel } from '../studioMarks'
import { MAX_MARKS, normaliseServeTag, withServeTag, type ServeTag, type StudioMark } from '../storage/db'
import { mergeTags } from '../storage/restore'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const line = (a: [number, number], b: [number, number]): StudioMark => ({ kind: 'line', pts: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], t: 1 })
const angle = (a: [number, number], v: [number, number], c: [number, number]): StudioMark => ({
  kind: 'angle',
  pts: [{ x: a[0], y: a[1] }, { x: v[0], y: v[1] }, { x: c[0], y: c[1] }],
  t: 1,
})

heading('What a mark reads, on the picture')

check('a plumb line is 0, a flat one 90, either way it was drawn', () => {
  assert(markDegrees(line([0.5, 0.1], [0.5, 0.9]), 1) === 0, 'plumb')
  assert(markDegrees(line([0.9, 0.5], [0.1, 0.5]), 1) === 90, 'flat')
  assert(markDegrees(line([0.2, 0.8], [0.6, 0.4]), 1) === 45, 'a diagonal on a square picture')
})

check('the picture’s shape is counted: a diagonal on a wide picture leans further', () => {
  assert(markDegrees(line([0.2, 0.8], [0.6, 0.4]), 16 / 9) > 45, 'the aspect was ignored')
})

check('an angle opens at its middle point, and says it is on the picture', () => {
  assert(markDegrees(angle([0.5, 0.2], [0.5, 0.5], [0.8, 0.5]), 1) === 90, 'a right angle')
  assert(markDegrees(angle([0.2, 0.5], [0.5, 0.5], [0.8, 0.5]), 1) === 180, 'straight')
  assert(markLabel(line([0.5, 0.1], [0.5, 0.9]), 1) === '0° from upright', markLabel(line([0.5, 0.1], [0.5, 0.9]), 1))
})

heading('Kept with the serve')

check('marks go on the serve’s tag, and a tag of only marks is kept', () => {
  const tag = withServeTag(undefined, 'r1', { marks: [line([0.1, 0.1], [0.2, 0.2])] }, 5)
  assert(tag?.marks?.length === 1, 'the mark was not kept')
  assert(withServeTag(tag, 'r1', { marks: [] }, 6) === undefined, 'clearing every mark left an empty row')
  const both = withServeTag(tag, 'r1', { serveNumber: 2 }, 7)
  assert(both?.marks?.length === 1 && both.serveNumber === 2, 'tagging the serve lost its marks')
})

check('a reload keeps good marks and drops what cannot be drawn, part by part', () => {
  const stored = {
    id: 'r1',
    taggedAt: 5,
    marks: [line([0.1, 0.1], [0.2, 0.2]), { kind: 'line', pts: [{ x: 0.1, y: 0.1 }], t: 1 }, { kind: 'circle', pts: [], t: 1 }, line([0.1, 0.1], [1.4, 0.2])],
  }
  const back = normaliseServeTag(JSON.parse(JSON.stringify(stored)))
  assert(back?.marks?.length === 1, `kept ${back?.marks?.length}`)
  assert(normaliseServeTag({ id: 'r2', taggedAt: 1, marks: [{ kind: 'x' }] }) === undefined, 'a row with nothing drawable survived')
})

check(`no more than ${MAX_MARKS} marks a serve`, () => {
  const many = Array.from({ length: MAX_MARKS + 5 }, () => line([0.1, 0.1], [0.2, 0.2]))
  assert(withServeTag(undefined, 'r', { marks: many }, 1)!.marks!.length === MAX_MARKS, 'too many kept')
})

check('two taps on one spot are not a mark (W5.1)', () => {
  const dot = line([0.5, 0.5], [0.502, 0.501])
  assert(normaliseServeTag({ id: 'd', taggedAt: 1, marks: [dot] }) === undefined, 'a dot-sized line was kept')
})

heading('A backup restore keeps both phones’ work (W5.1)')

check('a newer tag from the file keeps the marks drawn here; a mark drawn here keeps the file’s outcome', () => {
  const drawn: ServeTag = { id: 'x', marks: [line([0.1, 0.1], [0.3, 0.4])], taggedAt: 10 }
  const fromFile: ServeTag = { id: 'x', serveNumber: 2, taggedAt: 20 }
  const a = mergeTags(drawn, fromFile)!
  assert(a.serveNumber === 2 && a.marks?.length === 1, `marks lost to a newer tag: ${JSON.stringify(a)}`)
  const outcome: ServeTag = { id: 'x', outcome: 'net', taggedAt: 5 }
  const b = mergeTags(drawn, outcome)!
  assert(b.outcome === 'net' && b.marks?.length === 1, `an older outcome lost to a mark: ${JSON.stringify(b)}`)
  assert(mergeTags(a, fromFile) === undefined, 'a file that adds nothing was written again')
})

report()
