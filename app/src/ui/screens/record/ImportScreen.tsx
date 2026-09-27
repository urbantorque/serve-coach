import { FilmReelIcon, InfoIcon, ShieldCheckIcon, UploadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { lazy, Suspense, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { VideoMeta } from '../../../analysis/types.ts'
import { saveProfile, useSettingsStore } from '../../../data/index.ts'
import { useProfile, useSetting } from '../../../data/hooks.ts'
import { Button, Card, DelayedSkeleton, Screen, SectionLabel, Sheet, Skeleton } from '../../components/index.ts'
import { ChoiceChips, RadioCards, Stepper } from '../../components/record/index.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { IMPORT_HELP, RIGHTS_REMINDER } from './flow/copy.ts'
import {
  fpsLabel,
  fpsOverrideFor,
  heightsNote,
  importGuard,
  MOUNT_OPTIONS,
  mountContext,
  needsSlowMotionQuestion,
  resolutionLabel,
  slowMotionContext,
  speedTargetNote,
  summariseClip,
  viewFor,
  type CameraAnswer,
  type MountAnswer,
  type SlowMotionAnswer,
  type SlowMotionSpeed,
  type TimeBaseFacts,
} from './flow/importLogic.ts'
import { useRecordFlow } from './flow/flowStore.ts'
import { startAnalysis } from './flow/jobs.ts'
import { hasSeen, markSeen } from './flow/seenOnce.ts'
import { importCapture, playerFacts, saveNewSession, soundNote } from './flow/sessionFactory.ts'

/** Dev only: a picker for the synthetic corpus, compiled out of production builds. */
const DevSyntheticPicker = import.meta.env.DEV ? lazy(() => import('./DevSyntheticPicker.tsx').then((m) => ({ default: m.DevSyntheticPicker }))) : null

type Probed = { status: 'probing' } | { status: 'ready'; meta: VideoMeta; timeBase: TimeBaseFacts | null } | { status: 'error'; message: string }

const CAMERA_OPTIONS: { value: CameraAnswer; title: string; body?: string }[] = [
  { value: 'side-chest', title: 'Side, my hitting-arm side', body: 'The usual set-up. Most of your report comes from this view.' },
  { value: 'side-back', title: 'Side, other side' },
  { value: 'rear', title: 'Behind me, raised', body: 'Analysed as its own view from behind, never mixed with side-view stats.' },
  { value: 'other', title: 'Somewhere else', body: "Only timing is estimated; this angle doesn't show your toss height reliably." },
]

/**
 * Import a video (CAPTURE §11, PRODUCT §6.3.6, DESIGN §10.3): pick a clip, read its size, length and
 * frame rate without decoding, ask only what the file cannot tell (camera position, side, serve,
 * slow motion, target, how the phone was mounted, the serving spot), then analyse on this phone.
 * Imports have no tilt reading: a level mount lets heights stay estimates with a wider range
 * (METRICS §1.1.3a); otherwise heights are experimental.
 */
export function ImportScreen() {
  const navigate = useNavigate()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const profile = useProfile()
  const hitSound = useSetting('hitSoundTiming')
  const retention = useSetting('retention')
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const [file, setFile] = useState<File | null>(null)
  const [probed, setProbed] = useState<Probed | null>(null)
  const [camera, setCamera] = useState<CameraAnswer>('side-chest')
  // Nothing is assumed until the player says the phone was level.
  const [mount, setMount] = useState<MountAnswer>('tilted-or-unsure')
  const [spot, setSpot] = useState<'singles' | 'doubles' | null>(null)
  const [side, setSide] = useState<'deuce' | 'ad' | 'both'>('deuce')
  const [serve, setServe] = useState<1 | 2 | 'mixed'>(1)
  const [target, setTarget] = useState<'T' | 'body' | 'wide' | 'mixed' | null>(null)
  const [type, setType] = useState<'flat' | 'slice' | 'kick' | 'mixed' | null>(null)
  const [slow, setSlow] = useState<SlowMotionAnswer | null>(null)
  const [speed, setSpeed] = useState<SlowMotionSpeed | null>(null)
  // The player's own answers win; until then the profile prefills them.
  const [heightEdit, setHeightCm] = useState<number | null>(null)
  const [handEdit, setHand] = useState<'right' | 'left' | null>(null)
  const heightCm = heightEdit ?? (profile?.heightM ? Math.round(profile.heightM * 100) : null)
  const hand = handEdit ?? profile?.handedness ?? null
  const [help, setHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [firstImport] = useState(() => !hasSeen('import-rights'))


  const pick = async (f: File | null) => {
    setError(null)
    setFile(f)
    setSlow(null)
    setSpeed(null)
    if (!f) {
      setProbed(null)
      return
    }
    setProbed({ status: 'probing' })
    try {
      const { probeVideo } = await import('../../../analysis/video/probe.ts')
      const probe = await probeVideo(f, { fileName: f.name, mimeType: f.type })
      setProbed({ status: 'ready', meta: probe.meta, timeBase: probe.timeBase })
    } catch {
      setProbed({
        status: 'error',
        message: "We couldn't read this video. It may be a format this phone can't open. Choose another video, or export it again from Photos as Most Compatible.",
      })
    }
  }

  const meta = probed?.status === 'ready' ? probed.meta : null
  const tb = probed?.status === 'ready' ? probed.timeBase : null
  const summary = meta ? summariseClip(meta, tb?.device) : null
  const guard = meta && file ? importGuard(meta, file.size) : null
  const askSlow = needsSlowMotionQuestion(tb)
  const view = viewFor(camera)
  const fpsForSpeed = fpsOverrideFor(slow, speed) ?? meta?.captureFps ?? 0
  const speedNote = speedTargetNote({ experimental, captureFps: fpsForSpeed, view: view.view, target })
  const heightMissing = heightCm === null || hand === null
  const sound = soundNote(meta?.hasAudio ?? false)
  const canAnalyse = Boolean(file && meta && !guard && !heightMissing && !(askSlow && slow === null))
  const helper = !file
    ? null
    : guard
      ? guard
      : heightMissing
        ? 'Add your height and serving hand to continue.'
        : askSlow && slow === null
          ? 'Answer the slow-motion question to continue.'
          : null

  const analyse = async () => {
    if (!file || !meta || !canAnalyse || heightCm === null || hand === null) return
    setBusy(true)
    setError(null)
    try {
      if (!profile?.heightM || profile.handedness !== hand || Math.round(profile.heightM * 100) !== heightCm) {
        await saveProfile({ heightM: heightCm / 100, handedness: hand })
      }
      const player = playerFacts({ heightM: heightCm / 100, handedness: hand })
      const answers = {
        view: view.view,
        cameraSide: view.cameraSide,
        side,
        serveNumber: serve,
        type,
        target,
        slowMotionAnswer: askSlow ? slowMotionContext(slow, speed) : undefined,
        hitSoundTiming: hitSound === true,
        mount: mountContext(view.view, mount),
        servingSpot: spot,
      }
      const capture = importCapture(player, answers, meta)
      const block = { side, serveNumber: serve, type, target, servingSpot: spot }
      const startedAt = meta.createdAt ?? new Date().toISOString()
      const { sessionId } = await saveNewSession({
        // The re-test plan picked on Record also applies to an imported clip (it links to the experiment).
        session: { capture, view: view.view, cameraSide: view.cameraSide, mode: view.mode, template: useRecordFlow.getState().plan === 'retest' ? 'retest' : 'import', startedAt, block },
      })
      markSeen('import-rights')
      const viewWords = view.view === 'rear' ? 'View from behind' : view.view === 'side' ? 'Side view' : 'Other view'
      void startAnalysis({
        sessionId,
        file,
        run: { profile: { heightM: player.heightM, handedness: player.handedness }, view: view.view, capture, fpsOverride: fpsOverrideFor(slow, speed), source: 'file-import', hitSoundTiming: hitSound === true },
        clip: {
          title: `${shortDate(new Date(startedAt))}, ${summary?.duration ?? ''}`,
          line: `${viewWords}, ${side === 'both' ? 'both sides' : side}, ${serve === 'mixed' ? 'mixed serves' : serve === 2 ? 'second serves' : 'first serves'}`,
          tech: `${resolutionLabel(meta.width, meta.height)}, ${fpsLabel(fpsOverrideFor(slow, speed) ?? meta.captureFps)}`,
          orientation: meta.height >= meta.width ? 'portrait' : 'landscape',
        },
      })
      navigate(paths.processing(sessionId))
    } catch (e) {
      const quota = (e as { name?: string } | null)?.name === 'QuotaExceededError'
      setError(quota ? 'This phone is out of space, so the video could not be saved. Free up some space and try again.' : "We couldn't start the analysis. Try again.")
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Import a video"
      back={{ to: paths.record(), label: 'Record' }}
      bottomAction={
        file && meta ? (
          <>
            <Button onClick={() => void analyse()} disabled={!canAnalyse} loading={busy} aria-describedby={helper ? `${inputId}-helper` : undefined}>
              Analyse
            </Button>
            {helper ? (
              <p id={`${inputId}-helper`} className="text-footnote text-ink-2">
                {helper}
              </p>
            ) : null}
          </>
        ) : undefined
      }
    >
      <section className="flex flex-col gap-3" aria-label="Choose a video">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          aria-label="Choose a video"
          accept="video/*,.mov,.mp4"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void pick(e.currentTarget.files?.[0] ?? null)}
        />
        {!file ? (
          <Card className="flex flex-col items-start gap-4">
            <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink">
              <FilmReelIcon size={32} aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-title-2 text-balance text-ink">Bring in a clip you filmed</h2>
              <p className="text-callout text-ink-2">
                One block of serves from one side works best. We read its size and frame rate, ask a few questions, and analyse it on this phone. Nothing is uploaded.
              </p>
            </div>
            <Button icon={UploadSimpleIcon} onClick={() => inputRef.current?.click()}>
              Choose a video
            </Button>
            <Button variant="tertiary" onClick={() => setHelp(true)}>
              For slow-motion videos, choose Files. How?
            </Button>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">
                <FilmReelIcon size={24} aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-headline text-ink">{file.name}</p>
                {probed?.status === 'ready' && summary ? (
                  <p className="text-footnote tabular-nums text-ink-2">{summary.line}</p>
                ) : probed?.status === 'probing' ? (
                  <DelayedSkeleton label="Reading the video">
                    <Skeleton variant="text" className="mt-1 w-40" />
                  </DelayedSkeleton>
                ) : null}
              </div>
            </div>
            {probed?.status === 'error' ? (
              <p className="flex items-start gap-2 text-callout text-ink" role="alert">
                <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-attention" />
                {probed.message}
              </p>
            ) : null}
            {guard ? (
              <p className="flex items-start gap-2 text-callout text-ink" role="alert">
                <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-attention" />
                {guard}
              </p>
            ) : null}
            <Button variant="secondary" compact onClick={() => inputRef.current?.click()}>
              Choose another video
            </Button>
          </Card>
        )}
        {DevSyntheticPicker && !file ? (
          <Suspense fallback={null}>
            <DevSyntheticPicker onPick={(f) => void pick(f)} />
          </Suspense>
        ) : null}
      </section>

      {meta ? (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="q-camera">
            <SectionLabel>
              <span id="q-camera">Where was the camera?</span>
            </SectionLabel>
            <RadioCards label="Where was the camera?" options={CAMERA_OPTIONS} value={camera} onChange={setCamera} />
            {view.view === 'rear' ? <p className="text-footnote text-ink-2">{heightsNote(view.view, mount)}</p> : null}
          </section>

          {view.view === 'side' ? (
            <section className="flex flex-col gap-3" aria-labelledby="q-mount">
              <SectionLabel>
                <span id="q-mount">How was the phone mounted?</span>
              </SectionLabel>
              <RadioCards label="How was the phone mounted?" options={MOUNT_OPTIONS} value={mount} onChange={setMount} />
              <p className="text-footnote text-ink-2">{heightsNote(view.view, mount)}</p>
            </section>
          ) : null}

          <section className="flex flex-col gap-3" aria-labelledby="q-serves">
            <SectionLabel>
              <span id="q-serves">The serves in this video</span>
            </SectionLabel>
            <Card className="flex flex-col gap-1">
              <ChoiceChips
                label="Side"
                options={[
                  { value: 'deuce', label: 'Deuce' },
                  { value: 'ad', label: 'Ad' },
                  { value: 'both', label: 'Both' },
                ]}
                value={side}
                onChange={(v) => v && setSide(v)}
              />
              <ChoiceChips
                label="Serves"
                options={[
                  { value: 1 as const, label: 'First' },
                  { value: 2 as const, label: 'Second' },
                  { value: 'mixed' as const, label: 'Mixed' },
                ]}
                value={serve}
                onChange={(v) => v !== null && setServe(v)}
              />
              <ChoiceChips
                label="Spot"
                optional
                options={[
                  { value: 'singles', label: 'Singles' },
                  { value: 'doubles', label: 'Doubles' },
                ]}
                value={spot}
                onChange={setSpot}
              />
              {serve === 'mixed' || side === 'both' ? (
                <p className="pl-16 text-footnote text-ink-2">You'll sort each serve when you tag them after analysis. Stats never mix the two.</p>
              ) : null}
              <ChoiceChips
                label="Mostly"
                optional
                options={[
                  { value: 'flat', label: 'Flat' },
                  { value: 'slice', label: 'Slice' },
                  { value: 'kick', label: 'Kick' },
                  { value: 'mixed', label: 'Mixed' },
                ]}
                value={type}
                onChange={setType}
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
                value={target}
                onChange={setTarget}
              />
              {speedNote ? <p className="pl-16 text-footnote text-ink-2">{speedNote}</p> : null}
            </Card>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="q-fps">
            <SectionLabel>
              <span id="q-fps">Frame rate</span>
            </SectionLabel>
            <Card className="flex flex-col gap-3">
              <p className="text-callout text-ink">
                {fpsLabel(meta.captureFps)}, read from the file{tb?.status === 'proven' ? ' and confirmed by its timestamps' : ''}.
              </p>
              {askSlow ? (
                <>
                  <ChoiceChips
                    stacked
                    label="Was this filmed in slow motion?"
                    options={[
                      { value: 'normal', label: 'No, normal speed' },
                      { value: 'slow', label: 'Yes, slow motion' },
                      { value: 'not-sure', label: 'Not sure' },
                    ]}
                    value={slow}
                    onChange={(v) => {
                      setSlow(v)
                      if (v !== 'slow') setSpeed(null)
                    }}
                  />
                  {slow === 'slow' ? (
                    <ChoiceChips
                      stacked
                      label="Which speed?"
                      options={[
                        { value: 120 as const, label: '120 fps' },
                        { value: 240 as const, label: '240 fps' },
                        { value: 'not-sure' as const, label: 'Not sure' },
                      ]}
                      value={speed}
                      onChange={setSpeed}
                    />
                  ) : null}
                  <p className="text-footnote text-ink-2">
                    We check your answer against how fast the ball falls. Timing from a slowed-down copy is marked as an estimate, and speed needs a proven frame rate.
                  </p>
                </>
              ) : null}
            </Card>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="q-you">
            <SectionLabel>
              <span id="q-you">You</span>
            </SectionLabel>
            <Card className="flex flex-col gap-3">
              <Stepper
                label="Your height (cm)"
                value={heightCm}
                min={140}
                max={210}
                onChange={(v) => setHeightCm(heightCm === null ? 175 : v)}
              />
              <p className="text-footnote text-ink-3">We use it to turn your video into centimetres. It never leaves this phone.</p>
              <ChoiceChips
                stacked
                label="Which hand do you serve with?"
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'left', label: 'Left' },
                ]}
                value={hand}
                onChange={(v) => v && setHand(v)}
              />
            </Card>
          </section>

          <section className="flex flex-col gap-2" aria-label="What we keep">
            <p className="flex items-start gap-2 text-footnote text-ink-2">
              <InfoIcon size={20} aria-hidden="true" className="shrink-0" />
              {sound === 'none'
                ? `We keep a copy on this phone${retention?.policy === 'auto-delete-days' ? ` for ${retention.days} days` : ''}, following your storage setting.`
                : "This video has sound. Stored copies never keep sound, so if it can't be removed we keep only the stats and key frames. Your original is unchanged."}
            </p>
            {firstImport ? (
              <p className="flex items-start gap-2 text-footnote text-ink-2">
                <ShieldCheckIcon size={20} aria-hidden="true" className="shrink-0" />
                {RIGHTS_REMINDER}
              </p>
            ) : null}
            {error ? (
              <p className="flex items-start gap-2 text-callout text-critical" role="alert">
                <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <Sheet open={help} onClose={() => setHelp(false)} title={IMPORT_HELP.title} closeStyle="done">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-callout text-ink">
          {IMPORT_HELP.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Sheet>
    </Screen>
  )
}
