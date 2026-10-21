/**
 * What the player is told when there is no serve speed (N2.5).
 *
 * Every reason `measureServeSpeed` can give, as one thing the player can do
 * about it next time. No number in any of them: the copy rules forbid raw
 * readings in player lines, and a frame rate or an angle is one.
 *
 * Nothing here is on a screen yet. Showing a speed at all is the owner's call
 * (N2.7); these are ready for the moment it is made.
 */
import type { SpeedMiss } from './vision/serveSpeed'

export const SPEED_MISS_LINE: Record<SpeedMiss, string> = {
  frame_rate: 'Film in slow motion to get a speed. At normal speed the ball crosses the picture in a frame or two.',
  view: 'Film from the side to get a speed. From behind, the ball flies straight away from the camera.',
  no_toss: 'I could not follow your toss, so I had nothing to measure the picture with. Keep the whole toss in shot.',
  timing: 'This video does not carry the time of each frame, so I cannot time the ball.',
  not_found: 'I lost the ball after the hit. Turn the phone sideways so it stays in the picture longer.',
  unsure: 'I saw the ball after the hit, but not clearly enough to stand behind a speed.',
}
