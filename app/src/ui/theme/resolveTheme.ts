import { createContext } from 'react'
import type { ThemeSetting } from '../../data/records.ts'

export interface ResolvedTheme {
  theme: 'light' | 'dark'
  /** Court-side contrast on the whole app (Always, or prefers-contrast: more with the default choice). */
  courtEverywhere: boolean
}

/** Same rules as public/theme-init.js (DESIGN §13.3). */
export function resolveTheme(pref: ThemeSetting, media: { prefersDark: boolean; prefersMoreContrast: boolean }): ResolvedTheme {
  const theme = pref.scheme === 'dark' || (pref.scheme === 'system' && media.prefersDark) ? 'dark' : 'light'
  const courtEverywhere = pref.courtSide === 'always' || (pref.courtSide === 'camera' && media.prefersMoreContrast)
  return { theme, courtEverywhere }
}

/** Browser chrome colour per set (DESIGN §13.3). */
export const THEME_COLOR = { light: '#f1f3ef', dark: '#0b0f0d', court: '#fcfdfb' } as const

export const ThemeContext = createContext<ResolvedTheme & { courtOnCamera: boolean }>({
  theme: 'light',
  courtEverywhere: false,
  courtOnCamera: true,
})
