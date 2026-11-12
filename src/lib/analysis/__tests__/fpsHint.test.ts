/**
 * The 60 fps hint (L5.12): until the swing is sampled at the source rate
 * (D1.2), a real-time 60 fps clip is read on every second frame, 30 samples a
 * second, so no copy a player reads may send them to film at 60. Slow motion is
 * what helps.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { refusalFor } from '../verdict'
import { cueIssues } from '../voice'
import type { Triage } from '../triage'
import { assert, check, heading, note, report } from './harness'

const fs = fsUntyped as {
  readFileSync: (p: string, e: 'utf8') => string
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
}
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

/** Advice to film at a frame rate, rather than mention of one. */
const SIXTY = /\b(60|sixty)\s*(fps|frames)|frames per second|frame rate to/i

heading('The 60 fps hint')

check('the too-few-frames refusal recommends slow motion, and no frame rate', () => {
  // The line this replaced, which the pattern has to catch for the check to mean anything.
  assert(SIXTY.test('Film in slow motion, or set the camera to 60 frames per second.'), 'the pattern misses the old hint')
  const refusal = refusalFor({ status: 'rejected', reason: 'too_few_frames' } as Triage)
  assert(refusal !== undefined, 'no refusal for a clip with too few frames')
  note(refusal!.hints.join(' / '))
  assert(refusal!.hints.some((h) => /slow motion/i.test(h)), 'the refusal no longer says to film in slow motion')
  for (const h of refusal!.hints) {
    assert(!SIXTY.test(h), `a hint sends the player to a frame rate: "${h}"`)
    assert(cueIssues(h).filter((i) => !/sentences|words/.test(i)).length === 0, `"${h}" breaks the copy rules: ${cueIssues(h).join(', ')}`)
  }
})

check('nothing a player reads tells them to film at 60 fps', () => {
  // Every string literal in the screens, the components and the engine's own
  // player copy, comments stripped. The fixture plan's 60 fps clip is the
  // developer's shoot list for D1.2 itself, behind the fixture export, and is
  // not in these folders.
  const root = process.cwd()
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'dev') walk(full, out)
      } else if (/\.tsx?$/.test(e.name)) out.push(full)
    }
    return out
  }
  const files = [
    ...walk(path.join(root, 'src', 'screens')),
    ...walk(path.join(root, 'src', 'components')),
    ...walk(path.join(root, 'src', 'lib', 'analysis')),
  ]
  const found: string[] = []
  for (const f of files) {
    const body = fs
      .readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    for (const m of body.matchAll(/(['"`])((?:\.|(?!\1)[^\\n])*)\1/g)) {
      if (SIXTY.test(m[2])) found.push(`${f.slice(root.length + 1)}: ${m[2].slice(0, 80)}`)
    }
  }
  note(`${files.length} files read`)
  assert(found.length === 0, found.join('; '))
})

report()
