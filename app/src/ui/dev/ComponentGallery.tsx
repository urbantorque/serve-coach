import {
  ExportIcon,
  FilmReelIcon,
  ListBulletsIcon,
  NotePencilIcon,
  PlayIcon,
  TargetIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import type { MetricId, MetricStatus } from '../../analysis/types.ts'
import { DEMO_FIXTURES } from '../../data/fixtures.ts'
import type { ThemeSetting } from '../../data/records.ts'
import { useSettingsStore } from '../../data/stores/settings.ts'
import { showToast } from '../../data/stores/toast.ts'
import {
  Badge,
  Button,
  CaptureQualityLine,
  Card,
  EmptyState,
  EvidenceTierChip,
  IconButton,
  ListGroup,
  ListRow,
  MetricGrid,
  MetricTile,
  MetricValue,
  OutcomeMark,
  ProfileButton,
  ProgressStages,
  RowIcon,
  SampleBanner,
  Screen,
  SectionLabel,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusChip,
  StatusGlyph,
  UnavailableRow,
  VerdictChip,
} from '../components/index.ts'
import { OUTCOME_WORDS, STATUS_LABEL, type OutcomeMarkKind, type VerdictDisplayId } from '../copy/strings.ts'
import { paths } from '../shell/paths.ts'
import { FontCheck } from './FontCheck.tsx'

const STATUSES: MetricStatus[] = ['measured', 'estimated', 'player-entered', 'experimental', 'unavailable']
const VERDICTS: VerdictDisplayId[] = [
  'clearly-better', 'likely-better', 'about-the-same', 'too-early', 'likely-worse', 'clearly-worse', 'not-comparable', 'trend-too-early',
]
const OUTCOMES: OutcomeMarkKind[] = ['in', 'net', 'long', 'wide', 'fault', 'untagged']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-title-2 text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-8 shrink-0 rounded-media border border-line" style={{ background: `var(--${name})` }} aria-hidden="true" />
      <span className="text-footnote text-ink-2">--{name}</span>
    </div>
  )
}

const s1 = DEMO_FIXTURES.sessions[0].stats.metrics
const s2 = DEMO_FIXTURES.sessions[1].stats.metrics
const s3 = DEMO_FIXTURES.sessions[2].stats.metrics
const pick = (m: typeof s1, id: MetricId) => m[id] ?? { id, value: null, unit: '', status: 'unavailable' as const, confidence: 0, basis: '' }

/**
 * Component gallery (/dev/components): every base component in its states, in the current theme.
 * Numbers come from the demo fixtures (a synthetic player), so the sample banner shows.
 */
export function ComponentGallery() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [view, setView] = useState<'side' | 'ghost'>('side')

  return (
    <Screen title="Components" back={{ to: paths.today(), label: 'Today' }} trailing={<ProfileButton />} banner={<SampleBanner />}>
      <Section title="Theme">
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
        <FontCheck />
      </Section>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-2">
          {['bg', 'surface', 'surface-2', 'ink', 'ink-2', 'ink-3', 'line-strong', 'optic', 'good', 'bad', 'neutral', 'attention', 'critical', 'band'].map((n) => (
            <Swatch key={n} name={n} />
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="text-display text-ink">Display 32</p>
          <p className="text-title-1 text-ink">Title 1, 24</p>
          <p className="text-title-2 text-ink">Title 2, 20</p>
          <p className="text-headline text-ink">Headline, 16</p>
          <p className="text-body text-ink">Body, 16. Film a few serves and see what your toss is doing.</p>
          <p className="text-callout text-ink-2">Callout, 15. When the toss peaks at a different height, your swing re-times itself.</p>
          <p className="text-footnote text-ink-3">Footnote, 13. 12 of 14 serves</p>
          <p className="text-caption text-ink-3">Caption, 12</p>
          <p className="text-metric font-wide text-ink">0.92</p>
          <p className="text-cue text-ink">“Lift it like an elevator.”</p>
        </div>
      </Section>

      <Section title="Buttons">
        <Button icon={PlayIcon} onClick={() => showToast('Primary pressed')}>
          Start drill
        </Button>
        <Button variant="secondary" icon={NotePencilIcon}>
          Log practice
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" compact>
            Record
          </Button>
          <Button variant="secondary" compact disabled>
            Continue
          </Button>
        </div>
        <Button variant="secondary" loading>
          Save log
        </Button>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="tertiary">Why this focus?</Button>
          <Button variant="tertiary" to={paths.howWeMeasure()}>
            How we measure
          </Button>
        </div>
        <Button variant="destructive">Delete session</Button>
        <Button variant="critical">Call 000</Button>
        <div className="flex items-center gap-2">
          <IconButton icon={ExportIcon} label="Export" />
          <IconButton icon={FilmReelIcon} label="Import a video" variant="filled" />
          <ProfileButton />
        </div>
      </Section>

      <Section title="Data states">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {STATUSES.map((s) => (
            <StatusChip key={s} status={s} compact />
          ))}
          <span className="text-footnote text-ink-3">Compact, with this legend:</span>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-ink-2">
          {STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-1">
              <StatusGlyph status={s} /> {STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <StatusChip status="estimated" onOpenInfo={() => showToast('Opens Metric info at How sure we are')} />
          <Badge>Early read</Badge>
          <Badge>Plus</Badge>
        </div>
      </Section>

      <Section title="Evidence tiers">
        <div className="flex flex-wrap gap-2">
          <EvidenceTierChip tier="research-backed" />
          <EvidenceTierChip tier="coach-recommended" />
          <EvidenceTierChip tier="experimental" />
        </div>
      </Section>

      <Section title="Verdicts">
        <VerdictChip verdict="likely-better" size="large" />
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((v) => (
            <VerdictChip key={v} verdict={v} />
          ))}
        </div>
      </Section>

      <Section title="Metric values">
        <Card className="flex flex-col gap-3">
          <MetricValue metricId="toss-height-spread" value={pick(s1, 'toss-height-spread')} detail />
          <MetricValue metricId="contact-height-ratio" value={pick(s3, 'contact-height-ratio')} detail />
          <MetricValue metricId="first-serve-in-rate" value={pick(s3, 'first-serve-in-rate')} detail />
          <MetricValue metricId="speed-experimental" value={pick(s3, 'speed-experimental')} detail />
          <MetricValue metricId="shoulder-tilt-trophy" value={pick(s1, 'shoulder-tilt-trophy')} />
          <MetricValue metricId="deep-bend-flag" value={pick(s1, 'deep-bend-flag')} />
          <MetricValue metricId="speed-experimental" value={pick(s1, 'speed-experimental')} />
        </Card>
        <MetricValue metricId="rhythm-release-to-contact" value={pick(s3, 'rhythm-release-to-contact')} size="hero" />
      </Section>

      <Section title="Metric tiles">
        <MetricGrid>
          <MetricTile metricId="rhythm-release-to-contact" value={pick(s3, 'rhythm-release-to-contact')} usual="0.90 to 0.98 s" to={paths.metricInfo('rhythm-release-to-contact')} />
          <MetricTile metricId="contact-height-ratio" value={pick(s3, 'contact-height-ratio')} to={paths.metricInfo('contact-height-ratio')} />
          <MetricTile metricId="toss-height-spread" value={pick(s1, 'toss-height-spread')} to={paths.metricInfo('toss-height-spread')} />
          <MetricTile metricId="first-serve-in-rate" value={pick(s3, 'first-serve-in-rate')} to={paths.metricInfo('first-serve-in-rate')} />
          <MetricTile metricId="leg-drive" value={pick(s3, 'leg-drive')} to={paths.metricInfo('leg-drive')} />
          <MetricTile metricId="knee-bend-band" value={pick(s2, 'knee-bend-band')} to={paths.metricInfo('knee-bend-band')} />
        </MetricGrid>
        <SectionLabel>Not available from this session</SectionLabel>
        <ListGroup>
          <UnavailableRow metricId="knee-bend-band" reasonCode="NEEDS_REAR_VIEW" to={paths.metricInfo('knee-bend-band')} />
          <UnavailableRow metricId="speed-experimental" reasonCode="FPS_TOO_LOW" to={paths.metricInfo('speed-experimental')} />
          <UnavailableRow metricId="spin" reasonCode="NOT_MEASURABLE" to={paths.metricInfo('spin')} />
        </ListGroup>
      </Section>

      <Section title="Capture quality">
        <CaptureQualityLine overall="good" measured={20} detected={22} />
        <CaptureQualityLine overall="usable" measured={11} detected={12} tip="raise the phone a little" onOpen={() => showToast('Opens capture detail')} />
        <CaptureQualityLine overall="poor" measured={6} detected={16} onOpen={() => showToast('Opens capture detail')} />
      </Section>

      <Section title="Serve marks">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {OUTCOMES.map((o) => (
            <li key={o} className="flex items-center gap-1.5 text-footnote text-ink-2">
              <OutcomeMark outcome={o} size={12} /> {OUTCOME_WORDS[o]}
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-footnote text-ink-2">
            <OutcomeMark outcome="in" size={12} hollow /> You logged
          </li>
          <li className="flex items-center gap-1.5 text-footnote text-ink-2">
            <OutcomeMark outcome="in" size={12} experimental /> Experimental
          </li>
        </ul>
      </Section>

      <Section title="Controls">
        <SegmentedControl<'side' | 'ghost'>
          label="Compare view"
          value={view}
          onChange={setView}
          options={[
            { value: 'side', label: 'Side by side' },
            { value: 'ghost', label: 'Ghost' },
          ]}
        />
        <ListGroup label="Example rows">
          <ListRow
            to={paths.sessions()}
            leading={
              <RowIcon>
                <TargetIcon size={24} aria-hidden="true" />
              </RowIcon>
            }
            title="Sat 26 Sep"
            subtitle="Side view · 22 serves"
            detail="Your toss height was steadier than on 12 Sep."
          />
          <ListRow title="Experimental metrics" trailing="Off" onPress={() => showToast('Toggles the setting')} chevron={false} />
          <ListRow to={paths.storage()} title="Storage and privacy" />
        </ListGroup>
      </Section>

      <Section title="Sheets and toasts">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open sheet
        </Button>
        <Button variant="secondary" onClick={() => showToast('Serve deleted.', { label: 'Undo', onPress: () => showToast('Serve restored') })}>
          Show toast
        </Button>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Quick body check"
          footer={
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              All good
            </Button>
          }
        >
          <p className="text-body text-ink-2">How's your body today?</p>
        </Sheet>
      </Section>

      <Section title="Processing">
        <p className="text-footnote text-ink-3">Example states, not a running analysis.</p>
        <ProgressStages
          overall={0.64}
          eta="About 1 minute left"
          stages={[
            { id: 'a', label: 'Finding serves', state: 'done', detail: '14 found' },
            { id: 'b', label: 'Tracking the toss', state: 'active', fraction: 0.5, detail: 'serve 7 of 14' },
            { id: 'c', label: 'Timing each phase', state: 'waiting' },
            { id: 'd', label: 'Choosing your focus', state: 'waiting' },
          ]}
        />
      </Section>

      <Section title="Empty and loading">
        <Card>
          <EmptyState
            icon={VideoCameraIcon}
            title="Record your first serves"
            body="15 serves from one side, about 10 minutes. We'll find one thing to work on."
            action={<Button variant="secondary">Set up camera</Button>}
          />
        </Card>
        <EmptyState icon={ListBulletsIcon} title="No sessions yet" body="Your sessions will appear here after your first recording." />
        <div className="grid grid-cols-2 gap-3" aria-hidden="true">
          <Skeleton variant="tile" />
          <Skeleton variant="tile" />
          <Skeleton variant="text" className="col-span-2 w-2/3" />
          <Skeleton variant="row" className="col-span-2" />
        </div>
      </Section>
    </Screen>
  )
}
