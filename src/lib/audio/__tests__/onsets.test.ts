/**
 * Finding the racket's impacts in sound (L2.9).
 *
 * The court as samples: a hiss and a low rumble under everything, then the
 * sounds a practice is made of. Impacts are a broadband crack gone in a few
 * milliseconds; the ball bouncing is a duller thud; footsteps are low; a voice
 * is held and pitched. Only the impacts may come back, each at its own moment.
 */
import { REFRACTORY, findOnsets } from '../onsets'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const RATE = 48000

/** mulberry32, so the noise is the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const db = (d: number) => 10 ** (d / 20)

interface Court {
  impacts?: number[]
  bounces?: number[]
  steps?: number[]
  voices?: number[]
  hiss?: number
}

function court(seconds: number, c: Court, seed = 1): Float32Array {
  const r = rng(seed)
  const n = Math.round(seconds * RATE)
  const out = new Float32Array(n)
  const hiss = db(c.hiss ?? -45)
  for (let i = 0; i < n; i++) out[i] = hiss * (r() * 2 - 1) + db(-30) * Math.sin((2 * Math.PI * 50 * i) / RATE)
  const add = (at: number, length: number, f: (t: number) => number) => {
    const start = Math.round(at * RATE)
    for (let i = 0; i < Math.round(length * RATE) && start + i < n; i++) out[start + i] += f(i / RATE)
  }
  // A crack: white noise, gone in a few milliseconds.
  for (const t of c.impacts ?? []) add(t, 0.03, (s) => db(-8) * (r() * 2 - 1) * Math.exp(-s / 0.003))
  // A thud: low-passed noise, slower to die.
  for (const t of c.bounces ?? []) {
    let low = 0
    add(t, 0.08, (s) => {
      low += 0.06 * ((r() * 2 - 1) - low)
      return db(-12) * low * Math.exp(-s / 0.02)
    })
  }
  // A footstep: a low knock.
  for (const t of c.steps ?? []) add(t, 0.12, (s) => db(-14) * Math.sin(2 * Math.PI * 70 * s) * Math.exp(-s / 0.04))
  // A voice: a held, pitched sound with its harmonics.
  for (const t of c.voices ?? [])
    add(t, 0.4, (s) => db(-16) * Math.min(1, s / 0.01) * [1, 0.5, 0.25].reduce((a, k, h) => a + k * Math.sin(2 * Math.PI * 220 * (h + 1) * s), 0))
  return out
}

heading('A practice basket')

check('every impact is found, at its own moment, and nothing else is', () => {
  const impacts = [1.2, 4.05, 7.5, 10.31, 13.8, 17.02]
  const samples = court(20, {
    impacts,
    bounces: [0.4, 3.1, 6.6, 9.4, 12.9, 16.1, 1.9, 5.2],
    steps: [2.2, 2.6, 8.4, 8.9, 15.0],
    voices: [11.5, 18.4],
  })
  const found = findOnsets(samples, RATE)
  const hit = impacts.map((t) => found.find((o) => Math.abs(o.t - t) < 0.004))
  const extra = found.filter((o) => !impacts.some((t) => Math.abs(o.t - t) < 0.004))
  note(`found ${found.length}: ${found.map((o) => `${o.t.toFixed(3)} (${o.strength.toFixed(0)} dB)`).join(', ')}`)
  assert(hit.every(Boolean), `missed impacts at ${impacts.filter((_, i) => !hit[i]).join(', ')} s`)
  assert(extra.length === 0, `heard impacts that weren’t there: ${extra.map((o) => o.t.toFixed(3)).join(', ')} s`)
})

check('two cracks closer than the refractory time are one impact', () => {
  const found = findOnsets(court(4, { impacts: [1, 1 + REFRACTORY / 3] }), RATE)
  assert(found.length === 1, `heard ${found.length}`)
})

check('a quiet court and a loud one find the same impacts', () => {
  // The threshold is against the level around it, not an absolute one: a
  // windy court lifts everything, the crack included.
  const impacts = [1, 2.5, 4]
  for (const hiss of [-60, -45, -32]) {
    const found = findOnsets(court(5, { impacts, hiss }), RATE)
    const hit = impacts.filter((t) => found.some((o) => Math.abs(o.t - t) < 0.004))
    assert(hit.length === impacts.length && found.length === impacts.length, `hiss ${hiss} dB: ${found.length} found, ${hit.length} right`)
  }
})

check('the time of a later chunk is carried', () => {
  const found = findOnsets(court(3, { impacts: [1.5] }), RATE, 600)
  assert(found.length === 1 && Math.abs(found[0].t - 601.5) < 0.004, `placed at ${found[0]?.t}`)
})

report()
