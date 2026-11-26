/*
 * Where an `Icon` finds its path (E0.3). The glyphs the first screen draws are
 * in `icons.ts`, on the entry chunk; the rest are in `iconsMore.ts`, fetched
 * once. `App` asks for them when the first screen has painted; an `Icon` that
 * needs one sooner asks too, keeps its box, and fills in when they land.
 */
import { GLYPHS, type IconName } from './icons'

let more: Readonly<Record<string, string>> | undefined
let loading: Promise<void> | undefined
const waiting = new Set<() => void>()

export function loadMoreGlyphs(): Promise<void> {
  loading ??= import('./iconsMore').then((m) => {
    more = m.MORE_GLYPHS
    for (const done of waiting) done()
    waiting.clear()
  })
  return loading
}

/** The glyph's path, or undefined while it is still on its way. */
export function glyphPath(name: IconName): string | undefined {
  return (GLYPHS as Readonly<Record<string, string>>)[name] ?? more?.[name]
}

/** Calls `done` once the later glyphs have landed, fetching them if need be; returns a cancel. */
export function whenGlyphs(done: () => void): () => void {
  if (more) return () => {}
  waiting.add(done)
  void loadMoreGlyphs()
  return () => {
    waiting.delete(done)
  }
}
