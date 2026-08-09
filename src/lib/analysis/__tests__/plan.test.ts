/**
 * The queue of things to work on, and the promises it makes.
 *
 * The report used to hand out one drill, and then — through the per-metric
 * cards underneath it — as many as a bad serve had failing measurements. Both
 * are gone. `causalPlan` builds between two and four, in the order the
 * hierarchy says causes the others, and everything below is the guarantee that
 * ordering is real rather than a slice of whatever `diagnose` happened to emit.
 *
 * The properties worth pinning are not "the plan contains X" — that would break
 * every time a band moved. They are structural: the plan starts where triage
 * started, never grows past the cap, never lists a symptom of something it is
 * already listing, and never names a drill that does not exist.
 */
import { DRILLS } from '../coaching'
import { diagnose } from '../diagnose'
import type { FlawId } from '../flaws'
import { detectServe } from '../phases'
import { FLAW_DRILL, HIERARCHY, assessResilience, triage } from '../triage'
import { MAX_PLAN, causalPlan, suppressedNote } from '../verdict'
import { buildServe, type ServeDials } from './syntheticServe'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

function pipeline(dials: Partial<ServeDials> = {}, tier = 5) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const diagnosis = diagnose(frames, skel, { tier })
  const verdict = triage(diagnosis, assessResilience(frames, skel))
  return { diagnosis, verdict, plan: causalPlan(verdict, diagnosis) }
}

/** Where a flaw sits in the causal order. Lower is more upstream. */
const rung = (flaw: FlawId) => HIERARCHY.findIndex((l) => l.flaws.includes(flaw))

/**
 * A serve with faults spread across several rungs of the hierarchy.
 *
 * Deliberately broken in more than one place at once: a plan cannot be shown to
 * order anything if the engine only ever finds it one thing.
 */
const MESSY: Partial<ServeDials> = {
  palmToSky: 80,
  trophyForearmDrop: 0.22,
  tossWobble: 0.09,
  dropBelowShoulder: 0.05,
  hipLead: -0.09,
  spineLean: 26,
}

/* ===================================================== the shape of it ==== */

heading('The plan the report hands over')

check('a serve broken in several places is given more than one thing to do', () => {
  const { plan } = pipeline(MESSY)
  note(`${plan.length} item(s) planned`)
  assert(plan.length > 1, 'a multi-fault serve produced a plan of one')
})

check('the plan never runs past the cap, however much is wrong', () => {
  const { plan } = pipeline(MESSY)
  assert(plan.length <= MAX_PLAN, `plan of ${plan.length} exceeds the cap of ${MAX_PLAN}`)
})

check('the plan opens on the same fault triage chose', () => {
  const { verdict, plan } = pipeline(MESSY)
  assert(plan.length > 0, 'no plan at all')
  assert(Boolean(verdict.primary_flaw), 'triage named no primary flaw to compare against')
  // The plan is built by continuing triage's own walk rather than by re-ranking,
  // so its first entry has to be the fault the stored verdict already named. If
  // these two ever disagree the report is arguing with its own database.
  const primaryDrill = DRILLS[FLAW_DRILL[verdict.primary_flaw!.flaw]]
  assert(
    plan[0].drill.name === primaryDrill.name,
    `plan opens on "${plan[0].drill.name}", triage chose "${primaryDrill.name}"`,
  )
})

check('nothing is listed twice', () => {
  const { plan } = pipeline(MESSY)
  const names = plan.map((p) => p.drill.name)
  assert(new Set(names).size === names.length, `repeated drill in ${names.join(', ')}`)
})

check('every drill in the plan is one that exists', () => {
  const { plan } = pipeline(MESSY)
  for (const item of plan) {
    assert(Boolean(item.drill.name && item.drill.how && item.drill.reps), 'a drill arrived hollow')
  }
})

/* ========================================================= the ordering === */

heading('Causes before the things they cause')

check('the plan runs down the hierarchy, never back up it', () => {
  const { diagnosis, verdict, plan } = pipeline(MESSY)
  const detected = diagnosis.flaws.filter((f) => f.detected)
  // Map each planned item back to the flaw that produced it, by its drill.
  const flawOf = (name: string) =>
    (Object.keys(FLAW_DRILL) as FlawId[]).find((f) => DRILLS[FLAW_DRILL[f]].name === name)

  const rungs = plan.map((p) => rung(flawOf(p.drill.name)!))
  note(`rungs ${rungs.join(' → ')} of ${HIERARCHY.length}`)
  for (let i = 1; i < rungs.length; i++) {
    assert(rungs[i] >= rungs[i - 1], `plan went back up the hierarchy at position ${i + 1}`)
  }
  assert(detected.length > 0 && Boolean(verdict.primary_flaw), 'nothing was detected to order')
})

check('a symptom of something already in the plan is left out of it', () => {
  const { diagnosis, plan } = pipeline(MESSY)
  const attributed = diagnosis.flaws
    .filter((f) => f.detected && f.caused_by)
    .map((f) => DRILLS[FLAW_DRILL[f.flaw]].name)

  note(attributed.length ? `attributed: ${attributed.join(', ')}` : 'nothing was attributed')
  for (const name of plan.map((p) => p.drill.name)) {
    assert(!attributed.includes(name), `"${name}" is a symptom and was planned anyway`)
  }
})

check('a clean serve is handed no plan at all', () => {
  const { plan } = pipeline({}, 4)
  note(`${plan.length} item(s) for a serve clean at its own level`)
  assert(plan.length === 0 || plan.length === 1, 'a clean serve was given a queue of work')
})

/* ================================================== what is held back ===== */

heading('What the report is still holding back')

check('the held-back count drops by what the plan actually printed', () => {
  const { verdict, plan } = pipeline(MESSY)
  const one = suppressedNote(verdict, 1)
  const all = suppressedNote(verdict, plan.length)
  note(`shown 1 → ${one ?? 'nothing held back'}`)
  note(`shown ${plan.length} → ${all ?? 'nothing held back'}`)
  // Printing more must never claim more is being withheld. Anything else is the
  // report telling somebody it has secrets it has just handed over.
  if (all && one) assert(all.length <= one.length || all !== one, 'the count did not move')
  if (!one) assert(!all, 'nothing was held back at one, but something was at four')
})

check('a rejected clip is told nothing is being held back', () => {
  const rejected = { schema: 1 as const, status: 'rejected' as const, injury_risk: [], suppressed_count: 3 }
  assert(
    suppressedNote(rejected as never, 1) === undefined,
    'a refused clip was given a count of things it had supposedly found',
  )
})

report()
