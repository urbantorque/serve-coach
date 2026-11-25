/**
 * The ball pass in sweeps (L5.10): a basket sweep keeps the ball, so a drill
 * check can judge the toss height across it. The sweep loop runs here without
 * a video, each serve read by the real engine on the rig with the rig's ball,
 * the way `analyzeServe` hands a ball to the diagnosis.
 */
import { SWEEP_SKIPS, sweepServes } from '../analyze'
import { checkDrill } from '../progressions'
import { detectServe } from '../phases'
import { diagnose } from '../diagnose'
import { assessResilience, triage } from '../triage'
import { buildServe, rigBall } from '../syntheticServe'
import type { Analysis } from '../types'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

/** One swept serve, read with or without its ball. */
function read(index: number, apex: number, withBall: boolean): Analysis {
  const frames = buildServe({ noise: 0.004, seed: 400 + index, cameraYaw: 82 }, FPS)
  const skel = detectServe(frames, FPS)
  const ball = withBall ? rigBall(frames, { forward: 0.3, sideways: 0, apex }) : undefined
  const diagnosis = diagnose(frames, skel, { ball })
  return {
    diagnosis,
    triage: triage(diagnosis, assessResilience(frames, skel)),
    serves: { count: 6, index },
    ...(ball ? { ball } : {}),
  } as unknown as Analysis
}

async function basket(apex: number, withBall: boolean) {
  const run = await sweepServes({ count: 6 }, async (serveIndex) => read(serveIndex, apex, withBall))
  return { run, check: checkDrill('toss_height', run.serves) }
}

heading('The ball pass in sweeps')

check('a basket sweep reads the ball', () => {
  assert(!('skipBall' in SWEEP_SKIPS), 'the sweep skips the ball pass again')
  // The rest it still leaves out, for the reasons each has.
  for (const k of ['skipFramingCheck', 'skipThumbnails', 'skipRacketBoxes', 'skipPoseRefine'] as const) {
    assert(SWEEP_SKIPS[k] === true, `the sweep no longer skips ${k}`)
  }
})

await check('with the ball, a basket judges the toss height step; without it, it can’t', async () => {
  const low = await basket(1.2, true)
  const good = await basket(1.8, true)
  const blind = await basket(1.2, false)
  note(
    `low toss: ${low.check?.outcome} (${low.check?.clean} clean of ${low.check?.read}) · ` +
      `good toss: ${good.check?.outcome} (${good.check?.clean} of ${good.check?.read}) · ` +
      `no ball: ${blind.check?.outcome} (${blind.check?.read} read)`,
  )
  assert(low.run.serves.length === 6 && good.run.serves.length === 6, 'the sweep dropped serves')
  assert(low.check?.outcome === 'not_yet', `a basket of low tosses came back ${low.check?.outcome}`)
  assert(good.check?.outcome === 'passed', `a basket of good tosses came back ${good.check?.outcome}`)
  assert(blind.check?.outcome === 'unread' && blind.check.read === 0, 'a basket with no ball judged the toss')
})

report()
