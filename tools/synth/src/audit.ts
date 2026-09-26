/**
 * Render-free audit of every job: motion constraints, framing and landmark speeds.
 *
 *   npx tsx tools/synth/src/audit.ts [jobId ...]
 */
import { project } from './camera.ts'
import { cameraAt } from './frames.ts'
import { isInServiceBox } from './court.ts'
import { dist } from './math/vec.ts'
import { allJobs } from './scenarios.ts'
import { buildScenario } from './setup.ts'
import { kmh } from './ball.ts'

const ids = process.argv.slice(2)
const jobs = allJobs().filter((j) => ids.length === 0 || ids.includes(j.id))
const rows: Record<string, string | number | boolean>[] = []
let problems = 0
let faults = 0
for (const sc of jobs) {
  const b = buildScenario(sc)
  const clip = b.clip
  const dt = 1 / 480
  let maxSpeed = 0
  let prev = clip.pose(b.t0S).lm
  const tEnd = b.t0S + (b.frameCount - 1) / sc.video.fps
  for (let t = b.t0S + dt; t <= tEnd; t += dt) {
    const lm = clip.pose(t).lm
    for (let i = 0; i < 33; i++) maxSpeed = Math.max(maxSpeed, dist(lm[i], prev[i]) / dt)
    prev = lm
  }
  let playerOut = 0
  let n = 0
  for (let i = 0; i < b.frameCount; i += 4) {
    const t = b.t0S + i / sc.video.fps
    const cam = cameraAt(b.setup, t)
    if (!clip.pose(t).lm.every((p) => project(cam, p).inFrame)) playerOut++
    n++
  }
  for (const plan of clip.plans) {
    const T = plan.times
    const w = (p: [number, number, number]) => clip.toWorld(p)
    const bounce = w(plan.flight.bounce)
    const inBox = isInServiceBox(plan.params.courtSide, bounce[0], bounce[1])
    const apexIn = project(cameraAt(b.setup, T.tossApexS), w(plan.apex)).inFrame
    const contactIn = project(cameraAt(b.setup, T.contactS), w(plan.contact)).inFrame
    if (!plan.releaseReachable || maxSpeed > 30) problems++
    if (!inBox) faults++
    rows.push({
      job: sc.id,
      serve: plan.index,
      reach: plan.releaseReachable,
      inBox,
      net: +(plan.flight.netCrossing?.clearanceM ?? NaN).toFixed(2),
      kmh: +kmh(plan.flight.peakSpeedMs).toFixed(0),
      apexIn,
      contactIn,
      playerOutPct: +((100 * playerOut) / n).toFixed(0),
      maxLmSpeed: +maxSpeed.toFixed(1),
      frames: b.frameCount,
      durS: +((b.frameCount - 1) / sc.video.fps).toFixed(2),
    })
  }
}
console.table(rows)
const totalFrames = jobs.reduce((s, j) => s + buildScenario(j).frameCount, 0)
console.log(`${jobs.length} jobs, ${rows.length} serves, ${totalFrames} rendered frames; ${problems} problem serve(s) (unreachable release or landmark speed > 30 m/s); ${faults} fault(s) (bounce outside the service box, from aim scatter)`)
