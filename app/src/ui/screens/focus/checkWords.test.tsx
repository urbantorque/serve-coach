// A coaching rule that is experimental (coaching-library.json evidenceTier) is worded as a rule, not
// as experimental data, wherever a check is shown: the focus sheet rows and the focus card's
// "Also checked" lines, including decisions stored before the wording changed (the sample's own).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { CoachingDecision } from '../../../data/domain.ts'
import { FocusCard } from '../today/FocusCard.tsx'
import { alternativeText, checkText } from './checkWords.ts'
import { FOCUS_COPY } from './copy.ts'

const OLD_RHYTHM = "Rhythm is an experimental check, which you haven't switched on."
const OLD_TOSS_FORWARD = "Toss front to back is an experimental check, which you haven't switched on."

describe('rule-experimental checks say the rule is experimental', () => {
  it('focus sheet rows: steady-rhythm reads as a rule; a data-experimental item keeps its text', () => {
    expect(checkText({ itemId: 'steady-rhythm', status: 'experimental-off', text: OLD_RHYTHM })).toBe(FOCUS_COPY.ruleExperimentalOff)
    expect(checkText({ itemId: 'steady-rhythm', status: 'eligible', text: 'Your rhythm varied.' })).toBe('Your rhythm varied.')
    expect(checkText({ itemId: 'toss-spot-steady', status: 'experimental-off', text: OLD_TOSS_FORWARD })).toBe(OLD_TOSS_FORWARD)
  })

  it('stored "Also checked" lines: by fault id, with the subject named, and nothing else rewritten', () => {
    const rhythm = alternativeText({ faultId: 'rhythm-inconsistent', reason: OLD_RHYTHM })
    expect(rhythm).toBe(FOCUS_COPY.ruleExperimentalOffFor('Rhythm'))
    expect(rhythm).not.toMatch(/experimental check/)
    expect(alternativeText({ faultId: 'shoulder-tilt-low', reason: "Shoulder tilt at the top is an experimental check, which you haven't switched on." })).toMatch(
      /^Shoulder tilt at the top: this coaching rule is still experimental/,
    )
    // The toss items are experimental because their DATA is (not their rule): the engine's words stand.
    expect(alternativeText({ faultId: 'toss-forward-inconsistent', reason: OLD_TOSS_FORWARD })).toBe(OLD_TOSS_FORWARD)
    // A rule-experimental item ruled out for another reason keeps that reason.
    expect(alternativeText({ faultId: 'rhythm-inconsistent', reason: 'Rhythm: on a short break after your last focus.' })).toBe('Rhythm: on a short break after your last focus.')
    expect(alternativeText({ faultId: 'unknown-fault', reason: 'Something else.' })).toBe('Something else.')
  })

  it('the focus card\'s "Why this focus?" sheet, on the sample player\'s stored decision', async () => {
    const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'public/demo/seed@1.json'), 'utf8')) as { decisions: CoachingDecision[] }
    const focus = seed.decisions.find((d) => d.gate === 'ok' && d.focus && d.focus.faultId !== 'none')
    expect(focus, 'the sample has a focus decision').toBeDefined()
    // A record stored with the engine's old sentence (the sample built on 27 Sep carries exactly this).
    const others = focus!.alternatives.filter((a) => a.faultId !== 'rhythm-inconsistent')
    const stored: CoachingDecision = { ...focus!, alternatives: [...others, { faultId: 'rhythm-inconsistent', reason: OLD_RHYTHM }] }
    render(
      <MemoryRouter>
        <FocusCard decision={stored} variant="full" orientation="portrait" sample={false} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Why this focus?' }))
    const sheet = await screen.findByRole('dialog', { name: 'Why this focus?' })
    expect(within(sheet).getByText(FOCUS_COPY.ruleExperimentalOffFor('Rhythm'))).toBeInTheDocument()
    expect(within(sheet).queryByText(OLD_RHYTHM)).toBeNull()
  })
})
