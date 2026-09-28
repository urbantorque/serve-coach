/**
 * The Plus sheet's words per trigger (PRODUCT §6.15 item 1: a headline tied to the moment). Honest
 * prototype lines: nothing is sold, and test Plus is free on the Plan screen.
 */
import { PLUS_FEATURES, type PaywallTrigger, type PlusFeature } from '../../../entitlement/index.ts'

export function plusSheetCopy(trigger: PaywallTrigger, feature?: PlusFeature): { title: string; body: string; prototype: string } {
  if (trigger === 't3' && feature) {
    const f = PLUS_FEATURES[feature]
    return {
      title: `${f.name} is part of Plus`,
      body: f.line,
      prototype: 'Plus is not on sale yet. To try this now, switch on test Plus on the Plan screen. It is free and no payment is taken.',
    }
  }
  if (trigger === 't2') {
    return {
      title: "Past this month's free analyses",
      body: 'The free plan analyses your first experiment, then 2 practice days a month. Later sessions would wait, saved, until next month. During the beta nothing waits: this one is being analysed now.',
      prototype: 'Plus is not on sale yet. The Plan screen can switch on test Plus for this phone, free. No payment is taken.',
    }
  }
  return {
    title: 'That was your first experiment',
    body: 'Plus keeps this going every week through the season.',
    prototype: 'Plus is not on sale yet. The Plan screen can switch on test Plus for this phone, free. No payment is taken.',
  }
}

/**
 * The beta "Plus preview" (PRODUCT §5.3, decision 2026-09-28): the same moments, non-blocking. The
 * feature is already open; the sheet says what Plus will include, the proposed price, and asks once.
 */
export function plusPreviewCopy(trigger: PaywallTrigger, feature?: PlusFeature): { title: string; body: string } {
  if (trigger === 't3' && feature) {
    const f = PLUS_FEATURES[feature]
    return { title: `${f.name} is part of Plus`, body: f.line }
  }
  if (trigger === 't2') {
    return {
      title: "Past this month's free analyses",
      body: 'After the beta, the free plan will analyse your first experiment, then 2 practice days a month. Plus will analyse every practice day. This one is being analysed now.',
    }
  }
  return { title: 'That was your first experiment', body: 'After the beta, Plus will keep this going every week through the season. Your verdict and next focus stay free.' }
}

export const PREVIEW_COPY = {
  beta: 'Beta: this is unlocked for you. Nothing is sold during the beta.',
  includes: 'What Plus will include',
  price: 'Proposed price after the beta: A$99.99 a year, or A$14.99 a month.',
  question: 'Would you pay A$99.99 a year for this?',
  thanks: 'Thanks. Your answer is saved on this phone, in Beta data.',
  continue: 'Continue',
} as const
