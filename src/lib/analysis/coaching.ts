import type { ServeType } from '../storage/prefs'
import type { Drill, FundamentalId, PhaseId } from './types'

/**
 * Copy for every measurement the app makes.
 *
 * `insight` is what the number means and is always shown. `fix` is what to
 * change and is only shown when the metric falls outside its band, so the
 * report reads as praise where praise is due and instruction where it is not.
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
      low: 'Your tossing elbow is still bent when the ball leaves your hand, so the release point moves a little every time.',
      ok: 'Straight tossing arm at release. This is the single biggest reason a toss repeats.',
      high: 'Fully extended tossing arm at release.',
    },
    fix: {
      low: 'Lift from the shoulder with a straight arm and let go above eye level — think of placing the ball on a high shelf rather than throwing it.',
      high: 'Keep the arm long but relaxed; locking the elbow hard adds tension you do not need.',
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
      low: 'You let go of the ball below full stretch. A low release gives the ball longer to drift and leaves you rushing to catch up.',
      ok: 'You release at full stretch, which is the shortest and straightest path for the ball.',
      high: 'You release very high, right at the top of your reach.',
    },
    fix: {
      low: 'Hold on until the arm is completely extended above your head. The ball should roll off your fingertips, not leave your palm.',
      high: 'Check you are not pushing up onto your toes before the legs load — the release should be tall, not early.',
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
      low: 'Your tossing arm drops away early. When it comes down the front shoulder collapses with it, and you lose both height and balance at contact.',
      ok: 'You hold the tossing arm up into the swing, which keeps the chest open and the shoulders tilted.',
      high: 'You hold the tossing arm up right through the swing.',
    },
    fix: {
      low: 'Keep that arm up and pointing at the ball until the racket starts up to meet it, then tuck it into your chest — not before.',
      high: 'Do tuck it in eventually; leaving it out through the finish costs you rotation.',
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
      low: 'Your tossing hand travels dead straight up.',
      ok: 'Your tossing hand travels straight up with very little sideways drift.',
      high: 'Your tossing hand wanders sideways on the way up, so the ball finishes in a slightly different place each time.',
    },
    fix: {
      low: '',
      high: 'Toss with a quiet wrist and no flick. Stand side-on to a fence and toss so the ball brushes past it — twenty in a row without moving your feet.',
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
      low: 'Your toss does not get above your hitting reach, so you have to shorten the swing to meet it and the racket never fully extends.',
      ok: 'The ball tops out just above where you make contact, which is exactly where it hangs longest and is easiest to time.',
      high: 'You toss the ball a long way above your contact point, so it is falling fast by the time you hit it and the timing has to be perfect every time.',
    },
    fix: {
      low: 'Toss so the ball peaks about a foot above your racket at full stretch. Stand under a fence rail and toss to the same height ten times in a row.',
      high: 'Bring the toss down until it peaks just above your reach. A high toss feels safer and is much harder to time — the ball is quickest exactly where you are trying to hit it.',
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
      low: 'You strike the ball right at the top of its flight, where it is barely moving. That is the easiest moment to time and the highest you can possibly hit it.',
      ok: 'You catch the ball close to the top of its flight, while it is still hanging.',
      high: 'You are waiting for the ball to drop before you hit it. Every centimetre it falls is contact height you have given away, and it is moving faster the longer you wait.',
    },
    fix: {
      low: '',
      high: 'Start the swing earlier so the racket arrives as the ball stops climbing. If the toss is too high you will always end up waiting — check your toss height first.',
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
      low: 'You barely bend your knees, so the serve is almost entirely arm. The legs are the cheapest speed on the court.',
      ok: 'A strong, athletic load — deep enough to store energy, shallow enough to launch out of quickly.',
      high: 'You sink very deep into the load.',
    },
    fix: {
      low: 'Sink until your knees are over your toes, then drive up. Shadow serve slowly and pause at the bottom until the position feels normal.',
      high: 'Trim the bend back towards 45°. Depth is not the goal — how fast you come out of the bottom is.',
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
      low: 'Your hips and shoulders turn as one block, so you are serving with your arm instead of unwinding your body.',
      ok: 'Your hips lead and your shoulders lag behind them. That stretch across the trunk is what whips the arm through.',
      high: 'A big coil between hips and shoulders — a lot of stored energy.',
    },
    fix: {
      low: 'At the trophy, start the hips rotating towards the court while the shoulders stay closed a beat longer. Feel the stretch across your stomach.',
      high: 'Check the front hip is not sliding into the court before the racket has dropped, or the timing gets fragile.',
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
      low: 'Your shoulders are almost level at the trophy. Flat shoulders send the racket up on a shallow angle and cost you contact height.',
      ok: 'Hitting shoulder down, tossing shoulder up. This is the tilt that lets you hit up at the ball rather than around it.',
      high: 'A steep shoulder tilt, which gets the racket travelling upwards nicely.',
    },
    fix: {
      low: 'Point the tossing hand at the ball and let the hitting shoulder drop underneath it. Cartwheel your shoulders, do not spin them.',
      high: 'Make sure the tilt comes from the shoulders and not from leaning back — arching the lower back moves contact behind you.',
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
      low: 'Very little upward drive. You loaded the legs but never cashed it in.',
      ok: 'Strong upward drive out of the load — the legs are feeding the swing.',
      high: 'A big launch upwards.',
    },
    fix: {
      low: 'Explode up so that you leave the ground and land inside the baseline. Think up at the ball, not forward at it.',
      high: 'Check you are going up rather than out. Landing a long way into the court usually means the toss is too far in front.',
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
      low: 'The racket never really falls behind your back. Without that drop there is no runway to accelerate — the swing starts already half finished.',
      ok: 'The racket falls well down your back before it fires. That is where racket-head speed comes from.',
      high: 'A very deep racket drop, with plenty of runway to accelerate through.',
    },
    fix: {
      low: 'Let the racket head fall until you could scratch between your shoulder blades. It should feel loose and heavy, not lifted.',
      high: 'Keep the elbow up so the racket stays behind your back rather than dropping down by your side.',
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
      low: 'Your hitting elbow folds extremely tight at the drop.',
      ok: 'Your hitting arm folds into a loaded L at the drop, elbow up and racket head down.',
      high: 'Your hitting arm stays fairly straight through the drop, which turns the serve into a windmill.',
    },
    fix: {
      low: 'Give the racket a little room — jamming it against your back stops it swinging freely into the drop.',
      high: 'Let the elbow bend and lead the way up: racket head down, elbow up and pointing sideways, arm coiled like an L before it fires.',
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
      low: 'Extremely quick from drop to contact — either genuinely explosive, or the drop was shallow enough that there was little distance to cover.',
      ok: 'The racket covers the distance from drop to ball explosively. This is the acceleration window and yours is sharp.',
      high: 'The racket takes a long time to get from the drop to the ball, so the swing is being guided rather than released.',
    },
    fix: {
      low: 'Cross-check your racket drop — if the drop is shallow, a quick swing is hiding a short one.',
      high: 'Stop steering the racket. Serve at 80% intent but twice as loose, and let the arm extend late.',
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
      low: 'You are hitting the ball below full reach. Every centimetre you give up here shrinks the window the ball can land in.',
      ok: 'You make contact right at full stretch, which is exactly where your margin over the net comes from.',
      high: 'Contact is at the very top of your reach.',
    },
    fix: {
      low: 'Reach up and hit at the top. Serve with your heels off the ground for a basket — it forces you to go up rather than out.',
      high: 'Nothing to change here; just make sure the toss stays in front rather than drifting back to reach it.',
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
      low: 'Your hitting arm is still bent at contact, which costs you height and power at the same time.',
      ok: 'A long arm at contact — you are hitting at the top of the reach with nothing left on the table.',
      high: 'Full extension through the ball.',
    },
    fix: {
      low: 'Chase the ball up with a long arm. Toss a little higher so you have to stretch to it instead of pulling down early.',
      high: 'Stay loose through the elbow — a locked arm at contact stops the racket head releasing.',
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
      low: 'You are still flat-footed at contact, so the energy you loaded stayed in the ground.',
      ok: 'You extend up off the court into the ball — the chain fired in the right order.',
      high: 'You get well off the ground into contact.',
    },
    fix: {
      low: 'Let the drive carry you off the court. You do not need a big jump — a few centimetres means the legs, hips and shoulders fired in sequence.',
      high: 'Make sure the jump is up and slightly forward, and that you land on the front foot inside the baseline.',
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
      low: 'Contact is happening over or behind your head rather than out in front. This is why serves feel like they drop into the net and why your back arches.',
      ok: 'Contact is nicely in front of your body, so your weight is moving into the court as you hit.',
      high: 'Contact is a long way in front of you.',
    },
    fix: {
      low: 'Toss about a foot inside the baseline so you have to move up and forward to reach it. Contact belongs in front of your front foot.',
      high: 'Great for a flat first serve, but if you are falling into the court the toss has gone too far ahead.',
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
      low: 'The whole motion is very quick. Rushed serves rarely repeat, because the legs never get time to load.',
      ok: 'A well-paced motion: unhurried into the trophy, fast out of it.',
      high: 'A long motion. Fine if it flows, but usually it means the ball goes up and then you wait for it.',
    },
    fix: {
      low: 'Slow the first half down. Only the last third of a serve should be fast.',
      high: 'Trim the pause. The toss and the takeback start together and should not stop until contact.',
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
      low: 'Almost all of your motion happens before the trophy, then everything is crammed into a tiny window at the end.',
      ok: 'A good split between the slow build and the explosive finish.',
      high: 'A large share of the motion is spent after the trophy, which usually means the back half is drifting rather than firing.',
    },
    fix: {
      low: 'Give yourself more room after the trophy — start the drive a fraction earlier and let it flow into the swing.',
      high: 'Sharpen the finish. From the trophy on, it should be one continuous acceleration.',
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
      low: 'When the ball leaves your hand the racket is still down by your leg. The two arms are out of step, so the second half of the serve has to be rushed.',
      ok: 'Down together, up together — both arms arrive at the top at the same moment.',
      high: 'Your racket is already high when the ball is released.',
    },
    fix: {
      low: 'Start both hands down together and let them rise together: tossing arm extended, racket arm cocked, arriving at the same time.',
      high: 'Check you are not lifting the racket early and then stalling at the top waiting for the ball.',
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
    blurb: 'Judged as a kick serve, so contact belongs more over your head than in front.',
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
        low: 'Contact is happening over your head, which is where a kick serve wants it. Watch that it does not drift behind you, which is what makes a kick serve land short.',
      },
      contactHeight: {
        ok: 'You make contact at the right height for a kick — high enough for margin, low enough to brush up the back of the ball.',
      },
    },
  },
  slice: {
    label: 'Slice',
    blurb: 'Judged as a slice serve, so contact belongs further in front and out to the side.',
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
      how: 'Stand side-on, a racket length from a fence. Toss so the ball brushes past the fence on the way up and lands on the same spot every time. No racket, no serve — just the toss.',
      reps: '20 tosses · aim for 15 landing inside a racket head',
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
      how: 'Shadow serve and stop dead at the trophy: knees bent, tossing arm up and pointing, hitting shoulder dropped, chest to the sky. Hold two seconds, then drive up and finish the swing.',
      reps: '3 sets of 8 · then 10 live serves keeping the same shape',
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
      how: 'Serve at half pace with a single thought: let the racket fall down your back before it goes anywhere else. Loose grip, no targets, no care where the ball lands.',
      reps: '20 serves · then 10 at full pace keeping the same looseness',
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
      how: 'Serve a whole basket with your heels off the ground from start to finish. It removes the option of hitting out at the ball and forces you to reach up to it.',
      reps: '15 serves · then 15 normal, keeping the same contact height',
    },
  },
  rhythm: {
    label: 'Rhythm',
    blurb: 'How the pieces are timed against each other.',
    phase: 'ready',
    weight: 12,
    metrics: ['totalTime', 'loadRatio', 'syncAtRelease'],
    drill: {
      name: 'Count the serve',
      how: 'Say "one" as both hands go down, "two" as you hit the trophy, "three" at contact. One and two are slow and even; only three is fast.',
      reps: '2 baskets · say it out loud',
    },
  },
}
