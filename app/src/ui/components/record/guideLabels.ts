/**
 * Which guide labels would collide (finding 76): "Toss room above" is hidden rather than drawn at or
 * below "Feet about here" or outside the preview, and a label the top controls cover is hidden rather
 * than drawn under them. The dashed lines stay.
 */
export function hiddenGuideLabels(o: { height: number; toss: [number, number]; feet: [number, number]; coveredTo: number }): { toss: boolean; feet: boolean } {
  const [tTop, tBot] = o.toss
  const [fTop, fBot] = o.feet
  const feet = fTop < o.coveredTo || fBot > o.height
  const toss = tBot > o.height || tTop >= fTop || (!feet && tBot > fTop - 2)
  return { toss, feet }
}
