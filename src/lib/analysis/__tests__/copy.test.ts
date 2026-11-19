/**
 * The editor, as a test.
 *
 * Every string this app can put in front of a player is a command: at most two
 * sentences, at most twenty-five words, active voice, no pleasantries, no lab
 * vocabulary, and no raw measurement — the readout says it in body language
 * instead. Those rules only hold if something enforces them, and a style guide
 * in a comment enforces nothing. This walks the whole copy database and fails
 * the build on the first sentence that drifts.
 *
 * It also checks the translation layer covers every measurement, because a
 * missing ladder is silent: the number simply disappears from the card and the
 * report looks fine while saying less than it did.
 */
import { TRANSLATED, readoutOf, rungsOf, targetOf } from '../anatomy'
import {
  AXIS_COPY,
  DRILLS,
  FUNDAMENTALS,
  METRICS,
  SERVE_TYPES,
  metricCopy,
  type MetricCopy,
} from '../coaching'
import { rescoreStoredCard } from '../metrics'
import type { Fundamental, Metric } from '../types'
import type { BodyAxis } from '../axes'
import { MAX_SENTENCES, MAX_WORDS, command, cueIssues, plain, wordCount } from '../voice'
import { VERDICT_TABLES, causalFocus, everyVerdictCue, refusalFor, rotationMoveLine } from '../verdict'
import { FLAWS, type FlawId } from '../flaws'
import { FLAW_DRILL, FLAW_DRILL_BY_AXIS, drillIdFor } from '../triage'
import { uncalibratedLine } from '../../../components/statusLabels'
import { PHASE_COPY } from '../phases'
import { everyProgression } from '../progressions'
import { practiceHeadline, type PracticeFocus } from '../../practice'
import { FOOT_SHARE, placeLine } from '../../tossPlaceCopy'
import { assert, check, report } from './harness'
import { DEMO_DIALS, sampleAnalysis } from '../../../dev/sampleAnalysis'
import type { ServeType } from '../../storage/prefs'

console.log('\n\x1b[1mThe house voice\x1b[0m')

/** Every string in the database, labelled by where it came from. */
function everyCue(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  for (const m of Object.values(METRICS)) {
    for (const [k, v] of Object.entries(m.insight)) out.push({ where: `${m.id}.insight.${k}`, text: v })
    for (const [k, v] of Object.entries(m.fix)) {
      // An empty fix is deliberate: nothing to correct on that side of the band.
      if (v) out.push({ where: `${m.id}.fix.${k}`, text: v })
    }
    out.push({ where: `${m.id}.drill.how`, text: m.drill.how })
  }
  for (const [id, type] of Object.entries(SERVE_TYPES)) {
    out.push({ where: `${id}.blurb`, text: type.blurb })
    for (const [metricId, insight] of Object.entries(type.insight ?? {})) {
      for (const [k, v] of Object.entries(insight)) {
        if (v) out.push({ where: `${id}.${metricId}.${k}`, text: v })
      }
    }
    // The instruction and the exercise a serve type replaces face the editor on
    // the same terms as the description it replaces. They reach a player through
    // exactly the same card.
    for (const [metricId, fix] of Object.entries(type.fix ?? {})) {
      for (const [k, v] of Object.entries(fix)) {
        if (v) out.push({ where: `${id}.${metricId}.fix.${k}`, text: v })
      }
    }
    for (const [metricId, drill] of Object.entries(type.drill ?? {})) {
      out.push({ where: `${id}.${metricId}.drill.how`, text: drill.how })
    }
  }
  // The lines a body axis replaces. They reach a player through the same card as
  // the ones above and are chosen by the camera rather than by the player, which
  // is the one thing about them the editor does not care about.
  for (const [metricId, byAxis] of Object.entries(AXIS_COPY)) {
    for (const [axis, copy] of Object.entries(byAxis)) {
      for (const [k, v] of Object.entries(copy.insight ?? {})) {
        if (v) out.push({ where: `${axis}.${metricId}.${k}`, text: v })
      }
      for (const [k, v] of Object.entries(copy.fix ?? {})) {
        if (v) out.push({ where: `${axis}.${metricId}.fix.${k}`, text: v })
      }
      if (copy.drill) out.push({ where: `${axis}.${metricId}.drill.how`, text: copy.drill.how })
    }
  }
  for (const [id, f] of Object.entries(FUNDAMENTALS)) {
    out.push({ where: `${id}.blurb`, text: f.blurb })
    out.push({ where: `${id}.drill.how`, text: f.drill.how })
  }
  // The drills the triage layer can name. Most are the same objects as above and
  // are simply checked twice, which costs nothing; the handful that exist only
  // in the registry would otherwise never face the editor at all.
  for (const [id, drill] of Object.entries(DRILLS)) {
    out.push({ where: `DRILLS.${id}.how`, text: drill.how })
  }
  // The sentences the verdict layer writes about a named flaw or an injury risk.
  // These reach a player through the largest heading on the report — the one
  // thing to work on — so they face the editor first, not last.
  out.push(...everyVerdictCue())
  return out
}

check('every line of coaching copy passes the editor', () => {
  const bad = everyCue()
    .map((c) => ({ ...c, issues: cueIssues(c.text) }))
    .filter((c) => c.issues.length > 0)

  assert(
    bad.length === 0,
    `${bad.length} line(s) failed:\n` +
      bad.map((b) => `      ${b.where}: ${b.issues.join('; ')}\n        "${b.text}"`).join('\n'),
  )
})

check('no line runs past the ceiling', () => {
  for (const { where, text } of everyCue()) {
    assert(wordCount(text) <= MAX_WORDS, `${where} runs to ${wordCount(text)} words`)
  }
})

check('key words are marked for scanning', () => {
  // Praise can be plain; an instruction has to lead with something a player can
  // find without reading the sentence.
  for (const m of Object.values(METRICS)) {
    for (const [side, text] of Object.entries(m.fix)) {
      if (!text) continue
      assert(text.includes('**'), `${m.id}.fix.${side} has no marked instruction`)
    }
  }
  for (const [id, type] of Object.entries(SERVE_TYPES)) {
    for (const [metricId, fix] of Object.entries(type.fix ?? {})) {
      for (const [side, text] of Object.entries(fix)) {
        if (!text) continue
        assert(text.includes('**'), `${id}.${metricId}.fix.${side} has no marked instruction`)
      }
    }
  }
  for (const [metricId, byAxis] of Object.entries(AXIS_COPY)) {
    for (const [axis, copy] of Object.entries(byAxis)) {
      for (const [side, text] of Object.entries(copy.fix ?? {})) {
        if (!text) continue
        assert(text.includes('**'), `${axis}.${metricId}.fix.${side} has no marked instruction`)
      }
    }
  }
})

/* ----------------------------------------------------------------- anatomy -- */

console.log('\n\x1b[1mNumbers, said as body positions\x1b[0m')

check('every measurement can be spoken without a number', () => {
  for (const id of Object.keys(METRICS)) {
    assert(TRANSLATED.includes(id), `${id} has no body-language ladder`)
  }
})

check('a readout exists everywhere across each measurement axis', () => {
  for (const m of Object.values(METRICS)) {
    const [lo, hi] = m.range
    for (let i = 0; i <= 10; i++) {
      const v = lo + ((hi - lo) * i) / 10
      const tag = readoutOf(m.id, v)
      assert(tag.length > 0, `${m.id} has no readout at ${v}`)
      assert(
        cueIssues(tag).length === 0,
        `${m.id} readout "${tag}" fails the editor: ${cueIssues(tag).join('; ')}`,
      )
    }
  }
})

check('the target reads as a body position, and moves with the serve type', () => {
  for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      const target = targetOf(id, copy.ideal)
      assert(target.length > 0, `${id} has no target phrase for a ${type} serve`)
    }
  }
  // What a kick changes on screen. Its contact target used to be "over the
  // head", and published kicks are struck in front of the toe, a little nearer
  // than flat serves or no nearer at all (Connolly 2021, Vacek 2023, Campbell
  // 2013). So since D2.1 a kick only lowers the contact floor, and the target
  // that differs is the shoulders': a kick may tilt further. Since N7.3 that
  // is a ceiling lifted, not a band moved up: no study gives a kick's tilt, and
  // a band starting where the flat one stops told kick servers to bend more.
  const reach = (type: ServeType) => metricCopy('contactAhead', type).ideal[0]
  assert(reach('kick') < reach('flat'), 'a kick may no longer be struck over the head')
  const flat = metricCopy('shoulderTilt', 'flat').ideal
  const kick = metricCopy('shoulderTilt', 'kick').ideal
  assert(kick[0] === flat[0], `a kick's tilt floor moved off the flat one: ${kick[0]} against ${flat[0]}`)
  assert(kick[1] > flat[1], `a kick may tilt no further than a flat serve: ${kick[1]}`)
  assert(!/further/i.test(metricCopy('shoulderTilt', 'kick').fix.low), 'a kick is told to tilt further again')
})

check('a value outside the axis still lands somewhere', () => {
  assert(readoutOf('contactHeight', -99).length > 0, 'no readout below the axis')
  assert(readoutOf('contactHeight', 99).length > 0, 'no readout above the axis')
  assert(readoutOf('contactHeight', NaN).length > 0, 'no readout for a broken value')
  assert(readoutOf('notAMeasurement', 1) === '', 'invented a readout for an unknown measurement')
})

/* ------------------------------------------------- one card, one story -- */

console.log('\n\x1b[1mThe readout, the insight and the fix, saying one thing\x1b[0m')

/**
 * Which rungs of the ladder each line of copy can be printed beside.
 *
 * A card shows three things about one number at once: the readout, which names
 * the body position off `anatomy.ts`; the insight, chosen by where the number
 * falls against its band; and the fix, shown only outside that band. Nothing in
 * the code makes the three agree. They agree because a person wrote them to, and
 * they stop agreeing the moment a band moves, a rung is added or a sentence is
 * rewritten — at which point the card praises and corrects the same position at
 * once and the player is left to work out which half to believe.
 *
 * So each line declares, in the ladder's own words, the positions it can
 * truthfully be read against, and the sweep below checks every value of every
 * measurement against that declaration. The bar is not agreement of wording but
 * absence of contradiction: "struck far in front" sits happily under "you strike
 * in front of your body", because one is more of the other. "Struck behind the
 * head" does not, because a player reading both has been told two opposite
 * things about where their racket was.
 *
 * Keyed by measurement, and by `<serve type>.<measurement>` where a serve type
 * replaces the line — the same place the string itself is written, so the claim
 * and the sentence move together.
 */
type Kind = 'low' | 'ok' | 'high'

interface Claimed {
  /**
   * A fingerprint of the exact sentences this claim was written against.
   *
   * Without it the table is a claim about copy that no longer exists. This whole
   * class of bug arrived by rewrite — a sentence was rebuilt when the
   * measurement became signed and quietly stopped covering a rung it used to —
   * and a rewrite that leaves the claim untouched is the one edit the sweep
   * below cannot see. So changing a line breaks the stamp, and the only way past
   * it is to read the new sentence and say again which positions it can be
   * printed beside.
   */
  stamp: string
  /** Rungs each insight can describe without either taking the other back. */
  insight: Partial<Record<Kind, string[]>>
  /** The rung each fix orders the player onto. */
  aim?: Partial<Record<'low' | 'high', string>>
}

const CLAIMED: Record<string, Claimed> = {
  releaseHeight: {
    stamp: '07b4fcac',
    insight: {
      low: ['Let go below the eyes'],
      // Re-anchored on the coaching standard (D2.1): eye level and up is praised.
      ok: ['Let go at head height', 'Let go above the head'],
      high: ['Let go past full stretch'],
    },
    aim: { low: 'Let go above the head', high: 'Let go above the head' },
  },
  tossArmHold: {
    stamp: '1f8ea683',
    insight: {
      low: ['Arm comes down at once', 'Arm comes down early'],
      ok: ['Arm holds to the swing', 'Arm holds through contact'],
      high: ['Arm holds through contact'],
    },
    aim: { low: 'Arm holds to the swing', high: 'Arm holds to the swing' },
  },
  tossPathWobble: {
    // Re-stamped when the fault line and its order stopped saying "sideways".
    // The number under them is drift along whichever body axis the camera laid
    // across image x, which side-on is front-to-back — so the old wording named
    // a direction on every clip and had it right on some of them. The rungs
    // moved with it, from "wide" to "off line", for the same reason.
    stamp: '6c55745d',
    insight: {
      low: ['Dead straight lift'],
      ok: ['Dead straight lift', 'Straight lift'],
      high: ['Drifts a hand off line', 'Wanders off line'],
    },
    aim: { high: 'Straight lift' },
  },
  tossPeakHeight: {
    // Re-stamped when the ceiling moved from 1.72 to 2.1 on published toss
    // heights. The middle rung became "well above the racket", and the high line
    // now only ever stands over "far above".
    stamp: '17587504',
    insight: {
      // "Peaks at racket reach" is claimed on both sides: it is the flat serve's
      // near miss and the kick serve's floor, and neither sentence denies it.
      low: ['Peaks below the racket', 'Peaks at racket reach'],
      ok: ['Peaks at racket reach', 'Peaks well above the racket'],
      high: ['Peaks far above the racket'],
    },
    aim: { low: 'Peaks well above the racket', high: 'Peaks well above the racket' },
  },
  contactBelowPeak: {
    // Re-stamped when the band moved from 0–0.09 to 0–0.55 on published drops
    // from apex to impact: falling into the swing is praised, and only a long
    // fall is not. The high line now only ever stands over "well past".
    stamp: '172f9d6d',
    insight: {
      low: ['Struck at the peak'],
      // Re-anchored to published drops: the ball falls a fair way into a good
      // serve, so falling is praised and only falling a long way is not.
      ok: ['Struck at the peak', 'Struck as it starts to fall', 'Struck as the ball falls'],
      high: ['Struck well past the peak'],
    },
    aim: { high: 'Struck as it starts to fall' },
  },
  kneeBend: {
    stamp: '921ad28a',
    insight: {
      low: ['Legs straight', 'Legs barely bent'],
      ok: ['Athletic load'],
      high: ['Deep squat'],
    },
    aim: { low: 'Athletic load', high: 'Athletic load' },
  },
  shoulderTilt: {
    stamp: '731bd272',
    insight: {
      low: [
        'Tossing shoulder under the ball',
        'Hitting shoulder sits high',
        'Shoulders level',
        'Shoulders near level',
      ],
      // Two rungs of one direction: the flat and slice band is the "under the
      // ball" rung and the kick band is the steep one above it, and "hitting
      // shoulder down, tossing shoulder up" is true across both. "Shoulders near
      // level" was claimed here too while the slice band reached down into it,
      // which is how 11.9 degrees came back praised under a readout calling the
      // shoulders level — the claim covering for the band rather than checking it.
      ok: ['Hitting shoulder under the ball', 'Hitting shoulder far below'],
      high: ['Hitting shoulder under the ball', 'Hitting shoulder far below'],
    },
    aim: { low: 'Hitting shoulder under the ball', high: 'Hitting shoulder under the ball' },
  },
  legDrive: {
    // Re-stamped when the floor became a full extension with no jump (L3.9):
    // legs straightened out of the load are in band, and said so.
    stamp: 'a72ea67f',
    insight: {
      low: ['No push off the court'],
      // A big launch is praised since the band ran to the end of its axis (D2.3).
      ok: ['Legs straighten up', 'Light push', 'Strong drive up', 'Big launch'],
      high: ['Big launch'],
    },
    aim: { low: 'Strong drive up', high: 'Strong drive up' },
  },
  dropDepth: {
    // Re-stamped when the band moved from the hand down the back (0.16–0.34) to
    // the hand near the shoulder (−0.1–0.3), on real serve motion — and the rungs
    // were renamed for the hand, which is what is measured.
    stamp: 'ac988acd',
    insight: {
      low: ['Hand stays above the shoulder'],
      ok: ['Hand level with the shoulder', 'Hand below the shoulder'],
      high: ['Hand far down the back'],
    },
    aim: { low: 'Hand level with the shoulder', high: 'Hand below the shoulder' },
  },
  elbowAtDrop: {
    stamp: 'd737de98',
    insight: {
      low: ['Racket jammed on the back'],
      ok: ['Arm folded in an L'],
      high: ['Arm swings straight'],
    },
    aim: { low: 'Arm folded in an L', high: 'Arm folded in an L' },
  },
  handUnderElbow: {
    // Re-stamped when the floor moved from 20 to 4 on real serve motion: the
    // shortfall line now covers only the hand that never gets under the elbow,
    // and the praise covers dipping under it as well as hanging there.
    stamp: '1043fb58',
    insight: {
      low: ['Hand never gets under the elbow'],
      ok: ['Hand dips under the elbow', 'Hand hangs under the elbow'],
      // Claimed although the band runs to the end of the axis and this line
      // therefore cannot be shown today. The claim is what a future ceiling
      // would be checked against, and writing it now is cheaper than
      // reconstructing it then.
      high: ['Hand hangs under the elbow'],
    },
    // No `high`, because there is no instruction above a band that ends at the
    // top of its own axis — the same blank `tossPathWobble` carries at the
    // opposite end.
    aim: { low: 'Hand dips under the elbow' },
  },
  dropToContact: {
    // Re-stamped when `ok` dropped the phrase "acceleration window" — lab
    // vocabulary that clears the voice lint (it is not on the jargon list) and
    // still loses a player who has never met the term. The rungs claimed below
    // are unchanged: a racket that fires with no pause is an explosive swing.
    stamp: '8e65b13f',
    insight: {
      low: ['Swing snaps through'],
      ok: ['Explosive swing'],
      high: ['Guided swing', 'Steered swing'],
    },
    aim: { low: 'Explosive swing', high: 'Explosive swing' },
  },
  contactHeight: {
    stamp: 'fb7baed1',
    insight: {
      low: ['Struck at head height', 'Struck below full reach'],
      ok: ['Struck at full racket reach'],
      high: ['Struck at full racket reach', 'Struck at the top of the reach'],
    },
    aim: { low: 'Struck at full racket reach', high: 'Struck at full racket reach' },
  },
  // The ball's height at contact, on the hand's rungs raised by the racket.
  ballContactHeight: {
    stamp: '0f0c08cd',
    insight: {
      low: ['Struck at head height', 'Struck below full reach'],
      ok: ['Struck at full racket reach'],
      high: ['Struck at full racket reach', 'Struck at the top of the reach'],
    },
    aim: { low: 'Struck at full racket reach', high: 'Struck at full racket reach' },
  },
  armExtension: {
    stamp: '857d8f5d',
    insight: {
      low: ['Elbow bent at contact', 'Arm short of straight'],
      // Published elbows are flexed 14–30° at impact (D2.1), so a long arm short
      // of dead straight is praised too.
      ok: ['Arm long at contact', 'Arm dead straight'],
      high: ['Arm dead straight'],
    },
    aim: { low: 'Arm long at contact', high: 'Arm long at contact' },
  },
  contactAhead: {
    stamp: 'ef08c32c',
    insight: {
      low: ['Struck behind the head', 'Struck over the head'],
      ok: ['Struck in front of the body'],
      high: ['Struck far in front'],
    },
    // No order past the ceiling since N7.3, so nothing there to aim.
    aim: { low: 'Struck in front of the body' },
  },
  loadRatio: {
    stamp: 'a701f8ed',
    insight: {
      low: ['Crammed finish'],
      ok: ['Slow build, fast finish'],
      high: ['Back half drifts'],
    },
    aim: { low: 'Slow build, fast finish', high: 'Slow build, fast finish' },
  },

  /* The lines a serve type replaces, claimed where they are written. */
  'kick.contactAhead': {
    stamp: '6242295b',
    insight: {
      low: ['Struck behind the head'],
      // Over the head or in front since D2.1: published kicks are struck in
      // front of the toe, a little nearer than flat serves or no nearer at all.
      ok: ['Struck over the head', 'Struck in front of the body'],
      high: ['Struck far in front'],
    },
    aim: { low: 'Struck over the head', high: 'Struck over the head' },
  },
  'kick.contactHeight': {
    // Re-stamped when the flat instruction above the band was replaced. The
    // description is untouched and the two rungs claimed below are unchanged by
    // the edit; what moved is the order underneath them.
    stamp: '9a39cfda',
    insight: { ok: ['Struck below full reach', 'Struck at full racket reach'] },
    // The flat order above this band sends the toss forward, which is the one
    // place a kick card must never point: its own contact-depth line orders the
    // toss back over the head. The replacement aims at the lower of the two rungs
    // this card praises — struck at full racket reach rather than above it — so
    // the order and the description agree about where the ball is met.
    aim: { high: 'Struck at full racket reach' },
  },
  /*
   * The lines a body axis replaces, claimed where they are written.
   *
   * Both name the same rungs as the axis-neutral pair they replace, and that is
   * the point rather than a coincidence: the ladder measures how far the hand
   * left its line and the axis says which way it left it, so an overlay changes
   * the direction in the sentence and never the distance in the readout. A claim
   * here that differed from the base claim would mean an overlay had quietly
   * started describing a different amount of drift.
   */
  'depth.tossPathWobble': {
    // The clean lines say which half of the toss the camera saw (N2.10), and
    // claim the same rungs as the plain clean lines they replace.
    stamp: '420872b4',
    insight: { low: ['Dead straight lift'], ok: ['Dead straight lift', 'Straight lift'], high: ['Drifts a hand off line', 'Wanders off line'] },
    aim: { high: 'Straight lift' },
  },
  'lateral.tossPathWobble': {
    stamp: '2c906a26',
    insight: { low: ['Dead straight lift'], ok: ['Dead straight lift', 'Straight lift'], high: ['Drifts a hand off line', 'Wanders off line'] },
    aim: { high: 'Straight lift' },
  },

  'kick.ballContactHeight': {
    stamp: '2fbaab92',
    insight: { ok: ['Struck at full racket reach'] },
    aim: { high: 'Struck at full racket reach' },
  },
}

const SERVE_TYPE_IDS = Object.keys(SERVE_TYPES) as ServeType[]

/**
 * The overlays a site prefix can name.
 *
 * Two kinds now write copy over a measurement's own: a serve type, chosen by the
 * player, and a body axis, decided by where their phone stood. They share this
 * table's `<prefix>.<measurement>` key space because they share everything that
 * matters to an editor — both replace a line on a real card, both have to say
 * again which body positions the replacement can be printed beside, and both go
 * stale in exactly the same way when someone rewrites the sentence.
 *
 * The two vocabularies do not collide (`flat`/`kick`/`slice` against
 * `depth`/`lateral`) and this asserts that rather than trusting it, because the
 * day they do collide a claim silently starts checking the wrong sentence.
 */
const AXIS_IDS = ['depth', 'lateral'] as const
const isAxis = (prefix: string): prefix is BodyAxis =>
  (AXIS_IDS as readonly string[]).includes(prefix)

check('the two overlay vocabularies stay apart', () => {
  for (const axis of AXIS_IDS) {
    assert(
      !SERVE_TYPE_IDS.includes(axis as unknown as ServeType),
      `"${axis}" is both a body axis and a serve type, so a claim site names two things`,
    )
  }
})

/** The insight and fix a site owns: an overlay's own lines, or the base copy's. */
function copyAt(site: string): {
  insight?: Partial<MetricCopy['insight']>
  fix?: Partial<MetricCopy['fix']>
} {
  const [prefix, id] = site.includes('.') ? site.split('.') : [undefined, site]
  if (!prefix) return { insight: METRICS[id]?.insight, fix: METRICS[id]?.fix }
  if (isAxis(prefix)) {
    return { insight: AXIS_COPY[id]?.[prefix]?.insight, fix: AXIS_COPY[id]?.[prefix]?.fix }
  }
  return {
    insight: SERVE_TYPES[prefix as ServeType]?.insight?.[id],
    fix: SERVE_TYPES[prefix as ServeType]?.fix?.[id],
  }
}

/** The five lines one site can carry, in a fixed order, for the stamp. */
function linesAt(site: string): (string | undefined)[] {
  const { insight, fix } = copyAt(site)
  return [insight?.low, insight?.ok, insight?.high, fix?.low, fix?.high]
}

/**
 * Every axis a measurement's card can be written in, the neutral one first.
 *
 * `undefined` is not a placeholder here — it is the card `build` produces when
 * the caller has no camera angle to hand over, written to be true whichever way
 * the hand went, and it faces the sweeps below on the same terms as the two that
 * name a direction.
 */
function axesFor(id: string): (BodyAxis | undefined)[] {
  return [undefined, ...(Object.keys(AXIS_COPY[id] ?? {}) as BodyAxis[])]
}

/** Every card a player can be shown for one measurement: serve type × axis. */
function cardsFor(id: string): { type: ServeType; axis?: BodyAxis; label: string }[] {
  const out: { type: ServeType; axis?: BodyAxis; label: string }[] = []
  for (const type of SERVE_TYPE_IDS) {
    for (const axis of axesFor(id)) {
      out.push({ type, axis, label: axis ? `${type}/${axis}` : type })
    }
  }
  return out
}

/**
 * FNV-1a over those lines, marker-free so bolding a word costs nothing.
 *
 * A hash and not a copy of the text: the point is to notice an edit, and pasting
 * every sentence in here a second time would only give them somewhere else to
 * drift apart.
 */
function stampOf(site: string): string {
  let h = 0x811c9dc5
  for (const line of linesAt(site)) {
    for (const ch of plain(line ?? '')) {
      h ^= ch.charCodeAt(0)
      h = Math.imul(h, 0x01000193)
    }
    // A line boundary of its own, so moving a clause from the insight into the
    // fix does not leave the fingerprint unchanged.
    h ^= 0x2f
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Where one card reads its insight from: the axis line, the serve type's, or the
 * base.
 *
 * The order is `metricCopy`'s, and it has to be: whichever line that function
 * would put on the card is the line whose claim decides whether the card
 * contradicts itself. Checking the serve type's claim about a sentence the axis
 * overlay has already replaced would pass a card nobody is ever shown.
 */
const insightSite = (id: string, type: ServeType, kind: Kind, axis?: BodyAxis) =>
  axis && AXIS_COPY[id]?.[axis]?.insight?.[kind]
    ? `${axis}.${id}`
    : SERVE_TYPES[type].insight?.[id]?.[kind]
      ? `${type}.${id}`
      : id

/** The same for the instruction, which either overlay may replace on its own. */
const fixSite = (id: string, type: ServeType, side: 'low' | 'high', axis?: BodyAxis) =>
  axis && AXIS_COPY[id]?.[axis]?.fix?.[side]
    ? `${axis}.${id}`
    : SERVE_TYPES[type].fix?.[id]?.[side]
      ? `${type}.${id}`
      : id

function claimsFor(id: string, type: ServeType, kind: Kind, axis?: BodyAxis): string[] {
  const site = insightSite(id, type, kind, axis)
  const tags = CLAIMED[site]?.insight?.[kind]
  assert(
    tags !== undefined && tags.length > 0,
    `${site}.insight.${kind} never says which body positions it can be printed beside`,
  )
  return tags as string[]
}

/**
 * Where to look along one axis.
 *
 * A uniform sweep steps straight over the values that decide this: a band edge
 * and a rung boundary are each a single point, and the bug always lives within a
 * hair of one of them. So every edge is probed from both sides as well.
 *
 * The band's top edge is dropped when the rung above it opens exactly there. The
 * band is inclusive and the rung is not, so the two overlap on one value out of
 * an axis — arithmetic rather than a contradiction, and the sweep either side of
 * it still holds.
 */
function probes(copy: MetricCopy): number[] {
  const [lo, hi] = copy.range
  const eps = (hi - lo) / 1e6
  const out = new Set<number>()
  for (let i = 0; i <= 240; i++) out.add(lo + ((hi - lo) * i) / 240)
  for (const edge of [copy.ideal[0], copy.ideal[1], ...rungsOf(copy.id).map((r) => r.under)]) {
    out.add(edge - eps)
    out.add(edge)
    out.add(edge + eps)
  }
  return [...out].filter(
    (v) =>
      v >= lo &&
      v <= hi &&
      (v !== copy.ideal[1] || readoutOf(copy.id, v) === readoutOf(copy.id, v - eps)),
  )
}

check('no measurement is described one way and read out another', () => {
  for (const id of Object.keys(METRICS)) {
    for (const { type, axis, label } of cardsFor(id)) {
      const copy = metricCopy(id, type, axis)
      for (const v of probes(copy)) {
        // Exactly how `build()` chooses, so this walks the card a player sees
        // rather than a second opinion about which string should have shown.
        const kind: Kind = v < copy.ideal[0] ? 'low' : v > copy.ideal[1] ? 'high' : 'ok'
        const readout = readoutOf(id, v)
        assert(
          claimsFor(id, type, kind, axis).includes(readout),
          `${label} ${id} at ${v.toFixed(3)} reads out "${readout}" under\n` +
            `        "${copy.insight[kind]}"`,
        )
      }
    }
  }
})

check('a fault the card names always arrives with the order that corrects it', () => {
  for (const id of Object.keys(METRICS)) {
    for (const { type, axis, label } of cardsFor(id)) {
      const copy = metricCopy(id, type, axis)
      for (const v of probes(copy)) {
        if (v >= copy.ideal[0] && v <= copy.ideal[1]) continue
        const side = v < copy.ideal[0] ? 'low' : 'high'
        // A side left without a fix on purpose is not graded (N7.3): the row
        // scores as the band's edge there, with no fix and no drill.
        if (!copy.fix[side]) {
          const stored = { id, value: v, confidence: 1 } as Metric
          const area = { id: 'contact', label: '', blurb: '', phase: copy.phase, score: 0, status: 'work', headline: '', metrics: [stored], drill: copy.drill } as Fundamental
          const row = rescoreStoredCard([area], type)[0].metrics[0]
          assert(!row.fix && !row.drill && (row.status === 'good' || row.status === 'great'), `${label} ${id} at ${v.toFixed(3)} has no fix and was still marked down`)
          continue
        }
        assert(
          copy.fix[side].length > 0,
          `${label} ${id} at ${v.toFixed(3)} is out of band, reads "${readoutOf(id, v)}" and offers no fix`,
        )
      }
    }
  }
})

check('every fix aims at a position the same card would praise', () => {
  for (const id of Object.keys(METRICS)) {
    for (const { type, axis, label } of cardsFor(id)) {
      const copy = metricCopy(id, type, axis)
      const praised = claimsFor(id, type, 'ok', axis)
      for (const side of ['low', 'high'] as const) {
        if (!copy.fix[side]) continue
        const site = fixSite(id, type, side, axis)
        const aim = CLAIMED[site]?.aim?.[side]
        assert(aim !== undefined, `${site}.fix.${side} never says which position it aims at`)
        assert(
          praised.includes(aim as string),
          `${label} ${id} fix.${side} aims at "${aim}", which this card would not praise ` +
            `(${praised.join(', ')}):\n        "${copy.fix[side]}"`,
        )
      }
    }
  }
})

check('a serve type that rewrites a fault also rewrites the order that corrects it', () => {
  // The insight and the fix are two halves of one sentence to a player: the
  // first names what the body did, the second says what to do about it. A serve
  // type that replaces only the first leaves the flat instruction underneath its
  // own description, and the card contradicts itself — the kick card read
  // "hitting shoulder under the ball" and then ordered "drop the hitting
  // shoulder under the ball", telling the player to start doing what it had just
  // said they were doing.
  //
  // Nothing above catches that on its own. `every fix aims at a position the
  // same card would praise` only sees the aim recorded in the table beside it,
  // and a flat aim inside a moved band can still be a position that band
  // praises. So the pairing is required here, at the point where the override is
  // written, rather than noticed on a card months later.
  //
  // One direction only: a fix may be replaced without the description moving,
  // because a band can move while what the body did is still described
  // correctly. The reverse is what has now gone wrong twice.
  for (const [type, copy] of Object.entries(SERVE_TYPES)) {
    for (const [id, insight] of Object.entries(copy.insight ?? {})) {
      assert(METRICS[id] !== undefined, `${type} rewrites copy for ${id}, which is not a measurement`)
      for (const side of ['low', 'high'] as const) {
        if (!insight[side]) continue
        // Nothing to reorder where the flat card carries no order: a band that
        // runs to the end of its own axis has no fault on that side to correct.
        if (!METRICS[id].fix[side]) continue
        assert(
          Boolean(copy.fix?.[id]?.[side]),
          `${type} rewrites ${id}.insight.${side} and leaves the flat instruction under it:\n` +
            `        said:    "${insight[side]}"\n` +
            `        ordered: "${METRICS[id].fix[side]}"`,
        )
      }
    }
  }
})

check('a body axis that rewrites a fault also rewrites the order that corrects it', () => {
  // The serve-type rule below, applied to the other overlay, and here it is not
  // a hypothetical: the whole reason this overlay exists is that the fence-line
  // instruction and its drill were being printed under a reading taken along the
  // player's front/back axis. An axis that renames the fault and leaves the old
  // order beneath it would rebuild that exact card — the description finally
  // correct, the one line the player acts on still pointing at the wrong axis.
  //
  // The drill is required with them, which the serve-type rule does not demand.
  // A serve type moves a band and can leave the exercise alone; an axis is a
  // direction, and every drill here constrains one. A fence pins the hand
  // sideways and says nothing about how far in front of the body it went, so an
  // axis carrying its own words and the other axis's exercise sends the player
  // to practise the one thing that cannot move their number.
  for (const [id, byAxis] of Object.entries(AXIS_COPY)) {
    assert(METRICS[id] !== undefined, `an axis rewrites copy for ${id}, which is not a measurement`)
    for (const [axis, copy] of Object.entries(byAxis)) {
      for (const side of ['low', 'high'] as const) {
        if (!copy.insight?.[side]) continue
        if (!METRICS[id].fix[side]) continue
        assert(
          Boolean(copy.fix?.[side]),
          `${axis} rewrites ${id}.insight.${side} and leaves the axis-neutral instruction under it:\n` +
            `        said:    "${copy.insight[side]}"\n` +
            `        ordered: "${METRICS[id].fix[side]}"`,
        )
      }
      assert(
        Boolean(copy.drill),
        `${axis}.${id} names the fault in its own words and offers no drill of its own`,
      )
    }
  }
})

check('the target phrase is a position the card praises, for every card', () => {
  // `targetOf` reads the middle of the band through the ladder, so this is the
  // band and the ok insight checked against each other from the other end: the
  // phrase printed as the target has to be one the praise can be said about.
  for (const id of Object.keys(METRICS)) {
    for (const { type, axis, label } of cardsFor(id)) {
      const copy = metricCopy(id, type, axis)
      const target = targetOf(id, copy.ideal)
      assert(
        claimsFor(id, type, 'ok', axis).includes(target),
        `${label} ${id} asks for "${target}" and praises it with\n        "${copy.insight.ok}"`,
      )
    }
  }
})

check('every band edge lands on a rung boundary, for every serve type', () => {
  // The general form of a defect this file has now closed four times one band at
  // a time. A band edge that stops inside a rung splits that rung in half, and a
  // rung is exactly what the readout prints: the slice's contact band ended at
  // 24, four points into "struck far in front", so 22 came back badged Solid and
  // 26 came back with an order to rein the toss in, both under one line saying
  // the ball was struck far in front. The kick's tilt band did it to "hitting
  // shoulder under the ball", its contact band to "struck over the head".
  //
  // Each was found by a person reading one band against one ladder, months
  // apart, and nothing stopped the next one arriving. The sweeps above cannot
  // see it either — they ask whether the claim table covers the readout, and a
  // claim naming both halves of a split rung covers it truthfully while the card
  // still praises and corrects the same position.
  //
  // The ends of the axis count as boundaries. A band that runs to the end of its
  // own axis has no values beyond it to correct, so there is no rung it could
  // split — see `tossArmHold`, praised from 55 all the way to a full hold.
  for (const type of SERVE_TYPE_IDS) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      const boundaries = [copy.range[0], copy.range[1], ...rungsOf(id).map((r) => r.under)]
      for (const [side, edge] of [
        ['floor', copy.ideal[0]],
        ['ceiling', copy.ideal[1]],
      ] as const) {
        assert(
          boundaries.includes(edge),
          `${type} ${id} band ${side} of ${edge} stops inside "${readoutOf(id, edge)}", so that\n` +
            `        one readout is praised on one side of ${edge} and corrected on the other.\n` +
            `        Move it to a rung boundary: ${boundaries.filter(Number.isFinite).join(', ')}`,
        )
      }
    }
  }
})

check('a rewritten line has to say again which positions it claims', () => {
  for (const site of Object.keys(CLAIMED)) {
    const now = stampOf(site)
    assert(
      CLAIMED[site].stamp === now,
      `the copy at ${site} changed since its claim was written.\n` +
        `        Read the lines again, check the rungs claimed below still hold, then stamp '${now}'`,
    )
  }
})

check('every claim is written in the ladder’s own words, and every claim is used', () => {
  // Without this the table above rots into prose about prose: a rung renamed in
  // `anatomy.ts` would silently stop matching and the sweep would pass by
  // claiming nothing at all.
  for (const [site, claimed] of Object.entries(CLAIMED)) {
    const [prefix, id] = site.includes('.') ? site.split('.') : [undefined, site]
    assert(METRICS[id] !== undefined, `${site} claims things about a measurement that is gone`)
    const tags = rungsOf(id).map((r) => r.tag)
    // Read through the same resolver the stamp uses, so an overlay that stops
    // replacing a line cannot leave a claim behind still being counted.
    const { insight: written, fix: ordered } = copyAt(site)
    for (const [kind, list] of Object.entries(claimed.insight)) {
      if (prefix) {
        assert(
          written?.[kind as Kind] !== undefined,
          `${site}.insight.${kind} claims for a line ${prefix} no longer replaces`,
        )
      }
      for (const tag of list) assert(tags.includes(tag), `${site}.insight.${kind}: no rung "${tag}"`)
    }
    for (const [side, aim] of Object.entries(claimed.aim ?? {})) {
      if (prefix) {
        assert(
          ordered?.[side as 'low' | 'high'] !== undefined,
          `${site}.aim.${side} claims for a fix ${prefix} no longer replaces`,
        )
      }
      assert(tags.includes(aim), `${site}.aim.${side}: no rung "${aim}"`)
    }
  }
})

/* ------------------------------------------------------------------ filter -- */

console.log('\n\x1b[1mThe slop filter\x1b[0m')

check('pleasantries and throat-clearing are stripped', () => {
  const cases: [string, string][] = [
    ['Great job on your serve, but your elbow bends.', 'Your elbow bends.'],
    ['It looks like you are dropping the arm early.', 'You are dropping the arm early.'],
    ['You should try to keep the arm straight.', 'Keep the arm straight.'],
    ['Basically, sink until the knees bend.', 'Sink until the knees bend.'],
  ]
  for (const [input, want] of cases) {
    const got = command(input)
    assert(got === want, `"${input}"\n        wanted "${want}"\n        got    "${got}"`)
  }
})

check('hedging words are removed', () => {
  const got = command('Just try to keep the arm a little straighter.')
  assert(!/\bjust\b|\ba little\b/i.test(got), `hedging survived: "${got}"`)
})

check('a multi-paragraph answer is cut to two sentences', () => {
  const got = command(
    'Your toss drifts. Fix it with a fence drill. Then film again next week. Then check the trend.',
  )
  assert(got === 'Your toss drifts. Fix it with a fence drill.', `got "${got}"`)
})

check('a decimal point is not the end of a sentence', () => {
  // The cut used to split on every stop, so a line quoting a reading — "this
  // one 1.9%" — was printed as "this one 1." and lost its number.
  const got = command('Your best serve read 0.3% here, this one 1.9%. Closer than last time.')
  assert(got === 'Your best serve read 0.3% here, this one 1.9%. Closer than last time.', `got "${got}"`)
})

check('an over-long sentence is cut at a word boundary and closed off', () => {
  const long = `Keep ${Array.from({ length: 40 }, () => 'word').join(' ')}`
  const got = command(long)
  assert(wordCount(got) <= MAX_WORDS, `${wordCount(got)} words survived`)
  assert(/[.!?]$/.test(got), `no terminator: "${got}"`)
})

check('a cut never leaves the rest of the report in bold', () => {
  const got = command(`**Keep the arm straight ${Array.from({ length: 40 }, () => 'word').join(' ')}**`)
  assert((got.match(/\*\*/g)?.length ?? 0) % 2 === 0, `unbalanced markers: "${got}"`)
})

check('the filter is idempotent, so copy cannot be shortened twice', () => {
  for (const { where, text } of everyCue()) {
    assert(command(command(text)) === command(text), `${where} changes on a second pass`)
  }
})

check('marked-up copy survives being flattened for plain text', () => {
  const flat = plain('**Keep** the arm straight.')
  assert(flat === 'Keep the arm straight.', `got "${flat}"`)
})

check('the ceilings are the ones the copy was written against', () => {
  assert(MAX_WORDS === 25, `word ceiling moved to ${MAX_WORDS}`)
  assert(MAX_SENTENCES === 2, `sentence ceiling moved to ${MAX_SENTENCES}`)
})

/* ------------------------------------------------------------------- drills -- */

console.log('\n\x1b[1mOne fault, one drill\x1b[0m')

check('every measurement carries exactly one corrective drill', () => {
  for (const m of Object.values(METRICS)) {
    assert(m.drill.name.length > 0, `${m.id} has no drill`)
    assert(m.drill.how.length > 0, `${m.id} drill has no instruction`)
    assert(m.drill.reps.length > 0, `${m.id} drill has no rep count`)
    assert(
      wordCount(m.drill.how) <= MAX_WORDS,
      `${m.id} drill runs to ${wordCount(m.drill.how)} words`,
    )
  }
})

check('no two measurements share a drill name by accident', () => {
  const seen = new Map<string, string>()
  for (const m of Object.values(METRICS)) {
    const clash = seen.get(m.drill.name)
    // The same object is a share on purpose: one quantity read two ways, the
    // hand's and the ball's contact height, never both on one card.
    assert(!clash || METRICS[clash].drill === m.drill, `${m.id} and ${clash} both use "${m.drill.name}"`)
    seen.set(m.drill.name, m.id)
  }
})

/* ===================================================== the verdict layer == */

console.log('\n\x1b[1mFrom identifier to sentence\x1b[0m')

check('every flaw the engine can name has words and an exercise', () => {
  // Three tables have to agree, and nothing but this connects them: `FLAWS`
  // decides what can be detected, `FLAW_DRILL` names the exercise, and
  // `FLAW_COPY` writes the sentence. A gap in any one of them is a report whose
  // single instruction is a blank heading or a drill card with no drill in it —
  // and it would only show up for the player whose serve happened to have that
  // fault as its worst one.
  for (const spec of FLAWS) {
    const copy = VERDICT_TABLES.flaws[spec.flaw]
    assert(Boolean(copy), `${spec.flaw} can be detected but has no copy`)
    assert(Boolean(copy.title.trim()), `${spec.flaw} has an empty title`)
    assert(Boolean(FLAW_DRILL[spec.flaw]), `${spec.flaw} has no drill id`)
    assert(
      Boolean(DRILLS[FLAW_DRILL[spec.flaw]]),
      `${spec.flaw} points at drill "${FLAW_DRILL[spec.flaw]}", which does not exist`,
    )
  }
})

check('every axis a flaw can be measured along has words and an exercise of its own', () => {
  /*
   * The same three-table agreement as above, one level down, where it was
   * missing. `toss_drift` chooses its drill by the axis the toss wandered along,
   * and `DRILLS` gained two entries for it that nothing referenced and no test
   * could reach — an unreachable drill goes stale silently, and the day triage
   * starts asking for it the player gets a blank card.
   *
   * Both directions are checked. Every axis with copy needs a drill, and every
   * axis with a drill needs copy — a heading in one axis's words above an
   * exercise for the other is the exact failure this whole axis pass was about.
   */
  for (const [flaw, copy] of Object.entries(VERDICT_TABLES.flaws)) {
    const axes = new Set([
      ...Object.keys(copy.byAxis ?? {}),
      ...Object.keys(FLAW_DRILL_BY_AXIS[flaw as FlawId] ?? {}),
    ]) as Set<BodyAxis>

    for (const axis of axes) {
      const words = copy.byAxis?.[axis]
      assert(Boolean(words?.title?.trim()), `${flaw}/${axis} has a drill but no heading`)
      assert(Boolean(words?.low?.trim()), `${flaw}/${axis} has a heading but nothing under it`)

      const id = drillIdFor(flaw as FlawId, axis)
      assert(Boolean(DRILLS[id]), `${flaw}/${axis} points at drill "${id}", which does not exist`)
      assert(
        id !== drillIdFor(flaw as FlawId),
        `${flaw}/${axis} falls back to the axis-neutral drill, so the axis buys nothing`,
      )
    }

    // Two axes cannot share one exercise: the whole reason the axis is carried
    // is that a drill constrains one direction and says nothing about the other.
    const ids = [...axes].map((a) => drillIdFor(flaw as FlawId, a))
    assert(new Set(ids).size === ids.length, `${flaw} hands the same drill to two different axes`)
  }
})

check('a two-sided fault says something different on each side', () => {
  // The toss peak is the one signal with a wrong answer above the band as well
  // as below it. One sentence for both would tell half the players who see it
  // the opposite of what they need, so the pair must exist and must differ.
  for (const [flaw, copy] of Object.entries(VERDICT_TABLES.flaws)) {
    if (!copy.high) continue
    assert(copy.high !== copy.low, `${flaw} says the same thing above and below its band`)
    assert(
      Boolean(copy.highTitle) && copy.highTitle !== copy.title,
      `${flaw} has two sentences and one heading`,
    )
  }
})

check('a refusal names something the player can film differently', () => {
  // The one test a refusal has to pass. "Your clip was unusable" is true and
  // costs the player the serve; every reason here has to come with an action.
  for (const [reason, copy] of Object.entries(VERDICT_TABLES.refusals)) {
    assert(copy.hints.length >= 2, `${reason} offers fewer than two things to try`)
    for (const hint of copy.hints) {
      assert(wordCount(hint) <= 30, `${reason} hint runs to ${wordCount(hint)} words`)
      assert(/[.!?]$/.test(hint.trim()), `${reason} hint is not a finished sentence`)
    }
  }
})

check('a refused clip is never handed a fault to work on', () => {
  // The two halves of the verdict layer must not both answer. A refusal that
  // also produced a focus would put an instruction on screen underneath a
  // heading saying the clip could not be read.
  const refused = {
    schema: 1 as const,
    status: 'rejected' as const,
    reason: 'too_blurry' as const,
    quality: {
      confidence: 0.2,
      blur: 0.9,
      roll_deg: 0,
      yaw_deg: 80,
      yaw_measured: true,
      swing_samples: 4,
      depth_unreliable: false,
    },
    injury_risk: [],
    suppressed_count: 0,
  }
  assert(refusalFor(refused) !== undefined, 'a rejected clip produced no refusal')
  assert(causalFocus(refused) === undefined, 'a rejected clip was still handed a fault to fix')
})

check('the verdict layer writes nothing an editor would cut', () => {
  // Belt and braces over the sweep above: these strings are assembled and passed
  // through `cue` at runtime, and a source line over the ceiling would be
  // silently truncated mid-sentence rather than failing anything.
  for (const { where, text } of everyVerdictCue()) {
    const issues = cueIssues(text)
    assert(issues.length === 0, `${where}: ${issues.join('; ')}\n        "${text}"`)
    assert(
      command(text) === text.trim(),
      `${where} is changed by the filter, so the source and the screen disagree:\n        "${text}"\n        "${command(text)}"`,
    )
  }
})

check('the ungraded delta line says a direction and never a figure', () => {
  /*
   * This is the line R50 nearly shipped with a number in it. Its own brief
   * proposed "laid back 18° further", which is an honest sentence and one
   * `voice.ts` refuses: `MATH` fails any line carrying degrees, on the standing
   * rule that a readout speaks in body language. The usual escape is
   * `readoutOf`, and it is shut — `external_rotation_deg` has no ladder in
   * `anatomy.ts` and cannot be given one, because a ladder is a set of absolute
   * stops and this reading is in `UNCALIBRATED` precisely for having no zero.
   *
   * So the check is on both halves: the sentence passes the same lint every
   * coaching line passes, and it contains no figure for anyone to read as a
   * target. A future round that puts the magnitude back has to move this.
   */
  const text = uncalibratedLine('external_rotation_deg', 1, 4)
  assert(text !== undefined, 'the one identifier this maps produced no line')
  const issues = cueIssues(text!)
  assert(issues.length === 0, `${issues.join('; ')}\n        "${text}"`)
  assert(
    !/\d+(\.\d+)?\s*(°|deg|degrees)/.test(text!),
    `a figure in degrees reached the panel: "${text}"`,
  )
  // Serve numbers are the exception and have to be there: a change with no
  // serves attached is not a fact about two serves, it is an assertion.
  assert(/serve 4/.test(text!) && /serve 1/.test(text!), `the two serves are not named: "${text}"`)
})

check('the landing delta line describes a body position and grades nothing', () => {
  /*
   * The trap this catches is one adjective. `LandingBalance.offset` is unsigned,
   * so the app does not know which way the body went, and ungraded, so it does
   * not know that going further was worse — a serve hit with real intent
   * finishes travelling. "Fell", "lost", "off balance" would each be the app
   * grading the one reading it has decided it cannot grade.
   */
  const text = uncalibratedLine('landing_offset_ratio', 2, 5)
  assert(text !== undefined, 'the landing identifier produced no line')
  const issues = cueIssues(text!)
  assert(issues.length === 0, `
        ""`)
  assert(!/d+(.d+)?s*(°|deg)/.test(text!), `a figure reached the panel: ""`)
  assert(
    !/fell|falling|lost|off balance|unbalanced|collaps/i.test(text!),
    `the line grades a reading nothing grades: ""`,
  )
  assert(/serve 5/.test(text!) && /serve 2/.test(text!), `the two serves are not named: ""`)
})

check('a reading with no line of its own prints nothing rather than something generic', () => {
  // `leg_drive_rise_ratio` is the live case: measured in R51·1, in the register,
  // and deliberately not surfaced yet. This check used to name `chain_span_ratio`
  // and went red the moment R50·3 gave that one a line — which is the check
  // working, and the reason it now names something still genuinely unmapped.
  assert(
    uncalibratedLine('leg_drive_rise_ratio', 1, 2) === undefined,
    'an unmapped identifier was given a sentence anyway',
  )
})

/*
 * ONE TALLY, AND IT COVERS THE WHOLE FILE.
 *
 * This used to sit two thirds of the way up, above the verdict-layer section,
 * and everything below it was unenforced: `report()` calls `process.exit(1)`
 * only when it has failures to print, so a check that failed after it printed
 * its red cross and the file still exited 0. Proved rather than reasoned about —
 * a deliberate `assert(false)` dropped into the verdict section printed one
 * cross and the file exited 0.
 *
 * Eight checks sat in that dead zone, including every check that the flaw table,
 * the drill table and the copy table agree with one another. `LOOP.md` names
 * this file as one of the three critics in executable form, and a third of it
 * was decorative.
 *
 * A tally belongs at the end of the file it is a tally of. Nothing may follow it.
 */

check('the racket lay-back line says a direction, grades nothing, and carries no figure', () => {
  /*
   * R50b's line, and it is not reached by `everyVerdictCue()` — that walks the
   * flaw tables, and this takes a `RotationMove`. Checked directly for the same
   * reason `uncalibratedLine` is: a sentence nothing walks is a sentence nothing
   * lints, which is the finding R69 was built on.
   *
   * BOTH DIRECTIONS ARE CHECKED, and neither may be graded. Laying the racket
   * back further is usually good and is not always; nothing in this engine knows
   * what the number should be for a club player, which is why the reading sits
   * in `UNCALIBRATED` at all. A line that praised one direction would be the app
   * grading a reading it has decided it cannot grade — and would be the
   * speaks-only-on-good-news shape this codebase has rejected twice.
   */
  for (const delta of [24, -24]) {
    const text = rotationMoveLine({ delta, bound: 17 })
    const issues = cueIssues(text)
    assert(issues.length === 0, `${issues.join('; ')}\n        "${text}"`)
    assert(!/\d+(\.\d+)?\s*(°|deg|degrees)/.test(text), `a figure reached the glance: "${text}"`)
    assert(
      !/good|better|worse|well done|nice|improve|should/i.test(text),
      `the line grades a reading nothing grades: "${text}"`,
    )
  }
  // And they must actually differ, or the direction is not being reported.
  assert(
    rotationMoveLine({ delta: 24, bound: 17 }) !== rotationMoveLine({ delta: -24, bound: 17 }),
    'both directions produce the same sentence, so the change has no direction on screen',
  )
})


check('the sequence delta line names legs and arm, and grades neither direction', () => {
  /*
   * "The chain" is coach jargon and banned by constraint 4 — `voice.ts` does not
   * catch it, which is exactly why this check names it. The line says legs and
   * arm, which is the same fact in words a player owns.
   *
   * And neither direction is graded: a tour sequence is not simply later or
   * earlier than a club one, and nothing here knows what the number should be.
   */
  const text = uncalibratedLine('chain_span_ratio', 1, 4)
  assert(text !== undefined, 'the sequence identifier produced no line')
  const issues = cueIssues(text!)
  assert(issues.length === 0, `${issues.join('; ')}\n        "${text}"`)
  assert(!/\bchain\b/i.test(text!), `coach jargon reached the panel: "${text}"`)
  assert(
    !/good|better|worse|should|too (late|early)/i.test(text!),
    `the line grades a reading nothing grades: "${text}"`,
  )
  assert(/serve 4/.test(text!) && /serve 1/.test(text!), `the two serves are not named: "${text}"`)
})

check('every area headline, assembled at runtime, passes the editor', () => {
  // Built from a template around a metric label in `headlineFor`, so no line
  // of the copy database ever contained them, and "Contact height is the
  // brake" reached the screen past every check in this file.
  const failures: string[] = []
  for (const dials of [{}, ...Object.values(DEMO_DIALS)]) {
    for (const f of sampleAnalysis(dials).fundamentals) {
      const issues = cueIssues(f.headline)
      if (f.headline && issues.length) failures.push(`${f.id}: "${f.headline}" — ${issues.join('; ')}`)
    }
  }
  assert(failures.length === 0, failures.join('\n'))
})

/* ------------------------------------------------ what the lint missed ---- */

console.log('\n\x1b[1mThe lines the editor used to miss (L1.5)\x1b[0m')

/**
 * Names, labels and captions: short, but on screen, and the place "Cartwheel
 * shoulders" and "Baseline drop toss" lived because nothing read them.
 */
function everyName(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  const types = Object.keys(SERVE_TYPES) as ServeType[]
  for (const id of Object.keys(METRICS)) {
    out.push({ where: `${id}.label`, text: METRICS[id].label })
    for (const type of types) {
      for (const axis of [undefined, 'depth', 'lateral'] as const) {
        const drill = metricCopy(id, type, axis)?.drill
        if (drill) out.push({ where: `${id}.${type}${axis ? `.${axis}` : ''}.drill.name`, text: drill.name })
      }
    }
  }
  for (const [id, f] of Object.entries(FUNDAMENTALS)) {
    out.push({ where: `${id}.label`, text: f.label })
    out.push({ where: `${id}.drill.name`, text: f.drill.name })
  }
  for (const [id, d] of Object.entries(DRILLS)) out.push({ where: `DRILLS.${id}.name`, text: d.name })
  for (const [flaw, p] of everyProgression()) {
    out.push({ where: `ladder.${flaw}.cue`, text: p.cue })
    out.push({ where: `ladder.${flaw}.easier`, text: p.easier })
    out.push({ where: `ladder.${flaw}.mistake`, text: p.mistake })
    p.steps.forEach((s, i) => {
      out.push({ where: `ladder.${flaw}.${i}.name`, text: s.name })
      out.push({ where: `ladder.${flaw}.${i}.how`, text: s.how })
    })
  }
  for (const [flaw, copy] of Object.entries(VERDICT_TABLES.flaws)) {
    out.push({ where: `flaw.${flaw}.title`, text: copy.title })
  }
  for (const [flag, copy] of Object.entries(VERDICT_TABLES.injuries)) {
    out.push({ where: `injury.${flag}.title`, text: copy.title })
  }
  for (const [id, copy] of Object.entries(PHASE_COPY)) {
    out.push({ where: `phase.${id}.label`, text: copy.label })
    out.push({ where: `phase.${id}.caption`, text: copy.caption })
  }
  return out
}

check('every name, label, ladder line and caption passes the editor', () => {
  const bad = everyName()
    .map((c) => ({ ...c, issues: cueIssues(c.text) }))
    .filter((c) => c.issues.length > 0)
  assert(
    bad.length === 0,
    bad.map((b) => `      ${b.where}: ${b.issues.join('; ')}\n        "${b.text}"`).join('\n'),
  )
})

check('"drop" is held to the racket, and the rule does not catch the racket', () => {
  for (const wrong of ['Your tossing arm drops early.', 'Let the ball drop on the line.', 'Your hitting shoulder dropped.']) {
    assert(cueIssues(wrong).some((i) => i.includes('racket drop')), `missed: "${wrong}"`)
  }
  for (const right of ['Let the racket drop behind you.', 'Hold the hip until the racket drops.', 'Your racket drop is short.', 'The racket head dropped late.']) {
    assert(!cueIssues(right).some((i) => i.includes('racket drop')), `flagged the racket: "${right}"`)
  }
})

check('every practice headline passes the editor, for every label and every branch', () => {
  // The sentence is built round the label at runtime, so the table check above
  // never saw it. Every label against every branch, at the longest counts.
  const branches: Partial<PracticeFocus>[] = [
    { verdict: 'improving', drilled: 3 },
    { verdict: 'improving', drilled: 0 },
    { verdict: 'slipping' },
    { verdict: 'stuck', drilled: 2 },
    { verdict: 'stuck', drilled: 9 },
    { verdict: 'stuck', drilled: 0, timesWeakest: 5 },
    { verdict: 'stuck', drilled: undefined, timesWeakest: 5 },
    { verdict: 'stuck', drilled: undefined, timesWeakest: 1 },
  ]
  const failures: string[] = []
  for (const m of Object.values(METRICS)) {
    for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
      for (const b of branches) {
        const f = { label: m.label, sessionsConsidered: 5, timesWeakest: 1, serveType: type, ...b } as PracticeFocus
        const line = practiceHeadline(f)
        const issues = cueIssues(line)
        if (issues.length) failures.push(`${m.id} ${type} ${JSON.stringify(b)}: ${issues.join('; ')}\n        "${line}"`)
        if (/^Your [a-z]/.test(line)) failures.push(`${m.id}: the label is behind a possessive: "${line}"`)
      }
    }
  }
  assert(failures.length === 0, failures.slice(0, 6).join('\n'))
})

check('a toss is placed in foot-lengths, never as a share of height', () => {
  for (const axis of ['ahead', 'across'] as const) {
    for (const v of [-0.6, -0.31, -0.18, -0.05, 0, 0.02, 0.07, 0.15, 0.22, 0.3, 0.45, 0.6]) {
      const line = placeLine(axis, v)
      assert(cueIssues(line).length === 0, `"${line}": ${cueIssues(line).join('; ')}`)
      assert(!/%|height/.test(line), `a share of height reached the player: "${line}"`)
    }
  }
  assert(placeLine('ahead', FOOT_SHARE) === 'about one foot-length in front of your front foot', placeLine('ahead', FOOT_SHARE))
  assert(placeLine('ahead', 0.01) === 'over your front foot', 'a toss over the foot was placed off it')
})

report()
