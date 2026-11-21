import { useMemo } from 'react'
import {
  boundsOf,
  figureOf,
  markerOf,
  pathOf,
  targetDrawn,
  viewOf,
  type Figure,
} from '../lib/analysis/targetShape'
import type { Metric } from '../lib/analysis/types'

/**
 * The target drawn on a body, under the words that describe it.
 *
 * The card above this already prints everything: "Hip–shoulder separation ·
 * hips and chest locked · aim for hips lead the chest", with a bar showing where
 * the reading falls in the band. All of it correct, and none of it something a
 * club player can convert into a shape to put their body in. This is the same
 * two numbers as two drawings — the player's, and the one they were asked for —
 * fitted in one box so the difference between them is to scale and can be read
 * at a glance.
 *
 * WHAT IT IS LABELLED AS. "The shape to aim for", every time, in the caption
 * beside it, plus the viewpoint the figure is drawn from. Never "what a pro
 * does" and never anything implying footage. The rig is a stick figure driven by
 * this player's own report — see the header of `targetShape.ts`, which owns the
 * argument — and the one thing a picture must never do here is borrow authority
 * it has not got.
 *
 * WHEN IT IS WITHHELD, which is most of the time:
 *
 *   - inside the band. `FundamentalCard` already withholds "Aim for" on exactly
 *     this test, and a second body drawn over a serve that was fine is the app
 *     inventing a fault.
 *   - below `SOFT_MEASUREMENT`. The same gate `ghostFor` and `bandsFor` use, and
 *     for the reason `bandsFor` gives at length: the card says "approximate"
 *     beside a number, and a player who has seen a diagram does not un-see it
 *     because a word nearby said "about".
 *   - where the readout and the target are the same phrase. The two figures
 *     would carry identical captions, and a correction whose before and after
 *     are described the same way is not a correction.
 *   - where there is no construction. Most measurements have none — see `DRAWN`.
 */
interface Props {
  metric: Metric
}

/**
 * Air left round the figure, as a share of its larger dimension.
 *
 * The `viewBox` is the figure's own bounding box plus this, rather than a fixed
 * rectangle the figure is letterboxed into. A fixed box has to suit both a leg —
 * tall and narrow — and a plan view of a pair of shoulders, which is wide and
 * flat, and it suits neither: measured on the real report, a bent arm occupied
 * 27 of 168 units across, so six sevenths of the picture was empty and the
 * drawing rendered at a sixth of the size it could have.
 *
 * With the box taking the shape of its contents, the stylesheet fixes the
 * HEIGHT and lets the width follow the aspect — so every figure on a card is the
 * same size to the eye and each one fills what it is given.
 */
const PAD = 0.09

export default function TargetShape({ metric: m }: Props) {
  const view = viewOf(m.id)
  const drawable = !!view && targetDrawn(m)

  const drawing = useMemo(() => {
    if (!drawable) return undefined
    const target = (m.ideal[0] + m.ideal[1]) / 2
    const yours = figureOf(m.id, m.value)
    const theirs = figureOf(m.id, target)
    if (!yours || !theirs) return undefined

    /*
     * One box across BOTH figures, plus both edges of the band.
     *
     * Fitted per figure they would each fill the box and come out looking alike,
     * which removes exactly the difference the drawing exists to show. The band
     * edges are in the fit as well so the shaded strip on a height diagram
     * cannot run off the top of the picture on a player who was well over it.
     */
    const edges = [figureOf(m.id, m.ideal[0]), figureOf(m.id, m.ideal[1])].filter(
      (f): f is Figure => !!f,
    )
    const box = boundsOf([yours, theirs, ...edges])
    const w = Math.max(1e-6, box.max.x - box.min.x)
    const h = Math.max(1e-6, box.max.y - box.min.y)
    // Equal padding on both axes, off the larger of the two, so the air round
    // the figure is the same thickness everywhere. Taken per axis it would be
    // wide margins beside a narrow figure and thin ones above it.
    const pad = Math.max(w, h) * PAD

    /*
     * Drawn in the figure's OWN coordinates, with the viewBox doing the fitting.
     *
     * There is no scale factor applied to any point below, and that is worth
     * being deliberate about: a drawing scaled by hand is a drawing that can be
     * scaled by different amounts on the two axes, and a figure stretched even
     * slightly is a figure whose angles are no longer the angles it was built
     * from — which is the entire claim being made. A `viewBox` cannot stretch;
     * `preserveAspectRatio` defaults to keeping the aspect, and there is nothing
     * to keep in step because there is only one transform and the browser owns
     * it.
     */
    return {
      viewBox: `${fix(box.min.x - pad)} ${fix(box.min.y - pad)} ${fix(w + pad * 2)} ${fix(h + pad * 2)}`,
      /** The figure's own units, for anything sized rather than positioned. */
      unit: Math.max(w, h),
      left: box.min.x - pad,
      width: w + pad * 2,
      yours,
      theirs,
      // The band as a strip, for the family measured straight up from the court.
      // An angle band has no strip to shade — the two edges are two more limb
      // positions, and a wedge between them drawn over a leg would read as the
      // leg being in both places. There, the pair of figures IS the band.
      strip:
        view!.kind === 'height' && edges.length === 2
          ? {
              top: Math.min(edges[0].joints[0].y, edges[1].joints[0].y),
              height: Math.abs(edges[0].joints[0].y - edges[1].joints[0].y),
            }
          : undefined,
    }
  }, [drawable, m.id, m.ideal, m.value, view])

  if (!drawing || !view) return null

  const ball = markerOf(m.id) === 'ball'
  // Stroke widths come from the stylesheet through `vector-effect`, so they are
  // device pixels whatever this figure's units happen to be. A radius cannot do
  // that, so it is a fraction of the figure's own size.
  const dot = drawing.unit * 0.035

  return (
    <figure className="tshape">
      <svg
        className={`tshape-canvas tshape-canvas--${view.kind}`}
        viewBox={drawing.viewBox}
        // One image with one description, rather than a tree of shapes a screen
        // reader would walk. Everything in the picture is already on the card in
        // words directly above it; what the label adds is that the two are the
        // same claim.
        role="img"
        aria-label={`${view.view}. You: ${m.readout}. The shape to aim for: ${m.target}.`}
      >
        {drawing.strip && (
          <rect
            className="tshape-band"
            x={fix(drawing.left)}
            y={fix(drawing.strip.top)}
            width={fix(drawing.width)}
            height={fix(Math.max(drawing.unit * 0.012, drawing.strip.height))}
          />
        )}

        {/* Fixed geometry — the court, the trunk, the horizontal the tilt is
            measured against. Identical in both figures by construction, so it is
            drawn once and in the neutral ink: anything that does not move with
            the number must not look like it did. */}
        <path className="tshape-ref" d={pathOf(drawing.theirs.reference)} />
        {drawing.theirs.head && (
          <circle
            className="tshape-ref"
            cx={fix(drawing.theirs.head.c.x)}
            cy={fix(drawing.theirs.head.c.y)}
            r={fix(drawing.theirs.head.r)}
          />
        )}

        {/* The target, first and underneath, dashed. Dashed and dim is the whole
            distinction between a target and a measurement on a picture where both
            are pale lines — the rule `drawGhost` states, kept here. */}
        <path className="tshape-target" d={pathOf(drawing.theirs.lines)} />
        {drawing.theirs.joints.map((p, i) => (
          <circle
            key={`t${i}`}
            className="tshape-target-dot"
            cx={fix(p.x)}
            cy={fix(p.y)}
            r={fix(dot)}
          />
        ))}

        {/* The player's own, on top and solid, in the accent — the same colour
            the overlay reserves for the thing being judged. */}
        <path className={`tshape-you tshape-you--${m.status}`} d={pathOf(drawing.yours.lines)} />
        {drawing.yours.joints.map((p, i) => (
          <circle
            key={`y${i}`}
            className={`tshape-you-dot tshape-you-dot--${m.status}`}
            cx={fix(p.x)}
            cy={fix(p.y)}
            r={fix(ball && i === drawing.yours.joints.length - 1 ? dot * 1.5 : dot * 1.2)}
          />
        ))}
      </svg>

      <figcaption className="tshape-key">
        <span className="tshape-key-row">
          <span className={`tshape-swatch tshape-swatch--you tshape-swatch--${m.status}`} aria-hidden="true" />
          <span className="tshape-key-label">You</span>
          <span className="tshape-key-value">{m.readout}</span>
        </span>
        <span className="tshape-key-row">
          <span className="tshape-swatch tshape-swatch--target" aria-hidden="true" />
          {/* "The shape to aim for", not "a pro". This caption is the caveat, and
              it is on every single one of these pictures. */}
          <span className="tshape-key-label">Shape to aim for</span>
          <span className="tshape-key-value">{m.target}</span>
        </span>
        <span className="tshape-view">{view.view}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Significant digits, not decimal places — the same rule `pathOf` follows and
 * for the same reason.
 *
 * These coordinates are in the figure's own units, which are fractions of a
 * standing height, so two decimal places would quantise the whole drawing into
 * about twenty steps. It once did: a 23° shoulder tilt came out of the markup
 * measuring 20°, under a caption still saying 23. Six significant digits are the
 * same precision whatever the units happen to be.
 */
const fix = (n: number) => Number(n.toPrecision(6))
