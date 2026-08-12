/**
 * What happens when there is no live preview to be had.
 *
 * The whole value of this half is that it is unglamorous and completely
 * testable: a browser refuses a camera by rejecting with a named
 * `DOMException`, and every one of those names has to end with the player still
 * able to film. The component around it cannot be tested here — there is no DOM
 * in the runner and no camera behind it — which is exactly why the mapping and
 * the copy do not live inside it.
 */
import { command, cueIssues, plain } from '../../analysis/voice'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'
import { PREVIEW_BLOCK_CUE, previewBlockFor, previewSupported, type PreviewBlock } from '../access'

/** Every case the union admits, listed so a new one cannot slip through untested. */
const EVERY_BLOCK: PreviewBlock[] = ['unsupported', 'denied', 'missing', 'busy', 'unknown', 'engine']

heading('Saying there is no preview')

check('the list of blocks and the list of things to say about them agree', () => {
  const written = Object.keys(PREVIEW_BLOCK_CUE).sort()
  assert(
    written.join(',') === [...EVERY_BLOCK].sort().join(','),
    `the cues cover ${written.join(', ')}`,
  )
})

check('every refusal passes the editor and names something to do', () => {
  for (const block of EVERY_BLOCK) {
    const text = PREVIEW_BLOCK_CUE[block]
    const issues = cueIssues(text)
    assert(issues.length === 0, `${block}: "${plain(text)}" — ${issues.join('; ')}`)
    assert(command(text) === text, `${block} needed the filter: "${command(text)}"`)
    assert(/\*\*[^*]+\*\*/.test(text), `${block} marks no instruction`)
  }
})

check('no refusal blames the browser at the player', () => {
  // A player standing on a court cannot act on an API name, a permissions model
  // or a secure-context rule. Whatever went wrong, the sentence they get has to
  // be about the phone in their hand.
  const forbidden = /getUserMedia|mediaDevices|permission|https|api|websocket|context/i
  for (const block of EVERY_BLOCK) {
    const found = PREVIEW_BLOCK_CUE[block].match(forbidden)
    assert(!found, `${block} says "${found?.[0]}" to a player`)
  }
})

heading('Reading what the browser rejected with')

check('each spec name lands on the answer that helps', () => {
  const named = (name: string) => {
    const err = new Error('refused')
    err.name = name
    return previewBlockFor(err)
  }
  assert(named('NotAllowedError') === 'denied', 'a blocked camera was not read as blocked')
  assert(named('SecurityError') === 'denied', 'a security refusal was not read as blocked')
  assert(named('NotFoundError') === 'missing', 'a device with no camera was not read as missing')
  assert(named('NotReadableError') === 'busy', 'a camera another app holds was not read as busy')
  assert(named('AbortError') === 'busy', 'an aborted capture was not read as busy')
})

check('anything unrecognised is called unknown rather than guessed at', () => {
  assert(previewBlockFor(new Error('boom')) === 'unknown', 'a bare error was given a cause')
  assert(previewBlockFor(named('OverconstrainedError')) === 'unknown', 'a constraint failure was renamed')
  assert(previewBlockFor('not an error') === 'unknown', 'a string was given a cause')
  assert(previewBlockFor(undefined) === 'unknown', 'nothing at all was given a cause')

  function named(name: string) {
    const err = new Error('refused')
    err.name = name
    return err
  }
})

heading('Whether to offer it at all')

check('the offer needs a callable getUserMedia, not merely a navigator', () => {
  assert(!previewSupported(undefined), 'offered a preview with no navigator')
  assert(!previewSupported({}), 'offered a preview with no mediaDevices')
  assert(!previewSupported({ mediaDevices: {} }), 'offered a preview with no getUserMedia')
  assert(
    previewSupported({ mediaDevices: { getUserMedia: () => undefined } }),
    'refused a preview on a browser that has one',
  )
})

report()
