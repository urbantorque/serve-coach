import type { ServeType } from '../storage/prefs'
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
    // sideways drift of the tossing hand as a share of the player's height
    ideal: [0, 3],
    range: [0, 12],
    decimals: 1,
    insight: {
      low: 'Your tossing hand travels **dead straight** up.',
      ok: 'Your tossing hand travels **straight** up with almost no drift.',
      high: 'Your tossing hand **drifts sideways**, so the ball finishes somewhere new each serve.',
    },
    fix: {
      low: '',
      high: '**Quiet the wrist** and cut the flick. Lift side-on to a fence so the ball brushes past it.',
    },
    drill: {
      name: 'Fence line toss',
      how: 'Stand side-on beside a fence and toss so the ball brushes the fence going up.',
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
      high: 'You **wait for the drop**. Every centimetre it falls is contact height handed back.',
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
    range: [0, 55],
    decimals: 0,
    insight: {
      low: 'Your hips and chest turn as **one block**, so the arm does the work alone.',
      ok: 'Your hips **lead** and the shoulders lag. That stretch whips the arm through.',
      high: 'A **big coil** between hips and shoulders.',
    },
    fix: {
      low: '**Turn the hips** to the court while the chest stays closed. Feel the stretch across your stomach.',
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
    range: [0, 50],
    decimals: 0,
    insight: {
      low: 'Your shoulders stay **level**, so the racket climbs on a shallow angle.',
      ok: 'Hitting shoulder **down**, tossing shoulder up. That tilt sends the racket up at the ball.',
      high: 'A **steep tilt**, so the racket travels sharply upward.',
    },
    fix: {
      low: '**Cartwheel** the shoulders, never spin them. Point at the ball and drop the hitting shoulder under it.',
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
      ok: 'Your racket **falls down your back** before it fires. That is where head speed comes from.',
      high: 'A **deep drop**, with plenty of runway to accelerate.',
    },
    fix: {
      low: '**Let the racket fall** until you could scratch between your shoulder blades. Loose grip, no lifting.',
      high: '**Keep the elbow up** so the racket stays behind your back, not down by your side.',
    },
    drill: {
      name: 'Back-scratch drop',
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
      high: 'Your arm stays **straight** through the drop, so the serve becomes a windmill.',
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
      low: 'You **snap** from drop to contact: explosive, or a drop too shallow to cover.',
      ok: 'Your racket **fires** from drop to ball. That acceleration window is sharp.',
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
      low: 'You strike **below full reach**, which shrinks the window the ball can land in.',
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
      ok: 'You **extend up** off the court into the ball, and the chain fired in order.',
      high: 'You get **well off the ground** into contact.',
    },
    fix: {
      low: '**Let the drive lift you** off the court. A few centimetres proves the sequence fired.',
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
    // how far in front of the hips contact happens, as a share of height
    ideal: [5, 20],
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
      ok: '**Well paced**: unhurried into the trophy, fast out of it.',
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
    label: 'Explosive phase',
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
      low: 'Your racket sits **by your leg** when the ball leaves, so the back half gets rushed.',
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
  label: string
  /** Shown next to the score so the player knows what they are being judged as. */
  blurb: string
  overrides: Record<string, [number, number]>
  /** Replacement copy where the flat wording would be actively wrong. */
  insight?: Record<string, Partial<MetricCopy['insight']>>
}

export const SERVE_TYPES: Record<ServeType, ServeTypeCopy> = {
  flat: {
    label: 'Flat / first serve',
    blurb: 'Judged as a first serve hit through the ball.',
    overrides: {},
  },
  kick: {
    label: 'Kick / topspin',
    blurb: 'Judged as a kick serve, so contact belongs over your head.',
    overrides: {
      // The racket travels up the back of the ball, so contact sits much closer
      // to over the head — and slightly lower, because you are brushing up it
      // rather than reaching through it.
      contactAhead: [-2, 12],
      contactHeight: [1.22, 1.46],
      // More cartwheel: the hitting shoulder drops further under the ball.
      shoulderTilt: [20, 40],
      // A kick is tossed a little lower and further back than a flat serve.
      tossPeakHeight: [1.3, 1.62],
    },
    insight: {
      contactAhead: {
        low: 'You strike **over your head**, where a kick wants it. Keep it from drifting behind you.',
      },
      contactHeight: {
        ok: 'You strike at **kick height**: high enough for margin, low enough to brush up the ball.',
      },
    },
  },
  slice: {
    label: 'Slice',
    blurb: 'Judged as a slice serve, so contact belongs in front and out to the side.',
    overrides: {
      // The racket cuts across the outside of the ball, in front of the body.
      contactAhead: [8, 24],
      // Flatter shoulders than a kick: this is a sideways swing, not an upward one.
      shoulderTilt: [10, 26],
    },
  },
}

/** The copy for one measurement, with any serve-type adjustment applied. */
export function metricCopy(id: string, serveType: ServeType = 'flat'): MetricCopy {
  const base = METRICS[id]
  if (!base) return base
  const type = SERVE_TYPES[serveType] ?? SERVE_TYPES.flat
  const ideal = type.overrides[id]
  const insight = type.insight?.[id]
  if (!ideal && !insight) return base
  return {
    ...base,
    ideal: ideal ?? base.ideal,
    insight: insight ? { ...base.insight, ...insight } : base.insight,
  }
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
    metrics: ['dropDepth', 'elbowAtDrop', 'dropToContact'],
    drill: {
      name: 'Back-scratch drop',
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
