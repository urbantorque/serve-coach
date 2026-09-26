import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipRecord } from './generate.ts'
import { GROUPS } from './scenarios.ts'

export const MANIFEST_FORMAT = 'serve-synth-manifest/1'

export interface Manifest {
  format: string
  updatedAt: string
  note: string
  groups: typeof GROUPS
  clips: ClipRecord[]
}

export function manifestPath(outRoot: string): string {
  return join(outRoot, 'manifest.json')
}

/** Load the manifest, keeping only clips whose files are still on disk. */
export function loadManifest(outRoot: string): Manifest {
  const p = manifestPath(outRoot)
  let clips: ClipRecord[] = []
  if (existsSync(p)) {
    try {
      clips = (JSON.parse(readFileSync(p, 'utf8')) as Manifest).clips ?? []
    } catch {
      clips = []
    }
  }
  clips = clips.filter((c) => existsSync(join(outRoot, c.files.mp4)) && existsSync(join(outRoot, c.files.truth)) && (!c.files.webm || existsSync(join(outRoot, c.files.webm))))
  return {
    format: MANIFEST_FORMAT,
    updatedAt: new Date().toISOString(),
    note: 'Synthetic serve clips with exact ground truth (tools/synth). Paths are relative to this file. groups = scenario ids usable with `--scenario`.',
    groups: GROUPS,
    clips,
  }
}

/** Insert or replace clip records and write the manifest atomically (sorted by id). */
export function upsertManifest(outRoot: string, records: ClipRecord[]): Manifest {
  const m = loadManifest(outRoot)
  const byId = new Map(m.clips.map((c) => [c.id, c]))
  for (const r of records) byId.set(r.id, r)
  m.clips = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  m.updatedAt = new Date().toISOString()
  const p = manifestPath(outRoot)
  writeFileSync(`${p}.tmp`, JSON.stringify(m, null, 1))
  renameSync(`${p}.tmp`, p)
  return m
}
