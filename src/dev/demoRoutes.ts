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
import type { View } from '../App'
import type { FaultMove } from '../lib/analysis/carryForward'
import { buildConsistency, pairStills, type ServePairFrames } from '../lib/analysis/consistency'
import { checkDrill } from '../lib/analysis/progressions'
import type { Analysis } from '../lib/analysis/types'
import type { PracticeLog, Session } from '../lib/storage/db'
import { DEMO_DIALS, fitToClip, sampleAnalysis, sampleBasket, sampleClip, sampleHistory } from './sampleAnalysis'

export interface DemoContext {
  setView: (view: View) => void
  setPair: (pair: ServePairFrames | undefined) => void
  /** Hold a seeded history in place of storage — see `demoHistory` in `App.tsx`. */
  seedHistory: (history: { sessions: Session[]; practice: PracticeLog[] }) => void
  /** The object URL of a generated clip, so `App.tsx` can release it with the rest. */
  keepVideoUrl: (url: string) => void
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

export async function runDemoRoute(
  demo: string,
  { setView, setPair, seedHistory, keepVideoUrl }: DemoContext,
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
  // The two screens that are otherwise unreachable without going out and
  // filming a bad serve: the injury banner, which needs a spine folding
  // under load, and the refusal, which needs a clip the engine throws out.
  // Both were built and neither could be looked at.
  const analysis = sampleAnalysis(DEMO_DIALS[demo] ?? {})
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
      const basket = sampleBasket()
      fitted.consistency = buildConsistency(basket, 5)
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
      analysis: sampleAnalysis({ spineLean: DEMO_DIALS.injury.spineLean }),
      videoUrl: '',
    })
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
  } else if (demo === 'glance-refused') {
    setView({
      kind: 'glance',
      analysis: {
        ...analysis,
        triage: { ...analysis.triage, status: 'rejected', reason: 'too_few_frames' },
      } as Analysis,
      videoUrl: '',
    })
  } else {
    const { frames: _f, ...session } = analysis
    void _f
    setView({ kind: 'saved', session })
  }
}
