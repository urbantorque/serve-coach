/**
 * The public accuracy page (N6.3) says what the engine does, because it is
 * built from the engine's own tables. These hold the page to them.
 */
import { SCORE_STEADY, accuracyRows, gradedIds, unmeasuredRows, wobbleText } from '../accuracy'
import { REAL_CHANGE } from '../analysis/realChange'
import { CARD_NOISE_SD, RETEST_SD } from '../analysis/cardNoise'
import { METRICS } from '../analysis/coaching'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

heading('How sure I am, from the tables I grade with')

const rows = accuracyRows()

check('every graded reading is on the page, measured or said to be unmeasured', () => {
  const shown = new Set([...rows.map((r) => r.id), ...unmeasuredRows().map((r) => r.id)])
  for (const id of gradedIds()) assert(shown.has(id), `${id} is graded and missing from the page`)
  for (const r of rows) assert(r.wobble === CARD_NOISE_SD[r.id], `${r.id} shows a wobble the engine does not use`)
})

check('a steady serve keeps its grade 95 times in 100 where the band rule holds, and fewer where it is known not to', () => {
  for (const r of rows) note(`${r.label}: ${wobbleText(r.unit, r.wobble)}, keeps its grade ${r.keepsGrade} in 100`)
  const arm = rows.find((r) => r.id === 'armExtension')
  assert(arm !== undefined && arm.keepsGrade < 95 && arm.keepsGrade >= 90, `arm extension, the one known short band, shows ${arm?.keepsGrade}`)
  for (const r of rows.filter((x) => x.id !== 'armExtension')) assert(r.keepsGrade >= 95, `${r.id} keeps its grade ${r.keepsGrade} in 100, under the rule`)
})

check('the small public clips show only where they moved more, and only from the measured table', () => {
  for (const r of rows) {
    if (r.onSmallClips === undefined) continue
    assert(r.onSmallClips === RETEST_SD[r.id] && r.onSmallClips > r.wobble, `${r.id}: ${r.onSmallClips}`)
  }
  assert(rows.some((r) => r.onSmallClips !== undefined), 'nothing from the real footage reached the page')
})

check('the ball readings say nothing measured them', () => {
  const ball = unmeasuredRows().map((r) => r.id)
  note(ball.join(', '))
  assert(ball.length > 0 && ball.every((id) => CARD_NOISE_SD[id] === undefined), ball.join(', '))
})

check('every wobble reads in a unit a player knows, and every row names what it rests on', () => {
  for (const r of rows) {
    const t = wobbleText(r.unit, r.wobble)
    assert(/(% of your height| points|°| ms| cm)$/.test(t), `${r.id}: "${t}"`)
    assert(r.against.length > 10 && r.against === ('study' in METRICS[r.id].source ? (METRICS[r.id].source as { study: string }).study : (METRICS[r.id].source as { motion: string }).motion), `${r.id} has no source`)
  }
  assert(wobbleText('×', 0.00766) === '0.77% of your height', wobbleText('×', 0.00766))
})

check('the headline number is as steady as the change the app calls real, less one', () => {
  assert(SCORE_STEADY === REAL_CHANGE.overall - 1 && SCORE_STEADY > 0, `${SCORE_STEADY} against ${REAL_CHANGE.overall}`)
})

report()
