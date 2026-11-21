/**
 * A lesson for each fault (C1.3): every ladder's fault has one, every claim in
 * it is cited or marked as coaching, and every line keeps the copy rules.
 */
import { COACHING, LESSONS, SOURCES, everyLessonLine, fromLine } from '../lessons'
import { everyProgression } from '../progressions'
import { cueIssues } from '../voice'
import { assert, check, heading, note, report } from './harness'

heading('Every drill has a lesson')

check('every ladder’s fault has costs and a picture of good', () => {
  for (const [flaw] of everyProgression()) {
    const lesson = LESSONS[flaw]
    assert(lesson !== undefined, `${flaw} has a drill and no lesson`)
    assert(lesson!.costs.length >= 1 && lesson!.costs.length <= 2, `${flaw}: ${lesson!.costs.length} costs, want one or two`)
    assert(lesson!.good.text.length > 0, `${flaw}: no line of what good looks like`)
  }
})

check('no lesson for a fault the report never hands a drill for', () => {
  const ladders = new Set(everyProgression().map(([f]) => f))
  for (const flaw of Object.keys(LESSONS)) assert(ladders.has(flaw as never), `${flaw} has a lesson and no ladder`)
})

heading('Cited or marked')

check('every claim names a study it can be checked against, or says it is coaching', () => {
  let studies = 0
  let coaching = 0
  for (const lesson of Object.values(LESSONS)) {
    for (const claim of [...lesson!.costs, lesson!.good]) {
      if (claim.from === COACHING) {
        coaching++
        continue
      }
      for (const id of Array.isArray(claim.from) ? claim.from : [claim.from]) {
        const source = SOURCES[id]
        assert(source !== undefined, `"${claim.text}" cites ${id}, which is not in SOURCES`)
        assert(/\d{4}/.test(source.ref) && /doi|PMID|J |Med|Sci|Rev/.test(source.ref), `${id}: a reference nobody could look up`)
      }
      studies++
    }
  }
  note(`${studies} claims cite a study, ${coaching} are marked as coaching`)
  assert(studies > coaching, 'more of the lessons are coaching than measured')
})

check('the coaching mark says it is not a measurement', () => {
  assert(/not a measurement/.test(fromLine(COACHING)), fromLine(COACHING))
})

heading('Copy')

check('every line keeps the copy rules', () => {
  const lines = everyLessonLine()
  for (const { flaw, text } of lines) {
    const issues = cueIssues(text)
    assert(issues.length === 0, `${flaw}: "${text}": ${issues.join(', ')}`)
  }
  note(`${lines.length} lines`)
})

report()
