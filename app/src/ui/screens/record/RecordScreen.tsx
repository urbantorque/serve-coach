import {
  BackpackIcon,
  BookOpenIcon,
  ChartBarIcon,
  FilmReelIcon,
  FilmStripIcon,
  PushPinIcon,
  UsersThreeIcon,
  VideoCameraIcon,
  WaveformIcon,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { setSetting, showToast, useSettingsStore, useUiStore } from '../../../data/index.ts'
import { useActiveExperiment, useProfile, useSession, useSetting } from '../../../data/hooks.ts'
import { Button, Card, ListGroup, ListRow, RowIcon, Screen, SectionLabel, Sheet } from '../../components/index.ts'
import { BodyCheckSheet, ChoiceChips, RadioCards, RearDiagram, Toggle } from '../../components/record/index.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { BEFORE_YOU_GO, DOUBLES_CARD, FILMING_AT_COURTS, HIT_SOUND, PAIN_RULE, REAR_VIEW } from './flow/copy.ts'
import { FPS_OPTIONS, PLANS, RETEST_PLAN, useRecordFlow, type FpsChoice, type PlanId } from './flow/flowStore.ts'
import { hasSeen, markSeen } from './flow/seenOnce.ts'
import { bodyCheckForReferral, noteBodyCheck } from '../focus/actions.ts'
import { useFocusStore } from '../focus/focusStore.ts'

type SheetId = 'fps' | 'sound' | 'before' | 'etiquette' | 'rear' | null

function planMeta(serves: number, minutes: string) {
  return `${serves} serves · ${minutes}`
}

/**
 * Record tab root, R1 set-up (DESIGN §10.3, PRODUCT §6.3.1 to §6.3.2): the session plan, the block
 * card, capture options and the three ways in: set up the camera (primary), the set-up guide and
 * import. "Set up camera" runs the body check every time, then "Filming at the courts" the first
 * time, then the set-up choice.
 */
export function RecordScreen() {
  const navigate = useNavigate()
  const flow = useRecordFlow()
  const profile = useProfile()
  // The player's own experiment only: the sample's never pins a re-test here.
  const experiment = useActiveExperiment({ demo: false })
  const hitSound = useSetting('hitSoundTiming')
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const activeJob = useUiStore((s) => s.activeJob)
  const jobSession = useSession(activeJob?.sessionId)
  const [sheet, setSheet] = useState<SheetId>(null)
  const [bodyCheck, setBodyCheck] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  // A referral raised this session (the body check here) pauses coaching even when not saved (D8).
  const referral = useFocusStore((s) => s.referral)
  const paused = profile?.comfort.painFlag === 1 || Boolean(referral)
  const retestDue = Boolean(experiment) && !paused
  const locked = retestDue && flow.plan === 'retest' && !unlocked

  // The Light chip follows the clock until the player picks it (finding 21: never daylight by default at night).
  useEffect(() => {
    useRecordFlow.getState().syncLightToClock()
  }, [])

  // A due re-test is pinned first and preselected (DESIGN §10.3 R1), matched to the experiment's stratum.
  const pinnedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!retestDue || !experiment || pinnedFor.current === experiment.id) return
    pinnedFor.current = experiment.id
    if (flow.plan !== 'retest' && !unlocked) {
      const k = experiment.stratum
      useRecordFlow.setState((s) => ({
        plan: 'retest',
        block: {
          ...s.block,
          side: k.courtSide === 'unknown' ? s.block.side : k.courtSide,
          serveNumber: k.serveNumber === 'unknown' ? s.block.serveNumber : k.serveNumber,
          type: k.intendedType === 'unknown' ? s.block.type : k.intendedType,
        },
      }))
    }
    // Only once per experiment; later changes are the player's.
  }, [experiment, retestDue, flow.plan, unlocked])

  const plans = useMemo(() => {
    const list = PLANS.map((p) => ({ value: p.id, title: p.title, body: p.line, meta: planMeta(p.serves, p.minutes) }))
    return retestDue ? [{ value: RETEST_PLAN.id, title: RETEST_PLAN.title, body: RETEST_PLAN.line, meta: planMeta(RETEST_PLAN.serves, RETEST_PLAN.minutes) }, ...list] : list
  }, [retestDue])

  const b = flow.block
  const speedNote = experimental && flow.fps >= 120
  const startSetup = () => setBodyCheck(true)
  const afterBodyCheck = () => {
    flow.markBodyChecked()
    setBodyCheck(false)
    if (!hasSeen('filming-etiquette')) setSheet('etiquette')
    else navigate(paths.setupChoice())
  }

  return (
    <Screen
      title="Record"
      variant="root"
      bottomAction={
        <Button icon={VideoCameraIcon} onClick={startSetup}>
          Set up camera
        </Button>
      }
    >
      {activeJob ? (
        <ListGroup label="Analysis in progress">
          <ListRow
            to={paths.processing(activeJob.sessionId)}
            leading={
              <RowIcon>
                <ChartBarIcon size={24} aria-hidden="true" />
              </RowIcon>
            }
            title={`Analysing ${jobSession ? shortDate(jobSession.visitId) : 'your session'}: ${Math.round(activeJob.overall * 100)}%`}
            subtitle={activeJob.label}
          />
        </ListGroup>
      ) : null}

      {paused ? <p className="text-callout text-ink-2">Coaching is paused. Recording is still available if you're comfortable.</p> : null}

      <section className="flex flex-col gap-3" aria-labelledby="plan-label">
        <SectionLabel>
          <span id="plan-label">Session plan</span>
        </SectionLabel>
        <RadioCards label="Session plan" options={plans} value={flow.plan} onChange={(v: PlanId) => flow.setPlan(v)} />
        <ListGroup>
          <ListRow
            onPress={() => setSheet('rear')}
            leading={
              <RowIcon>
                <UsersThreeIcon size={24} aria-hidden="true" />
              </RowIcon>
            }
            title="View from behind"
            subtitle="Optional second angle"
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="block-label">
        <SectionLabel>
          <span id="block-label">This block</span>
        </SectionLabel>
        <Card className="flex flex-col gap-1">
          {locked ? (
            <div className="mb-2 flex items-center gap-2">
              <PushPinIcon size={20} aria-hidden="true" className="shrink-0 text-ink-2" />
              <p className="flex-1 text-footnote text-ink-2">Matched to your experiment</p>
              <Button variant="tertiary" onClick={() => setUnlocked(true)}>
                Change
              </Button>
            </div>
          ) : null}
          {unlocked && retestDue ? (
            <p className="mb-2 text-footnote text-ink-2">Changing these means the comparison will say “Not comparable yet”.</p>
          ) : null}
          <ChoiceChips
            label="Side"
            disabled={locked}
            options={[
              { value: 'deuce', label: 'Deuce' },
              { value: 'ad', label: 'Ad' },
            ]}
            value={b.side}
            onChange={(v) => v && flow.setBlock({ side: v })}
          />
          <ChoiceChips
            label="Serves"
            disabled={locked}
            options={[
              { value: 1 as const, label: 'First' },
              { value: 2 as const, label: 'Second' },
            ]}
            value={b.serveNumber}
            onChange={(v) => v && flow.setBlock({ serveNumber: v })}
          />
          <ChoiceChips
            label="Spot"
            options={[
              { value: 'singles', label: 'Singles' },
              { value: 'doubles', label: 'Doubles' },
            ]}
            value={b.spot}
            onChange={(v) => v && flow.setBlock({ spot: v })}
          />
          {b.spot === 'doubles' ? <p className="pl-16 text-footnote text-ink-2">{DOUBLES_CARD.body}</p> : null}
          <ChoiceChips
            label="Mostly"
            optional
            disabled={locked}
            options={[
              { value: 'flat', label: 'Flat' },
              { value: 'slice', label: 'Slice' },
              { value: 'kick', label: 'Kick' },
              { value: 'mixed', label: 'Mixed' },
            ]}
            value={b.type}
            onChange={(v) => flow.setBlock({ type: v })}
          />
          <ChoiceChips
            label="Aiming"
            optional
            options={[
              { value: 'T', label: 'T' },
              { value: 'body', label: 'Body' },
              { value: 'wide', label: 'Wide' },
              { value: 'mixed', label: 'Mixed' },
            ]}
            value={b.target}
            onChange={(v) => flow.setBlock({ target: v })}
          />
          {speedNote ? <p className="pl-16 text-footnote text-ink-2">For a speed range, pick one target: T, Body or Wide.</p> : null}
          <ChoiceChips
            label="Wind"
            options={[
              { value: 'calm', label: 'Calm' },
              { value: 'breezy', label: 'Breezy' },
              { value: 'windy', label: 'Windy' },
            ]}
            value={b.wind}
            onChange={(v) => v && flow.setBlock({ wind: v })}
          />
          <ChoiceChips
            label="Light"
            options={[
              { value: 'day', label: 'Day' },
              { value: 'lights', label: 'Lights' },
            ]}
            value={b.light}
            onChange={(v) => v && flow.setBlock({ light: v })}
          />
        </Card>
      </section>

      <ListGroup label="Capture options">
        <ListRow
          onPress={() => setSheet('fps')}
          leading={
            <RowIcon>
              <FilmStripIcon size={24} aria-hidden="true" />
            </RowIcon>
          }
          title="Frame rate"
          trailing={flow.fps === 50 ? '25 or 50 fps' : `${flow.fps} fps`}
        />
        <ListRow
          onPress={() => setSheet('sound')}
          leading={
            <RowIcon>
              <WaveformIcon size={24} aria-hidden="true" />
            </RowIcon>
          }
          title="Hit-sound timing"
          trailing={hitSound ? 'On' : 'Off'}
        />
      </ListGroup>

      <ListGroup label="Other ways to start">
        <ListRow
          to={`${paths.setupChoice()}#guide`}
          leading={
            <RowIcon>
              <BookOpenIcon size={24} aria-hidden="true" />
            </RowIcon>
          }
          title="Set-up guide"
          subtitle="Where the phone goes, light and heat"
        />
        <ListRow
          onPress={() => setSheet('before')}
          leading={
            <RowIcon>
              <BackpackIcon size={24} aria-hidden="true" />
            </RowIcon>
          }
          title={BEFORE_YOU_GO.title}
        />
        <ListRow
          to={paths.importVideo()}
          leading={
            <RowIcon>
              <FilmReelIcon size={24} aria-hidden="true" />
            </RowIcon>
          }
          title="Import a video"
          subtitle="A clip you filmed in the Camera app"
        />
      </ListGroup>

      <p className="text-footnote text-ink-3">{PAIN_RULE}</p>

      <BodyCheckSheet
        open={bodyCheck}
        onCancel={() => setBodyCheck(false)}
        onClear={(check) => {
          void noteBodyCheck(check)
          afterBodyCheck()
        }}
        onStop={(level) => {
          void noteBodyCheck(bodyCheckForReferral(level))
          setBodyCheck(false)
          showToast("No recording today. Your stats are safe.")
        }}
      />

      <Sheet open={sheet === 'fps'} onClose={() => setSheet(null)} title="Frame rate" detent="large" closeStyle="done">
        <RadioCards
          label="Frame rate"
          options={FPS_OPTIONS.map((o) => ({ value: String(o.value), title: o.title, body: o.body }))}
          value={String(flow.fps)}
          onChange={(v) => {
            const fps = Number(v) as FpsChoice
            flow.setFps(fps)
            void setSetting('captureDefaults', { orientation: flow.setup === 'fence' ? 'landscape' : 'portrait', countdownS: 10, fps }).catch(() => undefined)
          }}
        />
        <p className="mt-3 text-footnote text-ink-3">
          In the browser this is a request. We read back the rate the camera delivers and show it before you record. For 120 or 240 fps, film in the Camera app and import it.
        </p>
      </Sheet>

      <Sheet open={sheet === 'sound'} onClose={() => setSheet(null)} title={HIT_SOUND.title} closeStyle="done">
        <div className="flex flex-col gap-3">
          <Toggle
            label={HIT_SOUND.toggle}
            checked={hitSound === true}
            onChange={(on) => void setSetting('hitSoundTiming', on).catch(() => undefined)}
          />
          <p className="text-callout text-ink-2">{HIT_SOUND.body}</p>
          <p className="text-footnote text-ink-3">{HIT_SOUND.note}</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'before'} onClose={() => setSheet(null)} title={BEFORE_YOU_GO.title} closeStyle="done">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-callout text-ink">
          {BEFORE_YOU_GO.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Sheet>

      <Sheet
        open={sheet === 'etiquette'}
        onClose={() => setSheet(null)}
        title={FILMING_AT_COURTS.title}
        detent="large"
        footer={
          <Button
            onClick={() => {
              markSeen('filming-etiquette')
              setSheet(null)
              navigate(paths.setupChoice())
            }}
          >
            Continue
          </Button>
        }
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-callout text-ink">
          {FILMING_AT_COURTS.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'rear'} onClose={() => setSheet(null)} title={REAR_VIEW.title} detent="large" closeStyle="done">
        <div className="flex flex-col gap-4">
          <p className="text-callout text-ink">{REAR_VIEW.intro}</p>
          <RearDiagram className="mx-auto max-w-[300px]" />
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-callout text-ink">
            {REAR_VIEW.steps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <p className="text-footnote text-ink-2">{REAR_VIEW.limits}</p>
          <p className="text-footnote text-ink-2">The live framing check is built for the side view. Film the view from behind in the Camera app, then import it and choose “Behind me, raised”.</p>
          <Button variant="secondary" icon={FilmReelIcon} to={paths.importVideo()}>
            Import a video
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
