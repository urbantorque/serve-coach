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
