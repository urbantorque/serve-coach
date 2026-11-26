/**
 * The picture a refused clip shows, by why it was refused (Mirror M2.2).
 *
 * Only where the reason is the camera: where it stood, or what it had in the
 * picture. A picture of the fix settles those before the words are read. A
 * clip too short or too blurred is fixed by slow motion and light, which no
 * honest picture shows, so it keeps its words alone. Every reason is decided
 * here, a picture or none, and the type will not let a new one go undecided.
 */
import type { RejectReason } from './analysis/triage'

export type RefusalPicture = 'placement' | 'framing'

export const REFUSAL_PICTURE: Record<RejectReason, RefusalPicture | null> = {
  // "Keep your whole body in frame... from your feet to the racket at the top."
  body_not_visible: 'framing',
  // "Rest the phone on something steady... to your side."
  camera_unusable: 'placement',
  too_few_frames: null,
  too_blurry: null,
}

/**
 * A reason this build has no words for is refused with the placement's hint
 * (`refusalFor`'s fallback), so it shows the placement's picture.
 */
export function refusalPicture(reason: string): RefusalPicture | null {
  return reason in REFUSAL_PICTURE ? REFUSAL_PICTURE[reason as RejectReason] : 'placement'
}
