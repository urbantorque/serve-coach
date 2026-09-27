import { BackpackIcon, CaretDownIcon, CaretLeftIcon, CloudSunIcon, EyeIcon, ShieldCheckIcon, StackIcon, ThermometerIcon, type Icon } from '@phosphor-icons/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { setSetting, useSettingsStore } from '../../../data/index.ts'
import { useProfile } from '../../../data/hooks.ts'
import { Button, Card, Screen, SectionLabel } from '../../components/index.ts'
import { PlanDiagram, RadioCards, RearDiagram, SideDiagram } from '../../components/record/index.ts'
import { paths } from '../../shell/paths.ts'
import { CourtSide } from '../../theme/CourtSide.tsx'
import {
  BEFORE_YOU_GO,
  DOUBLES_CARD,
  FENCE_CARD,
  FILMING_AT_COURTS,
  FRAMING_RULE,
  HEAT,
  HOW_MANY,
  LIGHT_TIPS,
  REAR_VIEW,
  SIX_STEPS,
  SPEED_CARD,
} from './flow/copy.ts'
import { useRecordFlow, type SetupChoice } from './flow/flowStore.ts'

/** A collapsible guide section: a 56 px summary row with a caret, native <details> for keyboard and screen readers. */
function Disclosure({ icon: G, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <details className="group card overflow-hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">
          <G size={24} aria-hidden="true" />
        </span>
        <span className="flex-1 text-headline text-ink">{title}</span>
        <CaretDownIcon size={20} aria-hidden="true" className="shrink-0 text-ink-3 transition-transform duration-(--dur-fast) group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  )
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-callout text-ink">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  )
}

/**
 * R2 set-up choice and the set-up guide (DESIGN §10.3 R2, CAPTURE §2 to §7, PRODUCT §6.3.4). One
 * question first: where the phone goes, upright beside the court (default, preselected) or sideways
 * at the fence. The guide below it has the six steps, to-scale diagrams, the framing rule, light,
 * heat, how many serves and what a view from behind adds. Court-side contrast: this is read outdoors.
 */
export function SetupChoiceScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const setup = useRecordFlow((s) => s.setup)
  const setSetup = useRecordFlow((s) => s.setSetup)
  const fps = useRecordFlow((s) => s.fps)
  const spot = useRecordFlow((s) => s.block.spot)
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const profile = useProfile()
  const hand = profile?.handedness ?? 'right'
  const guideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (location.hash === '#guide') guideRef.current?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const choose = (value: SetupChoice) => {
    setSetup(value)
    void setSetting('captureDefaults', { orientation: value === 'fence' ? 'landscape' : 'portrait', countdownS: 10, fps }).catch(() => undefined)
  }
  const variant = setup === 'fence' ? 'fence' : 'portrait'

  return (
    <CourtSide className="min-h-[100dvh] bg-bg">
      <Screen
        title="Where will your phone go?"
        variant="root"
        leading={
          <Link
            to={paths.record()}
            aria-label="Back to Record"
            className="-ml-2 inline-flex h-11 min-w-11 items-center gap-0.5 rounded-control pr-2 text-subhead text-ink active:bg-surface-2"
          >
            <CaretLeftIcon aria-hidden="true" />
            <span>Record</span>
          </Link>
        }
        bottomAction={<Button onClick={() => navigate(paths.liveFraming())}>Continue</Button>}
      >
        <section className="flex flex-col gap-3" aria-label="Set-up">
          <RadioCards
            label="Where will your phone go?"
            value={setup}
            onChange={choose}
            options={[
              {
                value: 'portrait',
                title: 'Upright beside the court',
                pill: 'Recommended',
                media: <PlanDiagram variant="portrait" size="mini" handedness={hand} className="max-w-[240px]" />,
                body: "7 to 8 m from the centre mark, between courts or just outside the doubles alley. Phone 1.3 to 1.6 m high, level. We'll check the picture is tall enough.",
              },
              {
                value: 'fence',
                title: 'Sideways at the fence',
                media: <PlanDiagram variant="fence" size="mini" handedness={hand} className="max-w-[240px]" />,
                body: "8.5 to 9.5 m from the centre mark, at the side fence. Phone 1.4 to 1.8 m high. Use 4K if you can. We'll check the picture is tall enough.",
              },
            ]}
          />
          <p className="text-footnote text-ink-2">Either way: on your hitting-arm side, 1x lens, lens pointing along the baseline at you.</p>
        </section>

        <section ref={guideRef} id="guide" className="flex scroll-mt-16 flex-col gap-4" aria-labelledby="guide-title">
          <SectionLabel>
            <span id="guide-title">Set up your phone</span>
          </SectionLabel>
          <Card className="flex flex-col gap-4">
            <PlanDiagram variant={variant} handedness={hand} />
            <ol className="flex flex-col gap-4">
              {SIX_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-footnote font-strong tabular-nums text-ink">
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-headline text-ink">{step.title}</span>
                    <span className="text-callout text-ink-2">{i === 3 && variant === 'fence' ? FENCE_CARD.body : step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="flex flex-col gap-3">
            <h3 className="text-headline text-ink">{FRAMING_RULE.title}</h3>
            <SideDiagram variant={variant} />
            <p className="text-callout text-ink-2">{FRAMING_RULE.body}</p>
          </Card>

          {variant === 'portrait' ? (
            <Card className="flex flex-col gap-1">
              <h3 className="text-headline text-ink">{FENCE_CARD.title}</h3>
              <p className="text-callout text-ink-2">{FENCE_CARD.body}</p>
            </Card>
          ) : null}
          {spot === 'doubles' ? (
            <Card className="flex flex-col gap-1">
              <h3 className="text-headline text-ink">{DOUBLES_CARD.title}</h3>
              <p className="text-callout text-ink-2">{DOUBLES_CARD.body}</p>
            </Card>
          ) : null}
          {experimental ? (
            <Card className="flex flex-col gap-1">
              <h3 className="text-headline text-ink">{SPEED_CARD.title}</h3>
              <p className="text-callout text-ink-2">{SPEED_CARD.body}</p>
            </Card>
          ) : null}

          <div className="flex flex-col gap-2">
            <Disclosure icon={CloudSunIcon} title={LIGHT_TIPS.title}>
              <dl className="flex flex-col gap-3">
                {LIGHT_TIPS.items.map((t) => (
                  <div key={t.title} className="flex flex-col gap-0.5">
                    <dt className="text-subhead text-ink">{t.title}</dt>
                    <dd className="text-callout text-ink-2">{t.body}</dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
            <Disclosure icon={ThermometerIcon} title={HEAT.title}>
              <p className="text-callout text-ink">{HEAT.intro}</p>
              <Bullets items={HEAT.items} />
              <p className="text-callout text-ink-2">{HEAT.outro}</p>
            </Disclosure>
            <Disclosure icon={StackIcon} title={HOW_MANY.title}>
              <p className="text-callout text-ink">{HOW_MANY.lead}</p>
              <Bullets items={HOW_MANY.items} />
            </Disclosure>
            <Disclosure icon={EyeIcon} title="What a second angle adds">
              <p className="text-callout text-ink">{REAR_VIEW.intro}</p>
              <RearDiagram className="mx-auto max-w-[280px]" />
              <Bullets items={REAR_VIEW.unlocks} />
              <p className="text-callout text-ink-2">{REAR_VIEW.limits}</p>
            </Disclosure>
            <Disclosure icon={BackpackIcon} title={BEFORE_YOU_GO.title}>
              <Bullets items={BEFORE_YOU_GO.items} />
            </Disclosure>
            <Disclosure icon={ShieldCheckIcon} title={FILMING_AT_COURTS.title}>
              <Bullets items={FILMING_AT_COURTS.items} />
            </Disclosure>
          </div>
        </section>
      </Screen>
    </CourtSide>
  )
}
