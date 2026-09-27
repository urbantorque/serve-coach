import { useSettingsStore } from '../../../data/stores/settings.ts'
import type { ThemeSetting } from '../../../data/records.ts'
import { Screen, SectionLabel, SegmentedControl } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'

/**
 * Appearance (DESIGN §10.12, §13.3): System / Day / Night, and Court-side contrast on camera screens
 * (default), always, or off. Stored in Dexie `settings.theme`, mirrored for first paint.
 */
export function AppearanceScreen() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  return (
    <Screen title="Appearance" back={{ to: paths.profile(), label: 'You' }}>
      <section className="flex flex-col gap-2">
        <SectionLabel>Theme</SectionLabel>
        <SegmentedControl<ThemeSetting['scheme']>
          label="Theme"
          value={theme.scheme}
          onChange={(scheme) => setTheme({ scheme })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Day' },
            { value: 'dark', label: 'Night' },
          ]}
        />
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>Court-side contrast</SectionLabel>
        <SegmentedControl<ThemeSetting['courtSide']>
          label="Court-side contrast"
          value={theme.courtSide}
          onChange={(courtSide) => setTheme({ courtSide })}
          options={[
            { value: 'camera', label: 'Camera' },
            { value: 'always', label: 'Always' },
            { value: 'off', label: 'Off' },
          ]}
        />
        <p className="text-footnote text-ink-2">
          High contrast for bright sun. It is on for the camera screens unless you turn it off.
        </p>
      </section>
    </Screen>
  )
}
