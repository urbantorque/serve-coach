/**
 * Body-check and comfort wording out of a stored coaching decision (D8; ARCHITECTURE §8.4). Pure, so
 * the export and the coach summary share one rule. Records written from 28 September 2026 keep this
 * wording out when stored (coaching/record.ts, decide.ts); older records can still carry it, which is
 * why every reader that sends a decision off the phone runs it through here.
 */
import type { CoachingRecord } from './records.ts'

/** Wording that carries a body-check or comfort answer (older records named the sore areas). */
export const HEALTH_WORDS = /\bsore(ness)?\b|\bpain\b|\bhurt|\breferral\b|body check|\bcomfort\b/i

/** The neutral line a trace entry with body-check or comfort wording becomes. */
export const SAFETY_TRACE = 'Safety check applied.'

/** A "why" text without its sentences about soreness, pain or comfort settings. */
export function scrubWhy(text: string): string {
  return text
    .split(/(?<=[.?!])\s+/)
    .filter((s) => !HEALTH_WORDS.test(s))
    .join(' ')
}

/**
 * A stored coaching decision without body-check or comfort detail, for anything that leaves the phone
 * without "Include comfort notes": trace lines at any step that mention soreness, pain or a comfort
 * setting become a plain "Safety check applied." with no fault id (the ruled-out item would name the
 * region), alternatives ruled out by a comfort setting are left out, and sentences about soreness or
 * comfort leave the "why" text. A pain-referral decision (no focus, cue or drill; its existence is the
 * health answer) is left out whole.
 */
export function scrubDecision(d: CoachingRecord): CoachingRecord | null {
  if (d.gate === 'pain-referral' || d.referral) return null
  const out: CoachingRecord = {
    ...d,
    trace: d.trace.map((t) => {
      if (!HEALTH_WORDS.test(t.detail)) return t
      const { faultId: _faultId, ...rest } = t
      return { ...rest, detail: SAFETY_TRACE }
    }),
    alternatives: d.alternatives.filter((a) => !HEALTH_WORDS.test(a.reason)),
  }
  if (d.focus) out.focus = { ...d.focus, whyChosen: scrubWhy(d.focus.whyChosen) }
  return out
}
