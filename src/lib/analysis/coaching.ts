import type { ServeType } from '../storage/prefs'
import type { BodyAxis } from './axes'
import { weightedScore } from './geometry'
import type { Drill, Fundamental, FundamentalId, PhaseId } from './types'

/**
 * Copy for every measurement the app makes.
 *
 * `insight` is what the body did and is always shown. `fix` is the instruction
 * and is only shown when the measurement falls outside its band, so the report
 * reads as praise where praise is due and as an order where it is not.
 *
 * Every string here is a command, not a description. Two rules, both enforced by
 * `voice.ts` and tested over this whole file: at most twenty-five words, at most
 * two sentences. The key words carry `**markers**` so a player scanning the page
 * on a court sees the instruction before they read the sentence around it.
 *
 * `drill` is the one corrective exercise for this fault — one step, done on a
 * court, no equipment beyond a racket and a ball. One per measurement rather
 * than a menu: a player given three drills does none of them.
 */
export interface MetricCopy {
  id: string
  label: string
  unit: string
  phase: PhaseId
  weight: number
  ideal: [number, number]
  range: [number, number]
  /**
   * The axis length the scoring decay outside the band is measured against, when
   * that is not the axis itself.
   *
   * Only the signed measurements set it. Their axis carries a mirror half — the
   * same posture pointing the other way — and letting the scorer treat that as
   * extra axis would soften every miss on a band that never moved. See
   * `scoreAgainst`.
   */
  missSpan?: number
  decimals: number
  /** What the band stands on. A row with nothing to cite is a reading instead (`READINGS`). */
  source: BandSource
  insight: { low: string; ok: string; high: string }
  fix: { low: string; high: string }
  drill: Drill
}

/**
 * What a graded band stands on (D2.1). One of two things, and nothing else:
 *
 * - `study`: published figures the band is drawn from, converted to this
 *   engine's units, from the sources in `ANALYSIS-REVIEW.md` §3.5 and the
 *   research brief behind it.
 * - `motion`: no study gives a figure, so the band was re-derived on real
 *   serve motion — the forty Bath serves read inside it from every placement —
 *   and the fault it names was dialled into the rig and reads outside it.
 *   `bands.test.ts` re-checks both halves.
 *
 * A band with neither is a guess, and a guess is not graded: the measurement
 * moves to `READINGS` and is shown without a band.
 */
export type BandSource = { study: string } | { motion: string }

/*
 * Drills that more than one place hands out, held once so a card row, an area
 * and a fault's ladder give the player the same object (L1.4). None of them
 * stops the swing: a pause practised is a pause learned, which is how a hitch
 * at the trophy is taught (`progressions.ts`).
 */

/** The legs and hips starting the throw; the loading area's, and the first rung for the legs. */
const PUSH_THROWS: Drill = {
  name: 'Push throws',
  how: 'From side-on with your knees bent, push a ball up and out to full reach, legs and hips first.',
  reps: '10 throws',
}

/** The open chest's drill: the hips turning first while the chest stays closed. */
const HIP_LEAD_TURN: Drill = {
  name: 'Hip lead turn',
  how: 'Shadow serve and turn the hips to the court while the chest stays closed.',
  reps: '10 reps',
}

/** The throwing arm's own action; the collapsed elbow's first rung and the drop elbow's row. */
const OVERHEAD_THROW: Drill = {
  name: 'Overhead throws',
  how: 'Throw an old ball high and far, so it peaks well above net height. The throw puts the elbow where it belongs.',
  reps: '15 throws',
}

/** A whole swing with nothing to stop at: the racket drop's second rung. */
const BALL_IN_A_SOCK: Drill = {
  name: 'Ball in a sock',
  how: 'Swing a ball in a sock, or a towel, through the whole motion without stopping.',
  reps: '15 swings',
}

/**
 * Reaching up for the ball. Contact height's exercise, for the hand's height
 * and the ball's (one quantity read two ways, never on the same card), arm
 * extension's, and the contact area's. It replaced a basket on the toes, which
 * takes away the leg load that lifts the contact.
 */
const UP_AND_OUT: Drill = {
  name: 'Hit up and out',
  how: 'From the service line, swing up and out towards the back fence and let the racket bring the ball down.',
  reps: '20 serves',
}

export const METRICS: Record<string, MetricCopy> = {
  /* ------------------------------------------------------------------- toss */
  releaseHeight: {
    id: 'releaseHeight',
    label: 'Release height',
    unit: '×',
    phase: 'toss',
    source: {
      study:
        'Kovacs Academy 2022: the ball leaves the hand between eye level and the top of the head. Gao 2026: 1.72–1.75 m in WTA players about 1.72 m tall.',
    },
    weight: 1,
    // The floor is eye level, the low end of the coaching standard: 0.936 of
    // stature, which in this engine's units — heights from the ankle line over
    // a stature that reads about 8% short — is 0.96. The release keyframe is the
    // top of the hand's lift (D7.3), at or after the ball leaves it, so a hand
    // that tops out under eye level let the ball go lower still. The floor was
    // 1.12, and the forty Bath serves read 1.11–1.16 (up to fifteen of them
    // under it) and the rig 1.11.
    ideal: [0.96, 1.36],
    range: [0.7, 1.6],
    decimals: 2,
    insight: {
      low: 'You let the ball go **below eye level**, so it climbs further and wanders more on the way.',
      ok: 'You let go **at head height or higher**, so the ball has a short, steady climb.',
      high: 'You release at the **top** of your reach.',
    },
    fix: {
      low: 'Lift with a long arm and **let go at head height** or higher. Roll the ball off the fingertips.',
      high: 'Stay **flat-footed** until the legs load. Release tall, not early.',
    },
    drill: {
      name: 'Fingertip release',
      how: 'Toss slowly and let the ball roll off your fingertips only once the arm locks out.',
      reps: '15 tosses',
    },
  },
  tossArmHold: {
    id: 'tossArmHold',
    // A name, not a sentence (L1.5). "Tossing arm stays up" read as praise at
    // the head of the plan ("Work on this next: Tossing arm stays up") and broke
    // every sentence built round it ("Your tossing arm stays up has lost…").
    label: 'Tossing arm timing',
    unit: '%',
    phase: 'trophy',
    source: {
      motion:
        "No study gives a share. The forty Bath serves hold the arm up for 72–79% of the window from every placement, and the rig's dropped arm reads under 55.",
    },
    weight: 1.1,
    ideal: [55, 100],
    range: [0, 100],
    decimals: 0,
    insight: {
      low: 'Your tossing arm **comes down early**, your front shoulder follows it, and you meet the ball lower.',
      ok: 'You **hold** the tossing arm up into the swing, so the chest stays open.',
      high: 'You hold the tossing arm up **through** the swing.',
    },
    fix: {
      low: '**Point at the ball** until the racket starts up. Tuck the arm into your chest only then.',
      high: '**Tuck the arm in** as the racket fires. Leaving it out costs rotation.',
    },
    drill: {
      name: 'Point and hold',
      how: 'Toss, then hold a finger pointing at the ball until the racket starts up.',
      reps: '12 serves',
    },
  },
  tossPathWobble: {
    id: 'tossPathWobble',
    label: 'Toss path steadiness',
    unit: '%',
    phase: 'toss',
    source: {
      motion:
        "No study measures the hand's line. The forty Bath serves drift 0.2–1.6% of height from every placement, and the rig's wandering hand reads over 3.",
    },
    weight: 0.9,
    /*
     * Drift of the tossing hand off its own line, as a share of standing height,
     * along whichever body axis the camera laid across image x. `AXIS_COPY`
     * below says which axis on the day; this band is the same either way, and
     * that is worth stating plainly rather than leaving to be assumed.
     *
     * PROVENANCE, honestly: 0–3 was calibrated against the number this app used
     * to produce, which was raw image x on side-on footage. At the framing the
     * app recommends that reading is 0.99 front-to-back and 0.14 sideways, so
     * what was actually calibrated here is a DEPTH-axis band that nobody knew
     * was one. Recovering the depth axis divides by a gain of 0.99 at that
     * angle, which moves the band's meaning by under one percent — so the depth
     * case keeps its calibration intact and needs no re-derivation.
     *
     * The lateral case does not have that luxury. No footage in this repo has
     * ever driven the lateral axis — until `tossWobbleLateral` was added to the
     * rig there was no way to drive it at all — so applying 0–3 to a sideways
     * reading is an inheritance, not a measurement. It is kept because a hand
     * that wanders 3% of standing height is a hand that wanders that far
     * whichever way it went, and because the alternative is inventing a second
     * pair of numbers with even less behind them. PROVISIONAL: re-derive the
     * lateral band the first time there is face-on footage to derive it from.
     */
    ideal: [0, 3],
    range: [0, 12],
    decimals: 1,
    /*
     * The axis-neutral wording, which is what the base card has to be.
     *
     * "Drifts sideways" lived here for as long as the measurement did, and on
     * the framing this app recommends it was describing an axis the number
     * barely contained. The line below asserts only what every reading of this
     * measurement has in common — the hand left its line — and `AXIS_COPY` says
     * which way once the camera has been asked.
     */
    insight: {
      low: 'Your tossing hand travels **dead straight** up.',
      ok: 'Your tossing hand travels **straight** up with almost no drift.',
      high: 'Your tossing hand **wanders off line**, so the ball finishes somewhere new each serve.',
    },
    fix: {
      low: '',
      high: '**Quiet the wrist** and cut the flick. Lift the ball on one line and catch it back on that line.',
    },
    drill: {
      name: 'One line toss',
      how: 'Toss, keep your feet still, and catch the ball back in the hand that threw it.',
      reps: '20 tosses',
    },
  },

  /*
   * The two measurements taken from the ball itself rather than from the arm.
   * Both are absent unless the ball was actually tracked — see `trackBall`. A
   * toss judged only from the hand misses the two faults a coach spots first,
   * because both of them happen after the ball has left the fingers.
   */
  tossPeakHeight: {
    id: 'tossPeakHeight',
    label: 'Toss height',
    unit: '×',
    phase: 'toss',
    source: {
      study:
        'Newton 2025, Vacek 2025, Gao 2026: skilled toss peaks of 1.82–2.08 statures from the ankle line.',
    },
    weight: 1.2,
    // Peak of the ball above the court, in body heights.
    //
    // THE CEILING USED TO BE 1.72, and it was set against the wrong landmark.
    // It was argued from contact height — 1.28–1.5 — but that number is the
    // *wrist*, and the ball at contact sits about a quarter of a body height
    // above the wrist, at roughly 1.44–1.48 of standing height. Published toss
    // peaks in skilled servers are 1.82–2.08 of standing height measured from
    // the ankle line this app uses (Newton 2025, 3.48 m at 1.87 m; Vacek 2025,
    // 3.40 m at 1.81 m; Gao 2026, WTA, 3.56–3.65 m at 1.72 m), so the old
    // ceiling told every one of them their toss was too high. The ceiling now
    // sits above all of them: a toss past 2.1 is one that falls well over a
    // metre into the swing. The floor is unchanged, for want of club data.
    ideal: [1.38, 2.1],
    range: [0.9, 2.4],
    decimals: 2,
    insight: {
      low: 'Your toss **stops below** your hitting reach, so you shorten the swing to meet it.',
      ok: 'The ball **tops out** above contact, exactly where it hangs longest.',
      high: 'Your toss climbs **far above** contact, so you hit it falling fast and time it perfectly or not at all.',
    },
    fix: {
      low: 'Toss so the ball peaks **about a racket length above** your racket at full stretch.',
      high: '**Lower the toss** until it peaks about a racket length above your reach. A toss that high times badly.',
    },
    drill: {
      name: 'Rail height toss',
      how: 'Pick a fence rail about a racket length above your racket reach and toss to that height.',
      reps: '20 tosses',
    },
  },
  contactBelowPeak: {
    id: 'contactBelowPeak',
    label: 'How far the ball falls first',
    // Metres, from the clock (L5.6): `ballFallMetres`, ½·g·t² from the apex to
    // contact, which needs no scale and has no perspective. The published
    // drops are in metres too, so the band is theirs with no conversion.
    unit: 'm',
    phase: 'contact',
    source: {
      study:
        'Newton 2025, Vacek 2025, Connolly 2021, Gao 2026: the ball falls 0.56–0.94 m from its apex before impact.',
    },
    weight: 1.1,
    // How far the ball has fallen from its apex by the moment of contact.
    //
    // THIS WAS 0–0.09, AND THE RESEARCH SAYS THE OPPOSITE. Skilled servers do
    // not hit the ball at its peak: it falls 0.56–0.94 m before impact (Newton
    // 2025; Vacek 2025; Connolly 2021; Gao 2026, WTA), about 0.3–0.5 of
    // standing height, struck roughly a third to two fifths of a second after
    // the apex. The old band called all of them late. It now flags only a fall
    // past 0.55 — over a metre for most adults, a ball left to drop well below
    // where the serve wants it. Measured on the ball, so the published drops
    // apply directly, unlike the wrist-based contact height.
    //
    // In metres since L5.6: the old 0.55 of standing height is about a metre on
    // an adult, and a metre is where the band now stops.
    ideal: [0, 1],
    range: [0, 1.8],
    decimals: 2,
    insight: {
      low: 'You strike the ball at the **top** of its flight, where it barely moves.',
      ok: 'The ball **falls into your swing** from its peak, the way strong servers time it.',
      high: 'You let the ball **fall a long way** before you hit it, so you meet it lower than you could have.',
    },
    fix: {
      low: '',
      high: '**Start the swing earlier** so you meet the ball soon after it peaks. Check your toss height first.',
    },
    drill: {
      name: 'Swing as it turns',
      how: 'Toss and start your swing as the ball reaches the top, so you meet it soon after it starts to fall.',
      reps: '15 serves',
    },
  },

  /* ---------------------------------------------------------------- loading */
  kneeBend: {
    id: 'kneeBend',
    label: 'Knee bend at trophy',
    unit: '°',
    phase: 'trophy',
    source: {
      study:
        'Jacquier-Bret & Gorce 2024, 27 studies: knee flexion at the trophy of 64.5 ± 9.7° (front) and 67.4 ± 16.4° (back).',
    },
    weight: 1.1,
    /*
     * Anchored to published serves rather than to the rig. A meta-analysis of
     * 27 serve studies puts knee flexion at the trophy at 64.5 ± 9.7° for the
     * front knee and 67.4 ± 16.4° for the back (Frontiers in Sports and Active
     * Living, 2024, doi:10.3389/fspor.2024.1432030), and names knee flexion one
     * of the two least variable serve measurements — the most dependable band
     * there is to coach against. This reads the mean of both knees.
     *
     * The band used to stop at 62° and tell anything deeper to "trim the
     * bend": a textbook advanced load, ~66°, was scored out of band and told
     * to bend less. The floor stays where a club player's load starts to do
     * work; the ceiling is ~1.5 SD past the published means, so the fix below
     * is kept for a squat that genuinely stalls the drive.
     */
    ideal: [35, 80],
    range: [0, 110],
    decimals: 0,
    insight: {
      low: 'Your knees **barely bend** before the swing, so there is little spring to push up from.',
      ok: 'An **athletic load**: deep enough to store power, shallow enough to launch.',
      high: 'You **sink deep** into the load.',
    },
    fix: {
      low: '**Sink** until the knees sit over your toes, then drive straight up out of it.',
      high: '**Trim the bend**. Speed out of the bottom beats depth at the bottom.',
    },
    drill: PUSH_THROWS,
  },
  shoulderTilt: {
    id: 'shoulderTilt',
    label: 'Shoulder tilt',
    unit: '°',
    phase: 'trophy',
    source: {
      study:
        'Jacquier-Bret & Gorce 2024: trunk inclination at the trophy of 25.0 ± 7.1° pooled. The band is 1.5 deviations either side.',
    },
    weight: 1,
    // 1.5 deviations either side of the pooled 25.0°. The ceiling was 32, and
    // the forty Bath serves tilt 24–34° here, so it called up to seven of them
    // arched.
    ideal: [14, 36],
    // Below zero the cartwheel runs the wrong way: hitting shoulder high,
    // tossing shoulder dropped. It is a common recreational fault and it pulls
    // the racket down across the ball, so the axis has to be able to show it
    // rather than reporting it as a level pair of shoulders.
    range: [-25, 50],
    // The old axis, kept as the yardstick for the decay — see `missSpan`.
    // Admitting the reverse side lengthened the axis without moving the band,
    // and letting the scorer see that as more room hands a miss points it had
    // not earned. Without it a flat-shouldered trophy rose
    // from 45 to 58 on the strength of the widening alone, which moves the badge
    // from "work on this" to "fair" for a serve that did not change.
    missSpan: 50,
    decimals: 0,
    insight: {
      low: 'Your hitting shoulder sits **level or high**, so the racket comes down across the ball instead of up at it.',
      ok: 'Hitting shoulder **down**, tossing shoulder up. That tilt sends the racket up at the ball.',
      high: 'A **steep tilt**, so the racket travels sharply upward.',
    },
    fix: {
      low: '**Lower the hitting shoulder** under the ball and raise the tossing one. Tilt the shoulders, never spin them.',
      high: '**Tilt from the shoulders**, not the lower back. Arching moves contact behind you.',
    },
    drill: {
      name: 'Shoulder over shoulder',
      how: 'Shadow serve with the tossing arm pointing high, so your hitting shoulder dips under it, then swing through without stopping.',
      reps: '15 swings',
    },
  },
  legDrive: {
    id: 'legDrive',
    label: 'Leg drive',
    unit: '×',
    phase: 'contact',
    source: {
      study:
        'Deghaies 2026: the centre of mass rises 15.8 ± 3.4% of height in professionals. Reid 2008: no leg drive cost a tenth of racket speed.',
    },
    weight: 1,
    // The hips' rise from the deepest load to contact. One band with the
    // diagnosis's `leg_drive_rise_ratio` (`CARD_SIGNAL` in tiers.ts), whose
    // comment has the sources. The ceiling was 0.24 and told the highest of the
    // forty Bath serves to drive less: they rise 0.13–0.26 from every placement,
    // beside a professional 0.158 ± 0.034 (Deghaies 2026), and no study names a
    // rise too big. So the band runs to the end of the axis, as
    // `handUnderElbow`'s does, and the line above it is blank.
    //
    // THE FLOOR IS A FULL EXTENSION WITH NO JUMP (L3.9), from the least knee
    // bend this card calls good. It was 0.10, the professional mean less a
    // deviation, which asked a club player to leave the ground: a full bend
    // straightened out with both feet down rises 0.0435 on the rig and was
    // named "legs sit the serve out" on every take. Swept against
    // `contactHipHeight` and `trophyKneeAngle` (`bands.test.ts`), a full
    // extension from 35° of knee bend, the floor of `kneeBend`'s band, rises
    // 0.032 ± 0.006. A player who loads in band and straightens is not told
    // their legs sat out; straight legs, which cannot rise, still are.
    ideal: [0.032, 0.36],
    range: [0, 0.36],
    decimals: 3,
    insight: {
      low: 'You loaded the legs and **never cashed it in**.',
      ok: 'You **straighten up** out of the load, and the legs feed the swing.',
      high: 'A **big launch** upward.',
    },
    fix: {
      low: '**Push up** off the ground into the ball, so you land inside the baseline: up first, forward second.',
      // Empty while the band runs to the end of its own axis. It used to say a
      // big rise meant landing deep, which the hips' height cannot tell.
      high: '',
    },
    drill: {
      name: 'Land inside',
      how: 'Serve and push up off the ground into the ball, so you land inside the baseline every time.',
      reps: '15 serves',
    },
  },

  /* ------------------------------------------------------------------ swing */
  dropDepth: {
    id: 'dropDepth',
    label: 'Racket drop',
    unit: '×',
    phase: 'drop',
    source: {
      study:
        'Fleisig 2003: at full external rotation the upper arm sits near shoulder level and the racket falls behind. The forty Bath serves read −0.06 to −0.01.',
    },
    weight: 1.2,
    // The hand, not the racket: this is how far the racket hand sits below the
    // shoulder at the bottom of the drop. A real drop leaves it near shoulder
    // height while the racket head falls behind the back — Fleisig 2003's
    // maximum external rotation, and the Bath motion capture, which reads −0.01
    // to −0.06 here (ANALYSIS-REVIEW.md §9). The band used to want 0.16–0.34,
    // the hand between the shoulder blades, and scored every real serve low.
    // Wide at both ends on purpose: only a hand that stays well above the
    // shoulder means the racket never laid back.
    ideal: [-0.1, 0.3],
    range: [-0.25, 0.5],
    decimals: 3,
    insight: {
      low: 'Your hand **stays high** at the bottom of the swing, so the racket never lays back behind you.',
      ok: 'The racket **lays back behind you** before it fires, and that fall is where racket speed comes from.',
      high: 'Your hand sinks **well below your shoulder**, which can leave the racket by your side instead of behind you.',
    },
    fix: {
      low: '**Let the racket head fall** behind you while your elbow stays up at shoulder height. Keep the grip loose.',
      high: '**Keep the elbow up** so the racket stays behind your back, not down by your side.',
    },
    drill: {
      // Named for what the body does, not for the coaching shorthand. "Back
      // scratch" is a phrase you have to already know to picture, and it now
      // reaches the player through the largest heading on the report — the
      // triage layer routes a shallow drop straight here. It is also wrong about
      // where the hand goes: the racket head falls, the hand stays near the
      // shoulder, so the instruction says that in words that need no translation.
      name: 'Let the racket fall',
      how: 'Serve at half pace. Let the racket head fall behind your back, elbow up, then swing up.',
      reps: '20 serves',
    },
  },
  elbowAtDrop: {
    id: 'elbowAtDrop',
    label: 'Hitting elbow at drop',
    unit: '°',
    phase: 'drop',
    source: {
      study:
        "Fleisig 2003: 104° of elbow flexion at full external rotation, 76° at the joint. Gao 2026: 52° and 67° at the racket's low point.",
    },
    weight: 1,
    ideal: [40, 95],
    range: [20, 170],
    decimals: 0,
    insight: {
      low: 'Your hitting elbow **folds tight** against your back.',
      ok: 'Your arm folds into a loaded **L**: elbow up, racket head down.',
      high: 'Your arm stays **straight** through the drop, so the racket circles round your side instead of falling behind your back.',
    },
    fix: {
      low: '**Give the racket room**. Jammed against your back it cannot swing free into the drop.',
      high: '**Bend the elbow** and lead with it. Racket head down, elbow up, arm coiled.',
    },
    // The throwing arm's own action, which bends and leads with the elbow
    // without being told to. Was a pause at the drop.
    drill: OVERHEAD_THROW,
  },
  handUnderElbow: {
    id: 'handUnderElbow',
    label: 'Hand under the elbow',
    unit: '%',
    phase: 'drop',
    source: {
      motion:
        "No study measures it. The forty Bath serves read 6.5–16% from every placement, and the rig's racket that never falls reads 0.",
    },
    // Under every other measurement on this card, and deliberately so. The band
    // below is provisional in a way none of the others are, and weight is the
    // one honest lever for that: it holds down the vote a guessed band gets in
    // the Swing score without touching the number itself, which is measured
    // exactly as well as the ones beside it.
    weight: 0.7,
    /*
     * PROVISIONAL BAND, now re-derived from real motion as its first version
     * asked. That version anchored a floor of 20% to the synthetic rig alone,
     * when the rig dropped the hand down the back: 28.6% for its clean serve.
     * Real full drops keep the hand near the shoulder, and on the 40 Bath serves
     * filmed from three places the share's medians are 10.5%, 14.3% and 17.6%,
     * with the lowest tenth at 4.7–14%. So 20 called most real drops short. The
     * rebuilt rig, posed like those serves, reads 18% for its clean drop and 0%
     * whenever the racket never falls or the elbow collapses. What the share can
     * honestly separate is whether the hand gets under the elbow at all, so the
     * floor is 4: under every real drop's lowest tenth and over every serve with
     * none. It is still uncited — no study measures this — which is why the
     * weight above stays low.
     *
     * Those figures were read off the picture, where perspective put two real
     * drops at 0% from the guide's own placement. Since D7.7 the order is read
     * from the world landmarks (`metrics.ts`), and the same forty serves read a
     * median of 12–13% from every placement, with the lowest at 6.5–8.9%. The
     * floor of 4 now sits under every real drop rather than at the bottom of
     * them, and the toss moving onto the hand's peak (D7.3) lengthened the
     * window these shares are taken over, which is why the medians are lower
     * than the 14–18% the old reading gave from the far side.
     *
     * The ceiling is the end of the axis because naming a fault above the band
     * would be inventing one. Hanging under the elbow for a very long share of
     * the swing is probably a pause at the trophy — probably, and this app does
     * not print probably. An open top also means `insight.high` and `fix.high`
     * can never be shown while the band ends here; they are written out so that
     * a future ceiling arrives with its words already checked, exactly as
     * `tossArmHold` carries its own.
     *
     * Two consequences of that open top, both intended and neither an accident
     * to be tidied away later. `scoreAgainst` grades an open-topped band by how
     * far up it a value sits, so the rig's clean serve scores 73 — "Solid", no
     * fix and no drill — and nothing short of a 60% share reaches "Strong".
     * Nothing will: this measurement will not call a swing excellent until there
     * is footage to say what a lot of hang is worth, and a band that praised
     * loudly off a rig would be doing precisely what the rest of this file
     * refuses to do. The other consequence is that a clean serve's Swing card
     * will often name this its weakest row. That is true — it is the weakest row
     * — and `weight` above is what keeps it from being more than a note.
     */
    ideal: [4, 100],
    range: [0, 100],
    decimals: 0,
    insight: {
      // Worded as a shortfall and not as a position, because one sentence has to
      // cover two rungs that describe different bodies — a hand that never gets
      // under the elbow and one that dips under it and leaves. Naming either
      // would deny the readout printed beside it for players at the other end.
      low: 'Your hand **never gets under your elbow**, so the arm pushes the ball instead of throwing it.',
      ok: 'Your hand **gets under your elbow** on the way up, so the racket swings up from below.',
      high: 'Your hand **hangs under your elbow** for a long stretch of the swing.',
    },
    fix: {
      low: '**Let the hand hang under your elbow** as the arm goes up. Keep the grip loose.',
      // Empty while the band runs to the end of its own axis: there is nothing
      // above it to correct. `tossPathWobble` carries the same blank at the
      // other end for the same reason.
      high: '',
    },
    drill: BALL_IN_A_SOCK,
  },
  dropToContact: {
    id: 'dropToContact',
    label: 'Drop to contact',
    unit: 'ms',
    phase: 'contact',
    source: {
      study:
        "Newton 2025: the forward swing from the racket's low point takes 13.2 ± 2.1% of 0.97 s, about 128 ms, in high-performance men.",
    },
    weight: 1,
    ideal: [110, 230],
    range: [50, 450],
    decimals: 0,
    insight: {
      low: 'Your swing from the racket drop to the ball is **short**. Check the racket falls fully behind you first.',
      ok: 'Your racket **fires** from drop to ball, with no pause to slow it down.',
      high: 'Your racket **crawls** from drop to ball, so you are guiding the swing.',
    },
    fix: {
      low: '**Check the drop depth**. A quick swing off a shallow drop is a short swing.',
      high: '**Stop steering**. Serve at easy pace but twice as loose, and extend late.',
    },
    drill: {
      name: 'Loose arm serve',
      how: 'Serve at easy intent with a light grip and let the arm extend late.',
      reps: '20 serves',
    },
  },

  /* ---------------------------------------------------------------- contact */
  contactHeight: {
    id: 'contactHeight',
    // The hand's height, said so: it is what this card reads when the ball was
    // not followed to the racket, and the ball's own height has its row below.
    label: 'Hand height at contact',
    unit: '×',
    phase: 'contact',
    source: {
      study:
        'Girard 2005: impact at 1.43 statures for beginners and 1.49 for elite servers, with the racket head 0.26 statures over the wrist (Bath).',
    },
    weight: 1.3,
    // The wrist, not the ball. Published impact heights put a beginner's wrist
    // at about 1.20 in these units and an elite server's at about 1.27 (see
    // `contact_height_ratio` in tiers.ts for the arithmetic); the floor sits
    // 0.06 below the first of those, because the same serve read up to 0.12
    // apart from different phone positions. It was 1.28 — above the elite mean —
    // and scored ordinary club contact as short. Since D7.4 the reading has no
    // perspective in it (`handHeight.ts`) and the floor is held for a different
    // reason: the forty Bath serves read 1.174–1.246 from every placement, and
    // the beginners' 1.20 would call a sixth of a competent server's serves low.
    ideal: [1.14, 1.5],
    range: [0.9, 1.7],
    decimals: 2,
    insight: {
      low: 'You strike **below full reach**, so the ball has less room to clear the net and still land in.',
      ok: 'You strike at **full stretch**, exactly where your margin over the net lives.',
      high: 'You strike at the **top of your reach**.',
    },
    fix: {
      low: '**Reach up** and hit at the top. Serve a basket with your heels off the ground.',
      high: '**Keep the toss in front** so you never lean back to reach it.',
    },
    drill: UP_AND_OUT,
  },
  ballContactHeight: {
    id: 'ballContactHeight',
    label: 'Ball height at contact',
    unit: '×',
    phase: 'contact',
    source: {
      study:
        'Girard 2005, Vacek 2023: impact at 1.43 statures for beginners and 1.49–1.51 for elite and professional servers.',
    },
    weight: 1.3,
    /*
     * The ball itself, which is what published impact heights measure: 1.43
     * statures for beginners and 1.49 for elite servers (Girard 2005), 1.50–
     * 1.51 for professional men (Vacek 2023). In this engine's units — heights
     * from the ankle line, about 0.06 statures up, over a stature that reads
     * about 8% short — those are 1.49, 1.55 and 1.58. The floor sits
     * `CAMERA_ALLOWANCE` under the beginners' figure, as the hand's band does
     * under its own, and the ceiling the same distance over the hand's, raised
     * by the racket's 0.26 statures (the Bath capture). Shown in place of the
     * hand's height whenever the ball was followed to the racket (D2.2).
     */
    ideal: [1.43, 1.8],
    range: [1.1, 2.1],
    decimals: 2,
    insight: {
      low: 'You meet the ball **below full reach**, so it has less room to clear the net and still land in.',
      ok: 'You meet the ball at **full stretch**, exactly where your margin over the net lives.',
      high: 'You meet the ball at the **top of your reach**.',
    },
    fix: {
      low: '**Reach up** and hit at the top. Serve a basket with your heels off the ground.',
      high: '**Keep the toss in front** so you never lean back to reach it.',
    },
    drill: UP_AND_OUT,
  },
  armExtension: {
    id: 'armExtension',
    label: 'Arm extension at contact',
    unit: '°',
    phase: 'contact',
    source: {
      study:
        'Fleisig 2003, Fett 2021, Newton 2025, Jacquier-Bret & Gorce 2024: the elbow is flexed 14–30° at impact.',
    },
    weight: 1.2,
    // The elbow at impact is flexed 20 ± 4° in Olympic servers (Fleisig, via
    // Kovacs), 18 ± 8° in elite juniors (Fett), 14° in high-performance men
    // (Newton: 166 ± 5° of extension) and 30.1 ± 15.9° pooled over 27 studies:
    // 150–166° at the joint. The floor of 160 called most of them short. 145 is
    // 35° of flexion, the research brief's club edge, with room for a camera's
    // error. The Bath serves read 145–159° here, but their elbow markers sit off
    // the joint (ANALYSIS-REVIEW.md §9), so they cannot settle it.
    ideal: [145, 180],
    range: [100, 180],
    decimals: 0,
    insight: {
      low: 'Your hitting arm stays **bent** at contact, costing height and power together.',
      ok: '**Long arm** at contact, with nothing left on the table.',
      high: '**Full extension** through the ball.',
    },
    fix: {
      low: '**Chase the ball up** with a long arm. Toss higher so you stretch instead of pulling down.',
      high: '**Stay loose** through the elbow. A locked arm stops the racket head releasing.',
    },
    // Was "freeze at contact with the arm locked long", beside a fix saying a
    // locked arm stops the racket head releasing.
    drill: UP_AND_OUT,
  },
  contactAhead: {
    id: 'contactAhead',
    label: 'Contact point in front',
    unit: '%',
    phase: 'contact',
    source: {
      study:
        'Vacek 2023, Connolly 2021, Fett 2021: flat contact 50–62 cm ahead of the front toe, 0.28–0.37 of height; kick contact the same or nearer.',
    },
    weight: 1,
    // How far in front of the hips contact happens, as a share of height. The
    // floor sits on the ladder's own boundary between "struck over the head" and
    // "struck in front of the body": a band opening at 5 spent three points of
    // its width praising a contact the readout beside it still called over the
    // head, which is the fault this measurement exists to name.
    //
    // The ceiling was 20. Published flat serves meet the ball 0.28–0.37 of
    // height ahead of the front toe; this reads the wrist against the hips,
    // which the forty Bath serves put at 15–34 from the side, and 20 called most
    // of them too far in front. 40 is over every one of them and every
    // published mean.
    ideal: [8, 40],
    range: [-10, 50],
    decimals: 1,
    insight: {
      low: 'You strike **over or behind** your head, which sends serves into the net and arches your back.',
      ok: 'You strike **in front** of your body, with your weight moving into the court.',
      high: 'You strike **far in front** of your body.',
    },
    fix: {
      low: '**Toss further in front**, so you move up and forward into the ball. Contact belongs ahead of your front foot.',
      high: '**Rein the toss back** if you fall into the court. Ahead is good, falling is not.',
    },
    drill: {
      name: 'Step-in toss',
      how: "Toss so the ball would land about a racket's length inside the baseline, and let it pull you up into contact.",
      reps: '15 serves',
    },
  },

  /* ----------------------------------------------------------------- rhythm */
  loadRatio: {
    id: 'loadRatio',
    label: 'Time from trophy to contact',
    unit: '%',
    phase: 'trophy',
    source: {
      study:
        'Tubez 2021: trophy to impact takes 0.33–0.36 s in skilled servers and 0.54 s in children. Newton 2025: about 35% of release to impact.',
    },
    weight: 0.8,
    // share of the motion spent between the trophy and contact — about 400 ms
    // out of ~1300 ms in a well-timed serve
    ideal: [22, 42],
    range: [8, 65],
    decimals: 0,
    insight: {
      low: 'You spend the motion **before the trophy**, then cram everything into the finish.',
      ok: 'A **clean split** between the slow build and the fast finish.',
      high: 'You **linger after the trophy**, so the back half drifts instead of firing.',
    },
    fix: {
      low: '**Start the drive earlier** and let it flow straight into the swing.',
      high: '**Sharpen the finish**. From the trophy on, accelerate once and never pause.',
    },
    drill: {
      name: 'One-beat finish',
      how: 'From the trophy on, accelerate without a single pause until the ball leaves.',
      reps: '20 serves',
    },
  },
}

/**
 * Measurements with no band (D2.1): measured, shown in body language, never
 * graded.
 *
 * Each was a card row until its band was asked what it stood on and nothing
 * answered. The tossing arm's straightness is a coaching standard (Kovacs) with
 * no published angle, and the one set of real serves here carries a marker
 * offset in its elbow angles, so it cannot set one either. Body extension — the
 * feet's rise off the court — has no published figure at contact, and the
 * fault it named, legs that never drove, is `legDrive`'s. The motion's length
 * has no published figure from the first move, and its ceiling told a slow
 * serve it paused, which the hitch reading (`hitch.ts`) showed tempo is not.
 * Arm sync at release has no published figure and no rig fault that moves it,
 * so nothing showed which side of its edges a fault falls. The coil between
 * hips and shoulders had a band on real motion, and a noise floor of 30° from
 * the camera against a band 30° wide, so its grade was the camera's.
 *
 * Kept in `Fundamental.readings`, apart from `metrics`, so no score, plan,
 * focus or drawing can grade one by accident. A reading earns a row back on
 * the card the day something supports a band for it.
 */
export interface ReadingCopy {
  id: string
  label: string
  unit: string
  phase: PhaseId
  decimals: number
}

export const READINGS: Record<string, ReadingCopy> = {
  tossArmExtension: { id: 'tossArmExtension', label: 'Tossing arm extension', unit: '°', phase: 'toss', decimals: 0 },
  bodyExtension: { id: 'bodyExtension', label: 'Body extension', unit: '×', phase: 'contact', decimals: 3 },
  totalTime: { id: 'totalTime', label: 'Motion length', unit: 'ms', phase: 'contact', decimals: 0 },
  syncAtRelease: { id: 'syncAtRelease', label: 'Arms in sync', unit: '×', phase: 'toss', decimals: 2 },
  // "Separation" is the coach's word (L4.11); the row shows the shoulders
  // turned further than the hips.
  hipShoulderSeparation: {
    id: 'hipShoulderSeparation',
    label: 'Shoulders turned past the hips',
    unit: '°',
    phase: 'trophy',
    decimals: 0,
  },
}

/* -------------------------------------------------------------- body axes */

/**
 * Copy that changes with the body axis a reading was actually taken along.
 *
 * The same shape as the serve-type override below it, and for a closely related
 * reason: one measurement, two situations in which the flat wording would be
 * actively wrong. The difference is what decides it. A serve type is what the
 * player meant to hit; an axis is what the camera could see. The player chooses
 * one and the phone decides the other, and neither is a fact about the number.
 *
 * Why this has to exist rather than one careful sentence covering both: a drill
 * cannot hedge. "Toss so the ball brushes a fence you are standing side-on to"
 * pins the hand's sideways position and says nothing whatever about how far in
 * front of the body it went — so a player whose toss wanders front-to-back can
 * do that drill perfectly, a hundred times, and change nothing. The instruction
 * is the half of the card a player acts on, and an instruction aimed at the
 * wrong axis is worse than no instruction: it costs them the practice session
 * and the trust.
 *
 * Only the `high` lines are replaced. Below and inside the band the card says
 * the hand went straight up, which is true on both axes at once and needs no
 * help from the camera.
 */
export interface AxisCopy {
  insight?: Partial<MetricCopy['insight']>
  fix?: Partial<MetricCopy['fix']>
  drill?: Drill
}

/**
 * The two toss-path drills, named here because two tables need them.
 *
 * `AXIS_COPY` puts one on the card and `DRILLS` publishes both under names
 * `triage.ts` resolves by axis — `FLAW_DRILL_BY_AXIS` there maps depth to the
 * baseline drop and lateral to the fence. Written once and referenced twice
 * rather than typed out twice, so the fence drill a card prints and the fence
 * drill triage hands out cannot drift into two different exercises with one
 * name.
 */
const BASELINE_DROP_TOSS: Drill = {
  name: 'Baseline toss',
  how: 'Toss from behind the baseline without swinging, and let the ball fall onto the line every time.',
  reps: '20 tosses',
}

const FENCE_LINE_TOSS: Drill = {
  name: 'Fence line toss',
  how: 'Stand side-on beside a fence and toss so the ball brushes the fence going up.',
  reps: '20 tosses',
}

export const AXIS_COPY: Record<string, Partial<Record<BodyAxis, AxisCopy>>> = {
  tossPathWobble: {
    /*
     * Front-to-back, and the one this app produces most often, because it is
     * what a phone propped side-on to the court measures. No direction is
     * claimed in either line — `axes.ts` recovers the camera angle from an
     * `acos` and cannot tell a lens in front of the player from one behind, so
     * "forwards and back" names the axis and stops there. Saying "your toss
     * drifts forwards" would be a coin toss printed as an observation.
     */
    depth: {
      /*
       * A clean reading says which way it was seen (N2.10). Side-on, the angle
       * the guide asks for, a sideways wander points into the lens: one 10 cm
       * wobble reads 1 cm at 82° (F5, `depth.test.ts`). "Almost no drift" was
       * then a claim about an axis the camera never saw, so a steady toss here
       * is steady towards the net and back, and says the other half is unseen.
       */
      insight: {
        low: 'Your toss rises **dead straight**, towards the net and back. From the side I cannot see it drift sideways.',
        ok: 'Your toss rises **straight**, with little drift towards the net or back. From the side I cannot see sideways drift.',
        high: 'Your tossing hand **drifts forwards and back**, so the ball finishes nearer or further out each serve.',
      },
      fix: {
        high: '**Keep the toss on one line** and let the ball fall back onto the baseline every serve.',
      },
      drill: BASELINE_DROP_TOSS,
    },
    /*
     * Across the body — what every string here used to claim, on every clip.
     * The three lines below are the originals, unchanged and now printed only
     * where they are true: a camera round towards face-on, where image x really
     * does carry the shoulder-line axis. The fence is the right constraint for
     * exactly this reading and no other.
     */
    lateral: {
      // From in front or behind, the other way round: across the body is seen,
      // towards the net and back points into the lens (N2.10).
      insight: {
        low: 'Your toss rises **dead straight** across your body. From here I cannot see it drift towards the net.',
        ok: 'Your toss rises **straight**, with little drift sideways. From here I cannot see drift towards the net or back.',
        high: 'Your tossing hand **drifts sideways**, so the ball finishes somewhere new each serve.',
      },
      fix: {
        high: '**Quiet the wrist** and cut the flick. Lift side-on to a fence so the ball brushes past it.',
      },
      drill: FENCE_LINE_TOSS,
    },
  },
}

/* ------------------------------------------------------------------ drills */

/**
 * Every drill, addressable by name.
 *
 * The triage layer answers with a drill *identifier* rather than a drill,
 * because that layer deals in raw data and a paragraph of instruction is not
 * data. This is where an identifier becomes something a player can read, and it
 * is the only place the two vocabularies meet.
 *
 * Most entries point at the drill already attached to the measurement they
 * correct, so there is one canonical wording per exercise. The three that follow
 * exist only here: they correct faults the per-measurement copy has no home for,
 * because they are named breakdowns rather than numbers off a band.
 */
export const DRILLS: Record<string, Drill> = {
  rail_height_toss: METRICS.tossPeakHeight.drill,
  // Three entries for one measurement, because a toss that wanders needs a
  // different exercise depending on which way it wandered — see `AXIS_COPY`.
  // `fence_line_toss` keeps its name and still means the fence; repointing that
  // key at a drill about the baseline would have swapped the exercise under
  // every caller silently, which is why `triage.ts` chooses between the three by
  // axis instead. `one_line_toss` is the axis-neutral one it falls back to when
  // the camera angle cannot say — a stored report from before findings carried
  // an axis, or a clip filmed at the 45° tie.
  fence_line_toss: FENCE_LINE_TOSS,
  baseline_drop_toss: BASELINE_DROP_TOSS,
  one_line_toss: METRICS.tossPathWobble.drill,
  back_scratch_drop: METRICS.dropDepth.drill,
  hip_lead_turn: HIP_LEAD_TURN,
  push_throws: PUSH_THROWS,
  ball_in_a_sock: BALL_IN_A_SOCK,

  edge_first_serve: {
    name: 'Edge-first serve',
    how: 'Serve at half pace leading with the racket edge, so the strings never face the sky.',
    reps: '20 serves',
  },
  head_up_hold: {
    name: 'Head up hold',
    how: 'Serve and hold your chin up at the contact point until the ball lands.',
    reps: '15 serves',
  },
  pronation_snap: {
    name: 'Turn the hand over',
    how: 'Serve at half pace and let the palm turn out through the ball, thumb finishing down.',
    reps: '20 serves',
  },

  // Replacements for drills a coach would not hand out. The old ones asked for
  // a hold or a stance the serve never has: a pause at the drop, a two-second
  // sink at the bottom, a freeze at the trophy or at contact, a basket on the
  // toes. A pause practised is a pause learned — the hitch, which every
  // coaching source in `progressions.ts` warns holds teach — and serving on the
  // toes takes away the leg load that lifts the contact. Since L1.4 no card row
  // or area hands any of them out either; the shared drills are at the top.
  overhead_throw: OVERHEAD_THROW,
  back_leg_serve: {
    name: 'Back-leg serves',
    how: 'Serve with your weight on your back leg, then push up off it into the ball.',
    reps: '15 serves',
  },
  up_and_out: UP_AND_OUT,
  step_in_toss: METRICS.contactAhead.drill,
  point_and_hold: METRICS.tossArmHold.drill,
}

/* ------------------------------------------------------------- serve types */

/**
 * The bands above describe a first serve hit flat. They are not right for every
 * serve, and applying them to all three marks down technique that is correct.
 *
 * A well-struck kick serve makes contact more over the head than in front,
 * because the racket has to travel up the back of the ball rather than through
 * it — measured against the flat band, "contact point in front" scores near
 * zero, and the app tells a player with a good kick serve to stop hitting it
 * that way. A slice is the opposite: contact further in front and to the side,
 * with the shoulders staying flatter than a kick needs.
 *
 * Only the bands that genuinely differ are overridden. The toss, the loading and
 * the swing are the same motion whichever spin comes out of it, and inventing
 * differences there would be pretending to a precision this does not have.
 */
export interface ServeTypeCopy {
  /**
   * The name on a chip, where it stands alone and can afford both halves.
   *
   * NOT FOR USE INSIDE A SENTENCE — that is what `word` below is for, and the
   * distinction is not pedantry. "Flat / first serve" dropped into "showing
   * your … serves only" reads "showing your flat / first serve serves only",
   * which shipped, and the sibling line one section above it dodged the same
   * fault only by taking `label.split(' ')[0]` — a trick that works on these
   * three names and on no principle.
   */
  label: string
  /**
   * The same serve, as one word, for the middle of a sentence.
   *
   * Here rather than beside its readers because there were two of those and
   * they had already disagreed: `practice.ts` carried its own `SERVE_WORD`
   * table while `App.tsx` sliced the label. One name for a thing, in the file
   * that owns the thing.
   */
  word: string
  /** Shown next to the score so the player knows what they are being judged as. */
  blurb: string
  overrides: Record<string, [number, number]>
  /** Replacement copy where the flat wording would be actively wrong. */
  insight?: Record<string, Partial<MetricCopy['insight']>>
  /**
   * The same, for the instruction — and it has to exist alongside `insight`
   * rather than instead of it.
   *
   * Overriding one and not the other is what produced a kick serve card that
   * described the contact point correctly and then ordered the player to move it
   * somewhere the same card's blurb says a kick never goes. The insight and the
   * fix are two halves of one sentence to a player; a serve type that moves one
   * moves both.
   */
  fix?: Record<string, Partial<MetricCopy['fix']>>
  /** And the exercise, which is the fix said again slowly. */
  drill?: Record<string, Drill>
}

export const SERVE_TYPES: Record<ServeType, ServeTypeCopy> = {
  flat: {
    label: 'Flat / first serve',
    word: 'flat',
    blurb: 'Judged as a first serve hit through the ball.',
    overrides: {},
  },
  kick: {
    label: 'Kick / topspin',
    word: 'kick',
    // Since D2.1: published kicks are struck in front of the toe too, a little
    // nearer than flat serves or no nearer at all, so the blurb says what the
    // bands actually move — a lower contact floor and a steeper tilt.
    blurb: 'Judged as a kick serve, so contact may sit over your head and the shoulders tilt further.',
    overrides: {
      // A kick may be struck over the head, where a flat serve may not, so its
      // floor is the bottom of the "struck over the head" rung. It used to stop
      // at the top of that rung too, and published kicks are struck in front:
      // 0.15–0.28 of height ahead of the front toe in elite adolescents
      // (Connolly 2021), 51 cm against the flat serve's 56 in professional men
      // (Vacek 2023), and no different at all in Campbell 2013. So the ceiling
      // is the flat serve's.
      contactAhead: [0, 40],
      // No contact-height band of its own any more. It sat a whole rung below the
      // flat serve's, which only made sense while that band started at 1.28;
      // published kick and flat impact heights are within a centimetre of each
      // other (Vacek 2023: 1.50 and 1.51 statures, professional men), and the
      // flat band now starts at 1.14, already lower than this one used to.
      // More cartwheel: the hitting shoulder drops further under the ball, and
      // this band starts where the flat one stops, 36. The steep tilt the flat card
      // calls arching is the tilt a kick is hit with — the flat serve's fault is
      // this serve's intent — so the two meet at the rung boundary instead of
      // overlapping. Running from 20 to 40 split both rungs it touched: a
      // shoulder the readout called under the ball was praised at 21 and
      // corrected at 19.
      shoulderTilt: [36, 50],
      // A kick is tossed a little lower and further back than a flat serve, so
      // the toss is allowed to peak at racket reach. The ceiling holds at the
      // flat serve's — see its own comment for why that is 2.1.
      tossPeakHeight: [1.2, 2.1],
    },
    insight: {
      contactAhead: {
        // All three, because the kick band starts a rung below the flat one.
        // Under it a kick is behind the head, which arches the back; inside it
        // the racket can still brush up the ball; over it, as for a flat serve,
        // the player is reaching far out in front.
        low: 'You strike **behind your head**, so your back arches and the racket cannot brush up the ball.',
        ok: 'You strike **over or in front of** your head, where a kick can brush up the back of the ball.',
        high: 'You strike **far in front** of your body, so the racket drives through the ball rather than up its back.',
      },
      contactHeight: {
        ok: 'You strike at **kick height**: high enough for margin, low enough to brush up the ball.',
      },
      // The ball's height says the same thing the hand's does, and has to say
      // it the same way: a kick card that swapped rows when the ball was found
      // must not swap its advice with them.
      ballContactHeight: {
        ok: 'You meet the ball at **kick height**: high enough for margin, low enough to brush up it.',
      },
      shoulderTilt: {
        // The kick band starts a whole rung above the flat one, so everything
        // the ladder calls "hitting shoulder under the ball" falls below it. The
        // flat wording — the shoulder sits level or high — would deny that
        // readout outright for every kick between the two.
        low: 'Your hitting shoulder **dips too little** for a kick, so the racket goes through the ball instead of up it.',
      },
    },
    fix: {
      contactAhead: {
        low: 'Toss **over your head**, not behind it, and brush the racket up the back of the ball.',
        high: 'Toss **back over your head** so the racket brushes up the ball instead of driving through it.',
      },
      contactHeight: {
        // The flat order above the band is to keep the toss in front, and this
        // card's own contact-depth order is to toss back over the head. One card,
        // two instructions, opposite directions — and the player follows whichever
        // they read second. A kick struck above the band was reached for and
        // driven through, so the correction is depth of brush, never toss
        // position: the toss stays exactly where the other line just put it.
        high: '**Brush up the back of the ball** instead of reaching through it. Let contact sit under the top of your stretch.',
      },
      ballContactHeight: {
        high: '**Brush up the back of the ball** instead of reaching through it. Let contact sit under the top of your stretch.',
      },
      shoulderTilt: {
        // The flat order is to drop the hitting shoulder under the ball, which is
        // the position this card reads out for anything from fourteen degrees up
        // — so a kick at eighteen was told to start doing what the same card had
        // just said it was doing. A kick short of its band wants more of that
        // drop, not the beginning of it.
        low: '**Tilt further** so the hitting shoulder finishes well under the ball. Bend at the shoulders, never the lower back.',
      },
    },
    drill: {
      // The flat serve's step-in toss walks contact forward, which is the last
      // thing a kick serve struck too far in front needs.
      contactAhead: {
        // Above the head, as the kick's own fixes say. "Over the hitting
        // shoulder" is where a flat or slice toss goes.
        name: 'Kick toss above your head',
        how: 'Toss above your head, not out to the side, and brush the racket up the back of the ball.',
        reps: '15 serves',
      },
    },
  },
  slice: {
    label: 'Slice',
    word: 'slice',
    blurb: 'Judged as a slice serve, so contact belongs in front and out to the side.',
    overrides: {
      // Nothing moves, and both of the bands that used to be moved are worth
      // naming, because each bought a difference this app cannot actually see
      // out of a rung the readout beside it was already using.
      //
      // Contact point in front is not overridden. What makes a slice a slice is
      // lateral — the racket cuts across the outside of the ball, out to the
      // side — and this measures only how far ahead of the hips contact happens,
      // which for a slice is the flat serve's own rung, "struck in front of the
      // body". The band that ran from 8 to 24 stopped four points inside the
      // rung above it, so 22 came back badged Solid and 26 came back with an
      // order to rein the toss in, both under one readout saying the ball was
      // struck far in front. The lateral half of a slice is measured nowhere, and
      // faking it on this axis prices a good slice as a flat serve falling into
      // the court.
      //
      // Shoulder tilt is not overridden either. A slice cartwheels less than a
      // kick, but the rung under the flat band is "shoulders near level" and
      // nobody hits a slice with level shoulders — so the flat band is the honest
      // one, and the difference that matters is the one against the kick. The
      // band that ran from 10 to 26 bought its flatness out of that rung: 11.9
      // degrees came back badged Solid under a readout saying the shoulders were
      // near level, praising the posture the same card's fault line names.
    },
  },
}

/**
 * The copy for one measurement, for this serve and this camera.
 *
 * Two overlays, applied in a fixed order: the serve type first, then the body
 * axis. The order is stated rather than left to chance because it decides who
 * wins if both ever touch one line. The axis wins, and should: a serve type
 * moves a band and describes an intention, while the axis is the difference
 * between naming the direction a hand went and naming the other one. Nothing
 * overlaps today — no serve type touches `tossPathWobble` and no axis touches a
 * contact band — so this costs nothing now and settles the question before the
 * first pair that does.
 *
 * `axis` is omitted by callers that have no camera to ask and by every
 * measurement not read off image x. That case gets the axis-neutral base copy,
 * which is written to be true whichever way the hand actually went.
 */
export function metricCopy(
  id: string,
  serveType: ServeType = 'flat',
  axis?: BodyAxis,
): MetricCopy {
  const base = METRICS[id]
  if (!base) return base
  const type = SERVE_TYPES[serveType] ?? SERVE_TYPES.flat
  const byAxis = axis ? AXIS_COPY[id]?.[axis] : undefined
  const ideal = type.overrides[id]
  const insight = merge(type.insight?.[id], byAxis?.insight)
  const fix = merge(type.fix?.[id], byAxis?.fix)
  const drill = byAxis?.drill ?? type.drill?.[id]
  if (!ideal && !insight && !fix && !drill) return base
  return {
    ...base,
    ideal: ideal ?? base.ideal,
    insight: insight ? { ...base.insight, ...insight } : base.insight,
    fix: fix ? { ...base.fix, ...fix } : base.fix,
    drill: drill ?? base.drill,
  }
}

/** Two optional overlays into one, later winning, or nothing if both are absent. */
function merge<T extends object>(first?: Partial<T>, second?: Partial<T>): Partial<T> | undefined {
  if (!first) return second
  if (!second) return first
  return { ...first, ...second }
}

export const FUNDAMENTALS: Record<
  FundamentalId,
  {
    label: string
    blurb: string
    phase: PhaseId
    weight: number
    metrics: string[]
    /** Measured and shown without a band (`READINGS`). */
    readings?: string[]
    drill: Drill
  }
> = {
  toss: {
    label: 'Toss',
    blurb: 'Everything downstream is built on where the ball goes.',
    phase: 'toss',
    weight: 22,
    metrics: ['tossPeakHeight', 'releaseHeight', 'tossArmHold', 'tossPathWobble'],
    readings: ['tossArmExtension'],
    drill: {
      name: 'Fence toss',
      how: 'Stand side-on a racket from a fence and toss so the ball brushes past it, landing on one spot.',
      reps: '20 tosses · 15 inside a racket head',
    },
  },
  loading: {
    label: 'Loading',
    blurb: 'Legs, hips and shoulders storing energy before they unwind.',
    phase: 'trophy',
    weight: 22,
    metrics: ['kneeBend', 'shoulderTilt', 'legDrive'],
    // The coil is shown, no longer scored. It is a difference of two bearings
    // read from world z, the least reliable thing the pose model gives, and its
    // noise floor (30°, `NOISE_FLOOR.separation_deg`) was as wide as the 8–38°
    // band it was graded on, so its grade was mostly the camera. The open
    // chest is still named from it, past that floor, on a band of the
    // diagnosis's own (`SIGNALS.separation_deg`).
    readings: ['hipShoulderSeparation'],
    drill: PUSH_THROWS,
  },
  swing: {
    label: 'Swing',
    blurb: 'The racket drop and the acceleration that follows it.',
    phase: 'drop',
    weight: 20,
    // `handUnderElbow` is last and is the only one of the four that survives a
    // collapsed motion. The other three are read at or between keyframes that
    // land on one instant when the legs stay rigid and the racket never falls,
    // and `metrics.ts` drops two of them there — which left the player this app
    // exists for looking at a Swing card with a single row on it.
    metrics: ['dropDepth', 'elbowAtDrop', 'dropToContact', 'handUnderElbow'],
    drill: {
      // Named for what the body does, not for the coaching shorthand. "Back
      // scratch" is a phrase you have to already know to picture, and it now
      // reaches the player through the largest heading on the report — the
      // triage layer routes a shallow drop straight here. The instruction
      // underneath already says where the racket goes, in words that need no
      // translation.
      name: 'Let the racket fall',
      how: 'Serve at half pace with one thought: let the racket fall down your back before anything else moves.',
      reps: '20 serves · then 10 at full pace',
    },
  },
  contact: {
    label: 'Contact',
    blurb: 'Where you meet the ball, and how much of you is behind it.',
    phase: 'contact',
    weight: 24,
    metrics: ['contactHeight', 'ballContactHeight', 'contactBelowPeak', 'armExtension', 'contactAhead'],
    readings: ['bodyExtension'],
    drill: UP_AND_OUT,
  },
  rhythm: {
    label: 'Rhythm',
    blurb: 'Where each piece lands against the others.',
    phase: 'ready',
    weight: 12,
    metrics: ['loadRatio'],
    readings: ['totalTime', 'syncAtRelease'],
    drill: {
      name: 'Count the serve',
      how: 'Say one as both hands go down, two at the trophy, three at contact. One and two stay slow.',
      reps: '2 baskets · out loud',
    },
  },
}

/**
 * Whether this clip graded anything in an area at all (L1.1).
 *
 * An area can lose every row it grades for a reason that is about the clip and
 * not the player: Rhythm grades only the share of the motion after the trophy,
 * and that row leaves the card whenever the trophy lands on the toss — which is
 * the commonest club serve, legs straight and no drop. `chainScore` returns 0
 * for an empty list, and that 0 used to be weighted into the overall, drawn as
 * a ring badged "Needs work" and then reported as "Rhythm +83" the next time
 * the row was there. A measurement that could not be taken is not a bad one.
 *
 * Read off the shape rather than a stored flag, so every report saved before
 * this rule reads the same way: a graded row never scores under the curve's
 * floor of 30, so an area at 0 with no rows can only be one nothing was graded
 * in. An area with rows, or any score above 0, was measured.
 */
export function isMeasured(f: Pick<Fundamental, 'score' | 'metrics'>): boolean {
  return f.metrics.length > 0 || f.score > 0
}

/**
 * The overall score: the five areas by weight, leaving out any this clip could
 * not grade (`isMeasured`). The weights of the rest are renormalised rather
 * than the missing area being counted as a zero, so a serve whose rhythm could
 * not be read is scored on the four areas that were.
 */
export function overallOf(fundamentals: Pick<Fundamental, 'id' | 'score' | 'metrics'>[]): number {
  return weightedScore(
    fundamentals.filter(isMeasured).map((f) => ({ score: f.score, weight: FUNDAMENTALS[f.id].weight })),
  )
}
