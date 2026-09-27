/**
 * Builds and saves what the Record flow owns before analysis starts (ARCHITECTURE §5.1, §5.2 step 1):
 * the queued Session with its CaptureContext defaults, and the tally when one was entered.
 * The builders are pure and unit-tested; `saveNewSession` writes through the data layer's
 * repositories only.
 */
import type {
  CameraOrientation,
  CameraSide,
  CameraView,
  CaptureContext,
  CaptureSetup,
  Handedness,
  PhoneMount,
  ServeNumber,
  ServeSide,
  ServeType,
  ServingSpot,
  TargetZone,
  VideoMeta,
} from '../../../../analysis/types.ts'
import { createSession, getActiveExperiment, setTally } from '../../../../data/index.ts'
import type { ProfileRecord, SessionRecord, SessionTemplate, TallyCounts } from '../../../../data/index.ts'

/** CAPTURE §9.4: the default stature when none is entered, flagged as an assumption. */
export const DEFAULT_HEIGHT_M = 1.75

export interface PlayerFacts {
  heightM: number
  heightSource: 'entered' | 'default'
  handedness: Handedness
}

export function playerFacts(profile: Pick<ProfileRecord, 'heightM' | 'handedness'> | null | undefined): PlayerFacts {
  const h = profile?.heightM
  const valid = typeof h === 'number' && h >= 1.3 && h <= 2.2
  return { heightM: valid ? h : DEFAULT_HEIGHT_M, heightSource: valid ? 'entered' : 'default', handedness: profile?.handedness ?? 'right' }
}

export interface BlockFacts {
  side: ServeSide | 'both'
  serveNumber: ServeNumber | 'mixed'
  type?: ServeType | 'mixed' | null
  target?: TargetZone | 'mixed' | null
  wind?: 'calm' | 'breezy' | 'windy'
  light?: 'day' | 'lights'
  /** Addition: singles or doubles serving spot (a set-up matching factor, METRICS §4.4). */
  servingSpot?: ServingSpot | null
}

export interface RecordingFacts {
  mimeType: string
  durationS: number
  requested: { width: number; height: number; fps: number }
  delivered: { width: number; height: number; fps: number }
  orientation: CameraOrientation
  /** The set-up the player chose on R2. */
  setup: 'portrait' | 'fence'
  cameraLabel?: string
  orientationSamples?: { tMs: number; pitchDeg: number; rollDeg: number }[]
  recordingStartMs?: number
  framingAtStart?: CaptureContext['framingAtStart']
  recordedAnyway?: string[]
  expectedServeCount?: number
}

/** Lens default for the 1x main camera (CAPTURE §2.2: 26 mm, long side 67.3 degrees). */
const DEFAULT_FOV_DEG = 67.3

const intendedType = (t: BlockFacts['type']) => (t && t !== 'mixed' ? t : undefined)

export function setupFor(setup: 'portrait' | 'fence'): CaptureSetup {
  return setup === 'fence' ? 'side-landscape-fence' : 'side-portrait'
}

/** CaptureContext for an in-app web recording (CAPTURE §12; D1 set-up, delivered size and rate, tilt samples). */
export function recordingCapture(player: PlayerFacts, block: BlockFacts, facts: RecordingFacts, hitSoundTiming: boolean): CaptureContext {
  return {
    source: 'in-app-web',
    declaredView: 'side',
    cameraSide: 'chest',
    serveSide: block.side,
    ...(block.servingSpot ? { servingSpot: block.servingSpot } : {}),
    serveNumber: block.serveNumber,
    intendedType: intendedType(block.type),
    intendedTarget: block.target ?? undefined,
    handedness: player.handedness,
    playerHeightM: player.heightM,
    playerHeightSource: player.heightSource,
    conditions: { wind: block.wind, light: block.light },
    device: facts.cameraLabel ? { cameraLabel: facts.cameraLabel } : undefined,
    requested: facts.requested,
    delivered: { ...facts.delivered, mimeType: facts.mimeType },
    orientation: facts.orientation,
    setup: setupFor(facts.setup),
    videoFovDeg: DEFAULT_FOV_DEG,
    orientationSamples: facts.orientationSamples && facts.orientationSamples.length > 0 ? facts.orientationSamples : undefined,
    recordingStartMs: facts.recordingStartMs,
    framingAtStart: facts.framingAtStart,
    // The in-app recorder never records sound (D4, CAPTURE §7.2); hit-sound onsets are a separate opt-in.
    hitSoundTiming,
    expectedServeCount: facts.expectedServeCount,
    recordedAnyway: facts.recordedAnyway && facts.recordedAnyway.length > 0 ? facts.recordedAnyway : undefined,
  }
}

export interface ImportAnswers {
  view: CameraView
  cameraSide?: CameraSide
  side: ServeSide | 'both'
  serveNumber: ServeNumber | 'mixed'
  type?: ServeType | 'mixed' | null
  target?: TargetZone | 'mixed' | null
  slowMotionAnswer?: CaptureContext['slowMotionAnswer']
  hitSoundTiming: boolean
  /** Addition: "How was the phone mounted?" (side views; METRICS §1.1.3a). */
  mount?: PhoneMount
  /** Addition: singles or doubles serving spot. */
  servingSpot?: ServingSpot | null
}

/** CaptureContext for an import (CAPTURE §11.2): pitch unknown, built from the probe and the answers. */
export function importCapture(player: PlayerFacts, answers: ImportAnswers, meta: Pick<VideoMeta, 'width' | 'height' | 'captureFps' | 'mimeType'>): CaptureContext {
  const orientation: CameraOrientation = meta.height >= meta.width ? 'portrait' : 'landscape'
  const setup: CaptureSetup =
    answers.view === 'rear' ? 'rear-outcomes' : answers.view === 'side' ? (orientation === 'portrait' ? 'side-portrait' : 'side-other') : 'unknown'
  return {
    source: 'import',
    declaredView: answers.view,
    cameraSide: answers.cameraSide,
    serveSide: answers.side,
    serveNumber: answers.serveNumber,
    intendedType: intendedType(answers.type),
    intendedTarget: answers.target ?? undefined,
    handedness: player.handedness,
    playerHeightM: player.heightM,
    playerHeightSource: player.heightSource,
    delivered: { width: meta.width, height: meta.height, fps: meta.captureFps, mimeType: meta.mimeType },
    orientation,
    setup,
    hitSoundTiming: answers.hitSoundTiming,
    slowMotionAnswer: answers.slowMotionAnswer,
    ...(answers.mount ? { mount: answers.mount } : {}),
    ...(answers.servingSpot ? { servingSpot: answers.servingSpot } : {}),
  }
}

/** A minimal VideoMeta when the recorded blob cannot be probed (the pipeline probes it again). */
export function fallbackMeta(fileName: string, facts: Pick<RecordingFacts, 'mimeType' | 'durationS' | 'delivered'>): VideoMeta {
  const fps = facts.delivered.fps > 0 ? facts.delivered.fps : 30
  return {
    fileName,
    mimeType: facts.mimeType,
    durationMediaS: facts.durationS,
    width: facts.delivered.width,
    height: facts.delivered.height,
    rotationDeg: 0,
    hasAudio: false,
    nominalFps: fps,
    captureFps: fps,
    timeScale: 1,
    fpsSource: 'container',
    isVariableFrameRate: false,
    frameCount: Math.round(facts.durationS * fps),
  }
}

export const TEMPLATE_BY_PLAN: Record<string, SessionTemplate> = {
  retest: 'retest',
  'check-in': 'check-in',
  'second-serve-check-in': 'second-serve-check-in',
  experiment: 'experiment',
  'both-sides': 'both-sides',
}

export interface SessionInput {
  capture: CaptureContext
  view: CameraView
  cameraSide?: CameraSide
  mode: 'technique' | 'outcomes'
  template: SessionTemplate
  startedAt: string
  block: BlockFacts
}

/** The Session row before analysis: queued, with the block defaults the matched comparisons need. */
export function sessionFor(input: SessionInput): Omit<SessionRecord, 'id' | 'createdAt' | 'visitId' | 'isRetest' | 'isDemo'> {
  const b = input.block
  return {
    startedAt: input.startedAt,
    status: 'queued',
    mode: input.mode,
    view: input.view,
    cameraSide: input.cameraSide,
    setup: input.capture.setup,
    orientation: input.capture.orientation,
    template: input.template,
    blockIndex: 0,
    conditions: input.capture.conditions,
    defaultSide: b.side === 'both' ? undefined : b.side,
    defaultServeNumber: b.serveNumber === 'mixed' ? undefined : b.serveNumber,
    defaultIntendedType: intendedType(b.type),
    defaultTarget: b.target && b.target !== 'mixed' ? b.target : undefined,
    ...((input.capture.servingSpot ?? b.servingSpot) ? { servingSpot: (input.capture.servingSpot ?? b.servingSpot)! } : {}),
    ...(input.capture.mount ? { phoneMount: input.capture.mount } : {}),
  }
}

/**
 * Whether a stored copy can be kept (D4, D8): stored videos never carry sound. In-app recordings have
 * none. For an import with sound the pipeline removes the track when it can, and otherwise keeps no
 * copy (only stats and key frames). Used for the note on the Import screen.
 */
export function soundNote(hasAudio: boolean): 'none' | 'may-not-keep' {
  return hasAudio ? 'may-not-keep' : 'none'
}

export interface SaveInput {
  session: SessionInput
  tally?: { serveNumber: ServeNumber; counts: TallyCounts }
  now?: Date
}

/**
 * Writes the queued Session (with the block card's defaults) and the optional tally before analysis
 * starts (ARCHITECTURE §5.2 step 1). The pipeline reuses this session and stores the video itself
 * (analysis/pipeline/persist.ts), so no VideoRecord is written here.
 */
export async function saveNewSession(input: SaveInput): Promise<{ sessionId: string }> {
  const now = input.now ?? new Date()
  // A re-test (Record locks the block to the experiment's stratum) is linked to the player's active
  // experiment; once analysed, the coaching sync attaches it and works out "Did it work?".
  const exp = input.session.template === 'retest' ? await getActiveExperiment({ demo: false }) : undefined
  const link = exp ? { isRetest: 1 as const, experimentId: exp.id } : {}
  const session = await createSession({ ...sessionFor(input.session), ...link }, now)
  if (input.tally) {
    await setTally({
      sessionId: session.id,
      ...(input.tally.serveNumber === 2 ? { secondServes: input.tally.counts } : { firstServes: input.tally.counts }),
      enteredAt: now.toISOString(),
    })
  }
  return { sessionId: session.id }
}
