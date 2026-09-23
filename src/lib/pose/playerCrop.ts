/**
 * Where to point the pose model: a square around the server, when one helps.
 *
 * MediaPipe's pose detector letterboxes the whole frame into 224 × 224 before
 * it looks for anybody. A player filmed from the back fence in landscape is
 * about 215 px tall in a 1280 × 720 frame — roughly 37 px by the time the
 * detector sees them — and on the pose benchmark (`bench.html`, 500 labelled
 * serve frames from real phones; see ANALYSIS-REVIEW.md §7) the app returned
 * no pose at all on 101 of them. Cropping to the box the app's own
 * EfficientDet finds cut that to 8, and cut wrist and elbow error by about a
 * third, with no new model.
 *
 * ONE crop per read window, not one per frame. MediaPipe's VIDEO mode carries
 * each frame's region of interest into the next; a crop that moved under it
 * would move the tracker's frame of reference every sample. A fixed square is
 * just a zoom, and the tracker cannot tell the difference.
 *
 * DOM-free: the boxes arrive from `analyze.ts`, which owns the detector, and
 * `extract.ts` does the drawing. This file only decides.
 */

/** A detected person, in pixels of the source frame. */
export interface PersonBox {
  x: number
  y: number
  width: number
  height: number
  score: number
}

/** The square handed to the pose model, in source pixels. May overhang the frame. */
export interface Crop {
  x: number
  y: number
  side: number
}

/** Margin round the union of the server's boxes: room for the racket at full stretch. */
export const CROP_PAD = 1.5

/**
 * Past this share of the frame's long side the player is already big enough for
 * the detector, and a crop buys nothing but the risk of cutting off the toss.
 */
export const CROP_USEFUL_BELOW = 0.5

/** Samples in which the server has to be found before a crop is trusted. */
export const MIN_SIGHTINGS = 2

const centre = (b: PersonBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/**
 * The server, across a few samples of the window, or nothing.
 *
 * The tallest person in each sample, because the server is the one nearest the
 * phone — then any sample whose tallest person sits far from where the others
 * put the server is dropped, which is the partner walking past the lens for a
 * frame. A crop from fewer than `MIN_SIGHTINGS` agreeing samples is not made:
 * the full frame is what the app did before this existed, so declining is
 * always safe.
 */
export function choosePlayerCrop(
  samples: PersonBox[][],
  frameWidth: number,
  frameHeight: number,
): Crop | undefined {
  const tallest = samples
    .map((boxes) => boxes.reduce<PersonBox | undefined>((a, b) => (!a || b.height > a.height ? b : a), undefined))
    .filter((b): b is PersonBox => b !== undefined)
  if (tallest.length < MIN_SIGHTINGS) return undefined

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const mx = median(tallest.map((b) => centre(b).x))
  const my = median(tallest.map((b) => centre(b).y))
  const mh = median(tallest.map((b) => b.height))
  const agreeing = tallest.filter((b) => Math.hypot(centre(b).x - mx, centre(b).y - my) <= mh * 0.75)
  if (agreeing.length < MIN_SIGHTINGS) return undefined

  const x0 = Math.min(...agreeing.map((b) => b.x))
  const y0 = Math.min(...agreeing.map((b) => b.y))
  const x1 = Math.max(...agreeing.map((b) => b.x + b.width))
  const y1 = Math.max(...agreeing.map((b) => b.y + b.height))

  const longSide = Math.max(frameWidth, frameHeight)
  if (y1 - y0 >= longSide * CROP_USEFUL_BELOW) return undefined

  const side = Math.min(longSide, Math.max(x1 - x0, y1 - y0) * CROP_PAD)
  return { x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, side }
}

/**
 * A landmark the model placed in the crop, back in full-frame normalised
 * coordinates — x by width, y by height, as MediaPipe gives them for a whole
 * frame, so everything downstream reads a cropped sample exactly as it read an
 * uncropped one. MediaPipe scales image z like x, so z follows x's factor.
 */
export function uncrop<L extends { x: number; y: number; z: number }>(
  l: L,
  crop: Crop,
  frameWidth: number,
  frameHeight: number,
): L {
  return {
    ...l,
    x: (crop.x + l.x * crop.side) / frameWidth,
    y: (crop.y + l.y * crop.side) / frameHeight,
    z: (l.z * crop.side) / frameWidth,
  }
}
