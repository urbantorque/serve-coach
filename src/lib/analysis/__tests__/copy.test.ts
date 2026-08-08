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
  DRILLS,
  FUNDAMENTALS,
  METRICS,
  SERVE_TYPES,
  metricCopy,
  type MetricCopy,
} from '../coaching'
import { MAX_SENTENCES, MAX_WORDS, command, cueIssues, plain, wordCount } from '../voice'
import { VERDICT_TABLES, causalFocus, everyVerdictCue, refusalFor } from '../verdict'
import { FLAWS } from '../flaws'
import { FLAW_DRILL } from '../triage'
import { assert, check, report } from './harness'
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
  // The one that must genuinely differ: a kick is struck over the head, a flat
  // serve in front of the body. If these ever collapse to the same phrase the
  // serve-type picker has stopped meaning anything on screen.
  const flat = targetOf('contactAhead', metricCopy('contactAhead', 'flat').ideal)
  const kick = targetOf('contactAhead', metricCopy('contactAhead', 'kick').ideal)
  assert(flat !== kick, `flat and kick ask for the same contact point: "${flat}"`)
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
  tossArmExtension: {
    stamp: 'e2ea3dd9',
    insight: { low: ['Elbow folded', 'Elbow soft'], ok: ['Arm straight'], high: ['Arm straight'] },
    aim: { low: 'Arm straight', high: 'Arm straight' },
  },
  releaseHeight: {
    stamp: 'e1c5c11a',
    insight: {
      low: ['Let go at head height', 'Let go above the head'],
      ok: ['Let go at full stretch'],
      high: ['Let go past full stretch'],
    },
    aim: { low: 'Let go at full stretch', high: 'Let go at full stretch' },
  },
  tossArmHold: {
    stamp: 'c62244b5',
    insight: {
      low: ['Arm drops at once', 'Arm drops early'],
      ok: ['Arm holds to the swing', 'Arm holds through contact'],
      high: ['Arm holds through contact'],
    },
    aim: { low: 'Arm holds to the swing', high: 'Arm holds to the swing' },
  },
  tossPathWobble: {
    stamp: '86c85fdf',
    insight: {
      low: ['Dead straight lift'],
      ok: ['Dead straight lift', 'Straight lift'],
      high: ['Drifts a hand wide', 'Wanders wide'],
    },
    aim: { high: 'Straight lift' },
  },
  tossPeakHeight: {
    stamp: '99c04c3d',
    insight: {
      // "Peaks at racket reach" is claimed on both sides: it is the flat serve's
      // near miss and the kick serve's floor, and neither sentence denies it.
      low: ['Peaks below the racket', 'Peaks at racket reach'],
      ok: ['Peaks at racket reach', 'Peaks a ball above the racket'],
      high: ['Peaks a ball above the racket', 'Peaks far above the racket'],
    },
    aim: { low: 'Peaks a ball above the racket', high: 'Peaks a ball above the racket' },
  },
  contactBelowPeak: {
    stamp: '4c48180c',
    insight: {
      low: ['Struck at the peak'],
      ok: ['Struck at the peak', 'Struck near the peak'],
      high: ['Struck on the way down', 'Struck well after the drop'],
    },
    aim: { high: 'Struck at the peak' },
  },
  kneeBend: {
    stamp: 'c3f25db6',
    insight: {
      low: ['Legs straight', 'Legs barely bent'],
      ok: ['Athletic load'],
      high: ['Deep squat'],
    },
    aim: { low: 'Athletic load', high: 'Athletic load' },
  },
  hipShoulderSeparation: {
    stamp: 'dcbbacf6',
    insight: {
      // Four rungs, two faults: a chest that opened ahead of the hips and a coil
      // too shallow to unwind. The one string below the band names the shortfall
      // they share and asserts no direction, which is the only way one sentence
      // covers both without denying the readout at one end or the other.
      low: [
        'Chest opens ahead of the hips',
        'Chest leads the hips',
        'Hips and chest locked',
        'Slight coil',
      ],
      ok: ['Hips lead the chest'],
      high: ['Extreme coil'],
    },
    aim: { low: 'Hips lead the chest', high: 'Hips lead the chest' },
  },
  shoulderTilt: {
    stamp: '55cccbbd',
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
      ok: ['Hitting shoulder under the ball', 'Steep cartwheel'],
      high: ['Hitting shoulder under the ball', 'Steep cartwheel'],
    },
    aim: { low: 'Hitting shoulder under the ball', high: 'Hitting shoulder under the ball' },
  },
  legDrive: {
    stamp: '358b59d4',
    insight: {
      low: ['No push off the court', 'Light push'],
      ok: ['Strong drive up'],
      high: ['Big launch'],
    },
    aim: { low: 'Strong drive up', high: 'Strong drive up' },
  },
  dropDepth: {
    stamp: '6585e1cf',
    insight: {
      low: ['Racket stays at the shoulder', 'Racket half drops'],
      ok: ['Racket falls down the back'],
      high: ['Racket falls past the back'],
    },
    aim: { low: 'Racket falls down the back', high: 'Racket falls down the back' },
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
  dropToContact: {
    // Re-stamped when `ok` dropped the phrase "acceleration window" — lab
    // vocabulary that clears the voice lint (it is not on the jargon list) and
    // still loses a player who has never met the term. The rungs claimed below
    // are unchanged: a racket that fires with no pause is an explosive swing.
    stamp: '396a3a7c',
    insight: {
      low: ['Swing snaps through'],
      ok: ['Explosive swing'],
      high: ['Guided swing', 'Steered swing'],
    },
    aim: { low: 'Explosive swing', high: 'Explosive swing' },
  },
  contactHeight: {
    stamp: 'e056d4f1',
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
      ok: ['Arm dead straight'],
      high: ['Arm dead straight'],
    },
    aim: { low: 'Arm dead straight', high: 'Arm dead straight' },
  },
  bodyExtension: {
    // Re-stamped when `fix.low` stopped saying "proves the sequence fired". The
    // insight beside it had already been plain-languaged to "your legs, body and
    // arm fired in the right order", so one card was carrying both registers —
    // the description in English and the correction in shorthand. The rung this
    // fix aims at, "up off the court", is unchanged.
    stamp: '2016d48c',
    insight: {
      low: ['Feet stay on the court'],
      ok: ['Up off the court'],
      high: ['Big jump'],
    },
    aim: { low: 'Up off the court', high: 'Up off the court' },
  },
  contactAhead: {
    stamp: 'e993b3fb',
    insight: {
      low: ['Struck behind the head', 'Struck over the head'],
      ok: ['Struck in front of the body', 'Struck far in front'],
      high: ['Struck far in front'],
    },
    aim: { low: 'Struck in front of the body', high: 'Struck in front of the body' },
  },
  totalTime: {
    // Re-stamped when `ok` stopped claiming "unhurried into the trophy, fast out
    // of it". This measurement times the first move to the ball and cannot see
    // where the trophy fell inside that, so the old line asserted a split it
    // never measured. The rungs claimed below are unchanged by the rewrite.
    stamp: 'ab8674d5',
    insight: {
      low: ['Rushed motion'],
      ok: ['Even tempo'],
      high: ['Long motion', 'Stalled motion'],
    },
    aim: { low: 'Even tempo', high: 'Even tempo' },
  },
  loadRatio: {
    stamp: 'd5633430',
    insight: {
      low: ['Crammed finish'],
      ok: ['Slow build, fast finish'],
      high: ['Back half drifts'],
    },
    aim: { low: 'Slow build, fast finish', high: 'Slow build, fast finish' },
  },
  syncAtRelease: {
    stamp: '60d2b726',
    insight: {
      low: ['Racket still by the leg'],
      ok: ['Arms rise together'],
      high: ['Racket up early'],
    },
    aim: { low: 'Arms rise together', high: 'Arms rise together' },
  },

  /* The lines a serve type replaces, claimed where they are written. */
  'kick.contactAhead': {
    stamp: 'bf5b00fa',
    insight: {
      low: ['Struck behind the head'],
      ok: ['Struck over the head'],
      high: ['Struck in front of the body', 'Struck far in front'],
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
  'kick.shoulderTilt': {
    stamp: '0f84abf5',
    insight: {
      // Every rung below the kick band, and the top one is the point: a shoulder
      // the ladder calls under the ball is still short of what a kick asks for.
      low: [
        'Tossing shoulder under the ball',
        'Hitting shoulder sits high',
        'Shoulders level',
        'Shoulders near level',
        'Hitting shoulder under the ball',
      ],
    },
    // Which is why the order underneath cannot be the flat one. It aims a rung
    // higher than the flat fix does, at the only position this card praises.
    aim: { low: 'Steep cartwheel' },
  },
}

const SERVE_TYPE_IDS = Object.keys(SERVE_TYPES) as ServeType[]

/** The five lines one site can carry, in a fixed order, for the stamp. */
function linesAt(site: string): (string | undefined)[] {
  const [type, id] = site.includes('.') ? site.split('.') : [undefined, site]
  const insight = type ? SERVE_TYPES[type as ServeType]?.insight?.[id] : METRICS[id]?.insight
  const fix = type ? SERVE_TYPES[type as ServeType]?.fix?.[id] : METRICS[id]?.fix
  return [insight?.low, insight?.ok, insight?.high, fix?.low, fix?.high]
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

/** Where a serve type's card reads its insight from: its own line, or the base. */
const insightSite = (id: string, type: ServeType, kind: Kind) =>
  SERVE_TYPES[type].insight?.[id]?.[kind] ? `${type}.${id}` : id

/** The same for the instruction, which a serve type may replace on its own. */
const fixSite = (id: string, type: ServeType, side: 'low' | 'high') =>
  SERVE_TYPES[type].fix?.[id]?.[side] ? `${type}.${id}` : id

function claimsFor(id: string, type: ServeType, kind: Kind): string[] {
  const site = insightSite(id, type, kind)
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
  for (const type of SERVE_TYPE_IDS) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      for (const v of probes(copy)) {
        // Exactly how `build()` chooses, so this walks the card a player sees
        // rather than a second opinion about which string should have shown.
        const kind: Kind = v < copy.ideal[0] ? 'low' : v > copy.ideal[1] ? 'high' : 'ok'
        const readout = readoutOf(id, v)
        assert(
          claimsFor(id, type, kind).includes(readout),
          `${type} ${id} at ${v.toFixed(3)} reads out "${readout}" under\n` +
            `        "${copy.insight[kind]}"`,
        )
      }
    }
  }
})

check('a fault the card names always arrives with the order that corrects it', () => {
  for (const type of SERVE_TYPE_IDS) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      for (const v of probes(copy)) {
        if (v >= copy.ideal[0] && v <= copy.ideal[1]) continue
        const side = v < copy.ideal[0] ? 'low' : 'high'
        assert(
          copy.fix[side].length > 0,
          `${type} ${id} at ${v.toFixed(3)} is out of band, reads "${readoutOf(id, v)}" and offers no fix`,
        )
      }
    }
  }
})

check('every fix aims at a position the same card would praise', () => {
  for (const type of SERVE_TYPE_IDS) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      const praised = claimsFor(id, type, 'ok')
      for (const side of ['low', 'high'] as const) {
        if (!copy.fix[side]) continue
        const site = fixSite(id, type, side)
        const aim = CLAIMED[site]?.aim?.[side]
        assert(aim !== undefined, `${site}.fix.${side} never says which position it aims at`)
        assert(
          praised.includes(aim as string),
          `${type} ${id} fix.${side} aims at "${aim}", which this card would not praise ` +
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

check('the target phrase is a position the card praises, for every serve type', () => {
  // `targetOf` reads the middle of the band through the ladder, so this is the
  // band and the ok insight checked against each other from the other end: the
  // phrase printed as the target has to be one the praise can be said about.
  for (const type of SERVE_TYPE_IDS) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      const target = targetOf(id, copy.ideal)
      assert(
        claimsFor(id, type, 'ok').includes(target),
        `${type} ${id} asks for "${target}" and praises it with\n        "${copy.insight.ok}"`,
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
    const [type, id] = site.includes('.') ? site.split('.') : [undefined, site]
    assert(METRICS[id] !== undefined, `${site} claims things about a measurement that is gone`)
    const tags = rungsOf(id).map((r) => r.tag)
    for (const [kind, list] of Object.entries(claimed.insight)) {
      if (type) {
        assert(
          SERVE_TYPES[type as ServeType]?.insight?.[id]?.[kind as Kind] !== undefined,
          `${site}.insight.${kind} claims for a line ${type} no longer replaces`,
        )
      }
      for (const tag of list) assert(tags.includes(tag), `${site}.insight.${kind}: no rung "${tag}"`)
    }
    for (const [side, aim] of Object.entries(claimed.aim ?? {})) {
      if (type) {
        assert(
          SERVE_TYPES[type as ServeType]?.fix?.[id]?.[side as 'low' | 'high'] !== undefined,
          `${site}.aim.${side} claims for a fix ${type} no longer replaces`,
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
    assert(!clash, `${m.id} and ${clash} both use "${m.drill.name}"`)
    seen.set(m.drill.name, m.id)
  }
})

report()

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
