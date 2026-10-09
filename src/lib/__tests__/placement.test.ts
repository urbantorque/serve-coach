/**
 * One placement, said one way (L1.10).
 *
 * The guide, the tips, the refusals and the framing hints used to give four
 * different distances for one phone: four metres, four or five, 4–5 and ten
 * steps. Every sentence that says how far away to stand now reads it from
 * `PLACEMENT`. This walks the source for a player-facing string that gives a
 * distance of its own, which is how the next one would arrive.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { PLACEMENT } from '../placement'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readFileSync: (p: string, e: 'utf8') => string
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
}
const path = pathUntyped as { join: (...p: string[]) => string; relative: (a: string, b: string) => string }
declare const process: { cwd(): string }
const root = process.cwd()

heading('Where the phone goes')

/**
 * A distance written into a string: "four metres", "4–5 metres", "ten steps
 * to your side". Steps only count as a distance with somewhere to be: "one
 * step above it" is a rung of the level ladder.
 */
const DISTANCE =
  /\b(\d+(?:\s*[–-]\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:or\s+\w+\s+|to\s+\w+\s+)?(?:(?:metres?|meters?)\b|steps?\s+(?:away|back|from|to\s+your\s+side))/i

check('no player-facing string gives a distance of its own', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'dev') walk(full, out)
      } else if (/\.(ts|tsx)$/.test(e.name) && e.name !== 'placement.ts') out.push(full)
    }
    return out
  }
  const offenders: string[] = []
  let files = 0
  for (const file of walk(path.join(root, 'src'))) {
    files++
    // Comments explain distances and are not on screen.
    const code = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    for (const literal of code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? []) {
      if (DISTANCE.test(literal)) offenders.push(`${path.relative(root, file)}: ${literal.slice(0, 90)}`)
    }
  }
  note(`${files} source files read`)
  assert(offenders.length === 0, offenders.join('\n      '))
})

check('the phrase reads as part of a sentence and passes the editor', () => {
  for (const line of [
    `Film side-on from ${PLACEMENT.distance} away, with your whole body in frame.`,
    `Rest the phone on something steady ${PLACEMENT.height}, ${PLACEMENT.distance} to your side.`,
    `Stand the phone side-on, ${PLACEMENT.distance} away, ${PLACEMENT.where}.`,
  ]) {
    assert(cueIssues(line).length === 0, `"${line}": ${cueIssues(line).join('; ')}`)
  }
})

report()
