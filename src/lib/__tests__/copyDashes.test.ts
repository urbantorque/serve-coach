/**
 * What a player reads never carries a long dash.
 *
 * It reads as a machine's sentence, and the app's voice is plain, short and
 * spoken. Comments are free to use one: this strips them first, then reads what
 * is left of every file that holds player copy. The lists that are not player
 * copy (the bench's ledger, fixture validation) stay out.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readFileSync(p: string, e: string): string
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[]
}
const path = pathUntyped as { join(...p: string[]): string }

const NOT_COPY = ['groundTruth.ts', 'tiers.ts', 'invariants.ts', 'voice.ts', 'CorpusIngest.tsx']

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return ['__tests__', 'dev'].includes(e.name) ? [] : files(path.join(dir, e.name))
    return /\.tsx?$/.test(e.name) && !NOT_COPY.includes(e.name) ? [path.join(dir, e.name)] : []
  })
}

const uncommented = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')

heading('Plain punctuation')

check('no string or JSX text in the app holds a long dash', () => {
  const all = files('src')
  note(`${all.length} files read`)
  assert(all.length > 150, 'the walk found too little to mean anything')
  const found = all.filter((f) => uncommented(fs.readFileSync(f, 'utf8')).includes('—'))
  assert(found.length === 0, `a long dash in copy: ${found.join(', ')}`)
})

report()
