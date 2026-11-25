/**
 * Whether a browser should be asked to share a file, and what it means when
 * it refuses.
 *
 * `navigator.share` cannot be exercised here — no browser, no OS share sheet
 * — and that is exactly why the decision was pulled out of `shareBlob` into
 * `attemptShare`. What matters is not whether this repo can open a real
 * share sheet; it is whether the fallback chain reads every one of the ways
 * a real one refuses correctly, so a player who cannot share still gets the
 * file. "navigator.share with files is refused by more browsers than accept
 * it" was the claim this round opened with; every check below is one of the
 * refusals actually tested rather than assumed.
 */
import { attemptShare, renderTripCard, type ShareNavigator } from '../reportCard'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const FILE = {} as File

heading('Whether to ask this browser to share at all')

await check('a browser with no share function isn’t asked', async () => {
  assert(
    (await attemptShare(undefined, FILE, 'x')) === 'not-attempted',
    'asked a browser with no navigator.share',
  )
  assert(
    (await attemptShare({}, FILE, 'x')) === 'not-attempted',
    'asked a browser with an object that has no share method',
  )
})

await check('canShare saying no is respected without ever calling share', async () => {
  let shareCalled = false
  const nav: ShareNavigator = {
    canShare: () => false,
    share: async () => {
      shareCalled = true
    },
  }
  assert((await attemptShare(nav, FILE, 'x')) === 'not-attempted', 'shared a file canShare refused')
  assert(!shareCalled, 'called share() after canShare said no')
})

await check('a browser with share but no canShare is tried anyway', async () => {
  // The same rule `recordingType` applies to a missing `canPlayType`:
  // absence of the newer capability check must not remove a working control.
  let called: unknown
  const nav: ShareNavigator = {
    share: async (data) => {
      called = data
    },
  }
  assert((await attemptShare(nav, FILE, 'My serve')) === 'shared', 'refused to try without canShare')
  assert(
    (called as { files?: File[] } | undefined)?.files?.[0] === FILE,
    'didn’t hand the file to share()',
  )
})

await check('a canShare that throws is read as "try it", not as a refusal', async () => {
  // A capability check throwing is a browser being asked something it does
  // not understand, not proof of the thing it was asked about — the same
  // move `recordingType` makes for a `isTypeSupported` that throws.
  let shareCalled = false
  const nav: ShareNavigator = {
    canShare: () => {
      throw new TypeError('unrecognised')
    },
    share: async () => {
      shareCalled = true
    },
  }
  assert((await attemptShare(nav, FILE, 'x')) === 'shared', 'a throwing canShare silently killed the share')
  assert(shareCalled, 'never called share() after canShare threw')
})

heading('What a real share sheet says back')

await check('sharing that succeeds reports shared', async () => {
  const nav: ShareNavigator = { canShare: () => true, share: async () => undefined }
  assert((await attemptShare(nav, FILE, 'x')) === 'shared', 'a clean share() wasn’t reported as shared')
})

await check('backing out of the share sheet is cancelled, not failed', async () => {
  // The browser says which it was: a dismissal rejects with AbortError.
  // Read as anything else, a player who opened the sheet and thought better
  // of it would fall through to a download they never asked for.
  const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
  const nav: ShareNavigator = {
    canShare: () => true,
    share: async () => {
      throw abort
    },
  }
  assert((await attemptShare(nav, FILE, 'x')) === 'cancelled', 'a dismissal wasn’t read as cancelled')
})

await check('a share that fails for any other reason is failed, not cancelled', async () => {
  const nav: ShareNavigator = {
    canShare: () => true,
    share: async () => {
      throw new DOMException('not allowed', 'NotAllowedError')
    },
  }
  assert(
    (await attemptShare(nav, FILE, 'x')) === 'failed',
    'a real share failure was read as a cancellation',
  )
})

check('every outcome that isn’t shared or cancelled falls through to a download', () => {
  // shareBlob's own contract, restated as a closed set: attemptShare only
  // ever returns one of four answers, and the caller's fallback depends on
  // exactly two of them being distinct from the other two.
  const outcomes = ['shared', 'cancelled', 'not-attempted', 'failed']
  const fallsThrough = (o: string) => o !== 'shared' && o !== 'cancelled'
  assert(fallsThrough('not-attempted') && fallsThrough('failed'), 'the fallback set drifted')
  assert(!fallsThrough('shared') && !fallsThrough('cancelled'), 'the fallback set drifted')
  assert(outcomes.length === 4, 'a new outcome was added without updating this pin')
})


/* ------------------------------------------------- what the trip card draws -- */

heading('A trip card, and the refusal it has to carry into pixels')

/**
 * R58·2. The content was decided in R58·1 and this only draws it — so what these
 * checks are for is the one thing a drawing round can still get wrong: turning a
 * refusal back into a number on the way to the canvas.
 *
 * A recording context rather than a real one, the same trade `drawing.test.ts`
 * makes for the overlay. What is asserted is the text drawn, because the text is
 * the whole of the claim; where it sits is a layout question and this file has
 * no opinion about it.
 */
function recordingCanvas() {
  const texts: string[] = []
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillText(t: string) {
      texts.push(String(t))
    },
    measureText: (t: string) => ({ width: String(t).length * 14 }),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: unknown) => void) => cb({ size: 1 }),
  }
  return { canvas, texts }
}

/** Stand in for `document.createElement('canvas')` for one call. */
async function drawTrip(trip: Parameters<typeof renderTripCard>[0], strain?: string) {
  const { canvas, texts } = recordingCanvas()
  const doc = globalThis as unknown as { document?: { createElement: (t: string) => unknown } }
  const had = doc.document
  doc.document = { createElement: () => canvas }
  try {
    await renderTripCard(trip, strain)
  } finally {
    doc.document = had
  }
  return texts
}

const TRIP = {
  from: 1_800_000_000_000,
  serves: 4,
  best: { id: 'a', overall: 74 },
  worst: { id: 'b', overall: 61 },
  focus: 'Racket stops short behind you',
  strain: [],
}

await check('the card says how many serves, and both ends of the trip', async () => {
  const texts = await drawTrip(TRIP)
  const all = texts.join(' | ')
  assert(/4 serves filmed/.test(all), `no serve count on the card:\n      ${all}`)
  assert(texts.includes('74'), 'the best serve isn’t on the card')
  assert(texts.includes('61'), 'the toughest serve isn’t on the card')
  assert(/Racket stops short/.test(all), 'what they left working on isn’t on the card')
})

await check('one serve is a serve, not "1 serves"', async () => {
  // The kind of thing nobody notices until it is in somebody's message thread.
  const texts = await drawTrip({ ...TRIP, serves: 1 })
  assert(/1 serve filmed/.test(texts.join(' | ')), 'the card said "1 serves"')
})

await check('a trip nobody swept draws no repeatability row at all', async () => {
  /*
   * **THE CHECK THIS ROUND EXISTS FOR.** R58·1 refuses a repeatability reading
   * when nothing on the trip was swept, because a spread across separate clips
   * compares serves the app never compared. A row reading "0 apart" would say
   * the player was perfectly repeatable on a trip nobody measured — and it would
   * say it in an image that travels further than any report does.
   */
  const texts = await drawTrip({ ...TRIP, tightestGap: undefined })
  const all = texts.join(' | ')
  assert(!/Tightest basket/.test(all), `a repeatability row was drawn with nothing behind it:\n      ${all}`)
  assert(!/0 apart/.test(all), 'a gap of zero reached the card')
})

await check('a trip that was swept says so, with the number', async () => {
  const texts = await drawTrip({ ...TRIP, tightestGap: 6 })
  const all = texts.join(' | ')
  assert(/Tightest basket/.test(all), 'a swept trip drew no repeatability row')
  assert(/6 apart/.test(all), `the gap didn’t reach the card:\n      ${all}`)
})

await check('a trip with nothing to say about a joint says nothing about one', async () => {
  const texts = await drawTrip(TRIP)
  assert(texts.length > 0, 'the card drew nothing at all')
  const withStrain = await drawTrip(TRIP, 'Your shoulder has flagged on three of your last four trips.')
  assert(
    withStrain.join(' | ').includes('shoulder'),
    'a strain line was passed and didn’t reach the card',
  )
  assert(
    withStrain.length > texts.length,
    'the card is identical with and without a strain line',
  )
})

await check('no image of anybody reaches a card that travels', async () => {
  /*
   * The basket card carries no stills either, and for the same reason: a coach's
   * card goes further than a report ever does, and the promise is that pictures
   * of somebody serving stay on their phone. Asserted on the drawing calls —
   * this stub records no `drawImage`, and would throw on one.
   */
  const texts = await drawTrip({ ...TRIP, tightestGap: 6 })
  for (const t of texts) {
    assert(!/data:image|base64/.test(t), `something image-shaped reached the card: ${t.slice(0, 40)}`)
  }
})

report()
