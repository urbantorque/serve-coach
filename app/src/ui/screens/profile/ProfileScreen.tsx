import { XIcon } from '@phosphor-icons/react'
import { loadDemoData, removeDemoData } from '../../../data/demo.ts'
import { useHasDemoData } from '../../../data/hooks.ts'
import { showToast } from '../../../data/stores/toast.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { Badge, IconButton, ListGroup, ListRow, Screen, SectionLabel } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'

/**
 * Profile (DESIGN §10.12, PRODUCT §6.13). A 92% sheet with its own stack in the finished app; here a
 * full screen with every section reachable. STUB: section list; "Sample data: Remove" works.
 */
export function ProfileScreen() {
  const hasDemo = useHasDemoData()
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const setExperimental = useSettingsStore((s) => s.setExperimentalMetrics)
  return (
    <Screen title="You" leading={<IconButton icon={XIcon} label="Close profile" to={paths.today()} />}>
      <section className="flex flex-col gap-2">
        <SectionLabel>Coaching</SectionLabel>
        <ListGroup>
          <ListRow to={paths.yourServe()} title="Your serve" subtitle="Height, hand, level, goal, comp nights" />
          <ListRow to={paths.comfort()} title="Comfort and body" />
          <ListRow to={paths.coachFocus()} title="My coach's focus" />
        </ListGroup>
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>Data</SectionLabel>
        <ListGroup>
          <ListRow to={paths.storage()} title="Storage and privacy" />
          <ListRow to={paths.howWeMeasure()} title="How we measure" />
          <ListRow
            title="Experimental metrics"
            subtitle="Not yet checked against a radar or measured marks"
            trailing={<span className="text-ink">{experimental ? 'On' : 'Off'}</span>}
            onPress={() => setExperimental(!experimental)}
            chevron={false}
          />
        </ListGroup>
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>App</SectionLabel>
        <ListGroup>
          <ListRow to={paths.appearance()} title="Appearance" />
          <ListRow to={paths.plan()} title="Plan: Free" trailing={<Badge>Plus</Badge>} />
          {hasDemo ? (
            <ListRow
              title="Sample data"
              trailing={<span className="text-ink underline underline-offset-[3px]">Remove</span>}
              chevron={false}
              onPress={async () => {
                await removeDemoData()
                showToast('Sample data removed.', { label: 'Undo', onPress: () => void loadDemoData() })
              }}
            />
          ) : null}
          <ListRow to={paths.about()} title="About and legal" />
        </ListGroup>
      </section>
    </Screen>
  )
}
