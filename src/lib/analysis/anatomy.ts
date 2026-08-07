/**
 * Every measurement, said as a body position rather than a number.
 *
 * The pipeline works in ratios of standing height, degrees and milliseconds,
 * because that is what survives a change of camera. None of it means anything to
 * a player. "1.38×" is a coordinate multiplier; "peaks a ball above your reach"
 * is a thing you can see yourself doing on the next serve, and it is the same
 * fact.
 *
 * So this is the one place the app translates. Each measurement carries a short
 * ladder of body states, ordered low to high, and a value falls into exactly one
 * of them. The stops are absolute positions of a body — a straight arm is a
 * straight arm whichever serve you meant to hit — so they are deliberately NOT
 * derived from the target bands, which move with the serve type. The target
 * phrase is looked up through the same ladder, so the readout and the target are
 * always spoken in one vocabulary and can be read against each other.
 */

/** One rung: everything below `under`, in body language. */
interface Stop {
  under: number
  tag: string
}

/**
 * Ladders, low to high, per measurement. The last rung of each carries
 * `Infinity`, so every finite value lands somewhere.
 */
const LADDERS: Record<string, Stop[]> = {
  /* ------------------------------------------------------------------- toss */
  tossArmExtension: [
    { under: 140, tag: 'Elbow folded' },
    { under: 163, tag: 'Elbow soft' },
    { under: Infinity, tag: 'Arm straight' },
  ],
  releaseHeight: [
    { under: 1.0, tag: 'Let go at head height' },
    { under: 1.12, tag: 'Let go above the head' },
    { under: 1.36, tag: 'Let go at full stretch' },
    { under: Infinity, tag: 'Let go past full stretch' },
  ],
  tossArmHold: [
    { under: 25, tag: 'Arm drops at once' },
    { under: 55, tag: 'Arm drops early' },
    { under: 85, tag: 'Arm holds to the swing' },
    { under: Infinity, tag: 'Arm holds through contact' },
  ],
  tossPathWobble: [
    { under: 1.5, tag: 'Dead straight lift' },
    { under: 3, tag: 'Straight lift' },
    { under: 6, tag: 'Drifts a hand wide' },
    { under: Infinity, tag: 'Wanders wide' },
  ],
  tossPeakHeight: [
    { under: 1.2, tag: 'Peaks below the racket' },
    { under: 1.38, tag: 'Peaks at racket reach' },
    { under: 1.72, tag: 'Peaks a ball above the racket' },
    { under: Infinity, tag: 'Peaks far above the racket' },
  ],
  contactBelowPeak: [
    { under: 0.03, tag: 'Struck at the peak' },
    { under: 0.09, tag: 'Struck near the peak' },
    { under: 0.2, tag: 'Struck on the way down' },
    { under: Infinity, tag: 'Struck well after the drop' },
  ],

  /* ---------------------------------------------------------------- loading */
  kneeBend: [
    { under: 18, tag: 'Legs straight' },
    { under: 35, tag: 'Legs barely bent' },
    { under: 62, tag: 'Athletic load' },
    { under: Infinity, tag: 'Deep squat' },
  ],
  hipShoulderSeparation: [
    { under: 8, tag: 'Hips and chest locked' },
    { under: 15, tag: 'Slight coil' },
    { under: 38, tag: 'Hips lead the chest' },
    { under: Infinity, tag: 'Extreme coil' },
  ],
  shoulderTilt: [
    { under: 7, tag: 'Shoulders level' },
    { under: 14, tag: 'Shoulders near level' },
    { under: 32, tag: 'Hitting shoulder under the ball' },
    { under: Infinity, tag: 'Steep cartwheel' },
  ],
  legDrive: [
    { under: 0.04, tag: 'No push off the court' },
    { under: 0.1, tag: 'Light push' },
    { under: 0.24, tag: 'Strong drive up' },
    { under: Infinity, tag: 'Big launch' },
  ],

  /* ------------------------------------------------------------------ swing */
  dropDepth: [
    { under: 0.06, tag: 'Racket stays at the shoulder' },
    { under: 0.16, tag: 'Racket half drops' },
    { under: 0.34, tag: 'Racket falls down the back' },
    { under: Infinity, tag: 'Racket falls past the back' },
  ],
  elbowAtDrop: [
    { under: 40, tag: 'Racket jammed on the back' },
    { under: 95, tag: 'Arm folded in an L' },
    { under: Infinity, tag: 'Arm swings straight' },
  ],
  dropToContact: [
    { under: 110, tag: 'Swing snaps through' },
    { under: 230, tag: 'Explosive swing' },
    { under: 320, tag: 'Guided swing' },
    { under: Infinity, tag: 'Steered swing' },
  ],

  /* ---------------------------------------------------------------- contact */
  contactHeight: [
    { under: 1.1, tag: 'Struck at head height' },
    { under: 1.28, tag: 'Struck below full reach' },
    { under: 1.5, tag: 'Struck at full racket reach' },
    { under: Infinity, tag: 'Struck at the top of the reach' },
  ],
  armExtension: [
    { under: 140, tag: 'Elbow bent at contact' },
    { under: 160, tag: 'Arm short of straight' },
    { under: Infinity, tag: 'Arm dead straight' },
  ],
  bodyExtension: [
    { under: 0.02, tag: 'Feet stay on the court' },
    { under: 0.16, tag: 'Up off the court' },
    { under: Infinity, tag: 'Big jump' },
  ],
  contactAhead: [
    { under: 0, tag: 'Struck behind the head' },
    // A kick serve is asked to contact over the head — its band centres here —
    // so this rung has to be wide enough that a good kick and a good flat serve
    // never come back reading as the same position.
    { under: 8, tag: 'Struck over the head' },
    { under: 20, tag: 'Struck in front of the body' },
    { under: Infinity, tag: 'Struck far in front' },
  ],

  /* ----------------------------------------------------------------- rhythm */
  totalTime: [
    { under: 900, tag: 'Rushed motion' },
    { under: 1800, tag: 'Even tempo' },
    { under: 2400, tag: 'Long motion' },
    { under: Infinity, tag: 'Stalled motion' },
  ],
  loadRatio: [
    { under: 22, tag: 'Crammed finish' },
    { under: 42, tag: 'Slow build, fast finish' },
    { under: Infinity, tag: 'Back half drifts' },
  ],
  syncAtRelease: [
    { under: -0.05, tag: 'Racket still by the leg' },
    { under: 0.28, tag: 'Arms rise together' },
    { under: Infinity, tag: 'Racket up early' },
  ],
}

/** What the body actually did, for a measured value. */
export function readoutOf(id: string, value: number): string {
  const ladder = LADDERS[id]
  if (!ladder) return ''
  const v = Number.isFinite(value) ? value : 0
  return (ladder.find((s) => v < s.under) ?? ladder[ladder.length - 1]).tag
}

/**
 * What the body should do, for a target band.
 *
 * Read through the same ladder at the middle of the band rather than written out
 * a second time by hand. A serve type that moves a band — a kick contacts more
 * over the head — therefore moves its target phrase with it automatically, and
 * the two can never drift apart into a report that asks for one thing in words
 * and scores another in numbers.
 */
export function targetOf(id: string, ideal: [number, number]): string {
  return readoutOf(id, (ideal[0] + ideal[1]) / 2)
}

/** Measurements this module can speak for. Used by the copy tests. */
export const TRANSLATED = Object.keys(LADDERS)
