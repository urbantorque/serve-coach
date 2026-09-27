import type { OutputSpec, Scenario } from './setup.ts'

/**
 * The synthetic validation corpus. A Scenario here is a render job: one motion clip rendered once
 * and encoded to one or more output clips (different frame rates by decimation, CRFs, slow-motion
 * re-timing, WebM). Every output carries the ids of the scenario groups it belongs to in `tags`;
 * `--scenario <group>` renders every job with an output in that group.
 *
 * Reference setup ("baseline"): side view from the chest side at 5 m, camera 1.2 m high aimed at
 * 1.6 m, 26 mm-equivalent main lens, 1080x1920 portrait, 60 fps, bright sun, hard court, 1.80 m
 * right-handed intermediate player, five serves (deuce T/wide/body, ad T/wide). Sweeps change one
 * factor at a time and keep the same five serves (same serve seed), so results pair up by serve.
 */

export const BASE_CRF = 20
const SERVE_SEED = 20260927
const SERVE_COUNT = 5
const COURT_SIDES = ['deuce', 'deuce', 'deuce', 'ad', 'ad'] as const
const DIRECTIONS = ['T', 'wide', 'body', 'T', 'wide'] as const

export interface ScenarioGroup {
  id: string
  description: string
}

export const GROUPS: ScenarioGroup[] = [
  { id: 'quick', description: 'Three short, low-resolution clips for CI (side 60 fps with WebM, rear 30 fps left-hander, 240 fps slow motion re-timed to 30 fps)' },
  { id: 'baseline', description: 'Reference: side 5 m, 60 fps, 1080x1920 portrait, main lens, bright, 1.80 m right-hander, 5 serves (one clip per serve, plus a VP9 WebM of serve 1)' },
  { id: 'fps-sweep', description: '30/60/120/240 fps of the same five serves (one 240 fps render, decimated)' },
  { id: 'crf-sweep', description: `H.264 CRF 18/28/36 of the baseline serves (baseline itself is CRF ${BASE_CRF})` },
  { id: 'slomo', description: '240 fps capture re-timed to 30 fps media (1 real s = 8 media s, timeScale 0.125), serves 1-2' },
  { id: 'view-sweep', description: 'Rear and front-45 views (side is the baseline)' },
  { id: 'distance-sweep', description: 'Side view at 4, 7 and 12 m (5 m is the baseline)' },
  { id: 'lighting-sweep', description: 'Overcast, dusk (60 fps) and night under floodlights with 100 Hz flicker (240 fps)' },
  { id: 'shake', description: 'Handheld camera shake' },
  { id: 'toss-out-of-frame', description: 'Landscape, close and low: the toss apex leaves the top of the frame' },
  { id: 'left-handed', description: 'Left-handed player (mirrored model)' },
  { id: 'height-sweep', description: '1.60 m and 1.95 m players (toss and landing scale with height)' },
  { id: 'beginner', description: 'Beginner profile: high variability, little knee bend' },
  { id: 'advanced', description: 'Advanced profile: deep knee bend, jump, consistent toss, foot-up stance' },
  { id: 'session', description: 'One continuous multi-serve session clip: 8 serves, alternating sides, pauses, pre-serve ball bounces, distant distractor hits' },
  { id: 'default75', description: 'DECISIONS D1 default set-up: portrait side view 7.5 m from the centre mark, level phone 1.4 m high, 60 fps (deuce serves 1-3)' },
  { id: 'fence9', description: 'DECISIONS D1 alternative: landscape side view at the side fence, 9 m from the centre mark, level phone 1.6 m high, 1080p, 60 fps (deuce serves 1-3)' },
]

type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] }

function baseScenario(id: string, description: string, over: Partial2<Scenario> & { outputs: OutputSpec[] }): Scenario {
  const base: Scenario = {
    id,
    description,
    seed: 7001,
    player: { profile: 'intermediate' },
    serves: { count: SERVE_COUNT, serveSeed: SERVE_SEED, courtSides: [...COURT_SIDES], directions: [...DIRECTIONS] },
    video: { fps: 60, orientation: 'portrait', shortSidePx: 1080 },
    camera: { view: 'side', distanceM: 5, heightM: 1.2, lookAtHeightM: 1.6, focal35mmEquivMm: 26 },
    look: { lighting: 'bright', surface: 'hard-blue' },
    audio: { backgroundDbfs: -50 },
    outputs: [],
  }
  return {
    ...base,
    ...over,
    player: { ...base.player, ...over.player },
    serves: { ...base.serves, ...over.serves },
    video: { ...base.video, ...over.video },
    camera: { ...base.camera, ...over.camera },
    look: { ...base.look, ...over.look },
    audio: { ...base.audio, ...over.audio },
    outputs: over.outputs,
  } as Scenario
}

/** One job per serve (serve k of the shared five), each with a single 60 fps output. */
function perServe(prefix: string, groups: string[], description: string, over: Partial2<Scenario>, outputs?: (k: number) => OutputSpec[]): Scenario[] {
  return Array.from({ length: SERVE_COUNT }, (_, k) =>
    baseScenario(`${prefix}-s${k + 1}`, `${description} (serve ${k + 1} of ${SERVE_COUNT})`, {
      ...over,
      serves: { ...over.serves, pick: k },
      outputs: outputs ? outputs(k) : [{ id: `${prefix}-s${k + 1}`, tags: [...groups], crf: BASE_CRF }],
    }),
  )
}

/**
 * The DECISIONS D1 (revised 2026-09-27) set-ups: camera on the hitting-arm (chest) side on the
 * baseline extension, measured from the centre mark, level phone, 60 fps. Only the three deuce
 * serves (T, wide, body), where the right-hander stands nearer the camera than the centre mark.
 */
function d1SetupJobs(): Scenario[] {
  const deuce = [0, 1, 2]
  const mk = (prefix: string, groups: string[], description: string, over: Partial2<Scenario>): Scenario[] =>
    deuce.map((k) =>
      baseScenario(`${prefix}-s${k + 1}`, `${description} (serve ${k + 1} of ${SERVE_COUNT})`, {
        ...over,
        serves: { pick: k },
        outputs: [{ id: `${prefix}-s${k + 1}`, tags: [...groups], crf: BASE_CRF }],
      }),
    )
  return [
    ...mk('default75', ['default75', 'view-side', 'fps-60', 'level-camera', 'anchor-centre-mark'], 'D1 default: portrait side view 7.5 m from the centre mark, level phone 1.4 m high', {
      camera: { view: 'side', distanceM: 7.5, heightM: 1.4, lookAtHeightM: 1.4, anchor: 'centre-mark' },
    }),
    ...mk('fence9', ['fence9', 'view-side', 'fps-60', 'landscape', 'level-camera', 'anchor-centre-mark'], 'D1 alternative: landscape side view at the fence, 9 m from the centre mark, level phone 1.6 m high', {
      video: { orientation: 'landscape' },
      camera: { view: 'side', distanceM: 9, heightM: 1.6, lookAtHeightM: 1.6, anchor: 'centre-mark' },
    }),
  ]
}

function baselineJobs(): Scenario[] {
  return Array.from({ length: SERVE_COUNT }, (_, k) => {
    const n = k + 1
    const outputs: OutputSpec[] = [
      { id: `baseline-s${n}`, tags: ['baseline', 'fps-sweep', 'crf-sweep', 'fps-60', `crf-${BASE_CRF}`], decimate: 4, crf: BASE_CRF, webm: n === 1 },
      { id: `fps30-s${n}`, tags: ['fps-sweep', 'fps-30'], decimate: 8, crf: BASE_CRF },
      { id: `fps120-s${n}`, tags: ['fps-sweep', 'fps-120'], decimate: 2, crf: BASE_CRF },
      { id: `fps240-s${n}`, tags: ['fps-sweep', 'fps-240'], decimate: 1, crf: BASE_CRF },
      { id: `crf18-s${n}`, tags: ['crf-sweep', 'crf-18'], decimate: 4, crf: 18 },
      { id: `crf28-s${n}`, tags: ['crf-sweep', 'crf-28'], decimate: 4, crf: 28 },
      { id: `crf36-s${n}`, tags: ['crf-sweep', 'crf-36'], decimate: 4, crf: 36 },
    ]
    if (n <= 2) outputs.push({ id: `slomo-s${n}`, tags: ['slomo', 'fps-240', 'media-30', 'time-scale-0.125'], decimate: 1, mediaFps: 30, crf: BASE_CRF })
    return baseScenario(`base240-s${n}`, `Baseline serve ${n}, rendered at 240 fps and decimated / re-timed into the baseline, fps, CRF and slow-motion clips`, {
      serves: { pick: k },
      video: { fps: 240 },
      outputs,
    })
  })
}

export function corpus(): Scenario[] {
  const jobs: Scenario[] = []
  jobs.push(...baselineJobs())
  jobs.push(...perServe('rear', ['view-sweep', 'view-rear'], 'Rear view from behind the server, 5 m back, camera 1.5 m high', { camera: { view: 'rear', distanceM: 5, heightM: 1.5, lookAtHeightM: 1.6 } }))
  jobs.push(...perServe('front45', ['view-sweep', 'view-front45'], 'Front-45 view from inside the court on the chest side, 5 m away', { camera: { view: 'front45', distanceM: 5 } }))
  for (const d of [4, 7, 12]) jobs.push(...perServe(`dist${d}`, ['distance-sweep', `distance-${d}m`], `Side view at ${d} m`, { camera: { distanceM: d } }))
  jobs.push(...perServe('overcast', ['lighting-sweep', 'lighting-overcast'], 'Overcast sky, 1/250 s shutter', { look: { lighting: 'overcast' } }))
  jobs.push(...perServe('dusk', ['lighting-sweep', 'lighting-dusk'], 'Dusk: low warm sun, 1/60 s shutter (heavy motion blur), strong sensor noise', { look: { lighting: 'dusk' } }))
  jobs.push(
    ...perServe(
      'night240',
      ['lighting-sweep', 'lighting-night', 'flicker-100hz', 'fps-240'],
      'Night under floodlights with 100 Hz mains flicker, 240 fps, 1/240 s shutter',
      { look: { lighting: 'night', flicker: true }, video: { fps: 240 } },
    ),
  )
  jobs.push(...perServe('shake', ['shake'], 'Handheld: 0.5 deg / 1 cm shake', { camera: { shake: { rotationDeg: 0.5, translationM: 0.01 } }, seed: 7101 }))
  jobs.push(
    ...perServe('apexout', ['toss-out-of-frame', 'landscape'], 'Landscape at 4.5 m, camera 1.0 m high aimed at 1.3 m: the toss apex leaves the top of the frame', {
      video: { orientation: 'landscape' },
      camera: { distanceM: 4.5, heightM: 1.0, lookAtHeightM: 1.3 },
    }),
  )
  jobs.push(...perServe('lefty', ['left-handed'], 'Left-handed 1.80 m intermediate, side view from the chest side', { player: { profile: 'intermediate', handedness: 'left' } }))
  jobs.push(...perServe('h160', ['height-sweep', 'height-1.60'], '1.60 m player', { player: { profile: 'intermediate', heightM: 1.6, outfit: 'navy' } }))
  jobs.push(...perServe('h195', ['height-sweep', 'height-1.95'], '1.95 m player', { player: { profile: 'intermediate', heightM: 1.95, outfit: 'white' } }))
  jobs.push(...perServe('beginner', ['beginner'], 'Beginner profile (1.75 m)', { player: { profile: 'beginner', outfit: 'white' } }))
  jobs.push(...perServe('advanced', ['advanced'], 'Advanced profile (1.85 m, foot-up stance)', { player: { profile: 'advanced', outfit: 'navy' } }))
  jobs.push(
    baseScenario('session', 'Session: 8 serves alternating deuce/ad with 1-3 pre-serve bounces, varied pauses and walking between points, distant hits from other courts', {
      seed: 7201,
      serves: {
        count: 8,
        serveSeed: SERVE_SEED + 1,
        courtSides: ['deuce', 'ad'],
        directions: ['T', 'wide', 'body', 'wide', 'T', 'body', 'wide', 'T'],
        dribbles: [2, 3, 1, 2, 3, 2, 1, 3],
        idleS: [0.4, 0.8, 1.5, 0.6, 1.0, 2.0, 0.7, 1.2],
      },
      camera: { distanceM: 6 },
      audio: { distractorsPerMinute: 6 },
      outputs: [{ id: 'session', tags: ['session', 'multi-serve'], crf: BASE_CRF }],
    }),
  )
  jobs.push(...d1SetupJobs())
  return jobs
}

export function quickSet(): Scenario[] {
  const small = { shortSidePx: 540 }
  return [
    baseScenario('quick-side60', 'CI: side 5 m, 60 fps, 540x960, one serve', {
      serves: { pick: 0 },
      video: { ...small },
      outputs: [{ id: 'quick-side60', tags: ['quick', 'view-side', 'fps-60'], crf: 23, webm: true }],
    }),
    baseScenario('quick-rear30-lefty', 'CI: rear 5 m, 30 fps, 540x960, left-handed, one serve', {
      serves: { pick: 1 },
      player: { profile: 'intermediate', handedness: 'left' },
      video: { ...small, fps: 30 },
      camera: { view: 'rear', distanceM: 5, heightM: 1.5, lookAtHeightM: 1.6 },
      outputs: [{ id: 'quick-rear30-lefty', tags: ['quick', 'view-rear', 'fps-30', 'left-handed'], crf: 23 }],
    }),
    baseScenario('quick-slomo', 'CI: 240 fps capture of toss to bounce, re-timed to 30 fps media (timeScale 0.125), 540x960', {
      serves: { pick: 2 },
      video: { ...small, fps: 240, trim: 'toss-to-bounce' },
      outputs: [{ id: 'quick-slomo', tags: ['quick', 'slomo', 'fps-240', 'media-30', 'time-scale-0.125'], crf: 23, mediaFps: 30 }],
    }),
  ]
}

/** Every job (quick set first). */
export function allJobs(): Scenario[] {
  return [...quickSet(), ...corpus()]
}

/** Jobs for a group id, job id or clip id. */
export function resolveJobs(ids: string[], jobs: Scenario[] = allJobs()): Scenario[] {
  const picked = new Map<string, Scenario>()
  for (const id of ids) {
    const matches = jobs.filter((j) => j.id === id || j.outputs.some((o) => o.id === id || o.tags.includes(id)))
    if (matches.length === 0) throw new Error(`no scenario, job or clip called "${id}" (see --list)`)
    for (const m of matches) picked.set(m.id, m)
  }
  return [...picked.values()]
}
