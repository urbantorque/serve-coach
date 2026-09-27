import { describe, expect, it } from 'vitest'
import { collectSoundEvents } from '../src/audio.ts'
import { placeCamera } from '../src/camera.ts'
import {
  buildExtraTruth,
  CANONICAL,
  camPose,
  elevation3DDeg,
  kneeBand,
  kneeBandMetricsMd,
  legDrive,
  levelPose,
  normXY,
  pitchRollDeg,
  placementZone,
  rowHeightAtPlane,
  sampleSD,
  serveOutcome,
  tilt2DDeg,
  type CamPose,
  type TruthFile,
  type V3,
} from '../src/extraTruth.ts'
import { allJobs, quickSet } from '../src/scenarios.ts'
import { buildScenario, type BuiltScenario, type Scenario } from '../src/setup.ts'
import { buildTruth, FrameTruthSource, planOutput } from '../src/truth.ts'

/** The canonical metric ids (exact spelling) the product uses; truth-extra.json must cover all of them. */
const CANONICAL_IDS = [
  'serve-count', 'toss-apex-height', 'toss-forward', 'toss-drop', 'toss-height-spread', 'toss-forward-spread', 'contact-height-ratio', 'contact-forward',
  'rhythm-release-to-contact', 'rhythm-spread', 'trophy-pause', 'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag', 'shoulder-tilt-trophy',
  'knee-bend-band', 'shoulder-over-shoulder-contact', 'landing-distance', 'repeatability', 'serve-in-rate', 'first-serve-in-rate', 'double-faults',
  'placement-zone', 'serve-type-mix', 'speed-experimental', 'speed-average-rear', 'speed-radar-entered', 'spin', 'capture-quality',
]

function truthOf(sc: Scenario): { b: BuiltScenario; truth: TruthFile } {
  const b = buildScenario(sc)
  const source = new FrameTruthSource(b)
  const sounds = collectSoundEvents(b.clip, source.camAt, { seed: sc.seed, startS: b.t0S, endS: b.t0S + b.frameCount / sc.video.fps })
  const t = buildTruth({ b, output: planOutput(b, sc.outputs[0]), source, files: [], sounds, audio: { sampleRate: 48000, backgroundDbfs: -50, hum: false }, groups: [], generator: {} })
  return { b, truth: JSON.parse(JSON.stringify(t)) as TruthFile }
}

type Canon = Record<string, { value: unknown; alt?: Record<string, unknown>; availability: { supported: boolean; reason?: string } }>
interface ServeX {
  canonical: Canon
  flightTimeS: number
  continuous: Record<string, Record<string, number>> | null
  atFrames: Record<string, Record<string, number>>
}
interface Extra {
  serves: ServeX[]
  clip: Canon
  derivation: { continuous: string | null; continuousSkipped: string | null; rebuildMaxDeviationMm: number | null }
}

const [side60, rear30, slomo] = quickSet()
const sideT = truthOf(side60)
const rearT = truthOf(rear30)
const sideX = buildExtraTruth(sideT.truth, { rebuilt: sideT.b }) as unknown as Extra
const rearX = buildExtraTruth(rearT.truth, { rebuilt: rearT.b }) as unknown as Extra

describe('extra-truth geometry helpers', () => {
  it('2D line tilt is positive when the front point is higher and ignores facing direction', () => {
    expect(tilt2DDeg([10, 0], [0, 10])).toBeCloseTo(45, 9)
    expect(tilt2DDeg([-10, 0], [0, 10])).toBeCloseTo(45, 9)
    expect(tilt2DDeg([10, 10], [0, 0])).toBeCloseTo(-45, 9)
    expect(elevation3DDeg([1, 1, Math.SQRT2], [0, 0, 0])).toBeCloseTo(45, 9)
  })

  it('levelling a pitched camera keeps its centre and heading and makes verticals vertical', () => {
    const e = placeCamera({ view: 'side', distanceM: 5, heightM: 1.2, lookAtHeightM: 1.6 }, [0, 0, 0], -1)
    const c: CamPose = { R: [...e.right, ...e.down, ...e.forward], t: [0, 0, 0] }
    c.t = [-(c.R[0] * e.position[0] + c.R[1] * e.position[1] + c.R[2] * e.position[2]), -(c.R[3] * e.position[0] + c.R[4] * e.position[1] + c.R[5] * e.position[2]), -(c.R[6] * e.position[0] + c.R[7] * e.position[1] + c.R[8] * e.position[2])]
    expect(pitchRollDeg(c).pitchDeg).toBeCloseTo((Math.atan2(0.4, 5) * 180) / Math.PI, 6)
    const lvl = levelPose(c)
    expect(pitchRollDeg(lvl).pitchDeg).toBeCloseTo(0, 12)
    expect(pitchRollDeg(lvl).rollDeg).toBeCloseTo(0, 12)
    // A vertical pole beside the player: same image x in the level camera, not in the pitched one.
    const top: V3 = [0.8, 0.3, 3]
    const bottom: V3 = [0.8, 0.3, 0]
    expect(normXY(lvl, top)[0]).toBeCloseTo(normXY(lvl, bottom)[0], 12)
    expect(Math.abs(normXY(c, top)[0] - normXY(c, bottom)[0])).toBeGreaterThan(1e-3)
    // The principal-point row of a level camera meets the server's plane at camera height.
    const I = { fxPx: 1000, fyPx: 1000, cxPx: 540, cyPx: 960, k1: 0, k2: 0 }
    const fake = { settings: { intrinsics: I } } as unknown as TruthFile
    expect(rowHeightAtPlane(fake, lvl, 960, [0, 0, 0])).toBeCloseTo(1.2, 9)
    expect(rowHeightAtPlane(fake, lvl, 0, [0, 0, 0])).toBeCloseTo(1.2 + (5 * 960) / 1000, 9)
  })

  it('bands, zones, outcomes and SDs', () => {
    expect([kneeBand(19.9), kneeBand(20), kneeBand(44.9), kneeBand(45)]).toEqual(['little', 'moderate', 'moderate', 'deep'])
    expect([kneeBandMetricsMd(24.9), kneeBandMetricsMd(25), kneeBandMetricsMd(55), kneeBandMetricsMd(55.1)]).toEqual(['low', 'typical', 'typical', 'high'])
    expect([placementZone(true, 0.3), placementZone(true, -2), placementZone(true, 3.9), placementZone(false, 0.3)]).toEqual(['T', 'body', 'wide', null])
    expect(serveOutcome(true, 17, 0.3)).toBe('in')
    expect(serveOutcome(false, 17, -0.02)).toBe('net')
    expect(serveOutcome(false, 18.4, 0.3)).toBe('long')
    expect(serveOutcome(false, 17, 0.3)).toBe('wide')
    expect(sampleSD([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(5 / 3), 12)
    expect(sampleSD([1])).toBeNull()
  })

  it('leg drive on an analytic hip trajectory', () => {
    // z(t) = 0.9 + 0.5 (t - 0.4)^2: release at 0, contact at 1.
    const z = (t: number) => 0.9 + 0.5 * (t - 0.4) ** 2
    const samples = Array.from({ length: 101 }, (_, i) => ({ t: i / 100, z: z(i / 100) }))
    const L = legDrive(samples, { tRelease: 0, tContact: 1, zRelease: z(0), zContact: z(1) }, 1.8, z)
    expect(L.lowestTReal).toBeCloseTo(0.4, 6)
    expect(L.lowestHeightM).toBeCloseTo(0.9, 9)
    expect(L.hipRiseM).toBeCloseTo(0.18, 9)
    expect(L.hipRisePctHeight).toBeCloseTo(10, 7)
    expect(L.driveTimeS).toBeCloseTo(0.6, 6)
    expect(L.loadingDepthM).toBeCloseTo(0.08, 9)
    expect(L.peakUpwardHipSpeedMs).toBeCloseTo(0.59, 6) // central difference at the last interior sample (t = 0.99)
  })
})

describe('truth-extra for the quick clips', () => {
  it('covers every canonical metric id exactly and never the removed trunk-tilt-band', () => {
    const ids = new Set([...Object.keys(sideX.serves[0].canonical), ...Object.keys(sideX.clip)])
    for (const id of CANONICAL_IDS) expect(ids.has(id), id).toBe(true)
    expect(ids.has('trunk-tilt-band')).toBe(false)
    expect(CANONICAL.map((c) => c.id).sort()).toEqual([...CANONICAL_IDS].sort())
  })

  it('rebuilds the motion exactly and uses the continuous derivation', () => {
    for (const x of [sideX, rearX]) {
      expect(x.derivation.continuousSkipped).toBeNull()
      expect(x.derivation.rebuildMaxDeviationMm!).toBeLessThanOrEqual(0.06)
      expect(x.serves[0].continuous).not.toBeNull()
    }
  })

  it('refuses the continuous derivation when the rebuilt motion is a different clip', () => {
    const other = buildScenario(allJobs().find((j) => j.id === 'beginner-s1')!)
    const x = buildExtraTruth(sideT.truth, { rebuilt: other }) as unknown as Extra
    expect(x.derivation.continuous).toBeNull()
    expect(x.serves[0].continuous).toBeNull()
    expect(x.derivation.continuousSkipped).toBeTruthy()
  })

  it('frame-sampled values agree with the continuous ones', () => {
    const s = sideX.serves[0]
    const c = s.continuous!
    const f = s.atFrames
    expect(Math.abs(c.legDrive.hipRisePctHeight - f.legDrive.hipRisePctHeight)).toBeLessThan(0.3)
    expect(Math.abs(c.legDrive.loadingDepthPctHeight - f.legDrive.loadingDepthPctHeight)).toBeLessThan(0.3)
    expect(Math.abs(c.legDrive.driveTimeS - f.legDrive.driveTimeS)).toBeLessThan(1.5 / 60)
    expect(Math.abs(c.shoulderTiltTrophy.deg3D - f.shoulderTiltTrophy.deg3D)).toBeLessThan(0.5)
  })

  it('reproduces the side-view geometry findings: shoulder tilt in plane, knee and shoulder-over-shoulder not', () => {
    const k = sideX.serves[0].canonical
    const tilt = k['shoulder-tilt-trophy']
    // gaps/side-view-geometry-contradictions 4.2: D1 2D shoulder tilt at the trophy is within +1..+4 deg of 3D.
    expect((tilt.alt!.deg2DLevel as number) - (tilt.value as number)).toBeGreaterThan(0)
    expect((tilt.alt!.deg2DLevel as number) - (tilt.value as number)).toBeLessThan(4)
    // The side view overstates shoulder-over-shoulder at contact; the rear view reads it within a few degrees.
    const sosSide = sideX.serves[0].canonical['shoulder-over-shoulder-contact']
    const sosRear = rearX.serves[0].canonical['shoulder-over-shoulder-contact']
    expect((sosSide.alt!.deg2DLevel as number) - (sosSide.value as number)).toBeGreaterThan(15)
    expect(Math.abs((sosRear.alt!.deg2DLevel as number) - (sosRear.value as number))).toBeLessThan(4)
    // Back knee at the trophy: foreshortened from the side, nearly in plane from behind.
    const kneeSide = sideX.serves[0].canonical['knee-bend-band'].alt!
    const kneeRear = rearX.serves[0].canonical['knee-bend-band'].alt!
    expect((kneeSide.backKneeAtTrophy3DDeg as number) - (kneeSide.backKneeAtTrophy2DLevelDeg as number)).toBeGreaterThan(15)
    expect(Math.abs((kneeRear.backKneeAtTrophy3DDeg as number) - (kneeRear.backKneeAtTrophy2DLevelDeg as number))).toBeLessThan(3)
  })

  it('maps truth.json metrics and views correctly', () => {
    const s = sideT.truth.serves[0]
    const m = s.metrics as Record<string, number>
    const k = sideX.serves[0].canonical
    expect(k['toss-apex-height'].value).toBeCloseTo(m.tossApexHeightM / sideT.truth.player.heightM, 4)
    expect(k['landing-distance'].value as number).toBeCloseTo(m.landingDistanceInsideBaselineM - (m.contactForwardOfBaselineM - m.contactForwardOfFrontToeM), 3)
    expect(sideX.serves[0].flightTimeS).toBeCloseTo(s.events.bounce.tReal - s.events.contact.tReal, 6)
    expect(sideX.serves[0].flightTimeS).toBeCloseTo(m.flightTimeS, 4)
    expect(k['knee-bend-band'].availability).toEqual({ supported: false, reason: 'VIEW_NOT_SUPPORTED' })
    expect(rearX.serves[0].canonical['knee-bend-band'].availability.supported).toBe(true)
    expect(rearX.serves[0].canonical['leg-drive'].availability.reason).toBe('VIEW_NOT_SUPPORTED')
    expect(k['speed-experimental'].availability.reason).toBe('FPS_TOO_LOW')
    expect(k.spin).toMatchObject({ value: null, availability: { supported: false, reason: 'NOT_MEASURABLE' } })
    expect(sideX.clip['serve-count'].value).toBe(1)
  })

  it('240 fps side capture unlocks speed-experimental', () => {
    const { b, truth } = truthOf(slomo)
    const x = buildExtraTruth(truth, { rebuilt: b }) as unknown as Extra
    expect(x.serves[0].canonical['speed-experimental'].availability.supported).toBe(true)
    expect(x.derivation.continuousSkipped).toBeNull()
  })
})

describe('D1 set-ups (default75, fence9)', () => {
  it('place a level camera on the baseline extension, measured from the centre mark', () => {
    for (const [id, d, h] of [
      ['default75-s1', 7.5, 1.4],
      ['fence9-s1', 9, 1.6],
    ] as const) {
      const sc = allJobs().find((j) => j.id === id)!
      const b = buildScenario(sc)
      const e = b.setup.baseExtrinsics
      expect(e.position[0]).toBeCloseTo(0, 12)
      expect(e.position[1]).toBeCloseTo(-d, 12) // right-hander: hitting-arm (chest) side is -y
      expect(e.position[2]).toBeCloseTo(h, 12)
      expect(e.forward[2]).toBeCloseTo(0, 12) // level
      expect(e.forward[1]).toBeCloseTo(1, 12) // along the baseline
      // Frame top at the server's plane is above the 4.5 m D1 minimum.
      const I = b.setup.intrinsics
      const fake = { settings: { intrinsics: { fxPx: I.fxPx, fyPx: I.fyPx, cxPx: I.cxPx, cyPx: I.cyPx, k1: 0, k2: 0 } }, frames: [] } as unknown as TruthFile
      const pose = camPose({ settings: { extrinsics: { R: [...e.right, ...e.down, ...e.forward], t: [0, 0, 0] } } } as unknown as TruthFile)
      const C = e.position
      pose.t = [-(pose.R[0] * C[0] + pose.R[1] * C[1] + pose.R[2] * C[2]), -(pose.R[3] * C[0] + pose.R[4] * C[1] + pose.R[5] * C[2]), -(pose.R[6] * C[0] + pose.R[7] * C[1] + pose.R[8] * C[2])]
      const toe = b.clip.toWorld(b.clip.plans[0].frontToeAtRelease)
      expect(rowHeightAtPlane(fake, pose, 0, toe)).toBeGreaterThan(4.5)
    }
  })
})
