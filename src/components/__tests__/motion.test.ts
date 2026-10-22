/**
 * Motion with a purpose (N4.6): the score ring fills once, on a live report
 * only, and moves from the glance to the report where the browser can.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { withTransition } from '../viewTransition'
import Report from '../../screens/Report'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}

heading('Motion with a purpose')

check('a screen change runs inside a view transition where there is one, and directly where there is not', () => {
  let ran = 0
  let wrapped = 0
  withTransition(() => ran++, { startViewTransition: ((fn: () => void) => { wrapped++; fn(); return {} as ViewTransition }) as Document['startViewTransition'] })
  assert(ran === 1 && wrapped === 1, `ran ${ran}, wrapped ${wrapped}`)
  withTransition(() => ran++, {} as Pick<Document, 'startViewTransition'>)
  assert(ran === 2, 'without the API the change did not happen')
})

check('the ring fills on the report just made, and opens filled on a reopened one', () => {
  const live = renderToStaticMarkup(createElement(Report, { analysis: sampleAnalysis(), onBack: noop, onAnalyzeAnother: noop }))
  const { frames: _f, ...saved } = sampleAnalysis()
  void _f
  const reopened = renderToStaticMarkup(createElement(Report, { analysis: saved as never, onBack: noop, onAnalyzeAnother: noop }))
  const hero = (html: string) => html.slice(html.indexOf('class="hero"'), html.indexOf('class="hero"') + 1500)
  assert(hero(live).includes('ring-fill--animate'), 'the live report does not fill its ring')
  assert(!hero(reopened).includes('ring-fill--animate'), 'a reopened report replays the fill')
})

report()
