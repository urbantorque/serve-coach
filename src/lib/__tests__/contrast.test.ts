/**
 * What a player can actually read on a phone propped against a fence.
 *
 * WHY THIS FILE EXISTS. This app is used outdoors, in daylight, on a screen the
 * player is looking at from further away than they look at anything else — the
 * glance screen exists precisely because they are holding a basket of balls and
 * reading it from the baseline. Every other lint in this repo checks what the
 * app *says*; nothing checks whether it can be seen.
 *
 * **A FAILING TOKEN IS A FINDING, NOT A CHANGE.** Constraint 3 is explicit that
 * the design is not this loop's to alter, and a contrast repair is a colour
 * change by any other name. So this measures, records the number, and fails only
 * on the floor the palette already clears — a ratchet, not a redesign. Anything
 * measured and short is written into `SHORTFALLS` with its number, which is the
 * finding this audit was asked to produce.
 *
 * Ratios are WCAG 2.1 relative luminance, which is the only definition anything
 * else in the industry agrees on. Its thresholds:
 *
 *   · 4.5 — normal body text, AA
 *   · 3.0 — large text (18.66px bold or 24px), and non-text UI, AA
 *   · 7.0 — normal body text, AAA
 *
 * Parsed from `tokens.css` rather than restated here, so a token that moves
 * moves this measurement with it. A copied hex is a recorded number wearing a
 * derivation's clothes — the defect `repeatability.ts` names, and the one round
 * 40 found in `NEXT.md`.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

/** Every `--name: value` in the sheet, first definition wins — the `:root` one. */
const TOKENS = new Map<string, string>()
for (const m of css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
  if (!TOKENS.has(m[1])) TOKENS.set(m[1], m[2].trim())
}

type RGB = { r: number; g: number; b: number; a: number }

function parse(value: string): RGB | undefined {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(value)
  if (rgba) {
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] }
  }
  return undefined
}

/**
 * A translucent colour resolved against what is behind it.
 *
 * The status tints are all `rgba(..., 0.14)`, so their real appearance depends
 * entirely on the surface underneath — and on a dark palette that is most of
 * their appearance. Measuring the token alone would be measuring a colour
 * nobody ever sees.
 */
const over = (top: RGB, under: RGB): RGB => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
})

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const luminance = (c: RGB) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)

function ratio(fg: RGB, bg: RGB): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const colourOf = (name: string, behind?: RGB): RGB => {
  const raw = TOKENS.get(name)
  assert(raw !== undefined, `no token called ${name} — this audit is measuring a colour that moved`)
  const c = parse(raw!)
  assert(c !== undefined, `${name} is "${raw}", which this audit can’t read`)
  return c!.a < 1 && behind ? over(c!, behind) : c!
}

/**
 * One measured pair, and what a player is doing when they read it.
 *
 * `large` is not a convenience: WCAG's 3.0 floor applies to text at 24px or
 * 18.66px bold, and this app's headline and score ring are both well past that.
 * Holding every pair to 4.5 would report failures that are not failures.
 */
interface Pair {
  what: string
  fg: string
  bg: string
  large?: boolean
}

const ink = () => colourOf('--ink')
const ink2 = () => colourOf('--ink-2')

const PAIRS: readonly Pair[] = [
  { what: 'body text on the page', fg: '--fg', bg: '--ink' },
  { what: 'body text on a card', fg: '--fg', bg: '--ink-2' },
  { what: 'secondary text on the page', fg: '--fg-muted', bg: '--ink' },
  { what: 'secondary text on a card', fg: '--fg-muted', bg: '--ink-2' },
  { what: 'the faintest text on a card', fg: '--fg-faint', bg: '--ink-2' },
  // The four score bands, on the two surfaces they are drawn on. These carry
  // the verdict — a player reading the ring from the baseline is reading
  // colour before they read the number.
  { what: 'a strong score', fg: '--great', bg: '--ink', large: true },
  { what: 'a solid score', fg: '--good', bg: '--ink', large: true },
  { what: 'a nearly-there score', fg: '--fair', bg: '--ink', large: true },
  { what: 'a needs-work score', fg: '--work', bg: '--ink', large: true },
  { what: 'a needs-work score on a card', fg: '--work', bg: '--ink-2', large: true },
  { what: 'a nearly-there score on a card', fg: '--fair', bg: '--ink-2', large: true },
]

/**
 * Measured, short of its floor, and left alone.
 *
 * Empty is the good state and the checks below say so both ways — a shortfall
 * that gets fixed has to come out of this list, or the list becomes a record of
 * problems that no longer exist sitting next to ones that do.
 */
const SHORTFALLS: readonly { what: string; measured: number; floor: number }[] = []

heading('What a player can read on a phone in daylight')

const measured = PAIRS.map((p) => {
  const bg = colourOf(p.bg)
  return { ...p, ratio: ratio(colourOf(p.fg, bg), bg), floor: p.large ? 3 : 4.5 }
})

for (const m of measured) {
  note(`${m.ratio.toFixed(2)}:1  ${m.what}${m.large ? ' (large)' : ''} — needs ${m.floor}`)
}

check('every pair clears its WCAG AA floor', () => {
  const known = new Set(SHORTFALLS.map((s) => s.what))
  const failing = measured.filter((m) => m.ratio < m.floor && !known.has(m.what))
  assert(
    failing.length === 0,
    `below AA: ${failing
      .map((f) => `${f.what} at ${f.ratio.toFixed(2)}:1, needs ${f.floor}`)
      .join('; ')}. A colour change isn’t this loop's to make — record it in SHORTFALLS with its number.`,
  )
})

check('no recorded shortfall has quietly been fixed', () => {
  // The half `jsxCopy.test.ts` had to grow twice over. A list nobody prunes
  // becomes a list of problems that no longer exist, and the next real one is
  // added beside them without anybody noticing the difference.
  const short = new Set(measured.filter((m) => m.ratio < m.floor).map((m) => m.what))
  const stale = SHORTFALLS.filter((s) => !short.has(s.what))
  assert(stale.length === 0, `these clear their floor now: ${stale.map((s) => s.what).join(', ')}`)
})

check('the body text clears AAA, because that is the one read at a distance', () => {
  /*
   * A floor above AA for the one pair that carries everything. `--fg` on
   * `--ink` is the report, the plan, the cue and the refusal — and the whole
   * argument for this app's dark palette is that it is read outdoors, where the
   * effective contrast is worse than anything a spec measures.
   *
   * A ratchet on what the palette already does, not a demand on it.
   */
  const body = measured.find((m) => m.what === 'body text on the page')!
  assert(body.ratio >= 7, `body text is ${body.ratio.toFixed(2)}:1, under the 7.0 AAA floor`)
})

check('a translucent tint is measured against what is behind it', () => {
  /*
   * The check that keeps the numbers above honest. Every status tint is
   * `rgba(..., 0.14)`, and measuring one without compositing it would report the
   * contrast of a colour nobody ever sees — a wrong number that looks like a
   * right one, which is worse than no gate.
   */
  const raw = parse(TOKENS.get('--work-dim')!)
  assert(raw?.a === 0.14, `--work-dim is no longer a 14% tint: ${TOKENS.get('--work-dim')}`)
  const composited = over(raw!, ink())
  assert(
    composited.r > raw!.r * raw!.a && composited.a === 1,
    'compositing didn’t put the surface behind the tint',
  )
  // And it must land between the tint's own colour and the surface, which is
  // what "14% of that colour over this one" means.
  assert(
    composited.r < 255 && composited.r > ink().r,
    `a 14% tint of #ff7a6b over the page read as ${composited.r.toFixed(0)} red`,
  )
})

check('the narrowest margin in the palette is named, not just passed', () => {
  /*
   * THE AUDIT'S ACTUAL FINDING, and it is not a failure: every pair clears its
   * floor, and the closest is `--fg-faint` on a card at 4.87:1 against 4.5 —
   * about 8% of headroom, on the palette's faintest text, on the surface most
   * of the report is drawn on.
   *
   * Nothing to change. It passes, and constraint 3 makes the colour somebody
   * else's to move. What is worth having is this sentence being *checked*: a
   * token nudged two points darker eats that margin silently, and a gate that
   * only reports pass/fail would go from green to green until the day it did
   * not.
   *
   * The pair is not hard-coded — it is whichever comes out narrowest, so if the
   * ordering changes the finding changes with it.
   */
  const narrowest = measured.reduce((a, b) => (b.ratio / b.floor < a.ratio / a.floor ? b : a))
  const headroom = narrowest.ratio / narrowest.floor - 1
  note(
    `narrowest: ${narrowest.what} at ${narrowest.ratio.toFixed(2)}:1 against ${narrowest.floor} — ` +
      `${(headroom * 100).toFixed(0)}% of headroom`,
  )
  assert(headroom > 0, `${narrowest.what} doesn’t clear its floor at all`)
  assert(
    headroom < 0.25,
    `the tightest pair now has ${(headroom * 100).toFixed(0)}% of headroom, so the palette moved ` +
      'and this audit is describing a sheet that no longer exists',
  )
})

check('the sheet still has colours in it to measure', () => {
  // A parse that stopped matching would report zero pairs and pass everything,
  // the failure mode of every text-matched gate in this repo.
  assert(TOKENS.size > 30, `only ${TOKENS.size} tokens parsed from tokens.css`)
  assert(measured.length === PAIRS.length, 'a pair went missing between declaration and measurement')
  assert(ink2().r > ink().r, 'the card surface is no longer lighter than the page')
  note(`${TOKENS.size} tokens parsed, ${measured.length} pairs measured`)
})

report()
