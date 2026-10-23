/**
 * Hands-free recording (N1.1) and the spoken verdict (N1.2), on rig traces.
 *
 * The serves are the rig's own (`buildServe`), read the way the viewfinder
 * reads them while recording: one pose every `RECORDING_INTERVAL_MS`, turned
 * into hand samples. Around them, what happens on a court between serves —
 * standing, bouncing the ball, walking off.
 */
import { buildServe } from '../../analysis/syntheticServe'
import {
  COUNTDOWN_S,
  RECORDING_INTERVAL_MS,
  REARM_S,
  SETTLE_S,
  SPEAK_GAP_MS,
  WALKED_OFF_S,
  countdownWord,
  handSample,
  onCourtDefault,
  shouldRearm,
  shouldStop,
  speakVerdict,
  spoken,
  type HandSample,
} from '../handsFree'
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { cueIssues } from '../../analysis/voice'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const STEP = RECORDING_INTERVAL_MS / 1000
const SERVE = buildServe({}, 50)

/** Copy a serve onto the clock from `start`, sampled at the recording rate. */
function serveAt(start: number): HandSample[] {
  const t0 = SERVE[0].t
  const span = SERVE[SERVE.length - 1].t - t0
  const out: HandSample[] = []
  for (let t = 0; t <= span; t += STEP) {
    const f = SERVE.reduce((a, b) => (Math.abs(b.t - t0 - t) < Math.abs(a.t - t0 - t) ? b : a))
    out.push(handSample(start + t, f.image))
  }
  return out
}

/** The rig's ready pose: standing, both hands low, for `seconds` from `start`. */
function standing(start: number, seconds: number): HandSample[] {
  const ready = SERVE[0].image
  const out: HandSample[] = []
  for (let t = 0; t < seconds; t += STEP) out.push(handSample(start + t, ready))
  return out
}

/** Nobody in shot. */
function gone(start: number, seconds: number): HandSample[] {
  const out: HandSample[] = []
  for (let t = 0; t < seconds; t += STEP) out.push(handSample(start + t, undefined))
  return out
}

/** Bouncing the ball: the racket hand swings to the hip, never near the head. */
function bouncing(start: number, seconds: number): HandSample[] {
  const ready = SERVE[0].image
  const out: HandSample[] = []
  for (let t = 0; t < seconds; t += STEP) {
    const image = ready.map((p, i) => (i === 15 || i === 16 ? { ...p, y: p.y + 0.05 * Math.sin(t * 6) } : p))
    out.push(handSample(start + t, image))
  }
  return out
}

/** Run the samples as the recorder would, stopping at the first sample that says stop. */
function stopsAt(samples: HandSample[], target: number): { at?: number; serves: number } {
  for (let k = 1; k <= samples.length; k++) {
    const r = shouldStop(samples.slice(0, k), target)
    if (r.stop) return { at: samples[k - 1].t, serves: r.serves }
  }
  return { serves: shouldStop(samples, target).serves }
}

const lastOf = (xs: HandSample[]) => xs[xs.length - 1].t

heading('Stopping on its own, once the serve is over')

check('the rig serve raises a hand above the head, and its ready pose does not', () => {
  const s = serveAt(0)
  assert(s.some((x) => x.handUp), 'no sample of the rig serve had a hand above the head')
  assert(!handSample(0, SERVE[0].image).handUp, 'the ready pose read as a hand up')
  assert(handSample(0, SERVE[0].image).handsDown, 'the ready pose did not read as hands down')
})

check('one serve stops a second and a half after the hands come down, not before', () => {
  const serve = serveAt(2)
  const trace = [...standing(0, 2), ...serve, ...standing(lastOf(serve) + STEP, 6)]
  const r = stopsAt(trace, 1)
  note(`serve ends at ${lastOf(serve).toFixed(2)} s, recording stops at ${r.at?.toFixed(2)} s`)
  assert(r.at !== undefined && r.serves === 1, 'one serve never stopped the recording')
  assert(r.at! > lastOf(serve) - 1, 'stopped before the serve was over')
  assert(r.at! - lastOf(serve) <= SETTLE_S + 1, `waited ${(r.at! - lastOf(serve)).toFixed(1)} s after the serve`)
})

check('a basket of six stops after the sixth serve, and not after the fifth', () => {
  let t = 0
  const trace: HandSample[] = []
  const ends: number[] = []
  for (let k = 0; k < 6; k++) {
    trace.push(...bouncing(t, 4))
    t += 4
    const s = serveAt(t)
    trace.push(...s)
    t = lastOf(s) + STEP
    ends.push(t)
  }
  trace.push(...standing(t, 6))
  const r = stopsAt(trace, 6)
  assert(r.serves === 6, `counted ${r.serves} serves`)
  assert(r.at! > ends[5] - 1 && r.at! < ends[5] + SETTLE_S + 1, `stopped at ${r.at?.toFixed(1)} s, the sixth ended at ${ends[5].toFixed(1)} s`)
})

check('bouncing the ball before serving never counts as a serve', () => {
  const r = stopsAt([...bouncing(0, 20)], 1)
  assert(r.at === undefined && r.serves === 0, 'a bounce started a serve')
})

check('a player who serves and walks off ends a basket short', () => {
  const s = serveAt(1)
  const trace = [...standing(0, 1), ...s, ...gone(lastOf(s) + STEP, WALKED_OFF_S + 2)]
  const r = stopsAt(trace, 6)
  assert(r.at !== undefined && r.serves === 1, `walked off: stopped ${r.at !== undefined}, ${r.serves} serves`)
})

check('nobody in shot at all never stops it: that is for the cap', () => {
  assert(stopsAt(gone(0, 30), 1).at === undefined, 'an empty picture stopped the recording')
})

heading('The next serve starting by itself (C3)')

/** Run the samples as the viewfinder would, returning when re-arm first fires. */
function rearmsAt(samples: HandSample[], clear = true): number | undefined {
  for (let k = 1; k <= samples.length; k++) {
    if (shouldRearm(samples.slice(0, k), clear, samples[k - 1].t)) return samples[k - 1].t
  }
  return undefined
}

check('standing ready re-arms after REARM_S, and not before', () => {
  const at = rearmsAt([...gone(0, 3), ...standing(3, 5)])
  note(`back in shot at 3.00 s, re-armed at ${at?.toFixed(2)} s`)
  assert(at !== undefined, 'standing ready never re-armed')
  assert(at! - 3 >= REARM_S && at! - 3 <= REARM_S + STEP, `re-armed ${(at! - 3).toFixed(2)} s after stepping in`)
})

check('bouncing the ball before the serve re-arms: both hands stay low', () => {
  assert(rearmsAt(bouncing(0, 6)) !== undefined, 'a player bouncing the ball was never re-armed')
})

check('a serve under way never re-arms, because the toss puts a hand up', () => {
  const s = serveAt(0)
  const fired = s.some((x, k) => shouldRearm(s.slice(0, k + 1), true, x.t) && x.handUp)
  assert(!fired, 'a sample with a hand above the head re-armed')
  const up = s.findIndex((x) => x.handUp)
  assert(!shouldRearm(s.slice(0, up + 1), true, s[up].t), 'the toss itself re-armed')
})

check('nobody in shot, or a verdict that is not clear, never re-arms', () => {
  assert(rearmsAt(gone(0, 10)) === undefined, 'an empty picture re-armed')
  assert(rearmsAt(standing(0, 10), false) === undefined, 'a hedged or refused picture re-armed')
})

check('walking out of shot starts the wait again', () => {
  const trace = [...standing(0, REARM_S - 0.5), ...gone(REARM_S - 0.5, 1), ...standing(REARM_S + 0.5, REARM_S + 1)]
  const at = rearmsAt(trace)
  assert(at !== undefined && at >= REARM_S + 0.5 + REARM_S, `re-armed at ${at?.toFixed(2)} s, before a full wait after coming back`)
})

heading('The countdown and the spoken verdict')

check('the countdown says when it starts, the last three seconds, and go', () => {
  const words = Array.from({ length: COUNTDOWN_S + 1 }, (_, i) => countdownWord(COUNTDOWN_S - i))
  assert(words[0]!.includes(String(COUNTDOWN_S)), `first word: ${words[0]}`)
  assert(words[words.length - 1] === 'Go', 'it never said go')
  assert(words.filter(Boolean).length === 5, `said ${words.filter(Boolean).join(', ')}`)
})

check('a verdict is spoken when it changes, and never twice inside the gap', () => {
  assert(speakVerdict({ call: 'ready' }, undefined, 0), 'the first verdict was not spoken')
  assert(!speakVerdict({ call: 'ready' }, { call: 'ready', at: 0 }, 60_000), 'the same verdict was spoken again')
  assert(!speakVerdict({ call: 'feet' }, { call: 'ready', at: 0 }, SPEAK_GAP_MS - 1), 'a change was spoken inside the gap')
  assert(speakVerdict({ call: 'feet' }, { call: 'ready', at: 0 }, SPEAK_GAP_MS), 'a change after the gap was not spoken')
})

check('a spoken cue loses its bold markers and stays a plain sentence', () => {
  const line = spoken('**Film from here.** The camera can read your whole body and the angle.')
  assert(!line.includes('*') && cueIssues(line).length === 0, line)
})

heading('On court by default (Q6)')

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }

check('hands-free and the voice start on with a touch screen, and off without one', () => {
  const g = globalThis as { window?: unknown }
  const had = 'window' in g
  const before = g.window
  try {
    g.window = { matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' }) }
    assert(onCourtDefault(), 'a phone did not start on court')
    g.window = { matchMedia: () => ({ matches: false }) }
    assert(!onCourtDefault(), 'a desktop started hands-free')
    g.window = {}
    assert(!onCourtDefault(), 'a browser with no media queries started hands-free')
  } finally {
    if (had) g.window = before
    else delete g.window
  }
  assert(!onCourtDefault(), 'no window at all started hands-free')
})

check("the player's own setting wins over the default, both ways", () => {
  const src = fs.readFileSync('src/components/FramingCheck.tsx', 'utf8')
  assert(src.includes('readPrefs().handsFree ?? onCourtDefault()'), 'hands-free does not fall back only when unset')
  assert(src.includes('readPrefs().speakFraming ?? onCourtDefault()'), 'the voice does not fall back only when unset')
  assert(!src.includes('Boolean(readPrefs().handsFree)'), 'an unset hands-free still reads as off somewhere')
})

check('a blocked preview offers the camera app, and home wires it to the camera input', () => {
  const framer = fs.readFileSync('src/components/FramingCheck.tsx', 'utf8')
  const home = fs.readFileSync('src/screens/Home.tsx', 'utf8')
  assert(/onCameraApp && CAMERA_APP_HELPS\.has\(block\)/.test(framer), 'the blocked state has no camera-app button')
  assert(framer.includes('Film with your camera app'), 'the button does not say what it opens')
  assert(/onCameraApp=\{\(\) => \{\s*setChecking\(false\)\s*recordRef\.current\?\.click\(\)/.test(home), 'home does not open the camera input from it')
})

report()
