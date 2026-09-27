// COACHING §10 pain and red-flag screen: routing, copy rules, and that nothing diagnoses.
import { describe, expect, it } from 'vitest'
import { lintCopy } from '../ui/copy/lint.ts'
import { LIBRARY } from './library.ts'
import {
  BODY_CHECK,
  bodyCheckFromRedFlags,
  COMFORT_LINE,
  DRILL_PAIN_RULE,
  RED_FLAGS,
  REFERRAL_COPY,
  referralLevel,
  sorenessLine,
} from './safety.ts'

/** Words that would name a condition or promise an outcome (research 07; TGA 14B; Apple 1.4.1). */
const DIAGNOSIS_WORDS = /\b(tendin\w*|strain|sprain|tear|impingement|fracture|arthritis|bursitis|injur(y|ies|ed)|diagnos\w*|treat(ment)?|rehab\w*|prevent\w*|cure)\b/i

describe('referral routing (§10.2)', () => {
  it('the first three red flags are emergency; the rest see a doctor today; none is stop and book', () => {
    expect(RED_FLAGS.slice(0, 3).every((q) => q.level === 'emergency')).toBe(true)
    expect(RED_FLAGS.slice(3).every((q) => q.level === 'today')).toBe(true)
    expect(referralLevel(['chest'])).toBe('emergency')
    expect(referralLevel(['arm', 'legs'])).toBe('emergency')
    expect(referralLevel(['hot'])).toBe('today')
    expect(referralLevel([])).toBe('stop-and-book')
    expect(bodyCheckFromRedFlags([])).toEqual({ answer: 'pain' })
    expect(bodyCheckFromRedFlags(['side'])).toEqual({ answer: 'red-flag', level: 'today' })
  })

  it('emergency offers 000; see a doctor today names a GP or emergency department', () => {
    expect(REFERRAL_COPY.emergency.call000).toBe(true)
    expect(REFERRAL_COPY.emergency.title).toMatch(/000/)
    expect(REFERRAL_COPY.today.body.join(' ')).toMatch(/GP or an emergency department/)
    expect(REFERRAL_COPY['stop-and-book'].body.join(' ')).toMatch(/GP, physiotherapist or sports doctor/)
    expect(REFERRAL_COPY['stop-and-book'].actions).toContain('remind-3-days')
  })
})

describe('copy rules', () => {
  const all = [
    ...Object.values(REFERRAL_COPY).flatMap((c) => [c.title, ...c.body, c.helpline?.label ?? '']),
    ...RED_FLAGS.map((q) => q.text),
    BODY_CHECK.question,
    BODY_CHECK.sharpQuestion,
    DRILL_PAIN_RULE,
    COMFORT_LINE,
    sorenessLine(['shoulder']),
    sorenessLine(['knee', 'back']),
  ]

  it('never names a condition, estimates severity or promises prevention', () => {
    for (const t of all) expect(t, t).not.toMatch(DIAGNOSIS_WORDS)
  })

  it('passes the app copy lint (no dashes, exclamation marks or never-say words)', () => {
    for (const t of all) expect(lintCopy(t), t).toEqual([])
  })

  it('library content never makes an injury or prevention claim', () => {
    for (const it of LIBRARY) {
      const text = [it.whyItMatters, ...Object.values(it.cues), it.drill.setup, ...it.drill.steps, it.drill.successCriterion].join(' ')
      expect(text, it.id).not.toMatch(/\b(prevent\w*|injur(y|ies)|protect your)\b/i)
    }
  })
})
