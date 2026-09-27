/**
 * TEST DOUBLE of the engine contract (src/analysis/engine.ts, owned by engine-core), used ONLY by
 * the dev e2e page with ?engine=double while engine.ts is still a stub. It exists so the pipeline's
 * own mechanics (Pass B, workers, key frames, persistence, progress, cancellation) can be exercised
 * end to end. It is not the engine: it finds windows from a crude arm-above-head rule and passes the
 * ball layer's own MetricValues through (their statuses are the ball layer's). Never imported by
 * the app.
 */
import type { ServeAnalysis, SessionStats } from '../../../data/domain.ts'
import type { EngineInput, EngineOutput } from '../../engine.ts'
import type { TossAnalysis } from '../../ball/toss.ts'
import { LM, type EventEstimate, type Handedness, type MetricId, type MetricValue, type PoseFrame, type VideoMeta } from '../../types.ts'

interface WindowTossEntry {
  windowIndex: number
  startFrame: number
  endFrame: number
  startReal: number
  endReal: number
  provisionalContact: { tReal: number; frameIndex: number }
  toss: TossAnalysis | null
  events: { tossRelease?: EventEstimate; tossApex?: EventEstimate; contact?: EventEstimate }
  metrics: MetricValue[]
}

export function findServeWindowsDouble(poses: PoseFrame[], _meta: VideoMeta, _handedness: Handedness): { startReal: number; endReal: number; confidence: number }[] {
  // Either wrist: side-view left/right labels are unreliable.
  const up = poses.filter((p) => {
    const l = p.landmarks
    if (!l || l[LM.NOSE].visibility < 0.3) return false
    return [LM.LEFT_WRIST, LM.RIGHT_WRIST].some((k) => l[k].visibility > 0.3 && l[k].y < l[LM.NOSE].y - 0.02)
  })
  const anchors: number[] = []
  let runStart = -1
  let last = -Infinity
  for (const p of up) {
    if (p.tReal - last > 0.4) {
      if (runStart >= 0 && last - runStart >= 0.1) anchors.push(last)
      runStart = p.tReal
    }
    last = p.tReal
  }
  if (runStart >= 0 && last - runStart >= 0.1) anchors.push(last)
  const merged: number[] = []
  for (const a of anchors) {
    if (merged.length && a - merged[merged.length - 1] < 2.5) merged[merged.length - 1] = a
    else merged.push(a)
  }
  return merged.map((a) => ({ startReal: Math.max(0, a - 2.2), endReal: a + 1.6, confidence: 0.6 }))
}

function event(frameIndex: number, tReal: number, method: string, uncertaintyS = 0.02): EventEstimate {
  return { frameIndex, tReal, uncertaintyS, confidence: 0.6, method }
}

export function analyseSessionDouble(input: EngineInput): EngineOutput {
  const entries = (input.ball.toss ?? []) as WindowTossEntry[]
  const serves: ServeAnalysis[] = entries.map((w, k) => {
    const metrics: Partial<Record<MetricId, MetricValue>> = {}
    for (const m of w.metrics) metrics[m.id as MetricId] = { ...m, basis: `${m.basis} [test double: ball-layer value passed through]` }
    const release = w.events.tossRelease
    const contact = w.events.contact ?? event(w.provisionalContact.frameIndex, w.provisionalContact.tReal, 'test-double-provisional', 0.1)
    if (release) {
      const ms = (contact.tReal - release.tReal) * 1000
      metrics['rhythm-release-to-contact'] = {
        id: 'rhythm-release-to-contact',
        value: Math.round(ms / 10) * 10,
        unit: 'ms',
        status: 'estimated',
        uncertainty: { kind: 'plusminus', low: ms - 30, high: ms + 30 },
        confidence: 0.5,
        basis: 'toss release (ball layer) to contact [test double]',
      }
    }
    const inWindow = input.poses.filter((p) => p.frameIndex >= w.startFrame && p.frameIndex <= w.endFrame && p.landmarks)
    const hipY = (p: PoseFrame) => (p.landmarks![LM.LEFT_HIP].y + p.landmarks![LM.RIGHT_HIP].y) / 2
    const between = inWindow.filter((p) => (!release || p.tReal >= release.tReal) && p.tReal <= contact.tReal)
    const lowest = between.reduce<PoseFrame | undefined>((b, p) => (!b || hipY(p) > hipY(b) ? p : b), undefined)
    const landing = inWindow.find((p) => p.tReal >= contact.tReal + 0.35)
    const toss = w.toss?.status === 'ok' && w.toss.release && w.toss.apex ? w.toss : null
    return {
      schemaVersion: 1,
      id: `serve-${k + 1}`,
      sessionId: '',
      videoId: '',
      index: k + 1,
      mode: input.view === 'rear' ? 'outcomes' : 'technique',
      view: input.view,
      handedness: input.profile.handedness,
      window: { startFrame: w.startFrame, endFrame: w.endFrame, tStartReal: w.startReal, tEndReal: w.endReal },
      detection: { confidence: 0.6, cues: ['toss-arm'], kind: 'serve', anchor: 'pose-arm-run' },
      events: {
        ...(release ? { tossRelease: release } : {}),
        ...(w.events.tossApex ? { tossApex: w.events.tossApex } : {}),
        contact,
        ...(lowest ? { lowestHip: event(lowest.frameIndex, lowest.tReal, 'test-double-lowest-hip', 0.03) } : {}),
        ...(landing ? { landing: event(landing.frameIndex, landing.tReal, 'test-double-landing', 0.05) } : {}),
        ...(inWindow[0] ? { motionStart: event(inWindow[0].frameIndex, inWindow[0].tReal, 'test-double-window-start', 0.2) } : {}),
      },
      phases: [],
      rectification: { status: 'unknown', source: 'none', orientation: input.meta.width < input.meta.height ? 'portrait' : 'landscape', fovDeg: 67.3, fovSource: 'lens-default' },
      toss: toss
        ? {
            release: toss.release ? event(toss.release.frameIndex, toss.release.tReal, toss.release.method, toss.release.uncertaintyS) : release!,
            apex: { ...event(toss.apex!.frameIndex, toss.apex!.tReal, 'ball-apex-fit', toss.apex!.uncertaintyS), bracketed: true, aboveFrame: !!toss.apex!.aboveFrame, extrapolated: false },
            apexXY: { x: toss.apex!.x, y: toss.apex!.y },
            gravity: { status: toss.gravity.status === 'ok' ? 'ok' : 'unavailable', plausible: toss.gravity.plausible },
            fitRmseNorm: toss.fit?.rmse ?? 0,
            detections: toss.fit?.detections ?? 0,
          }
        : null,
      contact: { event: contact },
      legDrive: null,
      shoulder: null,
      rear: null,
      landing: null,
      audio: { usable: false, reason: 'test double' },
      speed: null,
      metrics,
      quality: { overall: 'usable', checks: [] },
      plausibility: { hardRejects: [], softFlags: [] },
      included: true,
      exclusions: [],
      keyFrames: {},
      engine: {
        engineVersion: '0.0.0-test-double',
        contract: 1,
        catalogueVersion: 'test-double',
        poseModel: 'mediapipe-pose',
        poseBackend: 'gpu',
        decodePath: input.meta.decodePath ?? 'webcodecs',
        analysedAt: new Date().toISOString(),
        durationMs: 0,
        paramsHash: 'test-double',
        bandsVersion: 'test-double',
      },
    }
  })
  const stats: SessionStats = {
    sessionId: '',
    inputsHash: 'test-double',
    computedAt: new Date().toISOString(),
    metrics: {
      'serve-count': { id: 'serve-count', value: serves.length, unit: 'serves', status: 'measured', confidence: 1, basis: 'serves found [test double]', n: serves.length },
    },
    strata: [],
    outcomeLink: null,
    outcomeLinkChecks: [],
    derivedPerServe: {},
  }
  if (serves[0]) stats.representativeServeId = serves[0].id
  return { serves, stats, quality: { overall: 'usable', checks: [] }, warnings: ['test double engine (dev e2e page only)'] }
}
