import { OUTFITS } from './bodyShape.ts'
import { makeIntrinsics, makeShake, placeCamera, type ViewSpec } from './camera.ts'
import { lightingLook } from './look.ts'
import { buildClip, type ClipMotion } from './kinematics/motion.ts'
import { childSeed, mulberry32 } from './math/random.ts'
import {
  PROFILES,
  sampleServeParams,
  type Handedness,
  type PlayerProfile,
  type ServeParams,
  type ServeStyle,
  type Stance,
  type VariedParam,
} from './params.ts'
import type { CourtSide, ServeDirection } from './court.ts'
import type { RenderSetup } from './frames.ts'
import type { CourtSurface, LightingPreset } from './render/sceneTypes.ts'
import type { Vec3 } from './math/vec.ts'

export type ProfileId = 'intermediate' | 'beginner' | 'advanced'

/** One encoded clip made from a render job's frames. */
export interface OutputSpec {
  /** Clip id: folder and file name under validation/synthetic/clips/. */
  id: string
  /** Scenario groups this clip belongs to (CLI --scenario ids) plus descriptive tags. */
  tags: string[]
  /** Keep every k-th rendered frame (240 fps render, decimate 4 -> 60 fps). Default 1. */
  decimate?: number
  /** Container frame rate. Default: captureFps / decimate. Lower = rendered slow motion. */
  mediaFps?: number
  crf: number
  /** Also write a VP9/Opus WebM of the same frames next to the MP4. */
  webm?: boolean
}

/** Declarative description of one render job (one motion clip, rendered once, encoded to 1+ outputs). */
export interface Scenario {
  id: string
  description: string
  seed: number
  player: {
    profile: ProfileId
    heightM?: number
    handedness?: Handedness
    stance?: Stance
    outfit?: keyof typeof OUTFITS
  }
  serves: {
    /** Serves sampled from the profile (same seed and count => identical serves across scenarios). */
    count: number
    serveSeed: number
    /** Render only this sampled serve (0-based); default renders all serves in one clip. */
    pick?: number
    directions?: ServeDirection[]
    courtSides?: CourtSide[]
    style?: ServeStyle
    sdScale?: number
    /** Extra SD factor per varied parameter (params.ts SampleOptions.sdScaleByParam). */
    sdScaleByParam?: Partial<Record<VariedParam, number>>
    dribbles?: number[]
    /** Standing time after each recovery before walking back (s), per serve index. */
    idleS?: number[]
    overrides?: Partial<ServeParams>
  }
  video: {
    /** True capture frame rate of the render. */
    fps: number
    orientation: 'portrait' | 'landscape'
    /** Short side in pixels (1080 = 1080x1920). */
    shortSidePx: number
    shutterS?: number
    bodyBlurSamples?: number
    /** Render only [tossRelease - 0.35 s, first bounce + 0.25 s] of the (single) serve. */
    trim?: 'toss-to-bounce'
  }
  camera: ViewSpec & {
    focal35mmEquivMm: number
    k1?: number
    k2?: number
    shake?: { rotationDeg: number; translationM: number }
  }
  look: {
    lighting: LightingPreset
    surface: CourtSurface
    flicker?: boolean
  }
  audio?: {
    /** Background noise RMS (dBFS). Default -50. */
    backgroundDbfs?: number
    /** Distant hits from other courts (not this player's), listed in truth as distractors. */
    distractorsPerMinute?: number
  }
  outputs: OutputSpec[]
}

export interface BuiltScenario {
  scenario: Scenario
  profile: PlayerProfile
  clip: ClipMotion
  setup: RenderSetup
  serves: ServeParams[]
  /** Indices (into the sampled serve list) of the serves in this clip. */
  serveIndices: number[]
  stance: Vec3
  chestSign: 1 | -1
  /** Real (motion) time of the first rendered frame; truth times are relative to it. */
  t0S: number
  /** Number of rendered frames. */
  frameCount: number
}

const DEFAULT_DIRECTIONS: ServeDirection[] = ['T', 'wide', 'body', 'T', 'wide', 'body', 'T', 'wide', 'body', 'T']

/** Parameters measured in metres that scale with the player's height (toss, landing). */
const LENGTH_PARAMS: VariedParam[] = ['tossReleaseHeightM', 'tossApexHeightM', 'tossApexForwardM', 'tossApexLateralM', 'landingDistanceM', 'jumpHeightM']

/**
 * The profile used for sampling. When the scenario overrides the player's height, toss heights,
 * toss offsets, jump and landing distance (means and SDs) scale by height / profile height, so a
 * 1.60 m and a 1.95 m player keep the same body-relative technique.
 */
export function scenarioProfile(sc: Scenario): PlayerProfile {
  const prof = PROFILES[sc.player.profile]
  const heightM = sc.player.heightM ?? prof.heightM
  const k = heightM / prof.heightM
  const means = { ...prof.means }
  const sds = { ...prof.sds }
  for (const p of LENGTH_PARAMS) {
    means[p] *= k
    sds[p] *= k
  }
  return {
    ...prof,
    heightM,
    handedness: sc.player.handedness ?? prof.handedness,
    stance: sc.player.stance ?? prof.stance,
    means,
    sds,
  }
}

export function sampleScenarioServes(sc: Scenario): ServeParams[] {
  const profile = scenarioProfile(sc)
  const rng = mulberry32(childSeed(sc.serves.serveSeed, `serves:${sc.player.profile}`))
  const out: ServeParams[] = []
  for (let k = 0; k < sc.serves.count; k++) {
    const direction = sc.serves.directions?.[k % sc.serves.directions.length] ?? DEFAULT_DIRECTIONS[k % DEFAULT_DIRECTIONS.length]
    const courtSide = sc.serves.courtSides?.[k % sc.serves.courtSides.length] ?? 'deuce'
    out.push(sampleServeParams(rng, profile, { direction, courtSide, style: sc.serves.style, sdScale: sc.serves.sdScale, sdScaleByParam: sc.serves.sdScaleByParam, overrides: sc.serves.overrides }))
  }
  return out
}

/** Output frame size for a scenario (width, height). */
export function frameSize(sc: Scenario): [number, number] {
  const long = Math.round((sc.video.shortSidePx * 16) / 9)
  return sc.video.orientation === 'portrait' ? [sc.video.shortSidePx, long] : [long, sc.video.shortSidePx]
}

export function buildScenario(sc: Scenario): BuiltScenario {
  const profile = scenarioProfile(sc)
  const all = sampleScenarioServes(sc)
  const serveIndices = sc.serves.pick === undefined ? all.map((_, i) => i) : [sc.serves.pick]
  const serves = serveIndices.map((i) => all[i])
  const clip = buildClip({
    heightM: profile.heightM,
    handedness: profile.handedness,
    serves,
    dribbles: sc.serves.dribbles,
    idleS: sc.serves.idleS,
  })
  const [w, h] = frameSize(sc)
  const intrinsics = makeIntrinsics(w, h, sc.camera.focal35mmEquivMm, sc.camera.k1 ?? 0, sc.camera.k2 ?? 0)
  // Camera is placed relative to the first serve's front toe (court coordinates).
  const stance = clip.toWorld(clip.plans[0].frontToeAtRelease)
  const chestSign: 1 | -1 = profile.handedness === 'right' ? -1 : 1
  const baseExtrinsics = placeCamera(sc.camera, stance, chestSign)
  const look = lightingLook(sc.look.lighting)
  if (sc.look.flicker === false) look.flickerAmplitude = 0
  const shutterS = Math.min(sc.video.shutterS ?? look.defaultShutterS, 1 / sc.video.fps)

  let t0S = 0
  let t1S = clip.durationS
  if (sc.video.trim === 'toss-to-bounce') {
    const T = clip.plans[0].times
    t0S = Math.max(0, T.tossReleaseS - 0.35)
    t1S = Math.min(clip.durationS, T.bounceS + 0.25)
  }
  const frameCount = Math.floor((t1S - t0S) * sc.video.fps + 1e-9) + 1

  const setup: RenderSetup = {
    clip,
    intrinsics,
    baseExtrinsics,
    shake: sc.camera.shake ? makeShake({ ...sc.camera.shake, seed: sc.seed }) : undefined,
    captureFps: sc.video.fps,
    shutterS,
    bodyBlurSamples: sc.video.bodyBlurSamples ?? look.bodyBlurSamples,
    look,
    surface: sc.look.surface,
    outfit: OUTFITS[sc.player.outfit ?? 'red'],
    environmentSeed: childSeed(sc.seed, 'environment'),
    t0S,
  }
  return { scenario: sc, profile, clip, setup, serves, serveIndices, stance, chestSign, t0S, frameCount }
}
