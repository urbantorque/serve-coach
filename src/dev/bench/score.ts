/**
 * The arithmetic of the pose benchmark, kept pure so it is tested in Node.
 *
 * The benchmark (`bench.html`, dev only) runs several pose back-ends over the
 * 500 labelled serve frames of the Tennis Player Actions dataset (CC BY 4.0,
 * see `scripts/fetch-bench.mjs`) and scores each against the hand labels. This
 * file owns everything about that scoring that is not a model call: which
 * landmark means which joint, how an error is normalised, what counts as a
 * miss, and the RTMPose crop-and-decode maths.
 */

/** The 17 COCO joints the dataset labels (it adds an 18th, `neck`, ignored here). */
export const COCO_JOINTS = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const

export type Joint = (typeof COCO_JOINTS)[number]

/** MediaPipe's 33-landmark index for each COCO joint, in `COCO_JOINTS` order. */
export const MEDIAPIPE_TO_COCO = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

/** The joints the serve engine actually measures from, grouped for the report. */
export const JOINT_GROUPS: Record<string, Joint[]> = {
  wrists: ['left_wrist', 'right_wrist'],
  elbows: ['left_elbow', 'right_elbow'],
  shoulders: ['left_shoulder', 'right_shoulder'],
  hips: ['left_hip', 'right_hip'],
  knees: ['left_knee', 'right_knee'],
  ankles: ['left_ankle', 'right_ankle'],
}

export interface Pt {
  x: number
  y: number
}

/** A prediction for one image: 17 points in COCO order, pixels, or nothing found. */
export type Prediction = Pt[] | undefined

export interface Truth {
  file: string
  /** 17 points in COCO order, pixels; `undefined` where the label is absent. */
  joints: (Pt | undefined)[]
  /** [x, y, w, h] of the labelled player, pixels. */
  bbox: [number, number, number, number]
}

/**
 * Read one COCO annotation into a `Truth`.
 *
 * COCO visibility is 0 (not labelled), 1 (labelled, occluded) or 2 (labelled,
 * visible); both labelled states count, since an occluded wrist the annotator
 * placed is exactly the case a pose model has to get right on a serve.
 */
export function truthFrom(file: string, keypoints: number[], bbox: number[]): Truth {
  const joints: (Pt | undefined)[] = []
  for (let j = 0; j < COCO_JOINTS.length; j++) {
    const v = keypoints[j * 3 + 2]
    joints.push(v > 0 ? { x: keypoints[j * 3], y: keypoints[j * 3 + 1] } : undefined)
  }
  return { file, joints, bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] }
}

/**
 * The yardstick every error is divided by: the labelled player's height.
 *
 * The box height, not its diagonal — on a serve the raised racket arm widens
 * the box without making the player any bigger, and a yardstick that grows
 * with the pose would flatter exactly the frames that are hardest.
 */
export const scaleOf = (t: Truth): number => Math.max(1, t.bbox[3])

/** Per-joint error as a fraction of player height; `undefined` where not comparable. */
export function jointErrors(pred: Prediction, t: Truth): (number | undefined)[] {
  const s = scaleOf(t)
  return t.joints.map((g, j) => {
    if (!g) return undefined
    if (!pred) return Infinity
    const p = pred[j]
    return Math.hypot(p.x - g.x, p.y - g.y) / s
  })
}

/**
 * The player the model found is not the player who was labelled.
 *
 * Median body-joint error over half the player's height: past that, the model
 * has put a skeleton on somebody else — the second player in the background
 * on half these frames — and averaging its joint errors in with the rest would
 * describe a tracking failure as imprecision.
 */
export function wrongPerson(errors: (number | undefined)[]): boolean {
  const e = errors.filter((x): x is number => x !== undefined).sort((a, b) => a - b)
  if (!e.length) return false
  return e[Math.floor(e.length / 2)] > 0.5
}

/** True when the prediction matches the labels better with left and right exchanged. */
export function leftRightSwapped(pred: Prediction, t: Truth): boolean {
  if (!pred) return false
  const pairs: [number, number][] = [
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
  ]
  let straight = 0
  let crossed = 0
  for (const [l, r] of pairs) {
    const gl = t.joints[l]
    const gr = t.joints[r]
    if (!gl || !gr) continue
    straight += Math.hypot(pred[l].x - gl.x, pred[l].y - gl.y) + Math.hypot(pred[r].x - gr.x, pred[r].y - gr.y)
    crossed += Math.hypot(pred[r].x - gl.x, pred[r].y - gl.y) + Math.hypot(pred[l].x - gr.x, pred[l].y - gr.y)
  }
  return crossed < straight * 0.6
}

export interface VariantSummary {
  images: number
  /** No pose returned at all. */
  missed: number
  /** A pose returned on somebody other than the labelled player. */
  wrongPerson: number
  /** Left and right exchanged on the right player. */
  swapped: number
  /** Over images where the right player was found: median error per group, % of height. */
  medianError: Record<string, number>
  /** Share of labelled joints within 5% / 10% of player height, per group. */
  pck05: Record<string, number>
  pck10: Record<string, number>
  /** Median milliseconds per image. */
  msPerImage: number
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Fold one variant's per-image results into the table row the report prints. */
export function summarise(
  results: { pred: Prediction; truth: Truth; ms: number }[],
): VariantSummary {
  const groups = { all: [...COCO_JOINTS], ...JOINT_GROUPS }
  const errs: Record<string, number[]> = Object.fromEntries(Object.keys(groups).map((g) => [g, []]))
  let missed = 0
  let wrong = 0
  let swapped = 0
  for (const { pred, truth } of results) {
    if (!pred) {
      missed++
      continue
    }
    const e = jointErrors(pred, truth)
    if (wrongPerson(e)) {
      wrong++
      continue
    }
    if (leftRightSwapped(pred, truth)) swapped++
    for (const [g, joints] of Object.entries(groups)) {
      for (const j of joints) {
        const v = e[COCO_JOINTS.indexOf(j)]
        if (v !== undefined) errs[g].push(v)
      }
    }
  }
  const pct = (xs: number[], lim: number) => (xs.length ? xs.filter((x) => x <= lim).length / xs.length : NaN)
  return {
    images: results.length,
    missed,
    wrongPerson: wrong,
    swapped,
    medianError: Object.fromEntries(Object.entries(errs).map(([g, xs]) => [g, median(xs) * 100])),
    pck05: Object.fromEntries(Object.entries(errs).map(([g, xs]) => [g, pct(xs, 0.05)])),
    pck10: Object.fromEntries(Object.entries(errs).map(([g, xs]) => [g, pct(xs, 0.1)])),
    msPerImage: median(results.map((r) => r.ms)),
  }
}

/* ---------------------------------------------------------------- RTMPose maths */

/** RTMPose's input, width × height. */
export const RTM_INPUT = { w: 192, h: 256 }
/** SimCC bins per input pixel. */
export const RTM_SPLIT = 2

/**
 * The crop RTMPose reads, from a person box: padded 1.25×, then widened or
 * heightened to the model's 3:4 — `TopDownGetBboxCenterScale` in its own
 * deploy pipeline, without the rotation it never uses at inference.
 */
export function rtmCrop(box: [number, number, number, number]): { x: number; y: number; w: number; h: number } {
  const [bx, by, bw, bh] = box
  const cx = bx + bw / 2
  const cy = by + bh / 2
  let w = bw * 1.25
  let h = bh * 1.25
  const aspect = RTM_INPUT.w / RTM_INPUT.h
  if (w > h * aspect) h = w / aspect
  else w = h * aspect
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/**
 * Decode SimCC: each joint's x and y are the argmax of its own 1-D
 * distribution, in input pixels × `RTM_SPLIT`; mapped back through the crop.
 */
export function decodeSimcc(
  simccX: Float32Array,
  simccY: Float32Array,
  joints: number,
  crop: { x: number; y: number; w: number; h: number },
): { points: Pt[]; scores: number[] } {
  const binsX = simccX.length / joints
  const binsY = simccY.length / joints
  const points: Pt[] = []
  const scores: number[] = []
  for (let j = 0; j < joints; j++) {
    let bx = 0
    let vx = -Infinity
    for (let i = 0; i < binsX; i++) {
      const v = simccX[j * binsX + i]
      if (v > vx) {
        vx = v
        bx = i
      }
    }
    let by = 0
    let vy = -Infinity
    for (let i = 0; i < binsY; i++) {
      const v = simccY[j * binsY + i]
      if (v > vy) {
        vy = v
        by = i
      }
    }
    points.push({
      x: crop.x + (bx / RTM_SPLIT / RTM_INPUT.w) * crop.w,
      y: crop.y + (by / RTM_SPLIT / RTM_INPUT.h) * crop.h,
    })
    scores.push(Math.min(vx, vy))
  }
  return { points, scores }
}

/** The tight box around a set of points, for handing one model's find to another. */
export function boxOf(points: Pt[]): [number, number, number, number] {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0]
}
