/**
 * Settings that change how the whole UI renders (theme, Court-side contrast, the experimental
 * toggle). Dexie `settings` is the source of truth; the theme is also mirrored to localStorage so
 * public/theme-init.js can apply it before first paint (DESIGN §13.3).
 */
import { create } from 'zustand'
import { DEFAULT_SETTINGS, type ThemeSetting } from '../records.ts'
import { getSetting, setSetting } from '../repos/settings.ts'

export const THEME_MIRROR_KEY = 'serve-coach:theme'

function readMirror(): ThemeSetting {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_MIRROR_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeSetting>
      return { ...DEFAULT_SETTINGS.theme, ...parsed }
    }
  } catch {
    // localStorage can be missing or throw (private mode, blocked site data). Defaults apply.
  }
  return DEFAULT_SETTINGS.theme
}

function writeMirror(theme: ThemeSetting): void {
  try {
    globalThis.localStorage?.setItem(THEME_MIRROR_KEY, JSON.stringify(theme))
  } catch {
    // Mirror is a first-paint convenience only.
  }
}

export interface SettingsState {
  theme: ThemeSetting
  experimentalMetrics: boolean
  hydrated: boolean
  setTheme: (patch: Partial<ThemeSetting>) => void
  setExperimentalMetrics: (on: boolean) => void
  /** Loads the stored values from Dexie. Safe to call more than once. */
  hydrate: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: readMirror(),
  experimentalMetrics: DEFAULT_SETTINGS.experimentalMetrics,
  hydrated: false,
  setTheme: (patch) => {
    const theme = { ...get().theme, ...patch }
    set({ theme })
    writeMirror(theme)
    void setSetting('theme', theme).catch(() => undefined)
  },
  setExperimentalMetrics: (on) => {
    set({ experimentalMetrics: on })
    void setSetting('experimentalMetrics', on).catch(() => undefined)
  },
  hydrate: async () => {
    try {
      const [theme, experimentalMetrics] = await Promise.all([getSetting('theme'), getSetting('experimentalMetrics')])
      writeMirror(theme)
      set({ theme, experimentalMetrics, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },
}))
