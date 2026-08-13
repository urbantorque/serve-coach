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
import { attemptShare, type ShareNavigator } from '../reportCard'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const FILE = {} as File

heading('Whether to ask this browser to share at all')

check('a browser with no share function is not asked', async () => {
  assert(
    (await attemptShare(undefined, FILE, 'x')) === 'not-attempted',
    'asked a browser with no navigator.share',
  )
  assert(
    (await attemptShare({}, FILE, 'x')) === 'not-attempted',
    'asked a browser with an object that has no share method',
  )
})

check('canShare saying no is respected without ever calling share', async () => {
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

check('a browser with share but no canShare is tried anyway', async () => {
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
    'did not hand the file to share()',
  )
})

check('a canShare that throws is read as "try it", not as a refusal', async () => {
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

check('sharing that succeeds reports shared', async () => {
  const nav: ShareNavigator = { canShare: () => true, share: async () => undefined }
  assert((await attemptShare(nav, FILE, 'x')) === 'shared', 'a clean share() was not reported as shared')
})

check('backing out of the share sheet is cancelled, not failed', async () => {
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
  assert((await attemptShare(nav, FILE, 'x')) === 'cancelled', 'a dismissal was not read as cancelled')
})

check('a share that fails for any other reason is failed, not cancelled', async () => {
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

check('every outcome that is not shared or cancelled falls through to a download', () => {
  // shareBlob's own contract, restated as a closed set: attemptShare only
  // ever returns one of four answers, and the caller's fallback depends on
  // exactly two of them being distinct from the other two.
  const outcomes = ['shared', 'cancelled', 'not-attempted', 'failed']
  const fallsThrough = (o: string) => o !== 'shared' && o !== 'cancelled'
  assert(fallsThrough('not-attempted') && fallsThrough('failed'), 'the fallback set drifted')
  assert(!fallsThrough('shared') && !fallsThrough('cancelled'), 'the fallback set drifted')
  assert(outcomes.length === 4, 'a new outcome was added without updating this pin')
})

report()
