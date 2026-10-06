/**
 * The Bath serve set: real serves in marker motion capture, made into joints.
 *
 * Durlind, Martinez-Hernandez & Assaf (2025), "Dataset for 'Exploratory
 * Proof-of-Concept: Predicting the Outcome of Tennis Serves Using Motion
 * Capture and Deep Learning'", University of Bath Research Data Archive,
 * doi:10.15125/BATH-01454. Licence: CC BY 4.0. Eight Qualisys Miqus M5 cameras
 * at 180 Hz; each serve is one `.mat` array of 75 markers × 3 × 301 frames,
 * labelled and gap-filled in QTM, in millimetres with z up. A spreadsheet gives
 * each serve's outcome (In / Out / Net) from a synchronised video camera.
 *
 * The files carry no marker names, so the layout below was worked out from the
 * data and is stated so it can be checked: which markers hold rigid distances
 * to which (a segment), which pair up across a joint, and where each sits at the
 * first frame. Every file uses the same order. All 42 serves are one
 * right-handed player — shoulder width and head height agree across them to a
 * few millimetres.
 *
 * Joint centres are standard but approximate, and the approximation is the
 * same in the truth and in what the phone sees, so comparisons between the two
 * are unaffected by it:
 * - hips from the pelvis markers by Harrington et al. (2007)'s regression;
 * - elbows, wrists and ankles at the centroid of the markers around the joint;
 * - knees from the single lateral knee marker, half a knee's width medially;
 * - shoulders 4 cm below the acromion markers, along the trunk.
 *
 * What was changed from the source, as the licence asks: the 75 markers are
 * reduced to the 24 points in `MOCAP_POINTS`, rotated so +x points towards the
 * net, and converted to metres.
 */
import { MOCAP_POINTS, type MocapPoint, type MocapServe, type Vec3 } from '../../lib/analysis/mocapServe'

export const BATH_RATE = 180
export const BATH_MARKERS = 75

export const BATH_ATTRIBUTION = `Durlind, G., Martinez-Hernandez, U. and Assaf, T. (2025). Dataset for "Exploratory
Proof-of-Concept: Predicting the Outcome of Tennis Serves Using Motion Capture and Deep
Learning". University of Bath Research Data Archive. doi:10.15125/BATH-01454
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Changed for Serve Coach's dev tooling: 75 markers reduced to 24 joint centres, rotated
so +x points towards the net, converted to metres.
`

/**
 * Marker indices, 0-based, as found in the data.
 *
 * Segments were identified by rigid distances over a whole serve (standard
 * deviation under ~3 mm within a segment, tens of millimetres across a joint):
 * per arm an upper-arm cluster of four, three on the distal humerus, two at the
 * elbow, a forearm cluster of three, two at the wrist and two on the hand; per
 * leg a thigh cluster of four, one lateral knee marker that keeps its distance
 * to both thigh and shank, a shank cluster, the malleoli and a forefoot marker.
 * Left and right come from which side of the pelvis and trunk a marker sits;
 * front and back from the sternum against C7.
 */
export const BATH = {
  racket: [0, 1, 2],
  head: { leftFront: 3, rightFront: 4, rightBack: 5, leftBack: 6 },
  clavicle: 7,
  rightAcromion: 8,
  leftAcromion: 9,
  c7: 10,
  left: { elbow: [15, 16, 17, 18, 19], wrist: [23, 24], hand: [25, 26] },
  right: { elbow: [32, 33, 34, 35, 36], wrist: [40, 41], hand: [42, 43] },
  pelvis: { rightAsis: 45, leftAsis: 48, rightPsis: 49, leftPsis: 50 },
  rightLeg: { knee: 55, ankle: [60, 61], toe: 62 },
  leftLeg: { knee: 67, ankle: [72, 73], toe: 74 },
} as const

/**
 * Which hand marker is the index knuckle, per side — `[index, pinky]`.
 *
 * Settled by the forearm's own anatomy rather than by guessing at a label: a
 * right forearm pronates by turning the hand clockwise about the elbow→wrist
 * axis, and a serve pronates into contact, so the knuckle line's sense of
 * rotation through the swing names its ends. Read with 42 as the index, 40 of
 * the 42 serves turned the "wrong" way (+8° to +148°, the other two never
 * swung), so 43 is the index. See `pronationSense` and `bath.test.ts`. The
 * left hand's two markers are stored in the same order.
 */
export const HAND_ORDER = { right: [43, 42], left: [26, 25] } as const

export interface MarkerTrack {
  count: number
  /** The marker at a frame, millimetres, lab frame. */
  at(marker: number, frame: number): Vec3
}

/** MATLAB stores markers × axes × frames with the first index fastest. */
export function markerTrack(data: Float64Array, markers = BATH_MARKERS): MarkerTrack {
  const count = data.length / (markers * 3)
  if (!Number.isInteger(count)) throw new Error(`${data.length} values is not ${markers} markers × 3 × frames`)
  return {
    count,
    at: (m, f) => ({
      x: data[m + markers * (0 + 3 * f)],
      y: data[m + markers * (1 + 3 * f)],
      z: data[m + markers * (2 + 3 * f)],
    }),
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-9, norm(a)))
const mean = (ps: Vec3[]): Vec3 => scale(ps.reduce(add, { x: 0, y: 0, z: 0 }), 1 / ps.length)

/**
 * Harrington et al. (2007) hip joint centres, metres in and out.
 *
 * Pelvic width PW is ASIS to ASIS, depth PD the ASIS midpoint to the PSIS
 * midpoint. In the pelvis frame (x anterior, y superior, z right) each centre
 * sits at x = −0.24·PD − 9.9 mm, y = −0.30·PW − 10.9 mm, z = ±(0.33·PW + 7.3 mm).
 */
export function harringtonHips(rAsis: Vec3, lAsis: Vec3, rPsis: Vec3, lPsis: Vec3): { left: Vec3; right: Vec3 } {
  const origin = scale(add(rAsis, lAsis), 0.5)
  const psis = scale(add(rPsis, lPsis), 0.5)
  const z = unit(sub(rAsis, lAsis))
  const back = sub(origin, psis)
  const x = unit(sub(back, scale(z, dot(back, z))))
  const y = cross(z, x)
  const pw = norm(sub(rAsis, lAsis))
  const pd = norm(sub(origin, psis))
  const ax = -0.24 * pd - 0.0099
  const ay = -0.3 * pw - 0.0109
  const az = 0.33 * pw + 0.0073
  const at = (side: 1 | -1) => add(origin, add(scale(x, ax), add(scale(y, ay), scale(z, side * az))))
  return { right: at(1), left: at(-1) }
}

export interface BathOptions {
  id: string
  outcome?: 'in' | 'out' | 'net'
  /**
   * Heading of the net in the lab, radians about +z. The racket leaves contact
   * along lab +x in every file, so 0; kept as a parameter so a different
   * session cannot be rotated silently.
   */
  netHeading?: number
}

/** Half the width of a knee and of an ankle across their markers, metres. */
const KNEE_HALF = 0.05
const SHOULDER_DROP = 0.04

/**
 * One Bath serve as joint paths in the court frame.
 *
 * Millimetres in, metres out, rotated about the vertical so the net is +x.
 * The floor stays at the lab's z = 0.
 */
export function bathServe(data: Float64Array, opts: BathOptions): MocapServe {
  const track = markerTrack(data)
  const n = MOCAP_POINTS.length
  const xyz = new Float32Array(track.count * n * 3)
  const heading = opts.netHeading ?? 0
  const c = Math.cos(-heading)
  const s = Math.sin(-heading)
  const toCourt = (p: Vec3): Vec3 => ({ x: (p.x * c - p.y * s) / 1000, y: (p.x * s + p.y * c) / 1000, z: p.z / 1000 })

  for (let f = 0; f < track.count; f++) {
    const m = (i: number) => toCourt(track.at(i, f))
    const ms = (is: readonly number[]) => mean(is.map(m))

    // Head: a band of four markers at the forehead.
    const lf = m(BATH.head.leftFront)
    const rf = m(BATH.head.rightFront)
    const rb = m(BATH.head.rightBack)
    const lb = m(BATH.head.leftBack)
    const centre = mean([lf, rf, rb, lb])
    const fwd = unit(sub(mean([lf, rf]), mean([lb, rb])))
    const leftward = unit(sub(mean([lf, lb]), mean([rf, rb])))
    const headUp = unit(cross(fwd, leftward))
    const nose = add(centre, add(scale(fwd, 0.1), scale(headUp, -0.07)))
    const ear = (side: 1 | -1) => add(centre, add(scale(leftward, side * 0.075), add(scale(headUp, -0.04), scale(fwd, -0.01))))

    const hips = harringtonHips(
      m(BATH.pelvis.rightAsis),
      m(BATH.pelvis.leftAsis),
      m(BATH.pelvis.rightPsis),
      m(BATH.pelvis.leftPsis),
    )
    const pelvisRight = unit(sub(m(BATH.pelvis.rightAsis), m(BATH.pelvis.leftAsis)))
    const neck = mean([m(BATH.c7), m(BATH.clavicle)])
    const trunkDown = unit(sub(mean([hips.left, hips.right]), neck))
    const shoulder = (acromion: number) => add(m(acromion), scale(trunkDown, SHOULDER_DROP))

    // The single knee marker is lateral; the joint is half a knee in.
    const rKnee = add(m(BATH.rightLeg.knee), scale(pelvisRight, -KNEE_HALF))
    const lKnee = add(m(BATH.leftLeg.knee), scale(pelvisRight, KNEE_HALF))
    const rAnkle = ms(BATH.rightLeg.ankle)
    const lAnkle = ms(BATH.leftLeg.ankle)
    const rToe = m(BATH.rightLeg.toe)
    const lToe = m(BATH.leftLeg.toe)
    // No heel markers: MediaPipe's heel is the back of the foot near the
    // floor, so 6 cm behind the ankle along the foot, 7 cm lower.
    const heel = (ankle: Vec3, toe: Vec3) => {
      const along = unit({ x: toe.x - ankle.x, y: toe.y - ankle.y, z: 0 })
      return add(ankle, add(scale(along, -0.06), { x: 0, y: 0, z: -0.07 }))
    }

    const values: Record<MocapPoint, Vec3> = {
      nose,
      leftEar: ear(1),
      rightEar: ear(-1),
      leftShoulder: shoulder(BATH.leftAcromion),
      rightShoulder: shoulder(BATH.rightAcromion),
      leftElbow: ms(BATH.left.elbow),
      rightElbow: ms(BATH.right.elbow),
      leftWrist: ms(BATH.left.wrist),
      rightWrist: ms(BATH.right.wrist),
      leftIndex: m(HAND_ORDER.left[0]),
      rightIndex: m(HAND_ORDER.right[0]),
      leftPinky: m(HAND_ORDER.left[1]),
      rightPinky: m(HAND_ORDER.right[1]),
      leftHip: hips.left,
      rightHip: hips.right,
      leftKnee: lKnee,
      rightKnee: rKnee,
      leftAnkle: lAnkle,
      rightAnkle: rAnkle,
      leftHeel: heel(lAnkle, lToe),
      rightHeel: heel(rAnkle, rToe),
      leftToe: lToe,
      rightToe: rToe,
      racket: ms(BATH.racket),
    }
    MOCAP_POINTS.forEach((name, k) => {
      const p = values[name]
      const o = (f * n + k) * 3
      xyz[o] = p.x
      xyz[o + 1] = p.y
      xyz[o + 2] = p.z
    })
  }

  return { id: opts.id, rate: BATH_RATE, count: track.count, xyz, hand: 'right', outcome: opts.outcome }
}

/**
 * Signed rotation of the knuckle line about the forearm, degrees, from one
 * frame to another — negative is clockwise looking down the forearm from the
 * elbow, which is pronation for a right arm.
 */
export function pronationSense(track: MarkerTrack, side: 'left' | 'right', from: number, to: number): number {
  const arm = BATH[side]
  const [index, pinky] = HAND_ORDER[side]
  const at = (f: number) => {
    const elbow = mean(arm.elbow.map((i) => track.at(i, f)))
    const wrist = mean(arm.wrist.map((i) => track.at(i, f)))
    const axis = unit(sub(wrist, elbow))
    const line = sub(track.at(index, f), track.at(pinky, f))
    return { axis, across: unit(sub(line, scale(axis, dot(line, axis)))) }
  }
  // Integrated frame by frame, so a turn past 180° is not folded back.
  let total = 0
  let prev = at(from)
  for (let f = from + 1; f <= to; f++) {
    const cur = at(f)
    const s = dot(cross(prev.across, cur.across), cur.axis)
    const c = dot(prev.across, cur.across)
    total += (Math.atan2(s, c) * 180) / Math.PI
    prev = cur
  }
  return total
}

/** Rows of the outcome spreadsheet: serve number → outcome. */
export function parseOutcomes(sheetXml: string, sharedStrings: string[]): Map<number, 'in' | 'out' | 'net'> {
  const out = new Map<number, 'in' | 'out' | 'net'>()
  for (const row of sheetXml.matchAll(/<row [^>]*>(.*?)<\/row>/g)) {
    const cells = new Map<string, string>()
    for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/g)) {
      const value = /<v>(.*?)<\/v>/.exec(cell[3] ?? '')?.[1]
      if (value === undefined) continue
      cells.set(cell[1], /t="s"/.test(cell[2]) ? sharedStrings[Number(value)] : value)
    }
    const serve = Number(cells.get('A'))
    const outcome = cells.get('B')?.trim().toLowerCase()
    if (Number.isInteger(serve) && (outcome === 'in' || outcome === 'out' || outcome === 'net')) out.set(serve, outcome)
  }
  return out
}
