/**
 * What the player is told about their serve speed (N2.5, N2.7).
 *
 * A reading is the launch speed — off the racket, which is what a radar gun
 * reads — with the range it is good to; SwingVision-style figures averaged
 * over the whole flight run a tenth or more below it, so this is the number to
 * hold against a radar. A miss is one thing the player can do about it next
 * time. No number in any miss line: the copy rules forbid raw readings in
 * player lines, and a frame rate or an angle is one.
 */
import type { ServeSpeed, SpeedMiss } from './vision/serveSpeed'

export const SPEED_MISS_LINE: Record<SpeedMiss, string> = {
  frame_rate: 'For a speed, film in slow motion or stand the phone further back. At normal speed the ball is gone in two frames.',
  view: 'Film from the side to get a speed. From behind, the ball flies straight away from the camera.',
  no_toss: 'I could not follow your toss, so I had nothing to measure the picture with. Keep the whole toss in shot.',
  timing: 'This video does not carry the time of each frame, so I cannot time the ball.',
  not_found: 'I lost the ball after the hit. Turn the phone on its side, step it back and leave the net side of the picture open.',
  unsure: 'I saw the ball after the hit, but not clearly enough to stand behind a speed.',
}

export type SpeedUnit = 'kmh' | 'mph'

/** Where a radar's speed is said in miles an hour. */
const MPH_REGIONS = ['US', 'GB', 'LR', 'MM']

/** The unit the player's own locale says speeds in: mph in the US and the UK, km/h elsewhere. */
export function defaultSpeedUnit(locale: string = typeof navigator === 'undefined' ? 'en' : navigator.language): SpeedUnit {
  const region = locale.split(/[-_]/)[1]?.toUpperCase()
  return region && MPH_REGIONS.includes(region) ? 'mph' : 'kmh'
}

export const UNIT_LABEL: Record<SpeedUnit, string> = { kmh: 'km/h', mph: 'mph' }

/** Metres a second into each unit. */
const PER_MS: Record<SpeedUnit, number> = { kmh: 3.6, mph: 3600 / 1609.344 }

/**
 * The short scale the reading is drawn on: a slow club serve to a fast one at
 * the far end, so the band sits somewhere a player can see it move.
 */
export const SPEED_SCALE: Record<SpeedUnit, [number, number]> = { kmh: [80, 220], mph: [50, 140] }

export interface SpeedFigures {
  best: number
  low: number
  high: number
  unit: string
  /** Where low, best and high sit along `SPEED_SCALE`, 0 to 1. */
  at: { low: number; best: number; high: number }
}

/**
 * A reading in whole units: the best figure rounded, the range widened
 * outwards so rounding never narrows what was claimed.
 */
export function speedFigures(s: Pick<ServeSpeed, 'ms' | 'low' | 'high'>, unit: SpeedUnit): SpeedFigures {
  const k = PER_MS[unit]
  const [from, to] = SPEED_SCALE[unit]
  const along = (v: number) => Math.max(0, Math.min(1, (v - from) / (to - from)))
  const best = Math.round(s.ms * k)
  const low = Math.floor(s.low * k)
  const high = Math.ceil(s.high * k)
  return { best, low, high, unit: UNIT_LABEL[unit], at: { low: along(low), best: along(best), high: along(high) } }
}

/** Each unit in words, for a voice: synthetic voices read "km/h" unevenly. */
const UNIT_SPOKEN: Record<SpeedUnit, string> = { kmh: 'kilometres an hour', mph: 'miles an hour' }

/**
 * The reading as the glance says it aloud, first (C3): the one figure, in
 * words. The range stays on the screen; read out, a second and third number
 * between the speed and the fix are noise to a player at the baseline.
 */
export function speedSpokenLine(f: Pick<SpeedFigures, 'best'>, unit: SpeedUnit): string {
  return `About ${f.best} ${UNIT_SPOKEN[unit]}.`
}

/** The glance's line for a reading. */
export function speedGlanceLine(f: SpeedFigures): string {
  return `About ${f.best} ${f.unit} off the racket, likely ${f.low}–${f.high}.`
}

type Ranged = Pick<ServeSpeed, 'ms' | 'low' | 'high'>

/** A reading as "about 130 km/h, likely 122–139". */
export function aboutSpeed(s: Ranged, unit: SpeedUnit): string {
  const f = speedFigures(s, unit)
  return `about ${f.best} ${f.unit}, likely ${f.low}–${f.high}`
}

/** A reading as a short label: "81 mph". */
export function aboutSpeedShort(s: Ranged, unit: SpeedUnit = defaultSpeedUnit()): string {
  const f = speedFigures(s, unit)
  return `${f.best} ${f.unit}`
}

/** The fastest serve on record, on Progress (N2.8). */
export function fastestLine(s: Ranged & { isNew: boolean }, unit: SpeedUnit): string {
  return `${s.isNew ? 'New fastest serve' : 'Fastest serve'}: ${aboutSpeed(s, unit)}.`
}

/** The newest trip against the one before, said only when their ranges are apart (N2.8). */
export function speedTrendLine(t: { direction: 'faster' | 'slower'; now: Ranged; then: Ranged }, unit: SpeedUnit): string {
  return `Serving ${t.direction} than your last trip: ${aboutSpeed(t.now, unit)}, against ${aboutSpeed(t.then, unit)}.`
}

/** Tagged first and second serves side by side (N2.8). */
export function serveNumberSpeedLine(s: { first: Ranged; second: Ranged; direction?: 'faster' | 'slower' }, unit: SpeedUnit): string {
  const first = `First serves ${aboutSpeed(s.first, unit)}; second serves ${aboutSpeed(s.second, unit)}.`
  // A slower second serve is what a second serve is for: said as a fact, not a fault.
  return s.direction === 'faster' ? `${first} Your second serve is the quicker one.` : first
}

/** A practice session's speeds, on its dashboard (N2.8). */
export function sessionSpeedLine(s: { read: number; fastest: Ranged; typical?: Ranged }, unit: SpeedUnit): string {
  const fastest = `Fastest serve ${aboutSpeed(s.fastest, unit)}.`
  return s.typical ? `${fastest} Typical serve ${aboutSpeed(s.typical, unit)}, over ${s.read} serves.` : fastest
}

/** A session read for speeds where no serve gave one. */
export const NO_SESSION_SPEED =
  'No serve in this practice gave a speed. Turn the phone on its side, step it back and leave the net side of the picture open.'
