#!/usr/bin/env node
/**
 * Builds the app's sample ("See a sample session", ARCHITECTURE §11) from REAL engine output.
 *
 *   node scripts/build-demo.mjs [--port 5219] [--reuse] [--pinned <library item id>]
 *
 * Starts its own Vite dev server (no HMR, no file watching, so editing sources while it runs cannot
 * reload the page mid-analysis). --reuse keeps the encoded clips and the cached pipeline output of
 * the last run and redoes only tags, coaching and the export.
 *
 * The sample player is the synthetic 1.80 m intermediate from tools/synth (DECISIONS D11 segment):
 *   1. sample-s1 (Sat 5 Sep): the corpus's multi-serve session clip (8 serves, deuce and ad
 *      alternating, 6 m). A short both-sides block: the engine reports it honestly, per court side.
 *   2. sample-s2 (Sat 12 Sep): check-in, 16 first serves to the deuce court in the D1 default set-up
 *      (tools/synth scenario sample-checkin: an inconsistent toss). Coaching picks the focus here and
 *      the sample player starts the experiment.
 *   3. sample-s3 (Sat 26 Sep): re-test after two logged practices (scenario sample-retest).
 *
 * Per session:
 *   a. The analysed file is the rendered clip's video stream without its audio track (stream copy,
 *      no re-encode): what the phone recorded. The pipeline (analysis/pipeline runAnalysis: real
 *      MediaPipe pose worker, ball worker, engine.ts) runs on it in headless Edge (390 x 844). The
 *      capture context is an in-app recording's; the phone pitch comes from the synthetic camera, as
 *      the motion sensors would give it (tools/validate/metrics-eval.ts convention).
 *   b. The copy the app plays back is a 720 x 1280 H.264 re-encode with no audio track, 8 MB or less
 *      (same frames and timing, so overlays line up; stored videos never have sound, D4/D8).
 * Then the sample player's own entries are added (outcome tags from the generator's ball flight,
 * first serves, flat, the aimed target; two practice logs; two match logs), and the real coaching
 * engine and statistics run through the same code the app uses after an analysis
 * (integration/coachingSync.ts): decisions, the experiment, the re-test link and "Did it work?".
 *
 * Output: public/demo/seed@1.json, public/demo/keyframes/*.jpg, public/demo/sample-s*.mp4.
 */
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const repoRoot = resolve(appRoot, '..')
const corpus = join(repoRoot, 'validation/synthetic/clips')
const outDir = join(appRoot, 'public/demo')
const workDir = join(tmpdir(), 'serve-coach-demo-build')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const port = Number(arg('port', '5219'))
const base = `http://localhost:${port}`
// 8 MB per playback clip (decimal, the stricter reading).
const MAX_BYTES = 8_000_000

/** Oldest first. Times are Melbourne local (AEST, +10:00). */
const SESSIONS = [
  {
    id: 'sample-s1',
    clip: 'session',
    role: 'first',
    startedAt: '2026-09-05T08:10:00+10:00',
    template: 'both-sides',
    decideAt: '2026-09-05T08:40:00+10:00',
    note: 'Synthetic multi-serve session clip: 8 serves alternating deuce and ad, pauses, pre-serve bounces, distant hits from other courts; side view, portrait, 6 m, 60 fps.',
  },
  {
    id: 'sample-s2',
    clip: 'sample-checkin',
    role: 'baseline',
    startedAt: '2026-09-12T08:05:00+10:00',
    template: 'check-in',
    decideAt: '2026-09-12T08:45:00+10:00',
    note: 'Synthetic check-in: 16 first serves to the deuce court, D1 default set-up (portrait, 7.5 m from the centre mark, level phone 1.4 m high, 60 fps); an inconsistent toss.',
  },
  {
    id: 'sample-s3',
    clip: 'sample-retest',
    role: 'retest',
    startedAt: '2026-09-26T08:05:00+10:00',
    template: 'retest',
    decideAt: '2026-09-26T08:45:00+10:00',
    note: 'Synthetic re-test two weeks later: 16 first serves to the deuce court, same set-up; steadier serves after a toss drill.',
  },
]
const FEATURED = 'sample-s3'
const EXPERIMENT_CREATED_AT = '2026-09-12T09:00:00+10:00'

const PRACTICE = [
  { date: '2026-09-16', createdAt: '2026-09-16T19:05:00+10:00', minutes: 10, reps: 40, successCriterionMet: 'partly', feel: 'awkward', cueHelpful: 'not-sure', body: 'fine' },
  { date: '2026-09-21', createdAt: '2026-09-21T18:40:00+10:00', minutes: 12, reps: 45, successCriterionMet: 'yes', feel: 'ok', cueHelpful: 'yes', body: 'fine' },
]

const MATCH_LOGS = [
  { id: 'sample-match-1', date: '2026-09-15', competition: 'night-comp', serviceGames: 5, doubleFaults: 3, firstServeRough: 'about-half', cueUsed: 'no', createdAt: '2026-09-16T07:30:00+10:00', updatedAt: '2026-09-16T07:30:00+10:00' },
  { id: 'sample-match-2', date: '2026-09-22', competition: 'night-comp', serviceGames: 6, doubleFaults: 2, firstServeRough: 'most', cueUsed: 'yes', createdAt: '2026-09-23T07:15:00+10:00', updatedAt: '2026-09-23T07:15:00+10:00' },
]

function log(...a) {
  console.log('[build-demo]', ...a)
}

// ---------------------------------------------------------------------------------------------
// 1. Files: the analysed stream (no audio, not re-encoded) and the playback copy (720p, <= 8 MB)
// ---------------------------------------------------------------------------------------------

function ffmpeg(argv, what) {
  const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...argv], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${what}`)
}

function prepareFiles(s) {
  const src = join(corpus, s.clip, `${s.clip}.mp4`)
  if (!existsSync(src)) throw new Error(`${src} is missing: render it with tools/synth (scenario ${s.clip})`)
  const analysis = join(workDir, `${s.id}-analysis.mp4`)
  if (!(flag('reuse') && existsSync(analysis))) ffmpeg(['-i', src, '-an', '-c:v', 'copy', '-movflags', '+faststart', analysis], `${s.id} analysis copy`)
  const playback = join(outDir, `${s.id}.mp4`)
  if (!(flag('reuse') && existsSync(playback))) {
    let ok = false
    for (const crf of [28, 30, 32, 34]) {
      ffmpeg(['-i', src, '-an', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-g', '60', '-movflags', '+faststart', playback], `${s.id} playback copy`)
      const bytes = statSync(playback).size
      log(`${s.id}.mp4: 720p CRF ${crf}, ${(bytes / 1e6).toFixed(2)} MB`)
      if (bytes <= MAX_BYTES) {
        ok = true
        break
      }
    }
    if (!ok) throw new Error(`${s.id}.mp4 is over 8 MB`)
  }
  return { analysisUrl: `/__demo-work/${s.id}-analysis.mp4`, playbackFile: `${s.id}.mp4`, playbackBytes: statSync(playback).size }
}

// ---------------------------------------------------------------------------------------------
// 2. Truth (camera pitch as a motion sensor would read it; the sample player's entries)
// ---------------------------------------------------------------------------------------------

function truthFor(clip) {
  const truth = JSON.parse(readFileSync(join(corpus, clip, 'truth.json'), 'utf8'))
  const extra = JSON.parse(readFileSync(join(corpus, clip, 'truth-extra.json'), 'utf8'))
  const R = truth.settings.extrinsics.R
  const deg = (v) => (Math.asin(Math.max(-1, Math.min(1, v))) * 180) / Math.PI
  const pitchDeg = deg(R[8])
  const roll = deg(R[2])
  const rollDeg = Math.abs(roll) < 1e-6 ? 0 : -roll
  const serves = truth.serves.map((s, k) => ({
    index: k,
    contactT: s.events.contact?.tReal,
    courtSide: s.courtSide,
    direction: s.direction,
    style: s.style,
    outcome: extra.serves?.[k]?.outcome,
  }))
  return { pitchDeg, rollDeg, serves, video: truth.video, player: truth.player, distanceM: truth.settings.distanceM }
}

// ---------------------------------------------------------------------------------------------
// 3. In the page
// ---------------------------------------------------------------------------------------------

/** Runs the production pipeline on one clip and returns every stored row (typed arrays packed). */
async function analyseInPage(spec) {
  const data = await import('/src/data/index.ts')
  const { runAnalysis } = await import('/src/analysis/pipeline/index.ts')
  const { getDb } = await import('/src/data/db.ts')
  const { packTyped } = await import('/src/data/sample.ts')
  const res = await fetch(spec.analysisUrl)
  if (!res.ok) throw new Error(`${spec.analysisUrl}: HTTP ${res.status}`)
  const blob = await res.blob()
  const file = new File([blob], spec.playbackFile, { type: 'video/mp4' })
  await data.createSession(
    {
      id: spec.id,
      startedAt: spec.startedAt,
      createdAt: spec.startedAt,
      status: 'queued',
      mode: 'technique',
      view: 'side',
      cameraSide: 'chest',
      setup: 'side-portrait',
      orientation: 'portrait',
      template: spec.template,
      blockIndex: 0,
      conditions: { wind: 'calm', light: 'day' },
      ...(spec.capture.serveSide !== 'both' ? { defaultSide: spec.capture.serveSide } : {}),
      defaultServeNumber: 1,
      defaultIntendedType: 'flat',
      label: 'Sample: synthetic player',
      isDemo: 1,
    },
    new Date(spec.startedAt),
  )
  const t0 = performance.now()
  const result = await runAnalysis(file, {
    sessionId: spec.id,
    profile: { heightM: spec.capture.playerHeightM, handedness: spec.capture.handedness },
    view: 'side',
    capture: spec.capture,
    hitSoundTiming: false,
    source: 'demo',
  })
  const ms = performance.now() - t0
  const db = getDb()
  const toDataUrl = (b) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      r.readAsDataURL(b)
    })
  const kf = []
  for (const k of await db.keyFrames.where('sessionId').equals(spec.id).toArray()) {
    const { blob: b, ...rest } = k
    kf.push({ ...rest, dataUrl: await toDataUrl(b) })
  }
  return {
    ms,
    result: { servesFound: result.servesFound, servesIncluded: result.servesIncluded, keyFrames: result.keyFrames, warnings: result.warnings, timeBase: result.timeBase, serveFinding: result.serveFinding, coaching: result.coaching },
    // Typed arrays (tracks) cross page.evaluate and JSON as base64 (data/sample.ts packTyped).
    session: packTyped(await db.sessions.get(spec.id)),
    videos: packTyped(await db.videos.where('sessionId').equals(spec.id).toArray()),
    serves: packTyped(await db.serves.where('sessionId').equals(spec.id).toArray()),
    tracks: packTyped(await db.tracks.where('sessionId').equals(spec.id).toArray()),
    stats: packTyped(await db.sessionStats.get(spec.id)),
    keyFrames: kf,
  }
}

/** Inserts the analysed rows, adds the sample player's entries and runs the coaching loop. */
async function assembleInPage(input) {
  const { getDb } = await import('/src/data/db.ts')
  const data = await import('/src/data/index.ts')
  const sample = await import('/src/data/sample.ts')
  const { syncCoaching } = await import('/src/integration/coachingSync.ts')
  const { toExperimentRecord } = await import('/src/ui/screens/focus/adapter.ts')
  const { toCoachingRecord, LIBRARY_VERSION, ENGINE_VERSION } = await import('/src/coaching/index.ts')
  const { PIPELINE_VERSION } = await import('/src/analysis/pipeline/index.ts')
  const db = getDb()
  if (input.pinned) sample.SAMPLE_PROFILE.pinnedFocusItemId = input.pinned
  const fromDataUrl = async (u) => (await fetch(u)).blob()
  const brief = (d) => (d ? { kind: d.kind, itemId: d.itemId ?? null, title: d.title ?? null, verdict: d.verdict ?? null, experiment: d.experiment ?? null } : null)

  // Analysed rows, as the pipeline stored them. The pipeline's own coaching row is dropped: the
  // sync below decides with the full history, tags and experiment, as the app does after analysis.
  for (const w of input.work) {
    await db.sessions.put(sample.unpackTyped(w.session))
    await db.videos.bulkPut(sample.unpackTyped(w.videos))
    await db.serves.bulkPut(sample.unpackTyped(w.serves))
    await db.tracks.bulkPut(sample.unpackTyped(w.tracks))
    await db.sessionStats.put(sample.unpackTyped(w.stats))
    const frames = []
    for (const k of w.keyFrames) {
      const { dataUrl, ...rest } = k
      frames.push({ ...rest, blob: await fromDataUrl(dataUrl) })
    }
    await db.keyFrames.bulkPut(frames)
  }
  await db.coaching.clear()

  // The sample player's tags: outcome (from the generator's ball flight), first serve, flat, aim and
  // the court side (all player-entered, "You logged").
  const zone = { T: 'T', body: 'body', wide: 'wide' }
  const matches = {}
  for (const w of input.work) {
    const truth = input.truth[w.session.id]
    const tags = []
    const matched = []
    for (const s of [...w.serves].sort((a, b) => a.index - b.index)) {
      const contact = s.events?.contact?.tReal
      let best = null
      for (const t of truth) {
        const d = Math.abs((t.contactT ?? 1e9) - (contact ?? -1e9))
        if (d < 0.5 && (!best || d < best.d)) best = { t, d }
      }
      matched.push({ serve: s.index, truth: best?.t.index ?? null, dt: best ? Number(best.d.toFixed(3)) : null })
      if (!best || !best.t.outcome) continue
      tags.push({
        serveId: s.id,
        sessionId: w.session.id,
        outcome: best.t.outcome,
        outcomeSource: 'player',
        serveNumber: 1,
        side: best.t.courtSide,
        intendedType: best.t.style === 'kick' || best.t.style === 'slice' ? best.t.style : 'flat',
        targetZone: zone[best.t.direction],
        taggedAt: new Date(new Date(w.session.startedAt).getTime() + 35 * 60_000).toISOString(),
        via: 'review',
      })
    }
    matches[w.session.id] = matched
    await db.tags.bulkPut(tags)
  }

  const [first, baseline, retest] = input.sessions
  const out = { matches }
  out.first = brief((await syncCoaching({ sessionId: first.id, now: new Date(first.decideAt), experimental: false })).decision)
  const rb = await syncCoaching({ sessionId: baseline.id, now: new Date(baseline.decideAt), experimental: false })
  out.baseline = brief(rb.decision)
  let experiment = null
  if (rb.decision && rb.decision.kind === 'focus') {
    // "Start drill" on the check-in's focus (focus/actions.ts ensureExperiment, with fixed ids/dates).
    const decisionId = rb.record.id
    experiment = await data.createExperiment({
      ...toExperimentRecord(rb.decision, decisionId, [baseline.id], { isDemo: true }),
      id: 'sample-exp-1',
      createdAt: input.experimentCreatedAt,
    })
    await data.putDecision(toCoachingRecord(rb.decision, { id: decisionId, isDemo: true, experimentId: experiment.id }))
    for (const [i, p] of input.practice.entries()) {
      await data.logPractice({
        id: `sample-practice-${i + 1}`,
        experimentId: experiment.id,
        itemId: rb.decision.itemId,
        drillId: rb.decision.drill.id,
        drillVariant: 'base',
        cueRegisterUsed: rb.decision.cue.register,
        setting: 'court',
        isDemo: 1,
        ...p,
      })
    }
    // The re-test was recorded with Record's re-test plan (locked to the experiment's stratum).
    await db.sessions.update(retest.id, { isRetest: 1, experimentId: experiment.id })
  }
  const rr = await syncCoaching({ sessionId: retest.id, now: new Date(retest.decideAt), experimental: false })
  out.retest = brief(rr.decision)
  out.attachedRetest = rr.attachedRetest ?? null
  for (const m of input.matchLogs) await data.saveMatchLog({ ...m, ...(experiment ? { experimentId: experiment.id } : {}), isDemo: 1 })

  const toDataUrl = (b) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      r.readAsDataURL(b)
    })
  const sessions = []
  for (const s of input.sessions) {
    const kf = []
    for (const k of await db.keyFrames.where('sessionId').equals(s.id).toArray()) {
      const { blob, ...rest } = k
      kf.push({ ...rest, dataUrl: await toDataUrl(blob) })
    }
    sessions.push(
      sample.packTyped({
        session: await db.sessions.get(s.id),
        videos: await db.videos.where('sessionId').equals(s.id).toArray(),
        serves: await db.serves.where('sessionId').equals(s.id).sortBy('index'),
        tracks: await db.tracks.where('sessionId').equals(s.id).toArray(),
        keyFrames: kf,
        stats: await db.sessionStats.get(s.id),
        tags: await db.tags.where('sessionId').equals(s.id).toArray(),
        tally: (await db.tallies.get(s.id)) ?? undefined,
      }),
    )
  }
  return {
    ...out,
    versions: { pipeline: PIPELINE_VERSION, engine: sessions[0].session.analysis?.engine?.engineVersion ?? 'unknown', coachingLibrary: LIBRARY_VERSION, coachingEngine: ENGINE_VERSION },
    sessions,
    decisions: sample.packTyped(await db.coaching.toArray()),
    experiments: sample.packTyped(await db.experiments.toArray()),
    practiceLogs: await db.practiceLogs.toArray(),
    matchLogs: await db.matchLogs.toArray(),
  }
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

const safeName = (id) => id.replace(/[^a-zA-Z0-9_-]+/g, '_')
const dataUrlToBuffer = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64')

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const problems = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  const url = `${base}/src/analysis/pipeline/e2e/pipeline-e2e.html`
  await page.goto(url)
  // Warm every module the run imports, so a first-time dependency optimisation (which reloads the
  // page) happens now and not in the middle of an analysis.
  await page
    .evaluate(() =>
      Promise.all(
        ['/src/data/index.ts', '/src/analysis/pipeline/index.ts', '/src/integration/coachingSync.ts', '/src/ui/screens/focus/adapter.ts', '/src/coaching/index.ts'].map(
          (m) => import(m),
        ),
      ),
    )
    .catch(() => undefined)
  await page.waitForTimeout(1500)
  await page.goto(url)
  return { context, page, problems }
}

/** Serves the analysis copies (outside public/) at /__demo-work/ on the build's own server. */
const workFiles = {
  name: 'demo-work-files',
  configureServer(server) {
    server.middlewares.use('/__demo-work/', (req, res, next) => {
      const file = join(workDir, decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, ''))
      if (!file.startsWith(workDir) || !existsSync(file)) return next()
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Length', String(statSync(file).size))
      createReadStream(file).pipe(res)
    })
  },
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  mkdirSync(workDir, { recursive: true })
  const truth = {}
  const specs = []
  for (const s of SESSIONS) {
    const t = truthFor(s.clip)
    truth[s.id] = t.serves
    const files = prepareFiles(s)
    const sides = [...new Set(t.serves.map((x) => x.courtSide))]
    specs.push({
      ...s,
      ...files,
      serveCount: t.serves.length,
      capture: {
        source: 'in-app-web',
        declaredView: 'side',
        cameraSide: 'chest',
        serveSide: sides.length === 1 ? sides[0] : 'both',
        serveNumber: 1,
        intendedType: 'flat',
        intendedTarget: 'mixed',
        handedness: t.player.handedness,
        playerHeightM: t.player.heightM,
        playerHeightSource: 'entered',
        conditions: { wind: 'calm', light: 'day' },
        requested: { width: 1080, height: 1920, fps: 60 },
        delivered: { width: t.video.width, height: t.video.height, fps: t.video.fps, mimeType: 'video/mp4' },
        orientation: 'portrait',
        setup: 'side-portrait',
        videoFovDeg: 67.3,
        orientationSamples: [{ tMs: 0, pitchDeg: Number(t.pitchDeg.toFixed(3)), rollDeg: Number(t.rollDeg.toFixed(3)) }],
        hitSoundTiming: false,
        expectedServeCount: t.serves.length,
      },
    })
  }

  const server = await createServer({
    configFile: join(appRoot, 'vite.config.ts'),
    root: appRoot,
    logLevel: 'warn',
    plugins: [workFiles],
    server: { port, strictPort: true, hmr: false, watch: null },
  })
  await server.listen()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const work = []
  const report = { sessions: [] }
  try {
    for (const spec of specs) {
      const cached = join(workDir, `${spec.id}.json`)
      if (flag('reuse') && existsSync(cached)) {
        log(`${spec.id}: reusing ${cached}`)
        work.push(JSON.parse(readFileSync(cached, 'utf8')))
        continue
      }
      log(`${spec.id}: analysing ${spec.clip} (${spec.serveCount} serves in the clip)`)
      const { context, page, problems } = await newPage(browser)
      const w = await page.evaluate(analyseInPage, spec)
      await context.close()
      log(`${spec.id}: ${w.result.servesFound} serves found, ${w.result.servesIncluded} included, ${w.keyFrames.length} key frames, ${(w.ms / 1000).toFixed(1)} s`)
      if (problems.length) log(`${spec.id}: console errors:`, problems.slice(0, 5))
      writeFileSync(cached, JSON.stringify(w))
      work.push(w)
    }
    for (const w of work) report.sessions.push({ id: w.session.id, servesFound: w.result.servesFound, servesIncluded: w.result.servesIncluded, warnings: w.result.warnings, serveFinding: w.result.serveFinding, pipelineMs: Math.round(w.ms) })

    log('assembling: tags, coaching, experiment, re-test, verdict')
    const { context, page, problems } = await newPage(browser)
    const assembled = await page.evaluate(assembleInPage, {
      work,
      truth,
      sessions: SESSIONS,
      practice: PRACTICE,
      matchLogs: MATCH_LOGS,
      experimentCreatedAt: EXPERIMENT_CREATED_AT,
      pinned: arg('pinned', null),
    })
    await context.close()
    if (problems.length) log('assemble console errors:', problems.slice(0, 5))
    for (const k of ['first', 'baseline', 'retest']) log(`decision (${k}):`, JSON.stringify(assembled[k]))
    log('serve matching:', JSON.stringify(assembled.matches))

    const kfDir = join(outDir, 'keyframes')
    rmSync(kfDir, { recursive: true, force: true })
    mkdirSync(kfDir, { recursive: true })
    const sessions = assembled.sessions.map((s, i) => {
      const spec = specs[i]
      const keyFrames = s.keyFrames.map((k) => {
        const { dataUrl, ...rest } = k
        const file = `keyframes/${safeName(k.id)}.jpg`
        writeFileSync(join(outDir, file), dataUrlToBuffer(dataUrl))
        return { ...rest, file }
      })
      // The stored copy is the no-audio playback file (an in-app recording never records sound).
      const videos = s.videos.map((v) => ({
        ...v,
        isDemo: 1,
        role: 'primary',
        source: 'demo',
        storage: 'idb',
        audio: 'never-recorded',
        fileName: spec.playbackFile,
        mimeType: 'video/mp4',
        sizeBytes: spec.playbackBytes,
        meta: { ...v.meta, hasAudio: false },
        file: spec.playbackFile,
      }))
      return { ...s, session: { ...s.session, isDemo: 1 }, videos, keyFrames }
    })
    const seed = {
      format: 'serve-coach-sample/1',
      note: "Sample data: a computer-generated player, analysed by the real engine. Tags, practice and match logs are the sample player's own entries.",
      builtAt: new Date().toISOString(),
      versions: assembled.versions,
      provenance: specs.map((s) => ({ sessionId: s.id, clip: s.clip, serves: s.serveCount, note: s.note })),
      profile: {
        id: 'me', heightM: 1.8, handedness: 'right', level: 'utr-4-5', utr: 4, goal: 'first-serves-in', ageBand: '18-plus',
        playStyle: ['night-comp'], matchNights: ['tue'], inSegment: 1, comfortRegions: [], comfort: { painFlag: 0 },
        createdAt: '2026-09-05T07:50:00+10:00', updatedAt: '2026-09-05T07:50:00+10:00',
      },
      featuredSessionId: FEATURED,
      sessions,
      decisions: assembled.decisions.map((d) => ({ ...d, isDemo: 1 })),
      experiments: assembled.experiments.map((e) => ({ ...e, isDemo: 1 })),
      practiceLogs: assembled.practiceLogs.map((p) => ({ ...p, isDemo: 1 })),
      matchLogs: assembled.matchLogs.map((m) => ({ ...m, isDemo: 1 })),
    }
    writeFileSync(join(outDir, 'seed@1.json'), JSON.stringify(seed))
    Object.assign(report, {
      decisions: { first: assembled.first, baseline: assembled.baseline, retest: assembled.retest },
      attachedRetest: assembled.attachedRetest,
      experiment: seed.experiments[0] ? { id: seed.experiments[0].id, primaryMetricId: seed.experiments[0].primaryMetricId, stratum: seed.experiments[0].stratum, result: seed.experiments[0].result } : null,
      matches: assembled.matches,
      seedBytes: statSync(join(outDir, 'seed@1.json')).size,
    })
    writeFileSync(join(workDir, 'report.json'), JSON.stringify(report, null, 2))
    log(`wrote ${join(outDir, 'seed@1.json')} (${(report.seedBytes / 1e6).toFixed(2)} MB) and ${sessions.reduce((a, s) => a + s.keyFrames.length, 0)} key frames`)
    log(`report: ${join(workDir, 'report.json')}`)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
