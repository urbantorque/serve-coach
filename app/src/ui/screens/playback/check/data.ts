/**
 * Data for "Check this serve": live reads of the stored checks, the remembered annotator, the random
 * subject key for exports, and the export itself (a JSON file saved on the phone; nothing is sent).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { gatherChecks, listChecks, listChecksForServe } from '../../../../validation/annotation/store.ts'
import { buildValidationExport, validationFileName } from '../../../../validation/annotation/export.ts'
import { cleanInitials, cleanSubjectCode } from '../../../../validation/annotation/marks.ts'
import type { AnnotatorRole } from '../../../../validation/annotation/types.ts'
import { appPointsFor } from './appPoints.ts'

export const useChecksForServe = (serveId: string) => useLiveQuery(() => listChecksForServe(serveId), [serveId])
export const useAllChecks = (enabled: boolean) => useLiveQuery(async () => (enabled ? listChecks() : null), [enabled])
/** Every check on this session's serves (the report's "Radar speed (you logged)" row). */
export const useChecksForSession = (sessionId: string) => useLiveQuery(async () => (await listChecks()).filter((c) => c.sessionId === sessionId), [sessionId])

const ANNOTATOR_KEY = 'serve-coach:check-annotator'
const SUBJECT_KEY = 'serve-coach:validation-subject'

export interface Annotator {
  initials: string
  role: AnnotatorRole
}

function readAnnotator(): Annotator {
  try {
    const raw = globalThis.localStorage?.getItem(ANNOTATOR_KEY)
    if (raw) {
      const a = JSON.parse(raw) as Partial<Annotator>
      const role = a.role === 'coach' || a.role === 'team' ? a.role : 'player'
      return { initials: cleanInitials(a.initials ?? ''), role }
    }
  } catch {
    // Storage can be unavailable; the defaults apply.
  }
  return { initials: '', role: 'player' }
}

/** Who is marking, remembered on this phone (a convenience; each check stores its own). */
export function useAnnotator(): [Annotator, (a: Annotator) => void] {
  const [value, setValue] = useState<Annotator>(readAnnotator)
  const set = (a: Annotator) => {
    const clean = { initials: cleanInitials(a.initials), role: a.role }
    setValue(clean)
    try {
      globalThis.localStorage?.setItem(ANNOTATOR_KEY, JSON.stringify(clean))
    } catch {
      // Remembering is optional.
    }
  }
  return [value, set]
}

const STUDY_CODE_KEY = (sessionId: string) => `serve-coach:study-code:${sessionId}`

/**
 * The study participant code for a session (docs/VALIDATION_PROTOCOL.md §7.4), remembered on this phone
 * so every serve of the session gets it; each saved check also stores its own. Empty on a player's own
 * phone. `fallback` is a code already saved on a check of this serve.
 */
export function useStudyCode(sessionId: string, fallback?: string): [string, (code: string) => void] {
  const [value, setValue] = useState<string>(() => {
    try {
      const stored = globalThis.localStorage?.getItem(STUDY_CODE_KEY(sessionId))
      if (stored !== null && stored !== undefined) return cleanSubjectCode(stored)
    } catch {
      // Storage can be unavailable; the fallback applies.
    }
    return cleanSubjectCode(fallback ?? '')
  })
  const set = (code: string) => {
    const clean = cleanSubjectCode(code)
    setValue(clean)
    try {
      globalThis.localStorage?.setItem(STUDY_CODE_KEY(sessionId), clean)
    } catch {
      // Remembering is optional.
    }
  }
  return [value, set]
}

/**
 * A random key for this phone's player in exports, so pooled statistics can cluster serves by player
 * without any identity. Kept on the phone; a new one is made if storage is unavailable.
 */
export function subjectKey(): string {
  const fresh = () => {
    const bytes = new Uint8Array(6)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  try {
    const stored = globalThis.localStorage?.getItem(SUBJECT_KEY)
    if (stored && /^[0-9a-f]{12}$/.test(stored)) return stored
    const key = fresh()
    globalThis.localStorage?.setItem(SUBJECT_KEY, key)
    return key
  } catch {
    return fresh()
  }
}

export const ROLE_LABEL: Record<AnnotatorRole, string> = { player: 'The player', coach: 'A coach', team: 'Our team' }

export function annotatorLabel(a: Annotator): string {
  return a.initials ? `${ROLE_LABEL[a.role]}, ${a.initials}` : ROLE_LABEL[a.role]
}

/** Builds the validation file from every check on this phone and saves it. Returns what was written. */
export async function exportChecks(now = new Date()): Promise<{ fileName: string; entries: number; sampleLeftOut: number }> {
  const gathered = await gatherChecks()
  const sources = gathered.map((g) => {
    const ap = appPointsFor(g.serve, g.track)
    return { annotation: g.annotation, serve: g.serve, video: g.video, session: g.session, appPoints: ap.points, appStandingNorm: ap.standingNorm }
  })
  const file = buildValidationExport(sources, { now, subjectKey: subjectKey() })
  const fileName = validationFileName(now)
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.rel = 'noopener'
    document.body.append(a)
    a.click()
    a.remove()
  } finally {
    // Give the download a moment to start before the URL goes.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return { fileName, entries: file.counts.entries, sampleLeftOut: file.counts.sampleLeftOut }
}
