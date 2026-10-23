/**
 * The engine stays out of the entry chunk (Q12).
 *
 * Home, the week plan and progress used to reach the clip-reading engine
 * through three small imports: the fault order from `triage`, the soft-reading
 * line from `confidence`, and two shoulder constants from `diagnose`. Each one
 * brought its whole module, and with them the keyframes, the Kalman bridge and
 * the camera read: 43 kB of the entry, which the first screen never runs.
 *
 * `bundle.test.ts` measures the size; this says why it moved, by walking the
 * static imports from `main.tsx` the way the bundler does (type-only imports
 * and `import()` are not edges) and failing if an engine module is reachable.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string; existsSync: (p: string) => boolean }
const path = pathUntyped as { join: (...p: string[]) => string; dirname: (p: string) => string; normalize: (p: string) => string }

/** Modules that read a clip, and only an analysis needs. */
const ENGINE = ['diagnose', 'phases', 'kinematics', 'kalman', 'spatial', 'confidence', 'metrics', 'analyze']

function resolve(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined
  const base = path.normalize(path.join(path.dirname(from), spec))
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (fs.existsSync(base + ext)) return base + ext
  }
  return undefined
}

/** Static, value-carrying imports and re-exports: what the bundler follows into the same chunk. */
function edges(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8')
  const out: string[] = []
  const re = /^(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm
  for (const m of src.matchAll(re)) {
    if (m[1]) continue
    const to = resolve(file, m[2])
    if (to) out.push(to)
  }
  return out
}

heading('The engine stays out of the entry chunk (Q12)')

check('nothing the first screen imports reaches a module that reads a clip', () => {
  const start = path.normalize('src/main.tsx')
  const seen = new Map<string, string>([[start, '']])
  const queue = [start]
  while (queue.length) {
    const file = queue.shift()!
    for (const to of edges(file)) {
      if (seen.has(to)) continue
      seen.set(to, file)
      queue.push(to)
    }
  }
  note(`${seen.size} modules reachable from main.tsx`)
  assert(seen.size > 40, 'the walk found too little to mean anything')
  const name = (f: string) => f.replace(/\\/g, '/').split('/').pop()!.replace(/\.tsx?$/, '')
  for (const [file] of seen) {
    if (!ENGINE.includes(name(file)) || !file.replace(/\\/g, '/').includes('lib/analysis/')) continue
    const chain = [file]
    for (let at = seen.get(file); at; at = seen.get(at)) chain.push(at)
    assert(false, `the entry reaches ${name(file)}: ${chain.reverse().map(name).join(' → ')}`)
  }
})

report()
