/**
 * What the player is told about their serve speed (N2.5, N2.7): every miss a
 * sentence they can act on, and every reading in whole units that never claim
 * more than the reader did.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, and this project carries no @types/node
import pathUntyped from 'path'
import { SPEED_MISS_LINE, SPEED_SCALE, defaultSpeedUnit, fastestLine, serveNumberSpeedLine, speedFigures, speedGlanceLine, speedTrendLine } from '../speedCopy'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readFileSync: (p: string, e: string) => string
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]
}
const path = pathUntyped as { join: (...p: string[]) => string }

const REASONS = ['view', 'frame_rate', 'no_toss', 'timing', 'not_found', 'unsure'] as const

heading('Why there is no speed, said plainly')

check('every miss has a line, and every line is a miss', () => {
  for (const r of REASONS) assert(Boolean(SPEED_MISS_LINE[r]), `"${r}" has no line`)
  assert(Object.keys(SPEED_MISS_LINE).length === REASONS.length, 'a line exists for a reason the reader never gives')
})

check('each line passes the copy lint and carries no number', () => {
  for (const [r, line] of Object.entries(SPEED_MISS_LINE)) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `${r}: "${line}": ${issues.join('; ')}`)
    assert(!/\d/.test(line), `${r} says a number: "${line}"`)
  }
})

heading('A reading, in the player’s unit (N2.7)')

check('the locale picks the unit: mph in the US and the UK, km/h elsewhere', () => {
  assert(defaultSpeedUnit('en-US') === 'mph' && defaultSpeedUnit('en-GB') === 'mph', 'the US or the UK is not in mph')
  assert(defaultSpeedUnit('fr-FR') === 'kmh' && defaultSpeedUnit('en-AU') === 'kmh', 'France or Australia is not in km/h')
  assert(defaultSpeedUnit('en') === 'kmh', 'a locale with no region is not in km/h')
})

check('whole units, the range widened outwards so rounding never narrows the claim', () => {
  const s = { ms: 36.1, low: 34.04, high: 38.36 }
  const k = speedFigures(s, 'kmh')
  assert(k.best === 130 && k.low === 122 && k.high === 139, `km/h ${k.best} ${k.low}–${k.high}`)
  const m = speedFigures(s, 'mph')
  assert(m.best === 81 && m.low === 76 && m.high === 86, `mph ${m.best} ${m.low}–${m.high}`)
  for (const f of [k, m]) {
    assert(f.at.low <= f.at.best && f.at.best <= f.at.high, 'the best figure is drawn outside its band')
    assert(f.at.low >= 0 && f.at.high <= 1, 'the band leaves the scale')
  }
})

check('a reading off either end of the scale is drawn at the end, not past it', () => {
  const [, top] = SPEED_SCALE.kmh
  const f = speedFigures({ ms: (top + 30) / 3.6, low: (top + 20) / 3.6, high: (top + 40) / 3.6 }, 'kmh')
  assert(f.at.low === 1 && f.at.best === 1 && f.at.high === 1, JSON.stringify(f.at))
})

check('the glance says the reading and its range in one line', () => {
  const line = speedGlanceLine(speedFigures({ ms: 36.1, low: 34.04, high: 38.36 }, 'kmh'))
  assert(line === 'About 130 km/h off the racket, likely 122–139.', line)
})

heading('A reading beside the coaching, never part of it')

check('nothing that scores, grades or plans reads the speed', () => {
  // The speed is written by `analyze.ts` and stored; only the screens and the
  // storage check read it back. A score, band, plan or drill that read it
  // would make speed a grade, which the speed rules forbid.
  const allowed = new Set(['analyze.ts', 'types.ts', 'speedPass.ts', 'db.ts'])
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(full)
      } else if (/\.ts$/.test(e.name) && !allowed.has(e.name) && /\.speed\b(?!Unit)/.test(fs.readFileSync(full, 'utf8'))) offenders.push(full)
    }
  }
  for (const dir of ['src/lib/analysis', 'src/lib/storage', 'src/lib/progress', 'src/lib/session']) {
    try {
      walk(dir)
    } catch {
      // A folder that does not exist reads nothing.
    }
  }
  assert(offenders.length === 0, `read the speed: ${offenders.join(', ')}`)
})

heading('Speed over time, in words (N2.8)')

check('the record, the trend and the two serves each say their ranges, in the player’s unit', () => {
  const a = { ms: 36.1, low: 34.04, high: 38.36 }
  const b = { ms: 40, low: 38.5, high: 41.6 }
  assert(fastestLine({ ...a, isNew: true }, 'kmh') === 'New fastest serve: about 130 km/h, likely 122–139.', fastestLine({ ...a, isNew: true }, 'kmh'))
  assert(fastestLine({ ...a, isNew: false }, 'mph').startsWith('Fastest serve: about 81 mph'), 'the standing record reads as new')
  const t = speedTrendLine({ direction: 'faster', now: b, then: a }, 'kmh')
  assert(t === 'Serving faster than your last trip: about 144 km/h, likely 138–150, against about 130 km/h, likely 122–139.', t)
  const slow = serveNumberSpeedLine({ first: b, second: a, direction: 'slower' }, 'kmh')
  assert(!/fault|too slow/i.test(slow) && slow.startsWith('First serves about 144'), slow)
  assert(serveNumberSpeedLine({ first: a, second: b, direction: 'faster' }, 'kmh').endsWith('Your second serve is the quicker one.'), 'a quicker second serve is not said')
})

report()
