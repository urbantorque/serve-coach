import { FirstAidIcon, HeartbeatIcon, LockSimpleIcon } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { PAUSE_LINE } from '../../../coaching/safety.ts'
import { getSetting, saveProfile, setSetting, showToast } from '../../../data/index.ts'
import { useProfile, useSetting } from '../../../data/hooks.ts'
import type { BodyRegion } from '../../../data/records.ts'
import { Button, Card, DelayedSkeleton, ListGroup, Screen, SectionLabel, Skeleton } from '../../components/index.ts'
import { exportDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { ChoiceList } from './parts/ChoiceList.tsx'
import { inOptionOrder } from './parts/choiceLogic.ts'
import { ConfirmSheet } from './parts/ConfirmSheet.tsx'
import { ReferralSheet } from './parts/ReferralSheet.tsx'
import { SwitchItem } from './parts/SwitchItem.tsx'
import { COMFORT_COPY, REGION_OPTIONS } from './parts/words.ts'

const back = { to: paths.profile(), label: 'You' }

/**
 * Comfort and body (PRODUCT §6.13 item 2, §6.16; COACHING §9.3, §10). Areas to go easy on (they only
 * leave out drills, never raise a priority), consent to keep comfort answers on this phone (APP 3.3),
 * the paused-coaching state after a body check, the referral path, and "Delete comfort notes".
 * Nothing here is ever sent anywhere, exported by default or shown to an AI (D8).
 */
export function ComfortScreen() {
  const id = useId()
  const profile = useProfile()
  const consents = useSetting('consents')
  const [referral, setReferral] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'withdraw' | null>(null)

  if (profile === undefined || consents === undefined) {
    return (
      <Screen title="Comfort and body" back={back}>
        <DelayedSkeleton>
          <Skeleton variant="tile" />
        </DelayedSkeleton>
      </Screen>
    )
  }

  const consented = consents.painNotes?.granted === true
  const regions = profile?.comfortRegions ?? []
  const paused = profile?.comfort.painFlag === 1
  const hasNotes = regions.length > 0 || paused

  const setConsent = async (granted: boolean) => {
    const now = new Date()
    const current = await getSetting('consents')
    await setSetting('consents', {
      ...current,
      painNotes: { granted, version: 'comfort@1', at: now.toISOString(), ...(granted ? {} : { revokedAt: now.toISOString() }) },
    })
  }

  const saveRegions = async (next: BodyRegion[]) => {
    await saveProfile({ comfortRegions: next, comfort: { ...(profile?.comfort ?? { painFlag: 0 }), updatedAt: new Date().toISOString() } })
    showToast('Saved on this phone.')
  }

  const deleteNotes = async () => {
    await saveProfile({ comfortRegions: [], comfort: { painFlag: 0 } })
  }

  return (
    <Screen title="Comfort and body" back={back}>
      {paused ? (
        <Card className="flex flex-col gap-2" label="Coaching paused">
          <div className="flex items-center gap-2 text-critical">
            <FirstAidIcon size={20} aria-hidden="true" />
            <h2 className="text-headline text-ink">{PAUSE_LINE}</h2>
          </div>
          <p className="text-callout text-ink-2">
            {profile?.comfort.updatedAt ? `After your body check on ${exportDate(new Date(profile.comfort.updatedAt))}. ` : ''}
            Coaching comes back when you answer “It's settled” at a later body check. You can still record and review your serves.
          </p>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby={`${id}-keep`}>
        <SectionLabel>
          <span id={`${id}-keep`}>On this phone</span>
        </SectionLabel>
        <ListGroup>
          <SwitchItem
            label="Save comfort answers on this phone"
            description="Areas to go easy on and body-check answers. They never leave this phone."
            checked={consented}
            onChange={(on) => {
              if (on) void setConsent(true).then(() => showToast('Comfort answers will be saved on this phone.'))
              else if (hasNotes) setConfirm('withdraw')
              else void setConsent(false).then(() => showToast('Comfort answers will not be saved.'))
            }}
          />
        </ListGroup>
        <p className="text-footnote text-ink-2">{COMFORT_COPY.profileLine}</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-areas`}>
        <SectionLabel>
          <span id={`${id}-areas`}>Areas to go easy on</span>
        </SectionLabel>
        {consented ? (
          <ChoiceList
            labelledBy={`${id}-areas`}
            mode="multi"
            size="compact"
            options={REGION_OPTIONS}
            value={regions}
            onChange={(next) => void saveRegions(inOptionOrder(next, REGION_OPTIONS))}
          />
        ) : (
          <p className="flex items-start gap-2 rounded-card bg-surface-2 p-4 text-callout text-ink-2">
            <LockSimpleIcon size={20} aria-hidden="true" className="mt-px shrink-0" />
            Turn on “Save comfort answers on this phone” to keep areas to go easy on. Without it, the body check still works for each session.
          </p>
        )}
        <p className="text-footnote text-ink-2">{COMFORT_COPY.lineDrills}</p>
        <p className="text-footnote text-ink-2">{COMFORT_COPY.lineGp}</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-hurts`}>
        <SectionLabel>
          <span id={`${id}-hurts`}>If something hurts</span>
        </SectionLabel>
        <p className="text-callout text-ink-2">
          Serve Coach can't assess an injury. If pain is sharp, getting worse, waking you at night or still there from last time, see a GP, physiotherapist or
          sports doctor.
        </p>
        <Button variant="secondary" icon={HeartbeatIcon} onClick={() => setReferral(true)}>
          Something hurts now
        </Button>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-delete`}>
        <SectionLabel>
          <span id={`${id}-delete`}>Delete</span>
        </SectionLabel>
        <Button variant="destructive" disabled={!hasNotes} onClick={() => setConfirm('delete')} aria-describedby={!hasNotes ? `${id}-none` : undefined}>
          Delete comfort notes
        </Button>
        {!hasNotes ? (
          <p id={`${id}-none`} className="-mt-1 text-footnote text-ink-3">
            No comfort notes are stored.
          </p>
        ) : null}
      </section>

      <ReferralSheet open={referral} onClose={() => setReferral(false)} />
      <ConfirmSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'withdraw' ? 'Stop saving comfort answers?' : 'Delete comfort notes?'}
        removes={
          paused
            ? 'Your areas to go easy on and the paused-coaching note from your body check are deleted from this phone.'
            : 'Your areas to go easy on are deleted from this phone.'
        }
        keeps="Your sessions, stats and videos stay. The body check still runs before each recording."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteNotes()
          if (confirm === 'withdraw') await setConsent(false)
          setConfirm(null)
          showToast('Comfort notes deleted.')
        }}
      />
    </Screen>
  )
}
