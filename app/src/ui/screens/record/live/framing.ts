/**
 * Live framing checks and the Ready gate (CAPTURE §9.4, §9.8, §8.2 B; DESIGN §8.20, §10.3 R3).
 * Pure functions over a pose snapshot, the tilt reading and a few scene flags, so the gate is
 * unit-tested without a camera. Every figure here is an estimate from the player's entered height
 * (the screen labels it that way); nothing here is a serve metric.
 */
import { classifyLevel, levelValue, type LevelState, type Tilt } from './level.ts'

/** CAPTURE §8.5 `frameTopM`, `courtRoomM`, `subjectPx`, `fps`. */
export const FRAMING = {
  frameTop: { block: 4.3, min: 4.5, target: 4.7, statureFactor: 1.54, dropHighUnknownM: 1.25, marginM: 0.35 },
  tossOffsetM: 0.3,
  roomAhead: { pass: 1.8, block: 1.2 },
  bodyPx: { pass: 300, warn: 250, block: 200 },
  fps: { block: 24, warn: 50 },
  stepM: 0.8,
  /** Level-phone relation top = h + d * tan(V/2): 26 mm lens, long side (portrait) or short side (landscape). */
  tanHalfV: { portrait: Math.tan((67.3 / 2) * (Math.PI / 180)), landscape: Math.tan((41.1 / 2) * (Math.PI / 180)) },
  /** Prefer "raise" below these phone heights (CAPTURE §9.4). */
  raiseBelowM: { portrait: 1.6, landscape: 1.8 },
} as const

export type FrameOrientation = 'portrait' | 'landscape'

/** What the light pose pass reports, as a median over the last couple of seconds (normalised frame coordinates). */
export interface PoseSnapshot {
  headTopY: number
  floorY: number
  /** Front toe x (towards the net), when visible. */
  frontToeX: number | null
  /** Core landmarks inside the frame with a 3% margin while standing. */
  inFrame: boolean
  /** Other people at least half the player's size. */
  others: number
}

export interface FramingGeometry {
  /** Frame top at the player after the toss-offset allowance (T, CAPTURE §8.2 cq.toss-headroom), metres. */
  frameTopM: number
  /** T_min for this player. */
  frameTopMinM: number
  allowanceM: number
  /** Raw pixels of standing height on the delivered frame. */
  bodyPx: number
  roomAheadM: number | null
  cameraHeightM: number
  /** Metres per frame-height unit at the player. */
  metresPerUnit: number
  /** Frame top was computed with a measured tilt (false: level assumed). */
  tiltMeasured: boolean
}

export interface FramingInput {
  orientation: FrameOrientation
  frameHeightPx: number
  /** Displayed width / height. */
  aspect: number
  playerHeightM: number
  tilt: Tilt | null
  netOnRight: boolean
}

/** Maps a normalised image row to the row a level camera would see (pitch only, centre column). */
export function rectifyY(y: number, pitchDeg: number, tanHalfV: number): number {
  const f = 0.5 / tanHalfV
  const theta = Math.atan((y - 0.5) / f)
  const phi = theta - (pitchDeg * Math.PI) / 180
  return 0.5 + f * Math.tan(phi)
}

export function frameTopMinM(playerHeightM: number): number {
  const ft = FRAMING.frameTop
  return Math.max(ft.min, ft.statureFactor * playerHeightM + ft.dropHighUnknownM + ft.marginM)
}

export function framingGeometry(pose: PoseSnapshot, input: FramingInput): FramingGeometry | null {
  const t = FRAMING.tanHalfV[input.orientation]
  const pitch = input.tilt?.pitchDeg ?? 0
  const head = rectifyY(pose.headTopY, pitch, t)
  const floor = rectifyY(pose.floorY, pitch, t)
  const top = rectifyY(0, pitch, t)
  const heightUnits = floor - head
  if (!(heightUnits > 0.02) || !(input.playerHeightM > 0)) return null
  const unitsPerM = heightUnits / input.playerHeightM
  const allowanceM = FRAMING.tossOffsetM * t
  const frameTopM = (floor - top) / unitsPerM - allowanceM
  let roomAheadM: number | null = null
  if (pose.frontToeX !== null) {
    const edge = input.netOnRight ? 1 - pose.frontToeX : pose.frontToeX
    roomAheadM = Math.max(0, (edge * input.aspect) / unitsPerM)
  }
  return {
    frameTopM,
    frameTopMinM: frameTopMinM(input.playerHeightM),
    allowanceM,
    bodyPx: (pose.floorY - pose.headTopY) * input.frameHeightPx,
    roomAheadM,
    cameraHeightM: (floor - 0.5) / unitsPerM,
    metresPerUnit: 1 / unitsPerM,
    tiltMeasured: input.tilt !== null,
  }
}

const stepsFor = (metres: number) => Math.max(1, Math.ceil(metres / FRAMING.stepM))
const stepWord = (n: number) => (n === 1 ? '1 step' : `${n} steps`)

/** One instruction to gain headroom (CAPTURE §9.4 suggestions): raise a low phone, otherwise move back. */
export function headroomFix(g: FramingGeometry, orientation: FrameOrientation): string {
  const need = g.frameTopMinM - g.frameTopM
  if (g.cameraHeightM < FRAMING.raiseBelowM[orientation] && need <= FRAMING.raiseBelowM[orientation] - g.cameraHeightM + 0.1) {
    return 'Raise the phone a little'
  }
  return `Phone back ${stepWord(stepsFor(need / FRAMING.tanHalfV[orientation]))}`
}

/** One instruction to make a small player bigger (CAPTURE §9.4): closer, or 4K at the fence. */
export function sizeFix(g: FramingGeometry, orientation: FrameOrientation): string {
  if (orientation === 'landscape') return 'Use 4K, or move the phone closer'
  const distance = g.metresPerUnit / (2 * FRAMING.tanHalfV[orientation])
  const closer = distance * (1 - g.bodyPx / FRAMING.bodyPx.pass)
  return `Phone closer ${stepWord(stepsFor(closer))}`
}

export type CheckId = 'level' | 'in-frame' | 'room-above' | 'room-ahead' | 'steady' | 'light' | 'ball' | 'fps' | 'size'
/** pass; warn = Ready still allowed; block = Ready withheld; pending = not checked yet. */
export type CheckState = 'pass' | 'warn' | 'block' | 'pending'

export interface LiveCheck {
  id: CheckId
  /** One word or two, as the tray shows it (§8.20). */
  label: string
  state: CheckState
  /** Short value for the detail sheet and the landscape rail. */
  value: string
  /** Counts towards Ready (CAPTURE §9.8). */
  core: boolean
}

export type MotionAccess = 'granted' | 'prompt' | 'denied' | 'unsupported'

export interface LiveInputs {
  setupOrientation: FrameOrientation
  /** Orientation of the delivered frames. */
  orientation: FrameOrientation
  frameHeightPx: number
  aspect: number
  playerHeightM: number
  tilt: Tilt | null
  motion: MotionAccess
  /** Pose snapshot, null while nobody is found, 'unavailable' when the pose pass cannot run here. */
  pose: PoseSnapshot | null | 'unavailable'
  /** A person was found in the latest frame, even if not yet settled enough for a snapshot. */
  personSeen?: boolean
  steady: boolean | null
  light: 'good' | 'dark' | 'backlit' | null
  fps: number | null
  netOnRight: boolean
}

export type RecordAnyway = 'offered' | 'without-toss-height' | 'not-offered'

export interface LiveEvaluation {
  checks: LiveCheck[]
  ready: boolean
  levelState: LevelState
  geometry: FramingGeometry | null
  /** The one instruction (CAPTURE §9.8 priority), null when Ready. */
  instruction: { checkId: CheckId; text: string; detail?: string } | null
  recordAnyway: RecordAnyway
  /** CAPTURE check ids failing now, stored in CaptureContext.recordedAnyway. */
  failingCaptureIds: string[]
}

const CAPTURE_ID: Record<CheckId, string> = {
  level: 'cq.camera-level',
  'in-frame': 'cq.player-in-frame',
  'room-above': 'cq.toss-headroom',
  'room-ahead': 'cq.court-room',
  steady: 'cq.camera-stability',
  light: 'cq.exposure',
  ball: 'cq.ball-visibility',
  fps: 'cq.frame-rate',
  size: 'cq.player-size',
}

const m1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1)

/** Evaluates every live check, the Ready gate, the one instruction and the Record anyway rule. */
export function evaluateLive(input: LiveInputs): LiveEvaluation {
  const allowUp = input.setupOrientation === 'landscape' ? 5 : 0
  const levelState = classifyLevel(input.tilt, { allowUpTiltDeg: allowUp })
  const pose = input.pose === 'unavailable' ? null : input.pose
  const geometry = pose
    ? framingGeometry(pose, {
        orientation: input.orientation,
        frameHeightPx: input.frameHeightPx,
        aspect: input.aspect,
        playerHeightM: input.playerHeightM,
        tilt: input.tilt,
        netOnRight: input.netOnRight,
      })
    : null
  const poseRuns = input.pose !== 'unavailable'

  const checks: LiveCheck[] = []

  // Level (tilt): unknown withholds Ready (CAPTURE §9.8); over the 5 degree cap blocks outright.
  checks.push({
    id: 'level',
    label: 'Level',
    core: true,
    state: levelState === 'level' || levelState === 'corrected' ? 'pass' : levelState === 'unknown' && input.motion === 'prompt' ? 'pending' : 'block',
    value:
      levelState === 'unknown'
        ? input.motion === 'prompt'
          ? 'Level unknown: allow motion access'
          : 'Level by eye'
        : levelValue(input.tilt, levelState),
  })

  // In frame.
  checks.push({
    id: 'in-frame',
    label: 'In frame',
    core: true,
    // Found but not yet standing still for two seconds is 'pending', not a fix.
    state: !poseRuns ? 'pending' : pose ? (pose.inFrame ? 'pass' : 'block') : input.personSeen ? 'pending' : 'block',
    value: !poseRuns ? "Can't check on this browser" : !pose ? (input.personSeen ? 'Stand tall for two seconds' : 'Step into the picture') : pose.inFrame ? (pose.others > 0 ? 'Someone else is in view' : 'In frame') : 'Partly out of the picture',
  })

  // Room above (D1 framing rule).
  const ft = FRAMING.frameTop
  let aboveState: CheckState = 'pending'
  let aboveValue = poseRuns ? 'Stand tall at your spot' : "Can't check on this browser"
  if (geometry) {
    const T = geometry.frameTopM
    const need = geometry.frameTopMinM
    if (T >= need) {
      aboveState = 'pass'
      aboveValue = `${m1(T)} m, needs ${m1(need)}`
    } else if (T >= ft.block) {
      aboveState = 'warn'
      aboveValue = `${m1(T)} m. Very high tosses will be estimated`
    } else {
      aboveState = 'block'
      aboveValue = `${m1(T)} m, needs ${m1(need)}`
    }
  }
  checks.push({ id: 'room-above', label: 'Room above', core: true, state: aboveState, value: aboveValue })

  // Room ahead of the front toe.
  let aheadState: CheckState = 'pending'
  let aheadValue = poseRuns ? 'Waiting for you' : "Can't check on this browser"
  if (geometry && geometry.roomAheadM !== null) {
    const r = geometry.roomAheadM
    aheadState = r >= FRAMING.roomAhead.pass ? 'pass' : r >= FRAMING.roomAhead.block ? 'warn' : 'block'
    aheadValue = `${m1(r)} m ahead`
  } else if (geometry) {
    aheadValue = "Can't see your front foot"
  }
  checks.push({ id: 'room-ahead', label: 'Ahead', core: true, state: aheadState, value: aheadValue })

  // Steady.
  checks.push({
    id: 'steady',
    label: 'Steady',
    core: true,
    state: input.steady === null ? 'pending' : input.steady ? 'pass' : 'block',
    value: input.steady === null ? 'Checking' : input.steady ? 'Steady' : 'Phone is moving',
  })

  // Light (information only; pose success is the hard gate).
  checks.push({
    id: 'light',
    label: 'Light',
    core: false,
    state: input.light === null ? 'pending' : input.light === 'good' ? 'pass' : 'warn',
    value: input.light === null ? 'Checking' : input.light === 'good' ? 'Good' : input.light === 'dark' ? "It's quite dark" : 'Sun behind you',
  })

  // Ball: the practice-toss check is recommended, not required; this build checks it after recording.
  checks.push({ id: 'ball', label: 'Ball', core: false, state: 'pending', value: 'Checked after recording' })

  // Frame rate delivered by the browser.
  const fps = input.fps
  checks.push({
    id: 'fps',
    label: fps ? `${Math.round(fps)} fps` : 'Frame rate',
    core: true,
    state: fps === null ? 'pending' : fps < FRAMING.fps.block ? 'block' : fps < FRAMING.fps.warn ? 'warn' : 'pass',
    value: fps === null ? 'Checking' : fps < FRAMING.fps.warn ? `${Math.round(fps)} fps: timing less precise` : `${Math.round(fps)} fps`,
  })

  // Size (raw pixels of standing height).
  let sizeState: CheckState = 'pending'
  let sizeValue = poseRuns ? 'Waiting for you' : "Can't check on this browser"
  if (geometry) {
    const px = geometry.bodyPx
    const b = FRAMING.bodyPx
    sizeState = px >= b.warn ? 'pass' : px >= b.block ? 'warn' : 'block'
    sizeValue = px >= b.warn ? `You: ${Math.round(px)} px tall` : `${Math.round(px)} px. Small in frame. Use 4K`
  }
  checks.push({ id: 'size', label: 'Size', core: true, state: sizeState, value: sizeValue })

  const core = checks.filter((c) => c.core)
  const ready = core.every((c) => c.state === 'pass' || c.state === 'warn')

  // One instruction, CAPTURE §9.8 order: step in, hold still, motion access, level, room above,
  // room ahead, size, frame rate.
  const byId = (id: CheckId) => checks.find((c) => c.id === id)!
  let instruction: LiveEvaluation['instruction'] = null
  if (!ready) {
    const inFrame = byId('in-frame')
    const level = byId('level')
    if (poseRuns && inFrame.state === 'block') {
      instruction = { checkId: 'in-frame', text: 'Step into the picture', detail: 'Stand at your serving spot, side-on, and stand tall.' }
    } else if (byId('steady').state === 'block') {
      instruction = { checkId: 'steady', text: 'Hold still', detail: 'Rest the phone on a tripod, fence clip or bag.' }
    } else if (levelState === 'unknown') {
      instruction =
        input.motion === 'prompt'
          ? { checkId: 'level', text: 'Allow motion access', detail: "We use it to read the tilt and correct for it (not yet checked on real phones)." }
          : { checkId: 'level', text: 'Level the phone by eye', detail: "We can't read the tilt here. Line it up with the net post or a fence post." }
    } else if (level.state === 'block') {
      instruction = { checkId: 'level', text: 'Level the phone', detail: level.value }
    } else if (byId('room-above').state === 'block' && geometry) {
      instruction = { checkId: 'room-above', text: headroomFix(geometry, input.orientation), detail: `Room above your toss: ${m1(geometry.frameTopM)} m (needs at least ${m1(FRAMING.frameTop.block)})` }
    } else if (byId('room-ahead').state === 'block') {
      instruction = { checkId: 'room-ahead', text: 'Phone back 1 step', detail: 'We need to see where you land.' }
    } else if (byId('size').state === 'block' && geometry) {
      instruction = { checkId: 'size', text: sizeFix(geometry, input.orientation), detail: 'You are small in the picture.' }
    } else if (byId('fps').state === 'block') {
      instruction = { checkId: 'fps', text: 'Frame rate too low', detail: 'Record in the Camera app at 60 fps, then import it.' }
    } else if (!poseRuns) {
      instruction = { checkId: 'in-frame', text: "We can't see you here", detail: 'This browser cannot run the body check. Use Record anyway, or import a video.' }
    } else {
      const waiting = core.find((c) => c.state === 'pending')
      instruction = waiting ? { checkId: waiting.id, text: waiting.id === 'steady' || waiting.id === 'fps' ? 'Hold still' : 'Stand tall at your spot', detail: 'Stand still for two seconds.' } : null
    }
  }

  // Record anyway (CAPTURE §9.8, DESIGN §10.3 R3): never over a measured tilt beyond 5 degrees; a
  // measured frame top under 4.3 m offers "Record without toss height" instead.
  let recordAnyway: RecordAnyway = 'offered'
  if (levelState === 'over-cap') recordAnyway = 'not-offered'
  else if (geometry && geometry.tiltMeasured && geometry.frameTopM < FRAMING.frameTop.block) recordAnyway = 'without-toss-height'
  if (ready) recordAnyway = 'not-offered'

  const failingCaptureIds = checks.filter((c) => c.core && (c.state === 'block' || c.state === 'pending')).map((c) => CAPTURE_ID[c.id])

  return { checks, ready, levelState, geometry, instruction, recordAnyway, failingCaptureIds }
}

/** "8 of 9 ready" for the collapsed tray chip: every check that passes or only warns. */
export function readyCount(checks: LiveCheck[]): { done: number; total: number } {
  return { done: checks.filter((c) => c.state === 'pass' || c.state === 'warn').length, total: checks.length }
}
