/**
 * A short lesson for each fault (C1.3): what it costs, and what good looks like.
 *
 * The report already says what is happening (`verdict.ts`, the fault's `low`
 * line), the drill says what to do and the demonstration shows it moving. What
 * nothing said was why a player should care: a fault is only worth a week of
 * drills if it costs pace, the ball's height over the net, or a joint. So each
 * fault has one or two costs and one line of what good looks like.
 *
 * CITED OR MARKED. Every claim names where it comes from: a study, by a key into
 * `SOURCES` below, or `COACHING`, which says out loud that it is how coaches
 * teach the serve and not a measurement. The studies are the ones read for
 * `tiers.ts` (the biomechanics brief), and each line says no more than its
 * source measured: who was studied is in the line where it matters ("junior
 * players", "skilled servers"), and a figure borrowed from another task is not
 * quoted. `lessons.test.ts` holds every claim to a source and to the copy lint.
 *
 * Only faults with a ladder have a lesson: those are the ones a report hands a
 * drill for. `arming_the_ball` is retired and `pancake_contact` never named.
 */
import type { FlawId } from './flaws'

/** A study a lesson cites: how a player sees it, and the full reference for anyone checking. */
export interface Source {
  /** Authors and year, as the lesson shows it. */
  short: string
  /** The full reference. */
  ref: string
}

export const SOURCES = {
  reid2008: {
    short: 'Reid, Elliott and Alderson, 2008',
    ref: 'Reid M, Elliott B, Alderson J. Med Sci Sports Exerc 2008;40:308-315. doi:10.1249/mss.0b013e31815c6d61',
  },
  deghaies2026: {
    short: 'Deghaies and others, 2026',
    ref: 'Deghaies K, Lussiana T, Touzard P, Fourel L, et al. J Hum Kinet 2026. doi:10.5114/jhk/203795',
  },
  girard2005: {
    short: 'Girard, Micallef and Millet, 2005',
    ref: 'Girard O, Micallef JP, Millet GP. Med Sci Sports Exerc 2005;37:1021-1029. PMID 15947729',
  },
  martin2015: {
    short: 'Martin, 2015',
    ref: 'Martin C. ITF Coach Sport Sci Rev 2015;23(67):22-24. doi:10.52383/itfcoaching.v23i67.154',
  },
  touzard2019: {
    short: 'Touzard and others, 2019',
    ref: 'Touzard P, Kulpa R, Bideau B, Montalvan B, Martin C. Eur J Sport Sci 2019;19:765-773. doi:10.1080/17461391.2018.1539527',
  },
  elliott2006: {
    short: 'Elliott, 2006',
    ref: 'Elliott B. Br J Sports Med 2006;40:392-396. doi:10.1136/bjsm.2005.023150',
  },
  newton2025: {
    short: 'Newton and others, 2025',
    ref: 'Newton O, Girard O, Chin A, Reid M. Eur J Sport Sci 2025;25:e70022. doi:10.1002/ejsc.70022',
  },
  gao2026: {
    short: 'Gao and others, 2026',
    ref: 'Gao B, Hu H, Liu Y, Chen H, et al. Front Sports Act Living 2026;8:1787475. doi:10.3389/fspor.2026.1787475',
  },
  campbell2013: {
    short: 'Campbell and others, 2013',
    ref: 'Campbell A, Straker L, O’Sullivan P, Elliott B, Reid M. Med Sci Sports Exerc 2013;45:1562-1568. doi:10.1249/MSS.0b013e31828bea5e',
  },
  whiteside2013: {
    short: 'Whiteside and others, 2013',
    ref: 'Whiteside D, Elliott B, Lay B, Reid M. J Appl Biomech 2013;29:573-582. doi:10.1123/jab.29.5.573',
  },
  whiteside2015: {
    short: 'Whiteside and others, 2015',
    ref: 'Whiteside D, Elliott BC, Lay B, Reid M. J Sports Sci 2015;33:675-686. doi:10.1080/02640414.2014.962569',
  },
  mendes2013: {
    short: 'Mendes and others, 2013',
    ref: 'Mendes PC, et al. J Sports Sci Med 2013;12:309-315',
  },
  vacek2023: {
    short: 'Vacek and others, 2023',
    ref: 'Vacek J, Vagner M, Cleather DJ, Stastny P. Appl Sci 2023;13:3586. doi:10.3390/app13063586',
  },
  kovacs2011: {
    short: 'Kovacs and Ellenbecker, 2011',
    ref: 'Kovacs M, Ellenbecker T. Sports Health 2011;3:504-513. doi:10.1177/1941738111414175',
  },
  kibler1995: {
    short: 'Kibler, 1995, as Kovacs reports it',
    ref: 'Kibler WB 1995, reported in Kovacs M, Ellenbecker T. Sports Health 2011;3:504-513. doi:10.1177/1941738111414175',
  },
} as const satisfies Record<string, Source>

export type SourceId = keyof typeof SOURCES

/** A claim that is how the serve is coached rather than something a study measured. */
export const COACHING = 'coaching' as const

/** What a fault costs: pace, height, the net and the body, and the timing that leads to them. */
export type CostKind = 'pace' | 'reach' | 'net' | 'body' | 'timing'

export const COST_NAME: Record<CostKind, string> = {
  pace: 'Pace',
  reach: 'Reach',
  net: 'Clearing the net',
  body: 'Your body',
  timing: 'Timing',
}

export interface Claim {
  text: string
  /** One study, several that agree, or the coaching mark. */
  from: SourceId | SourceId[] | typeof COACHING
}

export interface Lesson {
  costs: (Claim & { kind: CostKind })[]
  good: Claim
}

export const LESSONS: Partial<Record<FlawId, Lesson>> = {
  toss_arm_drops: {
    costs: [
      {
        kind: 'reach',
        text: 'Skilled servers told to drop the tossing arm at a different time met the ball with a more bent hitting arm.',
        from: 'newton2025',
      },
    ],
    good: { text: 'The tossing arm stays up, pointing at the ball, until the racket starts up to meet it.', from: COACHING },
  },
  contact_behind: {
    costs: [
      {
        kind: 'net',
        text: 'A ball met behind you leaves the strings climbing, so it sails long or you pull it down into the net.',
        from: COACHING,
      },
    ],
    good: {
      text: 'On a flat serve, skilled servers meet the ball about a third of their height in front of the front foot.',
      from: 'vacek2023',
    },
  },
  waiters_tray: {
    costs: [
      {
        kind: 'body',
        text: 'Junior players who served palm up put more twist through the shoulder and more strain on the elbow, for no extra speed.',
        from: 'touzard2019',
      },
    ],
    good: { text: 'The racket edge leads up to the ball, with the palm facing the side fence at the top.', from: COACHING },
  },
  toss_height: {
    costs: [
      {
        kind: 'timing',
        text: 'Beginners wait at the top for a toss to come down, and a pause there loses some of the stretch that powers the arm.',
        from: ['newton2025', 'elliott2006'],
      },
      {
        kind: 'pace',
        text: 'A toss too low makes you bend the arm or hurry the swing to catch it.',
        from: COACHING,
      },
    ],
    good: {
      text: 'Skilled servers let the ball fall from its peak before they hit it, about half a metre to a metre.',
      from: ['newton2025', 'gao2026'],
    },
  },
  toss_drift: {
    costs: [
      {
        kind: 'timing',
        text: 'When the toss moves, skilled servers bend the elbow differently to reach it, so the swing changes serve to serve.',
        from: 'whiteside2015',
      },
    ],
    good: {
      text: 'Experienced servers keep the top of the toss within about a hand’s width from one serve to the next.',
      from: 'mendes2013',
    },
  },
  posture_collapse: {
    costs: [
      {
        kind: 'body',
        text: 'Elite young players with low back pain had more sideways force through the lower back while serving.',
        from: 'campbell2013',
      },
    ],
    good: {
      text: 'The trunk stays straight and tilts as one piece, hitting shoulder over the other, rather than bending at the waist.',
      from: COACHING,
    },
  },
  collapsed_elbow: {
    costs: [
      {
        kind: 'body',
        text: 'A low elbow swings the forearm on its own, which coaches find slower and harder on the elbow.',
        from: COACHING,
      },
    ],
    good: { text: 'The elbow stays at shoulder height or above while the racket falls behind you.', from: COACHING },
  },
  shallow_drop: {
    costs: [
      {
        kind: 'pace',
        text: 'The upper arm turning over gives the biggest share of racket speed at contact, and that turn starts from the racket behind you.',
        from: 'elliott2006',
      },
    ],
    good: { text: 'The racket head falls behind your back, tip to the ground, before it starts up.', from: COACHING },
  },
  early_shoulder_rotation: {
    costs: [
      {
        kind: 'pace',
        text: 'In a widely used model, the legs, hips and trunk give about half the serve’s energy, more than the arm can easily replace.',
        from: 'kibler1995',
      },
    ],
    good: {
      text: 'The chest stays turned to the side fence until the racket has fallen, then turns to the court.',
      from: COACHING,
    },
  },
  no_leg_drive: {
    costs: [
      {
        kind: 'pace',
        text: 'Skilled servers who served with no leg drive swung the racket about a tenth slower.',
        from: 'reid2008',
      },
    ],
    good: {
      text: 'Professional servers’ bodies rise about a sixth of their height from the knee bend to the hit.',
      from: 'deghaies2026',
    },
  },
  low_contact: {
    costs: [
      {
        kind: 'net',
        text: 'Meeting the ball a hand’s width higher lets a serve land about a foot shorter in the box and still clear the net.',
        from: 'martin2015',
      },
    ],
    good: {
      text: 'Elite servers meet the ball at about one and a half times their height, beginners lower.',
      from: 'girard2005',
    },
  },
}

/** Who a claim is from, as the lesson says it. */
export function fromLine(from: Claim['from']): string {
  if (from === COACHING) return 'How coaches teach it, not a measurement.'
  const ids = Array.isArray(from) ? from : [from]
  return `${ids.map((id) => SOURCES[id].short).join('; ')}.`
}

/** Every line a lesson can show, for the copy lint. */
export function everyLessonLine(): { flaw: FlawId; text: string }[] {
  const out: { flaw: FlawId; text: string }[] = []
  for (const [flaw, lesson] of Object.entries(LESSONS) as [FlawId, Lesson][]) {
    for (const c of lesson.costs) out.push({ flaw, text: c.text }, { flaw, text: fromLine(c.from) })
    out.push({ flaw, text: lesson.good.text }, { flaw, text: fromLine(lesson.good.from) })
  }
  return out
}
