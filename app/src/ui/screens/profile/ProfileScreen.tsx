import {
  CaretRightIcon,
  ChalkboardTeacherIcon,
  DatabaseIcon,
  FlaskIcon,
  HeartbeatIcon,
  InfoIcon,
  ListChecksIcon,
  PaletteIcon,
  PlayCircleIcon,
  RulerIcon,
  SealCheckIcon,
  TennisBallIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { loadDemoData, removeDemoData, showToast, useSettingsStore } from '../../../data/index.ts'
import { useHasDemoData, useProfile, useSampleSessionId } from '../../../data/hooks.ts'
import { Badge, IconButton, ListGroup, ListRow, RowIcon, SampleBanner, Screen, SectionLabel } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { usePlan } from '../plan/entitlement.ts'
import { planLabel } from '../plan/planModel.ts'
import { EXPERIMENTAL_SHORT } from './copy.ts'
import { SwitchItem } from './parts/SwitchItem.tsx'
import { profileSummary } from './parts/words.ts'

/**
 * Profile (DESIGN §10.12, PRODUCT §6.13; D10 profile sheet). Settings and trust: your serve, comfort,
 * your coach, storage and privacy, how we measure, the experimental toggle, appearance, plan, sample
 * data and about. In the finished app this is a 92% sheet from Today; here it is a full screen.
 */
export function ProfileScreen() {
  const navigate = useNavigate()
  const profile = useProfile()
  const hasDemo = useHasDemoData()
  const sampleId = useSampleSessionId()
  const plan = usePlan()
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const setExperimental = useSettingsStore((s) => s.setExperimentalMetrics)
  const [loadingSample, setLoadingSample] = useState(false)

  const removeSample = async () => {
    await removeDemoData()
    showToast('Sample data removed.', { label: 'Undo', onPress: () => void loadDemoData() })
  }

  const seeSample = async () => {
    setLoadingSample(true)
    try {
      navigate(paths.sessionReport(await loadDemoData()))
    } catch {
      showToast("We couldn't load the sample. Try again.")
      setLoadingSample(false)
    }
  }

  return (
    <Screen
      title="You"
      leading={<IconButton icon={XIcon} label="Close profile" to={paths.today()} className="-ml-2" />}
      banner={hasDemo ? <SampleBanner onRemove={() => void removeSample()} /> : undefined}
    >
      <Link
        to={paths.yourServe()}
        className="card -mt-1 flex items-start gap-3 p-4 hover:bg-surface-2 active:bg-surface-2"
        aria-label={profile === undefined ? 'Your serve' : `Your serve: ${profileSummary(profile)}`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <TennisBallIcon size={24} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-headline text-ink">Your serve</span>
          <span className="text-footnote text-ink-2">{profile === undefined ? ' ' : profileSummary(profile)}</span>
        </span>
        <CaretRightIcon size={20} aria-hidden="true" className="mt-2.5 shrink-0 text-ink-3" />
      </Link>

      <section className="flex flex-col gap-2" aria-labelledby="profile-coaching">
        <SectionLabel>
          <span id="profile-coaching">Coaching</span>
        </SectionLabel>
        <ListGroup>
          <ListRow
            to={paths.comfort()}
            leading={<RowIcon><HeartbeatIcon size={24} aria-hidden="true" /></RowIcon>}
            title="Comfort and body"
            subtitle={comfortSubtitle(profile)}
          />
          <ListRow
            to={paths.coachFocus()}
            leading={<RowIcon><ChalkboardTeacherIcon size={24} aria-hidden="true" /></RowIcon>}
            title="My coach's focus"
            subtitle={profile?.pinnedFocusItemId ? 'Pinned. Share a session with your coach' : 'Pin a focus, share a session'}
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="profile-data">
        <SectionLabel>
          <span id="profile-data">Data</span>
        </SectionLabel>
        <ListGroup>
          <ListRow
            to={paths.storage()}
            leading={<RowIcon><DatabaseIcon size={24} aria-hidden="true" /></RowIcon>}
            title="Storage and privacy"
            subtitle="Keep or delete videos, export, delete"
          />
          <ListRow
            to={paths.howWeMeasure()}
            leading={<RowIcon><RulerIcon size={24} aria-hidden="true" /></RowIcon>}
            title="How we measure"
            subtitle="Every metric and how sure we are"
          />
          {/* Platform addition: the closed beta's local usage counts and report. */}
          <ListRow
            to={paths.betaData()}
            leading={<RowIcon><ListChecksIcon size={24} aria-hidden="true" /></RowIcon>}
            title="Beta data"
            subtitle="Usage counts on this phone"
          />
          <SwitchItem
            leading={<RowIcon><FlaskIcon size={24} aria-hidden="true" /></RowIcon>}
            label="Experimental metrics"
            description={EXPERIMENTAL_SHORT}
            checked={experimental}
            onChange={(on) => {
              setExperimental(on)
              showToast(on ? 'Experimental metrics on.' : 'Experimental metrics off.')
            }}
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="profile-app">
        <SectionLabel>
          <span id="profile-app">App</span>
        </SectionLabel>
        <ListGroup>
          <ListRow
            to={paths.appearance()}
            leading={<RowIcon><PaletteIcon size={24} aria-hidden="true" /></RowIcon>}
            title="Appearance"
          />
          <ListRow
            to={paths.plan()}
            leading={<RowIcon><SealCheckIcon size={24} aria-hidden="true" /></RowIcon>}
            title={`Plan: ${plan ? planLabel(plan.entitlement) : 'Free'}`}
            trailing={plan?.plus ? <Badge>Plus</Badge> : undefined}
          />
          {hasDemo ? (
            <ListRow
              to={paths.sessionReport(sampleId ?? 'sample-s1')}
              leading={<RowIcon><PlayCircleIcon size={24} aria-hidden="true" /></RowIcon>}
              title="See the sample session"
              subtitle="Sample data · synthetic player"
            />
          ) : (
            <ListRow
              onPress={loadingSample ? undefined : () => void seeSample()}
              leading={<RowIcon><PlayCircleIcon size={24} aria-hidden="true" /></RowIcon>}
              title={loadingSample ? 'Loading the sample…' : 'See a sample session'}
              subtitle="A computer-generated player, clearly labelled"
            />
          )}
          <ListRow
            to={paths.about()}
            leading={<RowIcon><InfoIcon size={24} aria-hidden="true" /></RowIcon>}
            title="About and legal"
          />
        </ListGroup>
      </section>
    </Screen>
  )
}

function comfortSubtitle(p: ReturnType<typeof useProfile>): string {
  if (!p) return 'Areas to go easy on, body checks'
  if (p.comfort.painFlag === 1) return 'Coaching paused after a body check'
  if (p.comfortRegions.length) return `${p.comfortRegions.length === 1 ? '1 area' : `${p.comfortRegions.length} areas`} to go easy on`
  return 'Areas to go easy on, body checks'
}
