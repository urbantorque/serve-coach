/**
 * The measurement records as a reader meets them (N2.13): written out in
 * `docs/next/measurement-records.md`, one heading per signal, since they left
 * the code a player downloads. The engine keeps only the keys
 * (`UNDER_RESOLVED`, `UNCALIBRATED` in `tiers.ts`); a check that holds a
 * record's words to a measurement reads them here.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import recordsFs from 'fs'

const RECORDS: string = (recordsFs as { readFileSync: (p: string, e: string) => string }).readFileSync('docs/next/measurement-records.md', 'utf8')

/** The record written under a signal's heading, or undefined where there is none. */
export function recordOf(id: string): string | undefined {
  const at = RECORDS.search(new RegExp(`^### ${id}[ \\t\\r]*$`, 'm'))
  if (at < 0) return undefined
  const body = RECORDS.slice(at).split(/\r?\n/).slice(1)
  const text: string[] = []
  for (const line of body) {
    if (/^#{2,3} /.test(line)) break
    if (line.trim()) text.push(line.trim())
  }
  return text.join(' ') || undefined
}
