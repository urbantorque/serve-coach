/** The parts of a File that identify it. Kept structural so it is testable. */
export interface ClipIdentity {
  name: string
  size: number
  lastModified: number
}

/** FNV-1a. Short, stable, and no dependency — this is a cache key, not a digest. */
function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/**
 * A stable id for "this serve, from this clip".
 *
 * Re-analysing the same serve is a *correction*, not a new serve: telling the
 * app it read the wrong hand, or flicking between the serves in one clip to see
 * them. Giving those a fresh id each time files duplicate reports, which then
 * appear as extra points on the trend chart and consume slots in the window the
 * practice advice looks across — so a re-analysis has to overwrite rather than
 * accumulate. Switching to a genuinely different serve in the clip gets its own
 * id, because that is a different serve.
 */
export function sessionKeyFor(clip: ClipIdentity, serveIndex: number): string {
  return `serve-${hash(`${clip.name}|${clip.size}|${clip.lastModified}`)}-${serveIndex}`
}
