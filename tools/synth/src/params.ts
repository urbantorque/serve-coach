import type { CourtSide, ServeDirection } from './court.ts'
import { bisect } from './math/interp.ts'
import { truncatedNormal, type Rng } from './math/random.ts'
import { G } from './ball.ts'

export type Handedness = 'right' | 'left'
export type Stance = 'foot-up' | 'foot-back'
export type ServeStyle = 'flat' | 'slice' | 'kick'

/** Per-serve generating parameters (targets). Realised values are recomputed from the motion in truth.json. */
export interface ServeParams {
  style: ServeStyle
  direction: ServeDirection
  courtSide: CourtSide
  stance: Stance
  /** Ball-centre height when it leaves the tossing hand (m). */
  tossReleaseHeightM: number
  /** Ball-centre apex height (m). */
  tossApexHeightM: number
  /** Apex x minus front-toe x at release (m, + = into the court). */
  tossApexForwardM: number
  /** Apex offset from the front toe toward the hitting-arm side (m). */
  tossApexLateralM: number
  /** Ball-centre contact height / player height. */
  contactHeightRatio: number
  /** Peak front-knee flexion (deg) during loading. */
  maxKneeFlexionDeg: number
  /** Trunk (mid-hip -> mid-shoulder) angle from vertical at contact (deg). */
  trunkInclinationContactDeg: number
  /** World azimuth of that lean (deg from +x toward the non-hitting side). */
  trunkLeanAzimuthDeg: number
  trophyPauseS: number
  /** Trophy end to contact (s): racket drop and upward swing. */
  driveDurationS: number
  /** Motion start (hands drop) to toss release (s). */
  motionToReleaseS: number
  /** Target pelvis rise at contact above the straight-legged, on-toes take-off height (m). */
  jumpHeightM: number
  /** Front toe x at touchdown (m inside the baseline). */
  landingDistanceM: number
  /** Ball speed just after contact (km/h). */
  serveSpeedKmh: number
  /** If set, the launch elevation is fixed and the bounce lands wherever physics puts it. */
  launchAngleDeg?: number
  /** If set, the toss apex height is solved so that release-to-contact takes exactly this long (s). */
  releaseToContactS?: number
  /** Aim-point scatter added to the nominal T/body/wide target (m). */
  targetDepthOffsetM: number
  targetLateralOffsetM: number
  spinRpm: number
  /** Spin axis in the right-handed canonical frame (ball moving +x): +y topspin, +z slice (curves to +y). */
  spinAxis: [number, number, number]
  /** Front-toe position offsets from the nominal stance spot (m). */
  stanceXOffsetM: number
  stanceYOffsetM: number
}

/** Parameters that get serve-to-serve variability, with their standard deviations. */
export const VARIED_PARAMS = [
  'tossReleaseHeightM',
  'tossApexHeightM',
  'tossApexForwardM',
  'tossApexLateralM',
  'contactHeightRatio',
  'maxKneeFlexionDeg',
  'trunkInclinationContactDeg',
  'trunkLeanAzimuthDeg',
  'trophyPauseS',
  'driveDurationS',
  'motionToReleaseS',
  'jumpHeightM',
  'landingDistanceM',
  'serveSpeedKmh',
  'targetDepthOffsetM',
  'targetLateralOffsetM',
  'stanceXOffsetM',
  'stanceYOffsetM',
] as const
export type VariedParam = (typeof VARIED_PARAMS)[number]

export interface PlayerProfile {
  id: string
  label: string
  heightM: number
  handedness: Handedness
  stance: Stance
  style: ServeStyle
  means: Record<VariedParam, number>
  sds: Record<VariedParam, number>
  /** Spin (rpm) per style; axis from the style. */
  spinRpm: Record<ServeStyle, number>
}

const INTERMEDIATE_MEANS: Record<VariedParam, number> = {
  tossReleaseHeightM: 1.72,
  tossApexHeightM: 3.3,
  tossApexForwardM: 0.3,
  tossApexLateralM: 0.12,
  contactHeightRatio: 1.5,
  maxKneeFlexionDeg: 42,
  trunkInclinationContactDeg: 20,
  trunkLeanAzimuthDeg: 12,
  trophyPauseS: 0.12,
  driveDurationS: 0.32,
  motionToReleaseS: 1.0,
  jumpHeightM: 0.08,
  landingDistanceM: 0.45,
  serveSpeedKmh: 150,
  targetDepthOffsetM: 0,
  targetLateralOffsetM: 0,
  stanceXOffsetM: 0,
  stanceYOffsetM: 0,
}

const INTERMEDIATE_SDS: Record<VariedParam, number> = {
  tossReleaseHeightM: 0.04,
  tossApexHeightM: 0.12,
  tossApexForwardM: 0.1,
  tossApexLateralM: 0.08,
  contactHeightRatio: 0.012,
  maxKneeFlexionDeg: 4,
  trunkInclinationContactDeg: 3,
  trunkLeanAzimuthDeg: 5,
  trophyPauseS: 0.05,
  driveDurationS: 0.02,
  motionToReleaseS: 0.06,
  jumpHeightM: 0.02,
  landingDistanceM: 0.1,
  serveSpeedKmh: 6,
  targetDepthOffsetM: 0.6,
  targetLateralOffsetM: 0.4,
  stanceXOffsetM: 0.03,
  stanceYOffsetM: 0.06,
}

const SPIN_DEFAULT: Record<ServeStyle, number> = { flat: 900, slice: 2200, kick: 3200 }

export const PROFILES: Record<string, PlayerProfile> = {
  intermediate: {
    id: 'intermediate',
    label: 'Intermediate club player (about UTR 4)',
    heightM: 1.8,
    handedness: 'right',
    stance: 'foot-back',
    style: 'flat',
    means: INTERMEDIATE_MEANS,
    sds: INTERMEDIATE_SDS,
    spinRpm: SPIN_DEFAULT,
  },
  beginner: {
    id: 'beginner',
    label: 'Beginner (UTR 1-2): little knee bend, inconsistent toss',
    heightM: 1.75,
    handedness: 'right',
    stance: 'foot-back',
    style: 'flat',
    means: {
      ...INTERMEDIATE_MEANS,
      tossReleaseHeightM: 1.62,
      tossApexHeightM: 3.25,
      tossApexForwardM: 0.12,
      tossApexLateralM: 0.22,
      contactHeightRatio: 1.4,
      maxKneeFlexionDeg: 15,
      trunkInclinationContactDeg: 9,
      trunkLeanAzimuthDeg: 20,
      trophyPauseS: 0.3,
      driveDurationS: 0.4,
      motionToReleaseS: 1.1,
      jumpHeightM: 0.0,
      landingDistanceM: 0.15,
      serveSpeedKmh: 105,
    },
    sds: {
      ...INTERMEDIATE_SDS,
      tossReleaseHeightM: 0.1,
      tossApexHeightM: 0.3,
      tossApexForwardM: 0.22,
      tossApexLateralM: 0.2,
      contactHeightRatio: 0.03,
      maxKneeFlexionDeg: 5,
      trunkInclinationContactDeg: 4,
      trunkLeanAzimuthDeg: 10,
      trophyPauseS: 0.12,
      driveDurationS: 0.05,
      motionToReleaseS: 0.15,
      jumpHeightM: 0.01,
      landingDistanceM: 0.08,
      serveSpeedKmh: 10,
      targetDepthOffsetM: 1.2,
      targetLateralOffsetM: 0.9,
      stanceXOffsetM: 0.06,
      stanceYOffsetM: 0.15,
    },
    spinRpm: SPIN_DEFAULT,
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced (UTR 6-7): deep knee bend, jump, consistent toss',
    heightM: 1.85,
    handedness: 'right',
    stance: 'foot-up',
    style: 'flat',
    means: {
      ...INTERMEDIATE_MEANS,
      tossReleaseHeightM: 1.8,
      tossApexHeightM: 3.45,
      tossApexForwardM: 0.45,
      tossApexLateralM: 0.1,
      contactHeightRatio: 1.56,
      maxKneeFlexionDeg: 65,
      trunkInclinationContactDeg: 26,
      trunkLeanAzimuthDeg: 8,
      trophyPauseS: 0.05,
      driveDurationS: 0.3,
      motionToReleaseS: 0.95,
      jumpHeightM: 0.2,
      landingDistanceM: 0.85,
      serveSpeedKmh: 178,
    },
    sds: {
      ...INTERMEDIATE_SDS,
      tossReleaseHeightM: 0.02,
      tossApexHeightM: 0.05,
      tossApexForwardM: 0.05,
      tossApexLateralM: 0.04,
      contactHeightRatio: 0.006,
      maxKneeFlexionDeg: 2.5,
      trunkInclinationContactDeg: 1.5,
      trunkLeanAzimuthDeg: 3,
      trophyPauseS: 0.02,
      driveDurationS: 0.01,
      motionToReleaseS: 0.03,
      jumpHeightM: 0.02,
      landingDistanceM: 0.06,
      serveSpeedKmh: 4,
      targetDepthOffsetM: 0.4,
      targetLateralOffsetM: 0.25,
      stanceXOffsetM: 0.02,
      stanceYOffsetM: 0.03,
    },
    spinRpm: SPIN_DEFAULT,
  },
}

/** Style-specific shifts applied on top of the profile means. */
export const STYLE_SHIFTS: Record<ServeStyle, Partial<Record<VariedParam, number>> & { speedFactor: number; spinAxis: [number, number, number] }> = {
  flat: { speedFactor: 1, spinAxis: [0, 1, 0.15] },
  slice: { speedFactor: 0.9, tossApexLateralM: 0.15, tossApexForwardM: -0.05, spinAxis: [0, 0.55, 1] },
  kick: { speedFactor: 0.8, tossApexLateralM: -0.25, tossApexForwardM: -0.25, trunkInclinationContactDeg: 4, spinAxis: [0, 1, -0.55] },
}

/** Physical limits applied after sampling. */
export const LIMITS: Partial<Record<VariedParam, [number, number]>> = {
  trophyPauseS: [0, 1.2],
  maxKneeFlexionDeg: [4, 95],
  jumpHeightM: [0, 0.35],
  landingDistanceM: [0.03, 1.4],
  driveDurationS: [0.22, 0.6],
  motionToReleaseS: [0.7, 1.6],
  trunkInclinationContactDeg: [0, 45],
}

export interface SampleOptions {
  direction: ServeDirection
  courtSide: CourtSide
  style?: ServeStyle
  /** Multiply all SDs (0 = identical serves). */
  sdScale?: number
  /** Parameter overrides applied after sampling (exact values). */
  overrides?: Partial<ServeParams>
}

export function effectiveMeans(profile: PlayerProfile, style: ServeStyle): Record<VariedParam, number> {
  const shift = STYLE_SHIFTS[style]
  const m = { ...profile.means }
  for (const k of VARIED_PARAMS) {
    const d = (shift as Partial<Record<VariedParam, number>>)[k]
    if (typeof d === 'number') m[k] += d
  }
  m.serveSpeedKmh *= shift.speedFactor
  return m
}

export function sampleServeParams(rng: Rng, profile: PlayerProfile, opts: SampleOptions): ServeParams {
  const style = opts.style ?? profile.style
  const sdScale = opts.sdScale ?? 1
  const means = effectiveMeans(profile, style)
  const vals = {} as Record<VariedParam, number>
  for (const k of VARIED_PARAMS) {
    let x = truncatedNormal(rng, means[k], profile.sds[k] * sdScale)
    const lim = LIMITS[k]
    if (lim) x = Math.min(lim[1], Math.max(lim[0], x))
    vals[k] = x
  }
  // Toss apex must stay comfortably above contact.
  const contactZ = vals.contactHeightRatio * profile.heightM
  vals.tossApexHeightM = Math.max(vals.tossApexHeightM, contactZ + 0.12)
  vals.tossReleaseHeightM = Math.min(vals.tossReleaseHeightM, vals.tossApexHeightM - 0.6)
  const p: ServeParams = {
    ...vals,
    style,
    direction: opts.direction,
    courtSide: opts.courtSide,
    stance: profile.stance,
    spinRpm: profile.spinRpm[style],
    spinAxis: STYLE_SHIFTS[style].spinAxis,
    ...opts.overrides,
  }
  return p
}

/** Toss rise and fall times (gravity only) implied by release, apex and contact heights. */
export function tossTimes(releaseZ: number, apexZ: number, contactZ: number): { tUpS: number; tDownS: number; releaseToContactS: number } {
  const tUpS = Math.sqrt((2 * (apexZ - releaseZ)) / G)
  const tDownS = Math.sqrt((2 * (apexZ - contactZ)) / G)
  return { tUpS, tDownS, releaseToContactS: tUpS + tDownS }
}

/** Apex height that yields a requested release-to-contact time (inverse of tossTimes). */
export function apexForReleaseToContact(releaseZ: number, contactZ: number, releaseToContactS: number): number {
  const lo = Math.max(releaseZ, contactZ) + 1e-6
  const f = (apex: number) => tossTimes(releaseZ, apex, contactZ).releaseToContactS - releaseToContactS
  if (f(lo) > 0) throw new Error('release-to-contact time too short for these heights')
  return bisect(f, lo, lo + 20, 1e-9)
}
