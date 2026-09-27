import { IconContext } from '@phosphor-icons/react'
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useSettingsStore } from '../../data/stores/settings.ts'
import { resolveTheme, THEME_COLOR, ThemeContext } from './resolveTheme.ts'

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }
}
function readMedia(query: string) {
  return () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
}
const DARK = '(prefers-color-scheme: dark)'
const MORE = '(prefers-contrast: more)'
const subscribeDark = subscribeMedia(DARK)
const subscribeMore = subscribeMedia(MORE)
const readDark = readMedia(DARK)
const readMore = readMedia(MORE)

/**
 * Resolves Day / Night / Court-side from settings and the system (DESIGN §13.3), keeps
 * `data-theme` and `data-contrast` on <html> in sync, updates the theme-color meta tags and sets
 * the Phosphor defaults once for the app: regular weight, 24 px (28 px in Court-side), currentColor.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pref = useSettingsStore((s) => s.theme)
  const hydrate = useSettingsStore((s) => s.hydrate)
  const prefersDark = useSyncExternalStore(subscribeDark, readDark, () => false)
  const prefersMoreContrast = useSyncExternalStore(subscribeMore, readMore, () => false)
  const resolved = useMemo(() => resolveTheme(pref, { prefersDark, prefersMoreContrast }), [pref, prefersDark, prefersMoreContrast])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolved.theme
    if (resolved.courtEverywhere) root.dataset.contrast = 'court'
    else delete root.dataset.contrast
    const colour = resolved.courtEverywhere ? THEME_COLOR.court : THEME_COLOR[resolved.theme]
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', colour)
  }, [resolved])

  const ctx = useMemo(() => ({ ...resolved, courtOnCamera: pref.courtSide !== 'off' }), [resolved, pref.courtSide])
  const icons = useMemo(
    () => ({ weight: 'regular' as const, size: resolved.courtEverywhere ? 28 : 24, color: 'currentColor', mirrored: false }),
    [resolved.courtEverywhere],
  )

  return (
    <ThemeContext.Provider value={ctx}>
      <IconContext.Provider value={icons}>{children}</IconContext.Provider>
    </ThemeContext.Provider>
  )
}
