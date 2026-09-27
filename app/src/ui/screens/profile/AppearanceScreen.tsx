import { useSettingsStore } from '../../../data/stores/settings.ts'
import type { ThemeSetting } from '../../../data/records.ts'
import { Screen, SectionLabel, SegmentedControl } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { ChoiceList } from './parts/ChoiceList.tsx'

/**
 * Appearance (DESIGN §10.12, §13.3): System / Day / Night, and Court-side contrast on camera screens
 * (default), always, or off. Stored in Dexie `settings.theme`, mirrored for first paint.
 */
export function AppearanceScreen() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  return (
    <Screen title="Appearance" back={{ to: paths.profile(), label: 'You' }}>
      <section className="flex flex-col gap-2" aria-labelledby="appearance-theme">
        <SectionLabel>
          <span id="appearance-theme">Theme</span>
        </SectionLabel>
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
        <p className="text-footnote text-ink-2">System follows your phone's light or dark setting.</p>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="appearance-court">
        <SectionLabel>
          <span id="appearance-court">Court-side contrast</span>
        </SectionLabel>
        <p className="-mt-1 text-footnote text-ink-2">High contrast, thicker edges and larger icons for bright sun.</p>
        <ChoiceList<ThemeSetting['courtSide']>
          labelledBy="appearance-court"
          mode="single"
          size="compact"
          options={[
            { value: 'camera', label: 'On camera screens', detail: 'Default' },
            { value: 'always', label: 'Always' },
            { value: 'off', label: 'Off' },
          ]}
          value={[theme.courtSide]}
          onChange={([courtSide]) => setTheme({ courtSide })}
        />
      </section>
    </Screen>
  )
}
