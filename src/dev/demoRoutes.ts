/**
 * The dev-only `?demo` routes, out of `App.tsx`.
 *
 * They were a 150-line branch inside the app's mount effect: every screen the
 * app has that is otherwise unreachable without filming something — a basket,
 * the glance and its four carry-forward verdicts, a refused clip, a seeded
 * season of history. Worth keeping, and nothing to do with how the app runs,
 * so they live here and `App.tsx` hands over the four things they touch.
 * Dynamically imported from a branch guarded on `import.meta.env.DEV`, so none
 * of it reaches the production bundle.
 */
import type { ServeTag } from '../lib/storage/db'
import type { View } from '../App'
import { bandsFor, keyframeOverlay } from '../lib/analysis/analyze'
import type { FaultMove } from '../lib/analysis/carryForward'
import { buildConsistency, pairStills, type ServePairFrames } from '../lib/analysis/consistency'
import { checkDrill, progressionFor } from '../lib/analysis/progressions'
import type { FlawId } from '../lib/analysis/flaws'
import type { Analysis } from '../lib/analysis/types'
import type { PracticeLog, Session } from '../lib/storage/db'
import type { PracticeSession } from '../lib/session/session'
import { SCORING_VERSION } from '../lib/analysis/types'
import type { ServeDials } from '../lib/analysis/syntheticServe'
import { DEMO_DIALS, fitToClip, sampleAnalysis, sampleBasket, sampleClip, sampleHistory } from './sampleAnalysis'

export interface DemoContext {
  setView: (view: View) => void
  setPair: (pair: ServePairFrames | undefined) => void
  /** Hold a seeded history in place of storage — see `demoHistory` in `App.tsx`. */
  seedHistory: (history: { sessions: Session[]; practice: PracticeLog[]; tags?: ServeTag[]; practiceSessions?: PracticeSession[] }) => void
  /** The object URL of a generated clip, so `App.tsx` can release it with the rest. */
  keepVideoUrl: (url: string) => void
  /** The drill a guided set is checking (C1.1), as "Film a check" sets it. */
  setCheckTarget: (target: { flaw: FlawId; drill: string }) => void
}

/**
 * A stand-in keyframe still, for `?demo=basket` only.
 *
 * The synthetic rig has no camera and therefore no pictures, so the paired strip
 * would be the one part of a basket report the demo route could not show — and
 * showing the UI without filming anything is the entire reason that route
 * exists. Labelled and the right aspect, so the layout it produces is the real
 * layout; obviously not a body, so nobody mistakes it for one.
 */
function placeholderStill(label: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 150
  canvas.height = 200
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#151a24'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#232a38'
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
  ctx.fillStyle = '#7b8799'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  return canvas.toDataURL('image/png')
}

/**
 * The rig's keyframes, drawn exactly as the analysis draws its stills, on a
 * dark tile standing in for the video the rig does not have
 * (`?demo=report&stills`, D4.6). The body, the arcs and the evidence are the
 * real overlay; only the footage under them is missing.
 */
function rigStills(a: Analysis): void {
  if (!a.frames?.length || !a.scale) return
  const draw = keyframeOverlay({
    frames: a.frames,
    ball: undefined,
    phases: a.phases,
    aspect: 1,
    racket: a.handedness,
    bodyHeight: a.scale.bodyHeight,
    bands: bandsFor(a.fundamentals),
    evidence: {
      metrics: a.fundamentals.flatMap((f) => f.metrics),
      scale: a.scale,
      rolled: false,
      tossPlacement: a.diagnosis?.tossPlacement,
    },
  })
  a.phases.forEach((p, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 400
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#12202a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    draw(ctx, i, { w: canvas.width, h: canvas.height })
    p.thumbnail = canvas.toDataURL('image/jpeg', 0.85)
  })
}

export async function runDemoRoute(
  demo: string,
  { setView, setPair, seedHistory, keepVideoUrl, setCheckTarget }: DemoContext,
): Promise<void> {
  /*
   * A season of practice, on the home screen, going nowhere else.
   *
   * Handled before `sampleAnalysis` is called at all, because this route
   * is not about a report: it seeds the history and then leaves the app
   * exactly where it starts, so the screens that only exist across many
   * serves — the form card, "Every serve so far", the trend, the
   * repeatability chart, "Then, and now", the records, the practice card
   * — can be opened by hand. See `sampleHistory` for what is in it and
   * which branch each part is there to reach.
   */
  if (demo === 'history') {
    seedHistory(sampleHistory())
    return
  }
  /*
   * The loop closed (C1.4): the season of practice, with the latest serve's
   * drill marked done just before it was filmed, opened on that serve's report.
   */
  if (demo === 'loop') {
    const history = sampleHistory()
    const byTime = [...history.sessions].sort((a, b) => b.createdAt - a.createdAt)
    const [latest, previous] = byTime
    const drill = progressionFor('toss_arm_drops')!.steps[0].name
    const doneAt = previous.createdAt + (latest.createdAt - previous.createdAt) / 2
    seedHistory({ ...history, practice: [...history.practice, { id: 'loop-log', metricId: 'tossArmHold', drill, assignedAt: previous.createdAt, doneAt }] })
    setView({ kind: 'saved', session: latest })
    return
  }
  /*
   * A guided set (C1.1), on the glance after its latest serve: `?demo=guided`
   * is four serves in with that one still showing the racket drop, and
   * `?demo=guided-done` is six in and passed, where the loop back to the
   * camera stops. The serves are the sample serve with the drop's verdict set
   * by hand, three minutes apart, so they are one trip. Turn hands-free on to
   * see the court layout; what is said is logged by a fake voice in the
   * scripted run.
   */
  if (demo === 'guided' || demo === 'guided-done') {
    const flaw: FlawId = 'shallow_drop'
    const pattern = demo === 'guided' ? 'cncn' : 'ccnccc'
    const base = sampleAnalysis()
    const now = Date.now()
    const serves = [...pattern].map((p, i) => {
      const finding = { flaw, detected: p === 'n', signal: 's', value: 0.5, unit: 'ratio', miss: p === 'n' ? 0.2 : 0, target: [0.6, 1], target_tier: 4, severity: p === 'n' ? 'medium' : 'none', confidence: 0.9 }
      return {
        ...base,
        id: `guided-${i}`,
        createdAt: now - (pattern.length - 1 - i) * 3 * 60_000,
        diagnosis: { ...base.diagnosis, flaws: [...(base.diagnosis?.flaws ?? []).filter((f) => f.flaw !== flaw), finding] },
      } as unknown as Session
    })
    seedHistory({ sessions: serves, practice: [] })
    setCheckTarget({ flaw, drill: progressionFor(flaw)!.steps.find((s) => s.check.by === 'engine')!.name })
    setView({ kind: 'glance', analysis: serves[serves.length - 1] })
    return
  }
  /*
   * A lesson with the player's own good (C1.3): the sample serve, led by the
   * tossing arm, after one yesterday that the engine judged clean of it. Open
   * "Start the drill" and "Why it matters" to see the line.
   */
  if (demo === 'lesson-own') {
    const flaw: FlawId = 'toss_arm_drops'
    const { frames: _f, ...base } = sampleAnalysis()
    void _f
    const now = Date.now()
    const yesterday = {
      ...base,
      id: 'lesson-own-0',
      createdAt: now - 24 * 60 * 60 * 1000,
      diagnosis: {
        ...base.diagnosis,
        flaws: (base.diagnosis?.flaws ?? []).map((f) => (f.flaw === flaw ? { ...f, detected: false, severity: 'none', confidence: 0.9 } : f)),
      },
    } as unknown as Session
    const today = { ...base, id: 'lesson-own-1', createdAt: now } as unknown as Session
    seedHistory({ sessions: [yesterday, today], practice: [] })
    setView({ kind: 'saved', session: today })
    return
  }
  // The crash screen (L6.8): a stored report with nothing in it, which the
  // report cannot render, so the boundary catches it as it would a record an
  // older version wrote.
  if (demo === 'crash') {
    setView({ kind: 'saved', session: { id: 'broken' } as never })
    return
  }
  // A finished practice session (L2.8): twenty-six serves found, two too
  // unclear, a racket that stays high on most of them and a reach that sags
  // over the last third, set against an earlier session. The rig has no
  // camera, so the stills are labelled stand-ins.
  if (demo === 'session') {
    const [{ lineOf }, { extremes }] = await Promise.all([import('../lib/session/line'), import('../lib/session/stats')])
    const build = (count: number, unclear: number[], dial: (i: number) => Partial<ServeDials>, createdAt: number) => {
      const found = Array.from({ length: count }, (_, i) => 6 + i * 13.5)
      const lines = found.map((t, i) =>
        unclear.includes(i)
          ? { number: i + 1, t, status: 'unclear' as const }
          : lineOf(sampleAnalysis({ seed: 9100 + i, ...dial(i) }), i + 1, t),
      )
      const session: PracticeSession = {
        id: `practice-demo-${createdAt}`,
        createdAt,
        updatedAt: createdAt,
        fileName: 'Tuesday basket.mov',
        duration: 6 + count * 13.5 + 20,
        serveType: 'flat',
        handedness: 'right',
        mode: 'every',
        found,
        // Two swings that were not serves, left out and only counted (W6.13).
        unsure: [found[3] + 6, found[17] + 6],
        chosen: found.map((_, i) => i),
        lines,
        phase: 'done',
        scoringVersion: SCORING_VERSION,
      }
      const { best, worst } = extremes(lines)
      session.stills = Object.fromEntries([...best, ...worst].map((n) => [n, placeholderStill('Contact')]))
      return session
    }
    const now = Date.now()
    const previous = build(14, [3], (i) => ({ dropBelowShoulder: -0.2, contactReach: 1.3 + (i % 3) * 0.04 }), now - 7 * 864e5)
    const session = build(
      26,
      [4, 17],
      (i) => ({ dropBelowShoulder: -0.2, contactReach: i >= 17 ? 1.16 + (i % 2) * 0.02 : 1.34 + (i % 3) * 0.03 }),
      now,
    )
    seedHistory({ sessions: [], practice: [], practiceSessions: [session, previous] })
    // `&plan`: the same clip before it is read, priced, with the speed choice (N2.8).
    if (new URLSearchParams(location.search).has('plan')) {
      const fresh: PracticeSession = { ...session, found: undefined, chosen: undefined, lines: [], phase: 'locating', duration: 600, stills: undefined }
      setView({ kind: 'session', session: fresh, stage: { state: 'planning', timed: true, perSampleMs: 110 }, canRead: true })
      return
    }
    setView({ kind: 'session', session, stage: { state: 'done' }, canRead: false })
    return
  }
  /*
   * Real footage (Mirror M0.1): the landing's licensed serve, read by the
   * engine and stored as a report (`scripts/landing-serve.mjs`), opened as a
   * player would reopen their own: the report with its kept clip, or with
   * `&glance` the court screen. Every other route is the rig, which has no
   * camera; this one is how the tour sees a player's own clip.
   */
  if (demo === 'real') {
    const base = import.meta.env.BASE_URL
    const [{ normalise }, { keepClip }, { clipIdOf }, raw, clip] = await Promise.all([
      import('../lib/storage/db'),
      import('../lib/storage/clipStore'),
      import('../lib/storage/sessionKey'),
      fetch(`${base}landing/report.json`).then((r) => r.json() as Promise<unknown>),
      fetch(`${base}landing/serve.mp4`).then((r) => r.blob()),
    ])
    const session = normalise(raw)
    if (!session) throw new Error('landing/report.json is not a stored report')
    if (new URLSearchParams(location.search).has('glance')) {
      const url = URL.createObjectURL(clip)
      keepVideoUrl(url)
      setView({ kind: 'glance', analysis: session, videoUrl: url })
      return
    }
    await keepClip(clipIdOf(session.id), clip, { optedIn: true })
    seedHistory({ sessions: [session], practice: [] })
    setView({ kind: 'saved', session })
    return
  }
  // A clip filmed with the phone on its side, refused by the same check the
  // app runs (`turnedPicture`) on the rig's serve turned a quarter. `&turn=40`
  // or `&turn=180` shows the other two wordings.
  if (demo === 'turned') {
    const [{ buildServe }, { turnedPicture }] = await Promise.all([
      import('../lib/analysis/syntheticServe'),
      import('../lib/analysis/spatial'),
    ])
    const turn = (Number(new URLSearchParams(location.search).get('turn') ?? 90) * Math.PI) / 180
    const frames = buildServe({}, 30).map((f) => ({
      ...f,
      image: f.image.map((p) => ({
        ...p,
        x: 0.5 + (p.x - 0.5) * Math.cos(turn) - (p.y - 0.5) * Math.sin(turn),
        y: 0.5 + (p.x - 0.5) * Math.sin(turn) + (p.y - 0.5) * Math.cos(turn),
      })),
    }))
    const refused = turnedPicture(frames)
    if (refused) setView({ kind: 'error', title: refused.message, hints: refused.hints })
    return
  }
  // The two screens that are otherwise unreachable without going out and
  // filming a bad serve: the injury banner, which needs a spine folding
  // under load, and the refusal, which needs a clip the engine throws out.
  // Both were built and neither could be looked at.
  // `&fps=60` builds the example at a rate the firing-order timeline reads (D3.8).
  const analysis = sampleAnalysis(DEMO_DIALS[demo] ?? {}, undefined, Number(new URLSearchParams(location.search).get('fps')) || 32)
  if (demo === 'basket' || demo === 'live') {
    const url = await sampleClip(analysis.window.end - analysis.window.start + 0.4)
    keepVideoUrl(url)
    // The recorded clip is never exactly the requested length, so fit the
    // analysis to what actually came out.
    const probe = document.createElement('video')
    probe.src = url
    await new Promise((r) => {
      probe.onloadedmetadata = r
      setTimeout(r, 3000)
    })
    const fitted = fitToClip(analysis, probe.duration)
    if (demo === 'basket') {
      // Five serves, the last one on screen, and the sweep attempted all
      // five — `sampleBasket` returns the four it could read. The counts
      // have to agree or the demo shows a panel no real clip produces.
      fitted.serves = { count: 5, index: 4 }
      // `&steady` is a basket of one serve four times, so the panel's foot for a
      // basket where nothing moved can be looked at (H43); `&steady=nodrop` the
      // same with no racket drop to find, for the headline that says so (H45).
      const steady = new URLSearchParams(location.search).get('steady')
      const basket =
        steady === null
          ? sampleBasket()
          : [0, 2, 3, 4].map((index) => {
              const a = sampleAnalysis({ contactReach: 1.38, ...(steady === 'nodrop' ? { dropBelowShoulder: -0.25, trophyKneeAngle: 170 } : {}) })
              a.serves = { count: 5, index }
              return a
            })
      fitted.consistency = buildConsistency(basket, 5)
      // The toss map (D6.3) reads the basket's other serves from history, as
      // one clip, so the demo files them as one. The rig throws the same toss
      // every time, which would stack every mark on one spot; the placements
      // are spread by hand here, dev-only, so the strip has something to show.
      const spread = [0.18, 0.31, 0.24, 0.36]
      fitted.id = 'serve-demobasket-4'
      if (fitted.diagnosis) fitted.diagnosis.tossPlacement = { ahead: 0.29, from: 'hand', confidence: 0.5 }
      seedHistory({
        sessions: basket.map((a, i) => {
          const { frames: _f, ...rest } = a
          void _f
          const session = { ...rest, id: `serve-demobasket-${a.serves.index}` } as Session
          if (session.diagnosis) {
            session.diagnosis = { ...session.diagnosis, tossPlacement: { ahead: spread[i], from: 'hand', confidence: 0.5 } }
          }
          return session
        }),
        practice: [],
      })
      // The drill check, worked out from the swept serves exactly as the app
      // does after a real sweep. `&passed` checks against a basket of clean
      // serves instead, so the "Move up a step" state can be looked at too.
      const primary = fitted.triage?.status === 'ok' ? fitted.triage.primary_flaw?.flaw : undefined
      const checked = new URLSearchParams(location.search).has('passed')
        ? Array.from({ length: 6 }, (_, i) => sampleAnalysis({ dropBelowShoulder: 0.45, trophyKneeAngle: 133, tossArmHold: 0.72, contactReach: 1.38, seed: i + 1 }))
        : basket
      const drillCheck = primary ? checkDrill(primary, checked) : undefined
      if (drillCheck) fitted.drillCheck = drillCheck
      // The rig draws no pictures, so the paired strip would be the one
      // part of a basket report `?demo=basket` could not show — which is
      // the whole reason this route exists. Stand-in tiles rather than
      // nothing: they are the right count, the right shape and the right
      // labels, so the layout is real even though the bodies in them are
      // not. Dev-only, like everything else down this branch.
      // `?demo=basket&nostills` is the state every re-opened report is in:
      // the words kept, the pictures gone with the clip. Reachable on
      // purpose, because it is the branch nobody would otherwise look at
      // and the one where a silent blank reads as a bug.
      const noStills = new URLSearchParams(location.search).has('nostills')
      if (!noStills) {
        /*
         * The report's own keyframes, not only the basket's.
         *
         * `nostills` reads as "this report has lost its pictures", and the
         * comment above says so — but it only ever governed the paired
         * strip, so the filmstrip on this screen showed placeholders
         * either way and the flag toggled half of what it claimed. That
         * went unnoticed while a missing still drew a grey box in both
         * states; it stops being invisible now that one of those states
         * draws the tracked body instead, which is the branch the flag
         * exists to let somebody look at.
         */
        for (const p of fitted.phases) p.thumbnail = p.thumbnail ?? placeholderStill(p.label)
      }
      if (fitted.consistency?.gap && !noStills) {
        const { gap } = fitted.consistency
        for (const a of basket) {
          for (const p of a.phases) p.thumbnail = p.thumbnail ?? placeholderStill(p.label)
        }
        setPair(pairStills(basket, gap))
      }
    }
    setView({ kind: 'report', analysis: fitted, videoUrl: url })
  } else if (demo === 'glance') {
    // The between-serves screen, which is otherwise only reachable by
    // recording a serve on a device with a camera — and no camera has
    // ever pointed at this code. `?demo=glance-refused` is the other half:
    // a clip the engine threw out, which is the branch that must never
    // show a score.
    setView({ kind: 'glance', analysis, videoUrl: '' })
  } else if (demo === 'glance-strain') {
    /*
     * The recurring joint warning, on the screen it exists for.
     *
     * Needs two things at once that no other demo route produces: a
     * seeded history carrying the same flag on earlier trips, and a
     * serve in front of the player that raises it again. So it seeds
     * `sampleHistory` — whose sore trips are dialled for exactly this —
     * and then glances at a freshly dialled sore serve rather than the
     * clean sample one. Both halves earn their flag through
     * `injuriesIn`; nothing here writes a warning onto a report.
     */
    seedHistory(sampleHistory())
    setView({
      kind: 'glance',
      analysis: sampleAnalysis({ spineLean: DEMO_DIALS.injury.spineLean, cameraYaw: DEMO_DIALS.injury.cameraYaw }),
      videoUrl: '',
    })
  } else if (demo?.startsWith('glance-score')) {
    // The score against the last serve (L3.1), in its three states:
    // `?demo=glance-score` is a move past the camera's line, `-same` one
    // inside it, and `-soft` one between two serves measured on different
    // rows (the earlier one with its drop collapsed). The earlier serve's
    // overall is set by hand, dev-only, so each state lands where it is named.
    const variant = demo.split('glance-score-')[1]
    const { frames: _f, ...earlier } = sampleAnalysis(variant === 'soft' ? DEMO_DIALS.collapsed : {})
    void _f
    seedHistory({
      sessions: [
        {
          ...earlier,
          id: 'serve-demoearlier-0',
          createdAt: analysis.createdAt - 90_000,
          overall: analysis.overall - (variant === 'same' ? 4 : 9),
          scoringVersion: SCORING_VERSION,
        } as Session,
      ],
      practice: [],
    })
    setView({ kind: 'glance', analysis, videoUrl: '' })
  } else if (demo?.startsWith('glance-move')) {
    // The carry-forward line, on each of its four verdicts —
    // `?demo=glance-move`, or `-cleared`/`-same`/`-wider`.
    //
    // Three of them point at the sample serve's own primary flaw, which
    // is the ordinary case and the one that draws the short repeat form:
    // the heading above already names the fault. `cleared` points at a
    // different one on purpose, because that is the only shape it has in
    // production — `faultMove` returns it when the later serve no longer
    // detects the fault, so it cannot also be that serve's headline.
    const verdict = (demo.split('glance-move-')[1] ?? 'closer') as FaultMove['verdict']
    const flaw = analysis.triage?.primary_flaw
    setView({
      kind: 'glance',
      analysis,
      videoUrl: '',
      move: flaw && {
        flaw: verdict === 'cleared' ? 'toss_height' : flaw.flaw,
        signal: flaw.signal,
        before: 0.1,
        after: verdict === 'cleared' ? 0 : 0.061,
        floor: 0.012,
        verdict,
      },
    })
  } else if (demo === 'links') {
    /*
     * A fix moved up by the player's own tags (N2.9), which no seeded season
     * reaches: it needs 48 tagged serves of one kind. Three sittings of 16,
     * half tagged net, the net ones mostly met low (the rig names a low contact
     * at a reach of 1.05), then the newest serve, which shows it too. `&first`
     * ties the tossing arm, the first fix, to the net instead, for the line
     * under the headline.
     */
    const first = new URLSearchParams(location.search).has('first')
    const sessions: Session[] = []
    const tags: ServeTag[] = []
    const start = Date.now() - 10 * 864e5
    for (let day = 0; day < 3; day++) {
      for (let i = 0; i < 16; i++) {
        const net = i < 8
        const marked = net ? i < 6 : i - 8 < 2
        const dials: Partial<ServeDials> = first ? (marked ? {} : { tossArmHold: 0.72 }) : { contactReach: marked ? 1.05 : 1.25 }
        const { frames: _f, ...rest } = sampleAnalysis({ noise: 0.004, seed: 700 + day * 16 + i, ...dials })
        void _f
        const id = `serve-demolinks${day * 16 + i}-0`
        const createdAt = start + day * 3 * 864e5 + i * 60_000
        sessions.push({ ...rest, id, createdAt } as Session)
        tags.push({ id, outcome: net ? 'net' : 'in', serveNumber: 1, taggedAt: createdAt })
      }
    }
    const { frames: _f, ...now } = sampleAnalysis({ noise: 0.004, seed: 799, contactReach: 1.05 })
    void _f
    const shown = { ...now, id: 'serve-demolinksnow-0', createdAt: Date.now() } as Session
    seedHistory({ sessions: [shown, ...sessions.reverse()], practice: [], tags })
    setView({ kind: 'saved', session: shown })
  } else if (demo === 'glance-refused') {
    setView({
      kind: 'glance',
      analysis: {
        ...analysis,
        // `&reason=body_not_visible` or `camera_unusable` for a refusal with its fix drawn (Mirror M2.2).
        triage: { ...analysis.triage, status: 'rejected', reason: new URLSearchParams(location.search).get('reason') ?? 'too_few_frames' },
      } as Analysis,
      videoUrl: '',
    })
  } else if (demo === 'held-target') {
    // A report led by a low contact, opened again, so the held frame carries
    // the shape to aim for (B1.1). The same dials `heldTarget.test.ts` reads.
    const { frames: _f, ...session } = sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 133, contactHipHeight: 1.0, contactReach: 1.0 })
    void _f
    setView({ kind: 'saved', session })
  } else if (demo === 'lean' || demo === 'met-behind') {
    // The two faults demonstrated since C1.2: a sideways lean, filmed from
    // behind the baseline where it is read, and a ball met behind the head.
    const dials = demo === 'lean' ? { spineLean: 34, cameraYaw: 8 } : { contactBehind: 0.35 }
    const { frames: _f, ...session } = sampleAnalysis(dials)
    void _f
    setView({ kind: 'saved', session })
  } else {
    if (new URLSearchParams(location.search).has('stills')) rigStills(analysis)
    const { frames: _f, ...session } = analysis
    void _f
    setView({ kind: 'saved', session })
  }
}
