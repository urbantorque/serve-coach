// End-to-end smoke validation of the app's engine on the synthetic corpus.
//
// Starts the app's Vite dev server (its dev-only middleware serves ../validation/synthetic under
// /__synthetic/), opens app/validation.html in headless Edge (Playwright, channel 'msedge') once
// per clip, waits for window.__harnessResult and writes
//   validation/results/smoke/<clip>.json   (scores, meta, stage timings, ball/audio summaries)
//   validation/results/smoke/SUMMARY.md    (tables over every clip result in that folder)
// The per-frame pose landmarks and ball candidates stay in the page unless --full is given
// (then they go to --full-dir, default validation/results/smoke/full/<clip>.json, which git ignores).
//
// Privacy check: every request the browser context makes (pages and workers) is recorded. A
// request to any host other than the dev server is a failure; it is aborted, so it cannot
// leave the machine even if the page's CSP did not stop it. CSP violations and console errors
// are recorded per clip.
//
//   node tools/validate/smoke.mjs                      # the default clip set (see SETS)
//   node tools/validate/smoke.mjs --clips quick-side60,baseline-s1
//   node tools/validate/smoke.mjs --sets quick,slomo   # named sets only
//   node tools/validate/smoke.mjs --force              # re-run clips that already have a result
//   node tools/validate/smoke.mjs --summary-only       # rebuild SUMMARY.md from existing JSON
//   options: --concurrency N (default 1) --timeout-min N (default 20) --headed --full [--full-dir DIR]
//            --channel msedge|chrome --out DIR
//
// Exit code 1 if any clip fails to run or any request leaves localhost.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const appRoot = join(repoRoot, 'app')
const corpusRoot = join(repoRoot, 'validation/synthetic')
// Playwright and Vite are the app's dev dependencies.
const appRequire = createRequire(join(appRoot, 'package.json'))

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const outDir = resolve(option('--out', join(repoRoot, 'validation/results/smoke')))
const concurrency = Math.max(1, Number(option('--concurrency', '1')))
const timeoutMs = Number(option('--timeout-min', '20')) * 60_000

/** Named clip sets: a manifest group or a clip-id prefix. Order = order in SUMMARY.md. */
const SETS = [
  { id: 'quick', label: 'quick (CI, 540x960)', match: (c) => c.groups.includes('quick') },
  { id: 'baseline', label: 'baseline (side 5 m, 60 fps)', match: (c) => c.groups.includes('baseline') },
  { id: 'fps-sweep', label: 'fps sweep (30/120/240)', match: (c) => c.groups.includes('fps-sweep') },
  { id: 'view-sweep', label: 'view sweep (rear, front-45)', match: (c) => c.groups.includes('view-sweep') },
  { id: 'distance-sweep', label: 'distance sweep (4/7/12 m)', match: (c) => c.groups.includes('distance-sweep') },
  { id: 'dusk', label: 'dusk (60 fps)', match: (c) => c.id.startsWith('dusk-') },
  { id: 'night240', label: 'night 240 fps, 100 Hz flicker', match: (c) => c.id.startsWith('night240-') },
  { id: 'crf36', label: 'CRF 36', match: (c) => c.id.startsWith('crf36-') },
  { id: 'slomo', label: 'slow motion (240 as 30 fps)', match: (c) => c.groups.includes('slomo') },
]

const manifest = JSON.parse(readFileSync(join(corpusRoot, 'manifest.json'), 'utf8'))
const byId = new Map(manifest.clips.map((c) => [c.id, c]))

function selectClips() {
  const explicit = option('--clips', '')
  const wantedSets = option('--sets', '') ? option('--sets', '').split(',') : SETS.map((s) => s.id)
  const chosen = new Map()
  for (const set of SETS) {
    if (!wantedSets.includes(set.id)) continue
    for (const clip of manifest.clips) if (set.match(clip) && !chosen.has(clip.id)) chosen.set(clip.id, set.id)
  }
  if (explicit) {
    const ids = explicit.split(',')
    for (const id of ids) if (!byId.has(id)) throw new Error(`unknown clip ${id}`)
    return ids.map((id) => ({ clip: byId.get(id), set: chosen.get(id) ?? SETS.find((s) => s.match(byId.get(id)))?.id ?? 'other' }))
  }
  return [...chosen].map(([id, set]) => ({ clip: byId.get(id), set }))
}

// ---------- formatting ----------

const num = (v) => typeof v === 'number' && Number.isFinite(v)
const f = (v, d = 1) => (num(v) ? v.toFixed(d) : '–')
const signed = (v, d = 1) => (num(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}` : '–')
const pct = (v) => (num(v) ? `${Math.round(100 * v)}%` : '–')
const secs = (msValue) => (num(msValue) ? (msValue / 1000).toFixed(1) : '–')
const median = (values) => {
  const v = values.filter(num).sort((a, b) => a - b)
  if (!v.length) return Number.NaN
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const mean = (values) => {
  const v = values.filter(num)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : Number.NaN
}
const maxAbs = (values) => {
  const v = values.filter(num).map(Math.abs)
  return v.length ? Math.max(...v) : Number.NaN
}

// ---------- per-clip record ----------

const trackCounts = (t) => ({ id: t.id, kind: t.kind, observations: t.observations.length, detected: t.observations.filter((o) => o.source === 'detected').length })

/** Keeps what SUMMARY.md and later analysis need; drops per-frame arrays. */
function compactResult(result) {
  if (!result) return null
  const pass = (p) => ({
    label: p.label,
    metaTimeScale: p.metaTimeScale,
    captureFps: p.captureFps,
    timeBaseKnown: p.timeBaseKnown,
    tossRoiUntilTReal: p.tossRoiUntilTReal,
    audioUsed: p.audioUsed,
    contactOnset: p.contactOnset,
    contactFromAudioTReal: p.contactFromAudioTReal,
    frames: p.frames.length,
    candidatesTotal: p.frames.reduce((n, fr) => n + fr.candidates.length, 0),
    setup: p.setup,
    tracks: p.tracks.map(trackCounts),
    tossTrack: p.tossTrack ? trackCounts(p.tossTrack) : null,
    outgoingTrack: p.outgoingTrack ? trackCounts(p.outgoingTrack) : null,
    toss: p.toss,
    events: p.events,
    timeBase: p.timeBase,
    speedFromTrack: p.speedFromTrack,
    averageSpeedRear: p.averageSpeedRear,
    bounce: p.bounce,
    placement: p.placement,
    metrics: p.metrics,
  })
  return {
    version: result.version,
    ok: result.ok,
    error: result.error,
    failedStage: result.failedStage,
    clipUrl: result.clipUrl,
    truthUrl: result.truthUrl,
    startedAt: result.startedAt,
    environment: result.environment,
    inputs: result.inputs,
    meta: result.meta,
    timings: result.timings,
    scores: result.scores,
    pose: result.pose ? { options: result.pose.options, stats: result.pose.stats, cleanReport: result.pose.clean.report, frames: result.pose.frames.length } : null,
    audio: result.audio,
    ball: result.ball ? { finalPass: result.ball.finalPass, passes: result.ball.passes.map(pass) } : null,
    cspViolations: result.cspViolations,
    notes: result.notes,
  }
}

// ---------- summary ----------

function loadRecords(clipIds) {
  const records = []
  for (const id of clipIds) {
    const file = join(outDir, `${id}.json`)
    if (existsSync(file)) records.push(JSON.parse(readFileSync(file, 'utf8')))
  }
  return records
}

function finalPassScore(r) {
  const s = r.result?.scores
  return s?.ball ? s.ball.passes[s.ball.finalPass] : null
}

function writeSummary(records, run) {
  const lines = []
  const ok = records.filter((r) => r.result?.ok)
  const failed = records.filter((r) => !r.result?.ok)
  const external = records.flatMap((r) => r.privacy.externalRequests.map((u) => `${r.clip}: ${u}`))
  const violations = records.flatMap((r) => (r.result?.cspViolations ?? []).map((v) => `${r.clip}: ${v.violatedDirective} ${v.blockedURI}`))
  const consoleCsp = records.flatMap((r) => r.privacy.consoleMessages.filter((m) => /Content Security Policy|Refused to/i.test(m)).map((m) => `${r.clip}: ${m}`))
  const env = ok[0]?.result?.environment ?? records[0]?.result?.environment
  lines.push('# Engine smoke validation on the synthetic corpus')
  lines.push('')
  lines.push(`Generated ${new Date().toISOString()} by \`node tools/validate/smoke.mjs\`. ${records.length} clips: ${ok.length} ran to completion, ${failed.length} failed.`)
  lines.push('')
  lines.push('**Everything here is synthetic** (validation/synthetic, rendered by tools/synth). No real footage was used, so these numbers bound the engine on clean renders; they are not accuracy claims for real phones.')
  lines.push('')
  lines.push('## Method')
  lines.push('')
  lines.push(`- Browser: ${run.browser ?? 'Edge'} headless via Playwright (channel \`${run.channel}\`), ${os.cpus().length} logical CPUs, ${os.cpus()[0]?.model?.trim() ?? 'unknown CPU'}. Clips run ${run.concurrency === 1 ? 'one at a time' : `${run.concurrency} at a time (stage times include contention)`}. The machine was not otherwise idle, so stage times are indicative, not benchmarks.`)
  lines.push(`- ${env ? `User agent: \`${env.userAgent}\`.` : ''}`)
  lines.push('- Pipeline (app/src/validation/harness.ts, the app\'s own engine): probe -> audio decode + onsets -> WebCodecs (or media-element) decode -> MediaPipe Pose Landmarker full, ROI auto, VIDEO mode, numPoses 2, worker, GPU with CPU fallback -> cleanPoseFrames -> ball detection at full resolution (toss band until the audio contact onset) -> tracking, toss analysis and gravity time-scale check -> if the check says slow motion: applyTimeScale(..., \'physics\'), poses re-timed and re-cleaned, ball detection re-run.')
  lines.push('- `timeBaseKnown` is what the video layer proves: only 100 fps+ timestamps (or Android capture-fps metadata) count, so 30/60 fps clips run with an unverified time base, exactly as the app would.')
  lines.push('- Player-entered inputs (camera view, height, handedness, target tag, court side) are taken from truth as stand-ins for what the player types in.')
  lines.push('- Pose error: 12 core joints, strict MediaPipe left/right labels, in statures (the player\'s standing height in pixels). Mirror-tolerant error forgives a whole-body left/right mirror. Ball scoring uses the ball layer\'s own scorer (recall over visible free-flight frames; precision over all candidates; localisation error = nearest matching candidate on toss frames).')
  lines.push('- Times are real (capture) milliseconds unless marked media. Audio onset error = detected onset minus the truth sound arrival at the phone (media time), so the sound travel time is not an error.')
  lines.push('')

  lines.push('## Privacy (CSP)')
  lines.push('')
  const probe = run.privacyProbe
  if (probe) {
    const show = (v) => (v && typeof v === 'object' ? `violation \`${v.violation ?? 'none'}\`, XHR ${v.xhr}, fetch ${v.fetch}` : String(v))
    lines.push(`- Probe of \`${TELEMETRY_URL}\` (MediaPipe telemetry) during the warm-up run:`)
    lines.push(`  - page: ${show(probe.page)}; blocked by the CSP: **${probe.pageBlockedByCsp ? 'yes' : 'no'}**;`)
    lines.push(`  - pose worker (\`${probe.workerUrl ?? '?'}\`): ${show(probe.worker)}; blocked by the CSP: **${probe.workerBlockedByCsp ? 'yes' : 'no'}** (XHR shows the CSP alone; fetch also meets the worker's same-origin guard);`)
    lines.push(`  - requests that reached the network layer during the probe: ${probe.externalDuringProbe.length}.`)
  }
  const runExternal = run.externalRequests ?? []
  lines.push(`- Requests to hosts other than the dev server during the whole run (warm-up included; the router aborts and records them): **${runExternal.length || external.length}**${external.length || runExternal.length ? ` (${[...new Set([...runExternal, ...external])].slice(0, 10).join('; ')})` : ''}.`)
  const cspRefused = run.blockedBeforeNetwork ?? []
  lines.push(`- Requests Chromium reported but the CSP refused before the network stack (probe included): ${cspRefused.length}${cspRefused.length ? ` (${[...new Set(cspRefused)].join('; ')})` : ''}.`)
  const guardHits = records.flatMap((r) => r.privacy.consoleMessages.filter((m) => m.includes('[privacy]')))
  lines.push(`- Telemetry attempts stopped inside the pose worker by its fetch guard (\`[privacy]\` console lines): ${guardHits.length}.`)
  lines.push(`- During the clip runs (after the probe), \`securitypolicyviolation\` events on the page: ${violations.length}${violations.length ? ` (${[...new Set(violations.map((v) => v.replace(/^[^:]+: /, '')))].slice(0, 6).join('; ')})` : ''}; CSP console messages from the page and workers: ${consoleCsp.length}${consoleCsp.length ? `; distinct: ${[...new Set(consoleCsp.map((m) => m.replace(/^[^:]+: /, '').slice(0, 220)))].slice(0, 4).map((m) => `\`${m}\``).join('; ')}` : ''}. (The worker's guard refuses the telemetry fetch before the CSP check runs, so none are expected.)`)
  lines.push(`- Pose ran on ${ok.filter((r) => (r.result.scores?.pose?.raw.detectionRate ?? 0) > 0).length} of ${ok.length} completed clips with the policy in force.`)
  lines.push('')

  if (failed.length) {
    lines.push('## Failures')
    lines.push('')
    for (const r of failed) lines.push(`- ${r.clip}: ${r.result ? `stage ${r.result.failedStage}: ${r.result.error}` : r.error}`)
    lines.push('')
  }

  const setOf = new Map(records.map((r) => [r.clip, r.set]))
  const orderedSets = SETS.filter((s) => records.some((r) => r.set === s.id))

  lines.push('## Summary by scenario')
  lines.push('')
  lines.push('Medians over the clips in each set (apex and onset errors: mean |error| / max |error|). The gravity column is the first-pass factor divided by the expected one (1 = the check recovered the true time scale; slow motion expects 0.125), median and range. Speed = experimental side-view ranges that contain the true speed / ranges produced (the rest were refused).')
  lines.push('')
  lines.push('| set | clips | frames = truth | pose detected | pose median err (stature) | ball toss recall | ball precision | ball loc. err (px) | toss found | apex err mean / max (ms) | audio onset err mean / max (ms) | gravity factor ratio to expected | speed ranges | ms per frame (pose / ball) |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const set of orderedSets) {
    const rs = records.filter((r) => r.set === set.id && r.result?.ok)
    const all = records.filter((r) => r.set === set.id)
    const sc = rs.map((r) => r.result.scores)
    const bp = rs.map(finalPassScore)
    const apex = bp.map((b) => b?.toss.apexErrorMs)
    const onset = sc.map((s) => s?.audio?.contact.nearestErrorMediaMs)
    const grav = rs.map((r) => r.result.scores?.ball?.passes[0]?.gravity)
    const ratios = grav.filter((g) => num(g?.factor) && num(g?.expected)).map((g) => g.factor / g.expected)
    const gravText = ratios.length ? `${f(median(ratios), 3)} (${f(Math.min(...ratios), 3)}-${f(Math.max(...ratios), 3)})` : '–'
    const ranges = bp.filter((b) => b?.speed.status === 'experimental')
    const speedText = `${ranges.filter((b) => b.speed.covered).length}/${ranges.length}`
    const framesOk = sc.filter((s) => s?.frames.match).length
    const poseMs = median(rs.map((r) => r.result.timings.posePassMs / Math.max(1, r.result.scores?.frames.decodedPose ?? 1)))
    const ballMs = median(rs.map((r) => r.result.timings.ballPassMs / Math.max(1, (r.result.scores?.frames.decodedBall ?? 1) * (r.result.ball?.passes.length ?? 1))))
    lines.push(
      `| ${set.label} | ${rs.length}${all.length !== rs.length ? ` of ${all.length}` : ''} | ${framesOk}/${rs.length} | ${pct(median(sc.map((s) => s?.pose?.raw.detectionRate)))} | ${f(median(sc.map((s) => s?.pose?.raw.medianErrorBH)), 3)} | ${pct(median(bp.map((b) => b?.detection.recallToss)))} | ${pct(median(bp.map((b) => b?.detection.precision)))} | ${f(median(bp.map((b) => b?.detection.errorMedianPx)), 2)} | ${bp.filter((b) => b?.toss.status === 'ok').length}/${rs.length} | ${f(mean(apex.map((v) => (num(v) ? Math.abs(v) : v))), 2)} / ${f(maxAbs(apex), 2)} | ${f(mean(onset.map((v) => (num(v) ? Math.abs(v) : v))), 2)} / ${f(maxAbs(onset), 2)} | ${gravText} | ${speedText} | ${f(poseMs, 0)} / ${f(ballMs, 0)} |`,
    )
  }
  lines.push('')

  // Computed flags: patterns worth acting on, recomputed from the data every time.
  const okScores = ok.map((r) => ({ r, s: r.result.scores, b: finalPassScore(r) }))
  const popLabels = {}
  for (const { s } of okScores) if (s?.audio?.contact.nearestKind) popLabels[s.audio.contact.nearestKind] = (popLabels[s.audio.contact.nearestKind] ?? 0) + 1
  const notStrongest = okScores.filter(({ s }) => s?.audio?.contact.strongestIsContact === false).map(({ r }) => r.clip)
  const releaseOutliers = okScores.filter(({ b }) => num(b?.toss.releaseErrorMs) && Math.abs(b.toss.releaseErrorMs) > 50).map(({ r, b }) => `${r.clip} ${signed(b.toss.releaseErrorMs, 0)} ms`)
  const apexZ = okScores.filter(({ b }) => num(b?.toss.apexZ) && Math.abs(b.toss.apexZ) > 2).map(({ r, b }) => `${r.clip} z ${f(b.toss.apexZ, 1)}`)
  const heightMissed = okScores.filter(({ b }) => b?.toss.apexHeight.covered === false).map(({ r }) => r.clip)
  const refusals = {}
  for (const { b } of okScores) if (b && b.speed.status !== 'experimental') refusals[(b.speed.reason ?? b.speed.status).split(';')[0]] = (refusals[(b.speed.reason ?? b.speed.status).split(';')[0]] ?? 0) + 1
  const mirrored = {}
  for (const { r, s } of okScores) {
    const view = r.result.inputs?.view ?? '?'
    ;(mirrored[view] ??= []).push(s?.pose?.raw.mirroredRate)
  }
  const outgoingImpure = okScores.filter(({ b }) => b?.outgoing.detections && num(b.outgoing.precision) && b.outgoing.precision < 1).map(({ r, b }) => `${r.clip} ${pct(b.outgoing.precision)} of ${b.outgoing.detections}`)
  lines.push('## Computed flags')
  lines.push('')
  lines.push(`- Audio label of the onset at the racket pop: ${Object.entries(popLabels).map(([k, v]) => `\`${k}\` ${v}`).join(', ') || 'none'} (of ${okScores.length} clips); the pop was not the strongest non-bounce transient in ${notStrongest.length}${notStrongest.length ? ` (${notStrongest.join(', ')})` : ''}.`)
  lines.push(`- Toss release |error| > 50 ms: ${releaseOutliers.length}${releaseOutliers.length ? ` (${releaseOutliers.join(', ')})` : ''}.`)
  lines.push(`- Toss apex outside 2 sigma of its reported uncertainty: ${apexZ.length}${apexZ.length ? ` (${apexZ.join(', ')})` : ''}. Toss apex height truth outside the reported range: ${heightMissed.length}${heightMissed.length ? ` (${heightMissed.join(', ')})` : ''}.`)
  lines.push(`- Speed-from-track (speed-experimental) refusals: ${Object.entries(refusals).map(([k, v]) => `"${k}" ${v}`).join('; ') || 'none'}.`)
  lines.push(`- Pose frames where a whole-body left/right mirror fits better than MediaPipe's labels (median per view): ${Object.entries(mirrored).map(([k, v]) => `${k} ${pct(median(v))}`).join(', ')}.`)
  lines.push(`- Outgoing tracks with detections off the ball: ${outgoingImpure.length}${outgoingImpure.length ? ` (${outgoingImpure.join(', ')})` : ''}.`)
  const rearPasses = ok.filter((r) => r.result.inputs?.view === 'rear').map((r) => ({ clip: r.clip, p: r.result.ball.passes[r.result.ball.finalPass] }))
  const tally = (values) => Object.entries(values.reduce((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {})).map(([k, v]) => `"${k}" ${v}`).join('; ')
  if (rearPasses.length) {
    // Bounce timing against truth (read from the corpus; the per-clip scores do not carry it).
    const bounceErrors = rearPasses.map(({ clip, p }) => {
      const truthFile = join(corpusRoot, byId.get(clip)?.files.truth ?? '')
      if (p.bounce.status !== 'experimental' || !existsSync(truthFile)) return `${clip} –`
      const t = JSON.parse(readFileSync(truthFile, 'utf8')).serves[0]?.events?.bounce
      return t?.inClip ? `${clip} ${signed((p.bounce.tReal - t.tReal) * 1000, 1)} ms` : `${clip} (truth bounce out of clip)`
    })
    lines.push(`- Rear view (${rearPasses.length} clips; the harness has no four-corner court tap): bounce ${tally(rearPasses.map(({ p }) => (p.bounce.status === 'experimental' ? 'located' : p.bounce.reason)))}, time error vs truth ${bounceErrors.join(', ')}; average speed ${tally(rearPasses.map(({ p }) => (p.averageSpeedRear.status === 'experimental' ? 'range' : p.averageSpeedRear.reason)))}.`)
  }
  lines.push('')

  lines.push('## Per clip: decode and time base')
  lines.push('')
  lines.push('| clip | set | decode path | frames decoded / container / truth | timeline fps (truth) | time base | gravity factor [95%] (expected) | suggestion | final capture fps / time scale (truth) |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of records) {
    const res = r.result
    if (!res?.meta) {
      lines.push(`| ${r.clip} | ${setOf.get(r.clip)} | – | – | – | – | – | – | failed: ${res?.error ?? r.error ?? 'no result'} |`)
      continue
    }
    const s = res.scores
    const g = s?.ball?.passes[0]?.gravity
    lines.push(
      `| ${r.clip} | ${r.set} | ${res.meta.decodePath} | ${s?.frames.decodedPose ?? '–'} / ${res.meta.probe.frameCount} / ${s?.frames.truth ?? '–'} | ${f(res.meta.probe.nominalFps, 2)} (${s?.timeBase.truth.fps ?? '–'}) | ${res.meta.timeBase.status} (${res.meta.timeBase.kind}) | ${g && num(g.factor) ? `${f(g.factor, 3)} [${f(g.low, 3)}-${f(g.high, 3)}] (${f(g.expected, 3)})` : `– (${g?.reason ?? 'no toss'})`} | ${g?.suggestion ?? '–'}${num(g?.suggestedTimeScale) && g.suggestedTimeScale !== 1 ? ` x${g.suggestedTimeScale}` : ''} | ${f(res.meta.final.captureFps, 1)} / ${res.meta.final.timeScale} (${s?.timeBase.truth.captureFps ?? '–'} / ${s?.timeBase.truth.timeScale ?? '–'})${s?.timeBase.final.matchesTruth ? '' : ' **mismatch**'} |`,
    )
  }
  lines.push('')

  lines.push('## Per clip: accuracy against truth')
  lines.push('')
  lines.push('Pose columns are raw tracked MediaPipe output (before cleaning). Ball and toss columns are the final pass (after any time-scale correction).')
  lines.push('')
  lines.push('| clip | pose detected | pose median / mean err (stature) | mirror-tol. mean | hitting wrist ±0.1 s | ball toss recall | ball precision (false / frame) | loc. err median / p95 (px) | toss track prec. / coverage | apex err (ms, z) | release err (ms) | apex height err (cm, in range) | audio contact onset err (ms, label) | ball layer contact from audio (ms) |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of records) {
    const s = r.result?.scores
    if (!r.result?.ok || !s) {
      lines.push(`| ${r.clip} | failed: ${r.result?.error ?? r.error ?? 'no result'} | | | | | | | | | | | | |`)
      continue
    }
    const p = s.pose?.raw
    const b = finalPassScore(r)
    const a = s.audio?.contact
    const h = b?.toss.apexHeight
    lines.push(
      `| ${r.clip} | ${pct(p?.detectionRate)} | ${f(p?.medianErrorBH, 3)} / ${f(p?.meanErrorBH, 3)} | ${f(p?.meanErrorBHMirrorTolerant, 3)} | ${f(p?.wristWindowErrorBH, 3)} | ${pct(b?.detection.recallToss)} | ${pct(b?.detection.precision)} (${f(b?.detection.falsePerFrame, 2)}) | ${f(b?.detection.errorMedianPx, 2)} / ${f(b?.detection.errorP95Px, 2)} | ${pct(b?.toss.trackPrecision)} / ${pct(b?.toss.coverage)} | ${b?.toss.status === 'ok' ? `${signed(b.toss.apexErrorMs, 2)} (${f(b.toss.apexZ, 1)})` : `– (${b?.toss.reason ?? b?.toss.status ?? 'no pass'})`} | ${signed(b?.toss.releaseErrorMs, 1)} | ${num(h?.errorM) ? `${signed(100 * h.errorM, 1)} (${h.covered ? 'yes' : 'no'})` : '–'} | ${a && num(a.nearestErrorMediaMs) ? `${signed(a.nearestErrorMediaMs, 2)} (${a.nearestKind}${a.strongestIsContact ? '' : ', not strongest'})` : s.audio ? `– (${s.audio.status}${a?.truthArrivalTMedia === null ? ', no pop in clip' : ', no onset within 30 ms'})` : '–'} | ${signed(b?.contactFromAudioErrorMs, 1)} |`,
    )
  }
  lines.push('')

  lines.push('## Per clip: stage times (s)')
  lines.push('')
  lines.push('Wall-clock seconds in the page. Pose pass includes decode (column "of which decode") and inference; ball pass includes RGBA decode and detection, summed over passes (2 passes after a slow-motion correction).')
  lines.push('')
  lines.push('| clip | frames | fetch | probe | audio decode + onsets | pose init | pose pass (of which decode) | pose ms/frame | pose clean | ball pass (decode / detect) | ball ms/frame | ball analyse | total |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of records) {
    const t = r.result?.timings
    if (!t) continue
    const frames = r.result.scores?.frames.decodedPose ?? r.result.pose?.frames ?? 0
    const ballFrames = (r.result.scores?.frames.decodedBall ?? 0) * (r.result.ball?.passes.length ?? 1)
    lines.push(
      `| ${r.clip} | ${frames} | ${secs(t.fetchMs)} | ${secs(t.probeMs)} | ${secs(t.audioDecodeMs + t.onsetsMs)} | ${secs(t.poseInitMs)} | ${secs(t.posePassMs)} (${secs(t.poseDecodeMs)}) | ${f(t.posePassMs / Math.max(1, frames), 0)} | ${secs(t.poseCleanMs)} | ${secs(t.ballPassMs)} (${secs(t.ballDecodeMs)} / ${secs(t.ballDetectMs)}) | ${f(t.ballPassMs / Math.max(1, ballFrames), 0)} | ${secs(t.ballAnalyseMs)} | ${secs(t.totalMs)} |`,
    )
  }
  lines.push('')

  const notes = records.flatMap((r) => (r.result?.notes ?? []).map((n) => `${r.clip}: ${n}`))
  if (notes.length) {
    lines.push('## Harness notes')
    lines.push('')
    for (const n of notes) lines.push(`- ${n}`)
    lines.push('')
  }
  writeFileSync(join(outDir, 'SUMMARY.md'), `${lines.join('\n')}\n`)
}

// ---------- CSP probe ----------

const TELEMETRY_URL = 'https://odml.pa.googleapis.com/v1/log'

/**
 * Tries the MediaPipe telemetry endpoint from the page and from inside the running pose worker.
 * XMLHttpRequest is used in the worker because pose.worker.ts wraps fetch in its own guard, so
 * only XHR shows whether the CSP itself governs the worker. The context router records (and
 * aborts) anything that gets past the CSP, so a probe can never leak.
 */
async function probeCsp(page, external) {
  const probe = (url) =>
    new Promise((resolve) => {
      const out = { violation: null, xhr: null, fetch: null }
      let pending = 2
      const done = () => {
        if (--pending === 0) setTimeout(() => resolve(out), 300)
      }
      self.addEventListener('securitypolicyviolation', (e) => (out.violation = `${e.violatedDirective} ${e.blockedURI}`), { once: true })
      try {
        const x = new XMLHttpRequest()
        x.open('POST', url)
        x.onload = () => ((out.xhr = `loaded HTTP ${x.status}`), done())
        x.onerror = () => ((out.xhr = 'network error'), done())
        x.send('privacy-probe')
      } catch (e) {
        out.xhr = `threw ${e.name}`
        done()
      }
      fetch(url, { method: 'POST', body: 'privacy-probe' }).then(
        (r) => ((out.fetch = `HTTP ${r.status}`), done()),
        (e) => ((out.fetch = `rejected: ${e.message}`), done()),
      )
    })
  const before = external.length
  const result = { page: null, worker: null, externalDuringProbe: [] }
  result.page = await page.evaluate(probe, TELEMETRY_URL).catch((e) => `failed: ${e.message}`)
  try {
    await page.waitForFunction(() => window.__harnessStatus?.stage === 'Pose', null, { timeout: 120_000, polling: 100 })
    const worker = page.workers().find((w) => w.url().startsWith('blob:'))
    result.workerUrl = worker ? worker.url().replace(/[0-9a-f-]{36}$/, '<uuid>') : null
    result.worker = worker ? await worker.evaluate(probe, TELEMETRY_URL) : 'no blob: worker found'
  } catch (error) {
    result.worker = `failed: ${error.message}`
  }
  result.externalDuringProbe = external.slice(before)
  // Blocked by the CSP = a violation was reported and nothing reached the network layer.
  result.pageBlockedByCsp = !!result.page?.violation && result.externalDuringProbe.length === 0
  result.workerBlockedByCsp = !!result.worker?.violation && result.externalDuringProbe.length === 0
  return result
}

// ---------- run ----------

async function main() {
  const selection = selectClips()
  mkdirSync(outDir, { recursive: true })
  const runInfo = { channel: option('--channel', 'msedge'), concurrency, browser: null }
  if (flag('--summary-only')) {
    const records = loadRecords(selection.map((s) => s.clip.id))
    const metaFile = join(outDir, 'run.json')
    if (existsSync(metaFile)) Object.assign(runInfo, JSON.parse(readFileSync(metaFile, 'utf8')))
    writeSummary(records, runInfo)
    console.log(`SUMMARY.md rebuilt from ${records.length} results`)
    return 0
  }

  const { chromium } = appRequire('playwright')
  const { createServer } = await import(pathToFileURL(appRequire.resolve('vite')).href)
  const vite = await createServer({
    root: appRoot,
    configFile: join(appRoot, 'vite.config.ts'),
    // Own optimiser cache: another dev server on this machine cannot trigger a re-optimisation reload mid-run.
    cacheDir: join(appRoot, 'node_modules/.vite-validate-smoke'),
    logLevel: 'warn',
    // No HMR socket and no file watching: an edit in src would otherwise reload a page mid-clip.
    // forwardConsole off: the page's console is recorded per clip here instead.
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, forwardConsole: false },
    optimizeDeps: { include: ['@mediapipe/tasks-vision', 'mp4box'] },
  })
  await vite.listen()
  const baseUrl = vite.resolvedUrls.local[0]
  const devHost = new URL(baseUrl).host

  const browser = await chromium.launch({ channel: runInfo.channel, headless: !flag('--headed') })
  runInfo.browser = `${runInfo.channel} ${browser.version()}`
  writeFileSync(join(outDir, 'run.json'), JSON.stringify(runInfo, null, 1))
  const context = await browser.newContext()
  // Record every request (pages and dedicated workers). Anything not for the dev server is a
  // privacy failure; abort it so nothing leaves the machine even if the CSP missed it.
  const external = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.host === devHost || url.protocol === 'blob:' || url.protocol === 'data:') return route.fallback()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  let exitCode = 0
  const queue = selection.filter(({ clip }) => flag('--force') || !existsSync(join(outDir, `${clip.id}.json`)) || !JSON.parse(readFileSync(join(outDir, `${clip.id}.json`), 'utf8')).result?.ok)
  console.log(`${baseUrl} | ${runInfo.browser} | ${queue.length} of ${selection.length} clips to run (${selection.length - queue.length} already have a result) | concurrency ${concurrency}`)
  // A second, passive record. Chromium reports requests the CSP refused as requests too (DevTools
  // shows them as "(blocked:csp)"), but they fail before reaching the network stack, so the router
  // above never sees them. A passive request that did not fail that way is counted as egress.
  const isExternal = (url) => url.host !== devHost && url.protocol !== 'blob:' && url.protocol !== 'data:'
  runInfo.blockedBeforeNetwork = []
  context.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (!isExternal(url)) return
    const failure = request.failure()?.errorText ?? 'unknown'
    const label = `${request.method()} ${url.origin}${url.pathname}`
    if (/BLOCKED_BY_CSP|blocked:csp|^csp$/i.test(failure)) runInfo.blockedBeforeNetwork.push(`${label} (${failure})`)
    else if (!external.includes(label) && !/BLOCKED_BY_CLIENT/i.test(failure)) external.push(`${label} (failed: ${failure}, not routed)`)
  })
  context.on('requestfinished', (request) => {
    const url = new URL(request.url())
    if (isExternal(url)) external.push(`${request.method()} ${url.origin}${url.pathname} (FINISHED)`)
  })
  // Warm-up (GPU shader compilation, JIT, dependency optimisation) on the smallest clip, not
  // reported. While its pose worker runs, the CSP is probed from inside the page and the worker.
  {
    const warm = await context.newPage()
    runInfo.warmupConsole = []
    warm.on('console', (m) => {
      if (m.type() === 'error' || /Content Security Policy|Refused|privacy/i.test(m.text())) runInfo.warmupConsole.push(`${m.type()}: ${m.text()}`)
    })
    const clip = byId.get('quick-side60')
    const q = new URLSearchParams({ clip: `/__synthetic/${clip.files.mp4}`, maxFrames: '150' })
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await warm.goto(`${baseUrl}validation.html?${q}`)
        if (attempt === 1) runInfo.privacyProbe = await probeCsp(warm, external)
        await warm.waitForFunction(() => window.__harnessResult !== undefined, null, { timeout: 180_000, polling: 500 })
        break
      } catch (error) {
        if (attempt === 3) console.warn(`warm-up failed: ${error.message}`)
      }
    }
    await warm.waitForTimeout(1000)
    await warm.close()
    console.log(`CSP probe: ${JSON.stringify(runInfo.privacyProbe)}`)
    if (runInfo.warmupConsole.length) console.log(`warm-up console:\n  ${[...new Set(runInfo.warmupConsole)].join('\n  ')}`)
  }

  let next = 0
  let done = 0
  async function worker() {
    for (;;) {
      const item = queue[next++]
      if (!item) return
      const { clip, set } = item
      const page = await context.newPage()
      const consoleMessages = []
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') consoleMessages.push(`${m.type()}: ${m.text()}`)
      })
      page.on('pageerror', (e) => consoleMessages.push(`pageerror: ${e.message}`))
      const externalBefore = external.length
      const query = new URLSearchParams({ clip: `/__synthetic/${clip.files.mp4}` })
      if (clip.files.truth && existsSync(join(corpusRoot, clip.files.truth))) query.set('truth', `/__synthetic/${clip.files.truth}`)
      const started = Date.now()
      let record
      try {
        await page.goto(`${baseUrl}validation.html?${query}`)
        await page.waitForFunction(() => window.__harnessResult !== undefined, null, { timeout: timeoutMs, polling: 1000 })
        if (flag('--full')) {
          const fullDir = resolve(option('--full-dir', join(outDir, 'full')))
          mkdirSync(fullDir, { recursive: true })
          writeFileSync(join(fullDir, `${clip.id}.json`), JSON.stringify(await page.evaluate(() => window.__harnessResult)))
        }
        const result = compactResult(await page.evaluate(() => window.__harnessResult))
        // Let a late worker message (e.g. a blocked telemetry flush) reach the console.
        await page.waitForTimeout(500)
        record = { clip: clip.id, set, wallS: (Date.now() - started) / 1000, result, privacy: { externalRequests: external.slice(externalBefore), consoleMessages } }
      } catch (error) {
        record = { clip: clip.id, set, wallS: (Date.now() - started) / 1000, error: error.message, result: null, privacy: { externalRequests: external.slice(externalBefore), consoleMessages } }
      }
      await page.close()
      if (!record.result?.ok || record.privacy.externalRequests.length) exitCode = 1
      writeFileSync(join(outDir, `${clip.id}.json`), `${JSON.stringify(record, null, 1)}\n`)
      done++
      const s = record.result?.scores
      const b = s?.ball?.passes[s.ball.finalPass]
      console.log(
        [
          `${String(done).padStart(3)}/${queue.length}`,
          clip.id.padEnd(20),
          record.result?.ok ? 'ok ' : `FAIL ${record.result?.failedStage ?? ''} ${record.result?.error ?? record.error ?? ''}`,
          `${f(record.wallS, 0)} s`,
          record.result?.meta?.decodePath ?? '',
          s ? `frames ${s.frames.decodedPose}/${s.frames.truth}` : '',
          s?.pose ? `pose ${pct(s.pose.raw.detectionRate)} ${f(s.pose.raw.medianErrorBH, 3)} BH` : '',
          b ? `ball recall ${pct(b.detection.recallToss)} prec ${pct(b.detection.precision)} apex ${signed(b.toss.apexErrorMs, 2)} ms grav ${f(s.ball.passes[0].gravity.factor, 3)}` : '',
          s?.audio ? `onset ${signed(s.audio.contact.nearestErrorMediaMs, 2)} ms` : '',
          record.privacy.externalRequests.length ? `EXTERNAL ${record.privacy.externalRequests.length}` : '',
        ].join(' | '),
      )
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()))
  } finally {
    await browser.close()
    await vite.close()
  }
  runInfo.externalRequests = [...external]
  writeFileSync(join(outDir, 'run.json'), JSON.stringify(runInfo, null, 1))
  writeSummary(loadRecords(selection.map((s) => s.clip.id)), runInfo)
  console.log(`Results in ${outDir}; external requests during the run (warm-up included): ${external.length}`)
  for (const r of new Set(external)) console.log(`  ${r}`)
  console.log(`Refused by the CSP before the network stack: ${runInfo.blockedBeforeNetwork.length}`)
  for (const r of new Set(runInfo.blockedBeforeNetwork)) console.log(`  ${r}`)
  return external.length ? 1 : exitCode
}

process.exitCode = await main()
