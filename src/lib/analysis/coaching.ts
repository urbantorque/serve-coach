import type { ServeType } from '../storage/prefs'
import type { BodyAxis } from './axes'
import type { Drill, FundamentalId, PhaseId } from './types'

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
  insight: { low: string; ok: string; high: string }
  fix: { low: string; high: string }
  drill: Drill
}

export const METRICS: Record<string, MetricCopy> = {
  /* ------------------------------------------------------------------- toss */
  tossArmExtension: {
    id: 'tossArmExtension',
    label: 'Tossing arm extension',
    unit: '°',
    phase: 'toss',
    weight: 1,
    ideal: [163, 180],
    range: [90, 180],
    decimals: 0,
    insight: {
      low: 'Your tossing elbow **bends** at release, so the ball leaves from a new spot every serve.',
      ok: 'Tossing arm **straight** at release. That is what makes a toss repeat.',
      high: 'Tossing arm **fully long** at release.',
    },
    fix: {
      low: 'Lift from the shoulder with a **straight arm**. Place the ball on a high shelf, never throw it.',
      high: 'Keep the arm long but **loose**. Locking the elbow adds tension you do not need.',
    },
    drill: {
      name: 'Straight-arm shelf',
      how: 'Toss with the elbow locked long and place the ball on an imaginary high shelf.',
      reps: '20 tosses',
    },
  },
  releaseHeight: {
    id: 'releaseHeight',
    label: 'Release height',
    unit: '×',
    phase: 'toss',
    weight: 1,
    ideal: [1.12, 1.36],
    range: [0.7, 1.6],
    decimals: 2,
    insight: {
      low: 'You let the ball go **below full stretch**, so it drifts longer and you chase it.',
      ok: 'You release at **full stretch**, the shortest path up for the ball.',
      high: 'You release at the **top** of your reach.',
    },
    fix: {
      low: 'Hold the ball until the arm **locks out overhead**. Roll it off the fingertips, not the palm.',
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
    label: 'Tossing arm stays up',
    unit: '%',
    phase: 'trophy',
    weight: 1.1,
    ideal: [55, 100],
    range: [0, 100],
    decimals: 0,
    insight: {
      low: 'Your tossing arm **drops early**, the front shoulder falls with it, and contact drops too.',
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
    weight: 1.2,
    // Peak of the ball above the court, in body heights. Contact wants to happen
    // at 1.28–1.5, and the ball should top out a little above that so you are
    // reaching up to a still ball rather than chasing a falling one.
    ideal: [1.38, 1.72],
    range: [0.9, 2.4],
    decimals: 2,
    insight: {
      low: 'Your toss **stops below** your hitting reach, so you shorten the swing to meet it.',
      ok: 'The ball **tops out** above contact, exactly where it hangs longest.',
      high: 'Your toss climbs **far above** contact, so you hit it falling fast and time it perfectly or not at all.',
    },
    fix: {
      low: 'Toss so the ball peaks **one ball above** your racket at full stretch.',
      high: '**Lower the toss** until it peaks one ball above your reach. A high toss times badly.',
    },
    drill: {
      name: 'Rail height toss',
      how: 'Pick a fence rail one ball above your racket reach and toss to that height.',
      reps: '20 tosses',
    },
  },
  contactBelowPeak: {
    id: 'contactBelowPeak',
    label: 'Hitting the ball at its peak',
    unit: '×',
    phase: 'contact',
    weight: 1.1,
    // How far the ball has fallen from its apex by the moment of contact.
    ideal: [0, 0.09],
    range: [0, 0.6],
    decimals: 3,
    insight: {
      low: 'You strike the ball at the **top** of its flight, where it barely moves.',
      ok: 'You catch the ball **near the top**, while it still hangs.',
      high: 'You let the ball **fall** before you hit it, so you meet it lower than you could have.',
    },
    fix: {
      low: '',
      high: '**Start the swing earlier** so the racket arrives as the ball stops climbing. Check your toss height first.',
    },
    drill: {
      name: 'Catch the peak',
      how: 'Toss and swing so the racket meets the ball the instant it stops climbing.',
      reps: '15 serves',
    },
  },

  /* ---------------------------------------------------------------- loading */
  kneeBend: {
    id: 'kneeBend',
    label: 'Knee bend at trophy',
    unit: '°',
    phase: 'trophy',
    weight: 1.1,
    ideal: [35, 62],
    range: [0, 90],
    decimals: 0,
    insight: {
      low: 'Your legs stay **straight**, so the serve runs on arm alone.',
      ok: 'An **athletic load** — deep enough to store power, shallow enough to launch.',
      high: 'You **sink deep** into the load.',
    },
    fix: {
      low: '**Sink** until the knees sit over your toes, then drive up. Shadow serve and hold the bottom.',
      high: '**Trim the bend**. Speed out of the bottom beats depth at the bottom.',
    },
    drill: {
      name: 'Slow sink hold',
      how: 'Shadow serve, sink until the knees sit over your toes, hold two seconds, drive up.',
      reps: '3 sets of 8',
    },
  },
  hipShoulderSeparation: {
    id: 'hipShoulderSeparation',
    label: 'Hip–shoulder separation',
    unit: '°',
    phase: 'trophy',
    weight: 1,
    ideal: [15, 38],
    // Below zero the chest has unwound past the hips before the racket has even
    // dropped, which is a different fault from failing to coil and reads
    // differently on the card. The axis has to reach far enough down to show it.
    range: [-30, 55],
    // The old axis, kept as the yardstick for the decay. Admitting the reverse
    // side lengthened the axis by more than half without moving a single band,
    // and letting the scorer see that as more room would have handed a locked
    // trunk points it had not earned.
    missSpan: 55,
    decimals: 0,
    insight: {
      // Below the band now covers two different faults — a chest that opened
      // ahead of the hips, and a real but shallow coil the ladder calls "Slight
      // coil" — and `build()` has one string for the pair, because it picks by
      // band and not by rung. So this names what both share, the stretch that
      // never got stored, and leaves the direction to the readout beside it.
      // Saying "turns open with your hips" instead denied the readout outright
      // for every player between eight and fifteen degrees, which is most of
      // them.
      low: 'You reach the trophy with **too little coil** between hips and chest, so the arm swings on its own.',
      ok: 'Your hips **lead** and the shoulders lag. That stretch whips the arm through.',
      high: 'A **big coil** between hips and shoulders.',
    },
    fix: {
      low: '**Hold the chest closed** while the hips turn to the court. Feel the stretch across your stomach.',
      high: '**Hold the front hip** until the racket drops. Sliding early makes the timing fragile.',
    },
    drill: {
      name: 'Hip lead turn',
      how: 'Shadow serve and turn the hips to the court while the chest stays closed.',
      reps: '10 reps',
    },
  },
  shoulderTilt: {
    id: 'shoulderTilt',
    label: 'Shoulder tilt',
    unit: '°',
    phase: 'trophy',
    weight: 1,
    ideal: [14, 32],
    // Below zero the cartwheel runs the wrong way: hitting shoulder high,
    // tossing shoulder dropped. It is a common recreational fault and it pulls
    // the racket down across the ball, so the axis has to be able to show it
    // rather than reporting it as a level pair of shoulders.
    range: [-25, 50],
    // The old axis, kept as the yardstick for the decay — see
    // `hipShoulderSeparation` above. Without it a flat-shouldered trophy rose
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
      name: 'Cartwheel shoulders',
      how: 'Freeze at the trophy with the hitting shoulder dropped under the tossing shoulder.',
      reps: '10 holds',
    },
  },
  legDrive: {
    id: 'legDrive',
    label: 'Leg drive',
    unit: '×',
    phase: 'contact',
    weight: 1,
    ideal: [0.1, 0.24],
    range: [0, 0.36],
    decimals: 3,
    insight: {
      low: 'You loaded the legs and **never cashed it in**.',
      ok: 'You **drive up** hard out of the load, and the legs feed the swing.',
      high: 'A **big launch** upward.',
    },
    fix: {
      low: '**Explode up** and land inside the baseline. Drive up at the ball, not forward at it.',
      high: '**Drive up**, not out. Landing deep in the court means the toss sits too far ahead.',
    },
    drill: {
      name: 'Land inside',
      how: 'Serve and jump so you land a stride inside the baseline every time.',
      reps: '15 serves',
    },
  },

  /* ------------------------------------------------------------------ swing */
  dropDepth: {
    id: 'dropDepth',
    label: 'Racket drop',
    unit: '×',
    phase: 'drop',
    weight: 1.2,
    ideal: [0.16, 0.34],
    range: [0, 0.5],
    decimals: 3,
    insight: {
      low: 'Your racket **never falls** behind your back, so the swing starts half finished.',
      ok: 'Your racket **falls down your back** before it fires, and that fall is where racket speed comes from.',
      high: 'A **deep drop**, with plenty of runway to accelerate.',
    },
    fix: {
      low: '**Let the racket fall** until you could scratch between your shoulder blades. Loose grip, no lifting.',
      high: '**Keep the elbow up** so the racket stays behind your back, not down by your side.',
    },
    drill: {
      // Named for what the body does, not for the coaching shorthand. "Back
      // scratch" is a phrase you have to already know to picture, and it now
      // reaches the player through the largest heading on the report — the
      // triage layer routes a shallow drop straight here. The instruction
      // underneath already says where the racket goes, in words that need no
      // translation.
      name: 'Let the racket fall',
      how: 'Serve at half pace and let the racket fall between your shoulder blades before firing.',
      reps: '20 serves',
    },
  },
  elbowAtDrop: {
    id: 'elbowAtDrop',
    label: 'Hitting elbow at drop',
    unit: '°',
    phase: 'drop',
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
    drill: {
      name: 'Elbow-up L',
      how: 'Pause at the drop with the elbow high and the racket head hanging down your back.',
      reps: '10 holds',
    },
  },
  handUnderElbow: {
    id: 'handUnderElbow',
    label: 'Hand under the elbow',
    unit: '%',
    phase: 'drop',
    // Under every other measurement on this card, and deliberately so. The band
    // below is provisional in a way none of the others are, and weight is the
    // one honest lever for that: it holds down the vote a guessed band gets in
    // the Swing score without touching the number itself, which is measured
    // exactly as well as the ones beside it.
    weight: 0.7,
    /*
     * PROVISIONAL BAND. There is no recorded footage in this repo to calibrate
     * against — `__tests__/fixtures/index.ts` still has an empty RECORDED list —
     * so the floor here is anchored to the synthetic rig and to nothing else.
     * On that rig a serve with a textbook racket drop spends 28.6% of its
     * toss-to-contact window with the hand under the elbow, one with no drop at
     * all spends 2.9%, and the share climbs monotonically between them: 14.3 at
     * a 0.10 m drop, 20.0 at 0.20, 25.7 at 0.30. Twenty is the rung boundary
     * that sits under every serve the rig calls loaded and over every one it
     * calls flat, and that is the entire evidence for it. Re-derive it from real
     * clips the moment there are any.
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
    ideal: [20, 100],
    range: [0, 100],
    decimals: 0,
    insight: {
      // Worded as a shortfall and not as a position, because one sentence has to
      // cover two rungs that describe different bodies — a hand that never gets
      // under the elbow and one that dips under it and leaves. Naming either
      // would deny the readout printed beside it for players at the other end.
      low: 'Your hand **spends too little time under your elbow**, so the arm pushes the ball instead of throwing it.',
      ok: 'Your hand **hangs under your elbow** on the way up, which is where racket speed comes from.',
      high: 'Your hand **hangs under your elbow** for a long stretch of the swing.',
    },
    fix: {
      low: '**Let the hand hang under your elbow** as the arm goes up. Keep the grip loose.',
      // Empty while the band runs to the end of its own axis: there is nothing
      // above it to correct. `tossPathWobble` carries the same blank at the
      // other end for the same reason.
      high: '',
    },
    drill: {
      name: 'Hang under the elbow',
      how: 'Shadow serve slowly and hold the hand hanging under a high elbow before the arm fires.',
      reps: '12 shadow serves',
    },
  },
  dropToContact: {
    id: 'dropToContact',
    label: 'Drop to contact',
    unit: 'ms',
    phase: 'contact',
    weight: 1,
    ideal: [110, 230],
    range: [50, 450],
    decimals: 0,
    insight: {
      low: 'You **snap** from drop to ball. That is either explosive, or a sign the racket never fell far enough.',
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
    label: 'Contact height',
    unit: '×',
    phase: 'contact',
    weight: 1.3,
    ideal: [1.28, 1.5],
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
    drill: {
      name: 'Heels-up basket',
      how: 'Serve a full basket with your heels off the ground from start to finish.',
      reps: '15 serves',
    },
  },
  armExtension: {
    id: 'armExtension',
    label: 'Arm extension at contact',
    unit: '°',
    phase: 'contact',
    weight: 1.2,
    ideal: [160, 180],
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
    drill: {
      name: 'Reach and freeze',
      how: 'Serve and freeze at contact with the hitting arm locked long above you.',
      reps: '12 serves',
    },
  },
  bodyExtension: {
    id: 'bodyExtension',
    label: 'Body extension',
    unit: '×',
    phase: 'contact',
    weight: 0.9,
    ideal: [0.02, 0.16],
    range: [0, 0.28],
    decimals: 3,
    insight: {
      low: 'You stay **flat-footed** at contact, so the load never left the ground.',
      ok: 'You **extend up** off the court into the ball, so your legs, body and arm fired in the right order.',
      high: 'You get **well off the ground** into contact.',
    },
    fix: {
      low: '**Let the drive lift you** off the court. Leaving the ground at all proves your legs fed the swing.',
      high: '**Jump up** and a touch forward, then land on the front foot inside the baseline.',
    },
    drill: {
      name: 'Off the court',
      how: 'Serve so both feet leave the court and you land on the front foot.',
      reps: '15 serves',
    },
  },
  contactAhead: {
    id: 'contactAhead',
    label: 'Contact point in front',
    unit: '%',
    phase: 'contact',
    weight: 1,
    // How far in front of the hips contact happens, as a share of height. The
    // floor sits on the ladder's own boundary between "struck over the head" and
    // "struck in front of the body": a band opening at 5 spent three points of
    // its width praising a contact the readout beside it still called over the
    // head, which is the fault this measurement exists to name.
    ideal: [8, 20],
    range: [-10, 34],
    decimals: 1,
    insight: {
      low: 'You strike **over or behind** your head, which drops serves into the net and arches your back.',
      ok: 'You strike **in front** of your body, with your weight moving into the court.',
      high: 'You strike **far in front** of your body.',
    },
    fix: {
      low: '**Toss a stride inside the baseline** so you move up and forward. Contact belongs ahead of the front foot.',
      high: '**Rein the toss back** if you fall into the court. Ahead is good, falling is not.',
    },
    drill: {
      name: 'Step-in toss',
      how: 'Toss a stride inside the baseline and let it pull you forward into contact.',
      reps: '15 serves',
    },
  },

  /* ----------------------------------------------------------------- rhythm */
  totalTime: {
    id: 'totalTime',
    label: 'Motion length',
    unit: 'ms',
    phase: 'contact',
    weight: 0.8,
    ideal: [900, 1800],
    range: [400, 3000],
    decimals: 0,
    insight: {
      low: 'You **rush** the whole motion, so the legs never load.',
      // Says only what this measurement can see. It times the whole motion from
      // the first move to the ball and knows nothing about where the trophy fell
      // inside it, so the old wording ("unhurried into the trophy, fast out of
      // it") claimed a split it never measured — and printed a Strong badge
      // three lines above `loadRatio` saying the back half drifts.
      ok: '**Well paced** from first move to ball, neither rushed nor drawn out.',
      high: 'A **long motion**. Usually the ball goes up and then you wait for it.',
    },
    fix: {
      low: '**Slow the first half**. Only the last third of a serve moves fast.',
      high: '**Cut the pause**. Toss and takeback start together and never stop until contact.',
    },
    drill: {
      name: 'Three count',
      how: 'Say one going down, two at the trophy, three at contact. Only three is fast.',
      reps: '2 baskets',
    },
  },
  loadRatio: {
    id: 'loadRatio',
    label: 'Time from trophy to contact',
    unit: '%',
    phase: 'trophy',
    weight: 0.8,
    // share of the motion spent between the trophy and contact — about 400 ms
    // out of ~1300 ms in a well-timed serve
    ideal: [22, 42],
    range: [8, 65],
    decimals: 0,
    insight: {
      low: 'You spend the motion **before the trophy**, then cram everything into the finish.',
      ok: 'A **clean split** between the slow build and the explosive finish.',
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
  syncAtRelease: {
    id: 'syncAtRelease',
    label: 'Arms in sync',
    unit: '×',
    phase: 'toss',
    weight: 1,
    ideal: [-0.05, 0.28],
    range: [-0.4, 0.5],
    decimals: 2,
    insight: {
      low: 'Your racket is still **down by your leg** when you release the ball, so everything after it happens in a rush.',
      ok: '**Down together, up together**: both arms reach the top at once.',
      high: 'Your racket is already **high** when the ball leaves your hand.',
    },
    fix: {
      low: '**Start both hands down together** and lift them together, arriving at the top as one.',
      high: '**Stop lifting the racket early**. Waiting at the top kills the rhythm.',
    },
    drill: {
      name: 'Mirror hands',
      how: 'Start both hands together at your thigh and lift them together to the top.',
      reps: '15 serves',
    },
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
  name: 'Baseline drop toss',
  how: 'Toss from behind the baseline and let the ball drop on the line, not in front of it or behind.',
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
      insight: {
        high: 'Your tossing hand **drifts forwards and back**, so the ball finishes nearer or further out each serve.',
      },
      fix: {
        high: '**Keep the toss on one line** and let the ball drop back onto the baseline every serve.',
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
      insight: {
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
  elbow_up_l: METRICS.elbowAtDrop.drill,
  hip_lead_turn: METRICS.hipShoulderSeparation.drill,
  slow_sink_hold: METRICS.kneeBend.drill,
  heels_up_basket: METRICS.contactHeight.drill,

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
    blurb: 'Judged as a kick serve, so contact belongs over your head.',
    overrides: {
      // The racket travels up the back of the ball, so contact sits much closer
      // to over the head — and slightly lower, because you are brushing up it
      // rather than reaching through it.
      //
      // The band is exactly the ladder's "struck over the head" rung, floor and
      // ceiling both. It used to run from -2 to 12, which put its bottom two
      // points inside the rung the readout calls struck behind the head and its
      // top four inside the one it calls struck in front of the body: a kick
      // serve could be badged "Solid" under a readout naming a fault, or under
      // one naming the flat serve's target.
      contactAhead: [0, 8],
      // Lower than a flat serve, and lower by a whole rung rather than by the
      // couple of hundredths a kick is really struck below one. The card speaks
      // in rungs, so a floor at 1.22 sat inside "struck below full reach" and
      // praised the top of that rung while correcting the bottom of it: two kick
      // serves, one readout, opposite verdicts. The ceiling stays where the flat
      // serve's is, because a kick reached for at the very top of the stretch has
      // been driven through rather than brushed up.
      contactHeight: [1.1, 1.5],
      // More cartwheel: the hitting shoulder drops further under the ball, and
      // this band starts where the flat one stops. The steep tilt the flat card
      // calls arching is the tilt a kick is hit with — the flat serve's fault is
      // this serve's intent — so the two meet at the rung boundary instead of
      // overlapping. Running from 20 to 40 split both rungs it touched: a
      // shoulder the readout called under the ball was praised at 21 and
      // corrected at 19.
      shoulderTilt: [32, 50],
      // A kick is tossed a little lower and further back than a flat serve, so
      // the toss is allowed to peak at racket reach rather than a ball above it.
      // The ceiling holds at the flat serve's: a toss climbing past that falls
      // too fast to brush up, whatever spin you meant to put on it.
      tossPeakHeight: [1.2, 1.72],
    },
    insight: {
      contactAhead: {
        // All three, because the kick band sits a whole rung below the flat one
        // and every region around it therefore describes a different position.
        // Under the band a kick is behind the head, not over it; over the band it
        // is where a flat serve wants it, which is too far forward to brush up
        // the back of the ball.
        low: 'You strike **behind your head**, so your back arches and the racket cannot brush up the ball.',
        ok: 'You strike **over your head**, where a kick wants it. Keep it from drifting behind you.',
        high: 'You strike **in front of your body**, so the racket drives through the ball rather than up its back.',
      },
      contactHeight: {
        ok: 'You strike at **kick height**: high enough for margin, low enough to brush up the ball.',
      },
      shoulderTilt: {
        // The kick band starts a whole rung above the flat one, so everything
        // the ladder calls "hitting shoulder under the ball" falls below it. The
        // flat wording — the shoulder sits level or high — would deny that
        // readout outright for every kick between the two.
        low: 'Your hitting shoulder **drops too little** for a kick, so the racket goes through the ball instead of up it.',
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
        name: 'Kick toss over the shoulder',
        how: 'Toss over your hitting shoulder and brush the racket up the back of the ball.',
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
  { label: string; blurb: string; phase: PhaseId; weight: number; metrics: string[]; drill: Drill }
> = {
  toss: {
    label: 'Toss',
    blurb: 'Everything downstream is built on where the ball goes.',
    phase: 'toss',
    weight: 22,
    metrics: ['tossPeakHeight', 'tossArmExtension', 'releaseHeight', 'tossArmHold', 'tossPathWobble'],
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
    metrics: ['kneeBend', 'hipShoulderSeparation', 'shoulderTilt', 'legDrive'],
    drill: {
      name: 'Freeze at the trophy',
      how: 'Shadow serve and stop dead at the trophy: knees bent, arm pointing, hitting shoulder dropped, chest up.',
      reps: '3 sets of 8 · then 10 live serves',
    },
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
    metrics: ['contactHeight', 'contactBelowPeak', 'armExtension', 'bodyExtension', 'contactAhead'],
    drill: {
      name: 'Heels up',
      how: 'Serve a whole basket with your heels off the ground, so you reach up to the ball instead of out.',
      reps: '15 serves · then 15 normal',
    },
  },
  rhythm: {
    label: 'Rhythm',
    blurb: 'Where each piece lands against the others.',
    phase: 'ready',
    weight: 12,
    metrics: ['totalTime', 'loadRatio', 'syncAtRelease'],
    drill: {
      name: 'Count the serve',
      how: 'Say one as both hands drop, two at the trophy, three at contact. One and two stay slow.',
      reps: '2 baskets · out loud',
    },
  },
}
