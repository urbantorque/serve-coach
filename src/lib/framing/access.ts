/**
 * Every way a live preview can fail to start, and what to say about each.
 *
 * Separated from the component for one reason: the component cannot be tested
 * here — there is no browser in the test runner and no camera behind it — and
 * this part can. What the browser hands back when it refuses a camera is a
 * `DOMException` with a `name`, and mapping those names onto sentences is
 * ordinary logic that ought not to hide inside a `catch` block nobody can reach.
 *
 * Every route out of here ends with the player able to film. The live preview is
 * an addition to the file picker and the operating system's camera, never a
 * replacement for either, so a refusal has to read as "use the other way in"
 * rather than as an error the player has to solve first.
 */

/** Why there is no preview. */
export type PreviewBlock = 'unsupported' | 'denied' | 'missing' | 'busy' | 'unknown' | 'engine'

/**
 * What each one says. Through the editor like every other player-facing string.
 *
 * The instruction is always the way out, never the diagnosis: somebody standing
 * on a court who has just been told their browser lacks an API has learned
 * nothing they can do anything with.
 *
 * And the way out has to be a control that exists. Once one of these is on
 * screen the preview has stopped and the camera has been given back, so there
 * is nothing on this screen left to press: the only retry is closing the sheet
 * and opening it again, which is what the two recoverable ones now name. "Try
 * again in a moment" named a button that was never there.
 */
export const PREVIEW_BLOCK_CUE: Record<PreviewBlock, string> = {
  unsupported: '**Film with your camera app** instead. This browser cannot show the camera here.',
  denied: '**Allow the camera** for this page, or film with your camera app and pick the video.',
  missing: '**Film with your camera app** instead. I could not find a camera on this device.',
  busy: '**Close your other camera apps**, then open the camera here again.',
  unknown: '**Film with your camera app** instead. The camera did not start here.',
  engine: '**Open the camera again** once you have signal. The coach needs a one-time download first.',
}

/**
 * Which refusal a `getUserMedia` rejection is.
 *
 * The names come from the Media Capture and Streams spec, which defines what
 * `getUserMedia` rejects with; they are the same across browsers even where the
 * messages are not, which is why the message is never read here.
 *
 * `AbortError` sits with `NotReadableError` deliberately. The spec separates
 * them — one is hardware that will not start, the other is anything else going
 * wrong at the point of capture — and from a player's side both mean the camera
 * exists, permission was given, and something else has hold of it. "Close your
 * other camera apps" is the one thing worth trying for either.
 *
 * Anything unrecognised becomes `unknown` rather than being guessed at. Naming a
 * cause the browser did not name is the same error as reporting a measurement
 * nothing produced.
 */
export function previewBlockFor(err: unknown): PreviewBlock {
  const name = err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
      return 'missing'
    case 'NotReadableError':
    case 'AbortError':
      return 'busy'
    default:
      return 'unknown'
  }
}

/**
 * Whether a live preview can be attempted at all.
 *
 * `navigator.mediaDevices` is absent, not merely unhelpful, on a page served
 * over plain http from anything but localhost — browsers gate the whole API on a
 * secure context. Reading it defensively also covers the test runner, where
 * there is no `navigator` at all.
 */
export function previewSupported(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const media = (nav as { mediaDevices?: { getUserMedia?: unknown } } | undefined)?.mediaDevices
  return typeof media?.getUserMedia === 'function'
}
