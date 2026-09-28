/**
 * The Record flow's working state (PRODUCT §6.3.1 to §6.3.2, DESIGN §10.3 R1 and R2): the session
 * plan, the block card and the set-up choice, shared by Record, Set-up, Live framing and Import.
 * In memory for the visit; the set-up orientation is also remembered in settings
 * (`captureDefaults.orientation`, ARCHITECTURE §7.1).
 */
import { create } from 'zustand'
import type { ServeNumber, ServeSide, ServeType, TargetZone } from '../../../../analysis/types.ts'
import type { SessionTemplate } from '../../../../data/records.ts'

export type PlanId = Extract<SessionTemplate, 'retest' | 'check-in' | 'second-serve-check-in' | 'experiment' | 'both-sides'>
export type SetupChoice = 'portrait' | 'fence'
export type Wind = 'calm' | 'breezy' | 'windy'
export type Light = 'day' | 'lights'
/** CAPTURE §3.7: the doubles spot moves the server 2 to 3 m, so the live check and matched comparisons keep it apart. */
export type Spot = 'singles' | 'doubles'
export type FpsChoice = 30 | 60 | 120 | 240 | 50

export interface Block {
  side: ServeSide
  serveNumber: ServeNumber
  type: ServeType | 'mixed' | null
  target: TargetZone | 'mixed' | null
  spot: Spot
  wind: Wind
  light: Light
}

export interface PlanInfo {
  id: PlanId
  title: string
  serves: number
  minutes: string
  /** One line under the title. */
  line: string
}

/** PRODUCT §6.3.1 / CAPTURE §5.5 templates. */
export const PLANS: PlanInfo[] = [
  { id: 'check-in', title: 'Check-in', serves: 15, minutes: '30 min', line: 'Warm up, one block, then your focus and a drill.' },
  { id: 'second-serve-check-in', title: 'Second-serve check-in', serves: 15, minutes: '30 min', line: '15 second serves from your usual side.' },
  { id: 'experiment', title: 'Experiment', serves: 30, minutes: '45 min', line: 'Two blocks with a drill between them.' },
  { id: 'both-sides', title: 'Both sides', serves: 30, minutes: '45 min', line: 'A deuce block, then an ad block.' },
]

export const RETEST_PLAN: PlanInfo = {
  id: 'retest',
  title: 'Re-test',
  serves: 15,
  minutes: '30 min',
  line: 'Warm up first. Record before you do the drill, so we see what stuck.',
}

export interface FlowState {
  plan: PlanId
  block: Block
  fps: FpsChoice
  setup: SetupChoice
  /** Set when the body check was answered for this recording (it runs before every recording). */
  bodyCheckedAt: number | null
  /** After Stop, whether to open tagging when analysis finishes. */
  tagAfterAnalysis: boolean
  /** The player picked the Light chip this visit; until then it follows the clock (lightForClock). */
  lightChosen: boolean
  /** Before the player picks: the Light chip from the local clock (evening and night: court lights). */
  syncLightToClock: (now?: Date) => void
  setPlan: (plan: PlanId) => void
  setBlock: (patch: Partial<Block>) => void
  setFps: (fps: FpsChoice) => void
  setSetup: (setup: SetupChoice) => void
  markBodyChecked: () => void
  clearBodyCheck: () => void
  setTagAfterAnalysis: (on: boolean) => void
}

/**
 * The Light chip's starting answer from the local clock (finding 21): 6 pm to 7 am is court lights, as
 * an import's timestamp does (sessionFactory lightFromTimestamp). Daylight is never assumed after dark;
 * the engine also checks the picture (a dark sky over a lit court, or flicker) and says so.
 */
export function lightForClock(now: Date = new Date()): Light {
  const h = now.getHours()
  return h >= 18 || h < 7 ? 'lights' : 'day'
}

export const DEFAULT_BLOCK: Block = { side: 'deuce', serveNumber: 1, type: null, target: null, spot: 'singles', wind: 'calm', light: lightForClock() }

export const useRecordFlow = create<FlowState>()((set) => ({
  plan: 'check-in',
  block: DEFAULT_BLOCK,
  fps: 60,
  setup: 'portrait',
  bodyCheckedAt: null,
  tagAfterAnalysis: false,
  lightChosen: false,
  syncLightToClock: (now) => set((s) => (s.lightChosen || s.block.light === lightForClock(now) ? s : { block: { ...s.block, light: lightForClock(now) } })),
  setPlan: (plan) =>
    set((s) => ({
      plan,
      // The second-serve template records second serves (CAPTURE §5.5).
      block: plan === 'second-serve-check-in' ? { ...s.block, serveNumber: 2 } : plan === 'check-in' ? { ...s.block, serveNumber: 1 } : s.block,
    })),
  setBlock: (patch) => set((s) => ({ block: { ...s.block, ...patch }, lightChosen: s.lightChosen || patch.light !== undefined })),
  setFps: (fps) => set({ fps }),
  setSetup: (setup) => set({ setup }),
  markBodyChecked: () => set({ bodyCheckedAt: Date.now() }),
  clearBodyCheck: () => set({ bodyCheckedAt: null }),
  setTagAfterAnalysis: (tagAfterAnalysis) => set({ tagAfterAnalysis }),
}))

/**
 * "Delete everything" (finding 18): the visit's plan (a re-test of a deleted experiment), block card
 * and body-check mark start again, as on a fresh start.
 */
export function resetRecordFlow(): void {
  useRecordFlow.setState({
    plan: 'check-in',
    block: { ...DEFAULT_BLOCK, light: lightForClock() },
    fps: 60,
    setup: 'portrait',
    bodyCheckedAt: null,
    tagAfterAnalysis: false,
    lightChosen: false,
  })
}

/** Frame-rate choices and copy (CAPTURE §3.3). */
export const FPS_OPTIONS: { value: FpsChoice; title: string; body: string }[] = [
  {
    value: 60,
    title: '60 fps (recommended)',
    body: 'Everything in your report: toss, contact, rhythm, leg drive, landing and shoulder tilt. Timing to about a sixtieth of a second.',
  },
  {
    value: 30,
    title: '30 fps',
    body: "Works for your toss, contact height, leg drive, shoulder tilt and landing. Rhythm and the timing of your leg drive are about half as precise, and speed isn't available.",
  },
  {
    value: 120,
    title: '120 fps',
    body: "Sharper contact frames and finer timing. Needed for the experimental speed range, together with your target (T, body or wide) and room in the picture for the ball's first metres of flight. Best in daylight. Files are about twice as big and the phone gets warmer.",
  },
  {
    value: 240,
    title: '240 fps slow motion',
    body: "The sharpest contact frames. Daylight only. Big files. If you film in the Camera app's Slo-mo, import it through Files so we can read the real frame rate.",
  },
  {
    value: 50,
    title: '25 or 50 fps (under lights)',
    body: "Court lights can pulse 100 times a second on Australia's 50 Hz power. 25 or 50 fps avoids the pulsing where your phone offers it.",
  },
]

export function fpsTitle(fps: FpsChoice): string {
  return FPS_OPTIONS.find((o) => o.value === fps)?.title ?? `${fps} fps`
}
