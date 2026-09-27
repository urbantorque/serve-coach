/**
 * Synthetic validation exports for tests (never real data): players with known truth, hand marks with
 * small marking noise, and app values with a chosen bias and noise, laid out exactly like a
 * `serve-coach-validation@1` file so the evaluation and the CLI tool can be checked end to end.
 */
import type { MetricValue } from '../../analysis/types.ts'
import type { EngineStamp } from '../../data/domain.ts'
import type { ExportedMetric, ValidationEntry, ValidationExport } from './export.ts'
import { PRIVACY_NOTE, VALIDATION_FORMAT, VALIDATION_VERSION } from './export.ts'
import { rng } from './stats.ts'
import type { CheckAnnotation } from './types.ts'

export interface SyntheticOptions {
  seed?: number
  players?: number
  servesPerPlayer?: number
  /** Share of serves marked by a second annotator. */
  doubleShare?: number
  /** App bias: toss and contact height in % of height, events in frames, forward distances in cm. */
  bias?: { apexPct?: number; contactPct?: number; eventFrames?: number; forwardCm?: number; legDrivePct?: number; loadingPct?: number; shoulderDeg?: number }
  /** App noise (SD): heights in % of height, events in frames, forward distances in cm. */
  noise?: { heightPct?: number; eventFrames?: number; forwardCm?: number; hipPct?: number; shoulderDeg?: number }
  /** Extra entries flagged as sample data and as not blind (both must be left out by default). */
  sampleEntries?: number
  unblindedEntries?: number
  /** Subject-key prefix (to make two files from different phones). */
  subjectPrefix?: string
}

const ENGINE: EngineStamp = {
  engineVersion: 'synthetic-1',
  contract: 1,
  catalogueVersion: '1.1.0',
  poseModel: 'synthetic',
  poseBackend: 'cpu',
  decodePath: 'webcodecs',
  analysedAt: '2026-09-27T00:00:00.000Z',
  durationMs: 0,
  paramsHash: 'synthetic',
  bandsVersion: 'synthetic',
}

export function syntheticExport(opts: SyntheticOptions = {}): ValidationExport {
  const next = rng(opts.seed ?? 7)
  const gauss = () => {
    const u = Math.max(1e-12, next())
    const v = next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const bias = { apexPct: 0, contactPct: 0, eventFrames: 0, forwardCm: 0, legDrivePct: 0, loadingPct: 0, shoulderDeg: 0, ...opts.bias }
  const noise = { heightPct: 1.5, eventFrames: 0.6, forwardCm: 4, hipPct: 1, shoulderDeg: 2.5, ...opts.noise }
  const players = opts.players ?? 10
  const perPlayer = opts.servesPerPlayer ?? 20
  const entries: ValidationEntry[] = []

  for (let p = 0; p < players; p++) {
    const subject = `${opts.subjectPrefix ?? 'syn'}-${String(p + 1).padStart(2, '0')}`
    const heightM = 1.6 + next() * 0.3
    const handedness = p % 6 === 5 ? ('left' as const) : ('right' as const)
    const fwd = handedness === 'right' ? 1 : -1
    const fps = p % 4 === 3 ? 120 : 60
    const width = 1080
    const height = 1920
    const aspect = width / height
    const standing = 0.19 + next() * 0.02
    const floorY = 0.82
    const night = p % 3 === 2
    for (let s = 0; s < perPlayer; s++) {
      const serveId = `${subject}-serve-${s + 1}`
      const apexRatio = 1.9 + gauss() * 0.08
      const contactRatio = 1.5 + gauss() * 0.04
      const toeX = 0.5
      const toCm = (standingHeights: number) => standingHeights * heightM * 100
      const fromCm = (cm: number) => ((cm / (heightM * 100)) * standing * fwd) / aspect
      const tossFwd = 30 + gauss() * 15
      const contactFwd = 35 + gauss() * 12
      const landing = 40 + gauss() * 12
      const release = 100
      const apexF = release + Math.round(fps * (0.6 + gauss() * 0.04))
      const contactF = apexF + Math.round(fps * (0.35 + gauss() * 0.03))
      const landingF = contactF + Math.round(fps * 0.4)
      const mpf = 1000 / fps
      // Lower body and shoulders (METRICS §3.15, §3.27 to §3.29), in % of height and degrees.
      const loading = 6 + gauss() * 2
      const legDrive = 12 + gauss() * 3
      const lowF = contactF - Math.round(fps * (0.35 + gauss() * 0.03))
      const trophyF = lowF - Math.round(fps * 0.03)
      const hipRelease = 0.53 + gauss() * 0.01
      const hipLow = hipRelease - loading / 100
      const hipContact = hipLow + legDrive / 100
      const tilt = 20 + gauss() * 5
      const shoulderDx = 0.045 * standing / 0.19
      const shoulderY = floorY - 0.8 * standing
      const shoulderDy = Math.tan((tilt * Math.PI) / 180) * shoulderDx

      const markNoise = () => gauss() * 0.0012
      const frameNoise = () => Math.round(gauss() * 0.35)
      const marks = (annotator: string, role: CheckAnnotation['annotatorRole']): CheckAnnotation => ({
        id: `check:${serveId}:${annotator}`,
        sessionId: `${subject}-session`,
        videoId: `${subject}-video`,
        serveId,
        annotator,
        annotatorRole: role,
        createdAt: `2026-09-27T0${annotator === 'AB' ? 1 : 2}:00:00.000Z`,
        updatedAt: `2026-09-27T0${annotator === 'AB' ? 1 : 2}:00:00.000Z`,
        tool: 'in-app@1',
        captureFps: fps,
        blind: true,
        events: {
          tossRelease: { frameIndex: release + frameNoise(), sure: true },
          tossApex: { frameIndex: apexF + frameNoise(), sure: true },
          contact: { frameIndex: contactF + frameNoise(), sure: true },
          landing: { frameIndex: landingF + frameNoise(), sure: true },
          trophy: { frameIndex: trophyF + frameNoise(), sure: true },
          lowestHip: { frameIndex: lowF + frameNoise(), sure: true },
        },
        points: {
          headTopSetup: { frameIndex: 40, x: toeX - 0.01 + markNoise(), y: floorY - standing + markNoise() },
          floorSetup: { frameIndex: 40, x: toeX - 0.03 + markNoise(), y: floorY + markNoise() },
          frontToeSetup: { frameIndex: 40, x: toeX + markNoise(), y: floorY + markNoise() },
          ballAtApex: { frameIndex: apexF, x: toeX + fromCm(tossFwd) + markNoise(), y: floorY - apexRatio * standing + markNoise() },
          ballAtContact: { frameIndex: contactF, x: toeX + fromCm(contactFwd) + markNoise(), y: floorY - contactRatio * standing + markNoise() },
          frontToeLanding: { frameIndex: landingF, x: toeX + fromCm(landing) + markNoise(), y: floorY + markNoise() },
          midHipRelease: { frameIndex: release, x: toeX - 0.02 + markNoise(), y: floorY - hipRelease * standing + markNoise() },
          midHipLowest: { frameIndex: lowF, x: toeX - 0.02 + markNoise(), y: floorY - hipLow * standing + markNoise() },
          midHipContact: { frameIndex: contactF, x: toeX + markNoise(), y: floorY - hipContact * standing + markNoise() },
          // Front shoulder nearer the net and higher by the tilt; labels deliberately swapped on some
          // serves (the maths takes the front shoulder by geometry, as the engine does).
          [s % 7 === 3 ? 'shoulderBackTrophy' : 'shoulderFrontTrophy']: { frameIndex: trophyF, x: toeX + (fwd * shoulderDx) / 2 / aspect + markNoise(), y: shoulderY - shoulderDy / 2 + markNoise() },
          [s % 7 === 3 ? 'shoulderFrontTrophy' : 'shoulderBackTrophy']: { frameIndex: trophyF, x: toeX - (fwd * shoulderDx) / 2 / aspect + markNoise(), y: shoulderY + shoulderDy / 2 + markNoise() },
        },
        ...(s % 5 === 0 ? { reference: { radarKmh: 150 + gauss() * 12, radarDevice: 'pocket-radar' as const, radarQuantity: 'peak' as const, radarUnit: 'km/h' as const } } : {}),
      })

      const est = (value: number, unit: string, sigma: number): ExportedMetric => ({
        value,
        unit,
        status: 'estimated',
        confidence: 0.8,
        uncertainty: { kind: 'ci95', low: value - 1.96 * sigma, high: value + 1.96 * sigma },
        validationLevel: 'V1',
        conditionClass: night ? 'night-lights' : 'day',
      })
      const appApex = apexRatio + (bias.apexPct + gauss() * noise.heightPct) / 100
      const appContact = contactRatio + (bias.contactPct + gauss() * noise.heightPct) / 100
      const ev = (truth: number) => {
        const f = truth + Math.round(bias.eventFrames + gauss() * noise.eventFrames)
        return { frameIndex: f, tReal: f / fps, confidence: 0.9, method: 'synthetic', uncertaintyS: 1 / fps }
      }
      const events = { tossRelease: ev(release), tossApex: ev(apexF), trophy: ev(trophyF), lowestHip: ev(lowF), contact: ev(contactF), landing: ev(landingF) }
      const appLegDrive = legDrive + bias.legDrivePct + gauss() * noise.hipPct
      const appLoading = loading + bias.loadingPct + gauss() * noise.hipPct
      const appDriveMs = (events.contact.frameIndex - events.lowestHip.frameIndex) * mpf
      const mechanics = { hipRisePctH: appLegDrive, hipDropPctH: appLoading, driveTimeMs: appDriveMs, shoulderTiltDeg: tilt + bias.shoulderDeg + gauss() * noise.shoulderDeg }
      const radar = s % 5 === 0
      const speedTruth = 150
      const metrics: Record<string, ExportedMetric> = {
        'toss-apex-height': est(appApex, 'ratio-of-height', 0.02),
        'contact-height-ratio': est(appContact, 'ratio-of-height', 0.015),
        'toss-drop': est(toCm(appApex - appContact), 'cm', 5),
        'rhythm-release-to-contact': est((events.contact.frameIndex - events.tossRelease.frameIndex) * mpf, 'ms', 12),
        'toss-forward': est(tossFwd + bias.forwardCm + gauss() * noise.forwardCm, 'cm', 6),
        'contact-forward': est(contactFwd + bias.forwardCm + gauss() * noise.forwardCm, 'cm', 6),
        'landing-distance': est(landing + bias.forwardCm + gauss() * noise.forwardCm, 'cm', 6),
        // Stored values are rounded like the engine's (1% of height, 10 ms); the mechanics are not.
        'leg-drive': { ...est(appLegDrive, '% of height', 1.8), value: Math.round(appLegDrive) },
        'loading-depth': { ...est(appLoading, '% of height', 1.8), value: Math.round(appLoading) },
        'drive-time': { ...est(appDriveMs, 'ms', 40), value: Math.round(appDriveMs / 10) * 10 },
        'shoulder-tilt-trophy': { value: null, unit: 'band', status: 'estimated', confidence: 0.6, conditionClass: night ? 'night-lights' : 'day' },
        ...(radar && fps >= 120
          ? { 'speed-experimental': { value: null, unit: 'km/h', status: 'experimental' as MetricValue['status'], confidence: 0.4, uncertainty: { kind: 'range' as const, low: speedTruth * 0.9, high: speedTruth * 1.1 }, quantity: 'launch-speed' as const } }
          : {}),
      }

      const base: Omit<ValidationEntry, 'annotation'> = {
        sample: false,
        subject: { key: subject, handedness, heightM, heightSource: 'entered' },
        clip: {
          videoId: `${subject}-video`,
          fingerprint: `fp-${subject}`,
          width,
          height,
          nominalFps: fps,
          captureFps: fps,
          timeScale: 1,
          frameCount: 600,
          timeBaseStatus: fps >= 100 ? 'proven' : 'unknown',
          orientation: 'portrait',
          view: 'side',
          setup: 'portrait-near',
          cameraSide: 'hitting-arm',
          light: night ? 'lights' : 'day',
          source: 'in-app-web',
        },
        serve: { id: serveId, index: s + 1, window: { startFrame: 0, endFrame: landingF + 30, tStartReal: 0, tEndReal: (landingF + 30) / fps }, included: true, exclusions: [], softFlags: [], hardRejects: [] },
        engine: ENGINE,
        app: { events, metrics, points: {}, standingNorm: standing * (1 + gauss() * 0.01), mechanics },
        derived: { you: { standingNorm: null, metrics: {}, radarKmh: null }, rows: [] },
      }
      entries.push({ ...base, annotation: marks('AB', 'team') })
      if (next() < (opts.doubleShare ?? 0.3)) entries.push({ ...base, annotation: marks('CD', 'coach') })
    }
  }

  // Entries the evaluation must leave out by default.
  const template = entries[0]
  for (let i = 0; template && i < (opts.sampleEntries ?? 0); i++) {
    entries.push({ ...template, sample: true, serve: { ...template.serve, id: `sample-${i}` }, annotation: { ...template.annotation, id: `check:sample-${i}:AB`, serveId: `sample-${i}` } })
  }
  for (let i = 0; template && i < (opts.unblindedEntries ?? 0); i++) {
    entries.push({ ...template, serve: { ...template.serve, id: `unblind-${i}` }, annotation: { ...template.annotation, id: `check:unblind-${i}:AB`, serveId: `unblind-${i}`, blind: false } })
  }

  return {
    format: VALIDATION_FORMAT,
    version: VALIDATION_VERSION,
    exportedAt: '2026-09-27T00:00:00.000Z',
    app: { engineVersions: [ENGINE.engineVersion], catalogueVersions: [ENGINE.catalogueVersion] },
    privacy: PRIVACY_NOTE,
    counts: { entries: entries.length, annotators: 2, sampleLeftOut: 0 },
    entries,
  }
}
