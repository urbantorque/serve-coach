/**
 * Keep videos only where it works (L6.7): the report's lines about the video
 * follow the setting, a reopened report with its clip kept says so instead of
 * "never saved", and a keep that failed is said on the live report.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Report from '../../screens/Report'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import type { Analysis } from '../../lib/analysis/types'
import type { Session } from '../../lib/storage/db'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}
const stored = (a: Analysis): Session => {
  const { frames: _f, ...rest } = a
  void _f
  return rest as Session
}
const NEVER = 'the video itself was never saved'

heading('What the report says about the video')

const reopened = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(Report, { analysis: stored(sampleAnalysis()), onBack: noop, onAnalyzeAnother: noop, ...props }))

check('a reopened report with its clip kept says it is kept, not that it was never saved', () => {
  const out = reopened({ kept: { url: 'blob:kept' }, keepsClips: true })
  assert(out.includes('the video is kept on this phone only'), 'a kept clip wasn’t said to be kept')
  assert(!out.includes(NEVER), '"never saved" printed under a kept video')
})

check('with the setting on and this clip not kept, the lines say so', () => {
  const out = reopened({ keepsClips: true })
  assert(out.includes('this video wasn’t kept'), 'a clip that wasn’t kept wasn’t said to be')
  assert(out.includes('This video wasn’t saved on your phone') && !out.includes(NEVER), 'the replay note still said never saved')
})

check('with the setting off, the old promise stands', () => {
  const out = reopened({})
  assert(out.includes(NEVER) && out.includes('Your video never left your phone'), 'the never-saved lines went missing')
})

check('a live report says when its clip couldn’t be kept', () => {
  const live = (keepFailed: boolean) =>
    renderToStaticMarkup(createElement(Report, { analysis: sampleAnalysis(), keepsClips: true, keepFailed, onBack: noop, onAnalyzeAnother: noop }))
  assert(live(true).includes('I couldn’t keep this video on the phone'), 'a failed keep went unsaid')
  assert(!live(false).includes('couldn’t keep'), 'a kept clip was said to have failed')
})

report()
