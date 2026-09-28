/**
 * Player-facing set-up copy (CAPTURE §3 owns set-up strings; §5.4, §6.1, §7.1, §7.2, §11.4).
 * Kept verbatim where CAPTURE marks it final; ranges use "to" (DESIGN §11 rule 6). Linted by
 * copy.test.ts.
 */

export const BEFORE_YOU_GO = {
  title: 'Before you head out',
  items: [
    'Phone charged to at least 40%, with about 2 GB free.',
    "Something to hold the phone upright and steady at chest height: a tripod or light stand, or a fence clip. A bag or bench works at a pinch; we'll tell you if it's too low.",
    'Balls. A basket is easiest. With 4 to 6 balls, serve them all, pick them up and keep going. We skip the walking.',
    'Water, a hat and sunscreen.',
    "Warm up first. Your first few serves of the day aren't typical, so we'll record after you're loose.",
  ],
} as const

export const FILMING_AT_COURTS = {
  title: 'Filming at the courts',
  items: [
    'Film yourself, not others. Frame the shot so the fence or windscreen is behind you where you can.',
    "If people are on the next court, a quick 'I'm just filming my serve' goes a long way.",
    "If kids are having a lesson in the background, move your phone or wait until they've finished.",
    "Some clubs and councils have rules about filming. If there's a sign or you're not sure, ask.",
    'Your videos stay on this phone. Nothing is uploaded.',
    'Under 18? A parent or guardian needs to be with you and agree to the recording.',
    "Coaches: film a junior player only with the parent's or guardian's permission and the player's agreement.",
    "Don't leave your phone on the fence and walk away.",
  ],
} as const

/** CAPTURE §3.2 "Set up in six steps". */
export const SIX_STEPS = [
  {
    title: 'Pick your side.',
    body: "Put the phone on your hitting-arm side. That's your right if you're right-handed, and your left if you're left-handed.",
  },
  {
    title: 'Line it up with the baseline.',
    body: 'Stand the phone outside the court, in line with the baseline, 2 to 3 big steps outside the outer sideline. Between two courts, halfway across is usually right. Point the camera straight along the baseline at where you serve, so the line runs up the middle of the screen.',
  },
  {
    title: 'Chest height, and level.',
    body: "Set the phone about 1.3 to 1.6 m high, around chest height. Keep it level. Don't tilt it up at the sky. The level guide turns solid when it's right.",
  },
  {
    title: 'Upright, standard lens.',
    body: "Stand the phone upright, with the camera facing your serving spot. Use the standard 1x lens and don't zoom.",
  },
  {
    title: 'Check the sun.',
    body: "Stand at your serving spot and look at the phone. The sun should be behind the phone or off to one side, not behind you. If you're squinting a little, that's good: the camera isn't.",
  },
  {
    title: 'Stand tall, then toss.',
    body: "Walk to your spot and stand tall for two seconds. Then toss a ball as you would for a serve and catch it. We'll check you, your toss and the light, and tell you if anything needs to move.",
  },
] as const

export const FENCE_CARD = {
  title: 'Using the side fence instead?',
  body: "Clip the phone sideways to the side fence, in line with the baseline, about 1.4 to 1.8 m high. If we ask, tilt the top back a little. We read the tilt from the phone's motion sensor and correct for it. This correction hasn't been checked on real phones yet. Use 4K if your phone offers it.",
} as const

export const DOUBLES_CARD = {
  title: 'Serving from your doubles spot?',
  body: "You'll be 2 to 3 m closer to the phone, so move the phone 2 big steps further back.",
} as const

export const SPEED_CARD = {
  title: 'Measuring speed?',
  body: 'We need to see the ball fly for a moment after you hit it. Put the phone about 8.5 m from the centre mark, or clip it sideways to the side fence. Tag your target (T, body or wide) for each block.',
} as const

/** The D1 framing rule in player words (CAPTURE §3.2 result states). */
export const FRAMING_RULE = {
  title: 'Room above your toss',
  body: "The top of the picture needs to be at least 4.5 m above the court where you stand, so even a very high toss stays in view. We work it out from your height while you stand tall, and we'll say if the phone needs to go back or up. Between 4.3 and 4.5 m still works, and very high tosses are then estimated.",
} as const

export const LIGHT_TIPS = {
  title: 'Light',
  items: [
    { title: 'Sun', body: 'Keep the sun behind the phone or to its side. Filming into the sun turns you into a silhouette and hides the ball against a bright sky.' },
    {
      title: 'Which end of the court',
      body: "Most courts run north to south. In the morning, set the phone on the east side; in the afternoon, on the west side. If you're right-handed that means serving from the south end in the morning and the north end in the afternoon; left-handers, the other way round.",
    },
    { title: 'Midday', body: "Midday is fine for the camera: the sun is high and to the side. It's the hottest and harshest part of the day for you and your phone, so keep sessions short." },
    { title: 'Winter', body: 'In winter the sun stays low in the north, even at midday. If your court runs east to west, put the phone where it faces south.' },
    { title: 'Background', body: 'A plain background helps us follow the ball: sky, a dark windscreen or a wall. Trees and busy courts behind you make it harder.' },
    {
      title: 'Night',
      body: "Court lights work. They're dimmer than daylight, so timing is a little less precise and the fast parts of your swing will blur. Your toss, leg drive and shoulder tilt are fine.",
    },
    {
      title: 'Comp nights',
      body: 'If you can, record your first check-in in daylight. Night sessions still count, and we label them, but a daylight session gives you a clean starting point to compare with.',
    },
    {
      title: 'Flicker',
      body: "Some lights pulse faster than you can see, which makes the picture flicker. If your phone offers 25 or 50 fps, use it at night. If not, keep 60 fps and we'll correct for it.",
    },
  ],
} as const

export const HEAT = {
  title: 'Hot day?',
  intro: 'Phones are designed for air temperatures up to 35 °C, and a phone in full sun gets hotter than the air. To keep recording:',
  items: [
    'Shade the phone with a towel or cap over the top, clear of the lens.',
    'Take it out of a thick case.',
    "Don't charge it while you record.",
    "Record your serves, then stop. Don't leave it running between blocks.",
    'If you see a temperature warning, stop. The phone may stop recording on its own.',
  ],
  outro: 'Look after yourself too: drink water, wear a hat, and stop if you feel unwell. If anything hurts, stop and see a physio or doctor.',
} as const

export const HOW_MANY = {
  title: 'How many serves',
  lead: "15 serves is the sweet spot. If you've got the energy and the balls, 20 is even better.",
  items: [
    'One side per block. Start on the deuce side (the right half as you face the net) unless you\'re working on the ad side. The phone stays where it is. We calibrate each side separately and only compare like with like.',
    'If you only have time for one side, use the same side each session so your progress lines up.',
    'Record second serves as their own block. A kick or slice toss sits in a different place, usually further back and to the side, so mixing them in would make your toss look less consistent than it is.',
    'Serving points (first serve, then a second if you miss) is coming later. For now, pick first or second for the block.',
  ],
} as const

export const REAR_VIEW = {
  title: 'Add a view from behind (optional)',
  intro: "A raised view from behind shows things the side view can't: your toss drifting left or right, your knee bend, how your shoulders tilt at contact, and where the ball lands.",
  steps: [
    'Clip the phone to the back fence behind your serving spot, as high as you can: 2.5 to 3.3 m is ideal, and 2 m at the least. About 5 to 7 m behind you is right.',
    'Centre it behind where you serve, or up to a metre towards your non-hitting side so your body doesn\'t hide the ball.',
    'Turn it sideways and use the standard 1x lens. Tilt it down a little so your feet and both far service boxes are in the picture. Use 4K if your phone offers it.',
    "Check the net tape isn't covering the far service line. If it is, the phone needs to go higher.",
  ],
  unlocks: [
    'Toss drift left or right, and its spread',
    'A knee-bend band, from the knee nearer the camera',
    'Shoulder tilt at contact',
    'Experimental in or out and placement suggestions',
    'An experimental average speed range, from contact to the bounce',
  ],
  limits: "It never mixes with your side-view stats, and spin and serve type still can't be measured. Record it as its own session.",
} as const

export const HIT_SOUND = {
  title: 'Hit-sound timing',
  toggle: 'Use the hit sound for timing',
  body: "Your phone listens for the moment of contact. The sound is turned into timings on this phone and deleted; it's never saved or sent. Leave this off if people are talking nearby.",
  note: 'It only times contact. It is never used for speed.',
} as const

export const IMPORT_HELP = {
  title: 'Getting the best copy of your video',
  items: [
    'Filmed in the Camera app? Use 1080p or 4K at 60 fps, with Enhanced Stabilization and HDR off.',
    "For slow motion, don't send it through Messages or a chat app first. In Photos, tap Share, then Options, turn on All Photos Data, and Save to Files. Then choose Files here.",
    'Picking straight from your Photo Library can make a smaller copy. If your video looks blurry here, use Files instead.',
  ],
} as const

export const RIGHTS_REMINDER = "Only import videos you're allowed to use. If the player is under 18, a parent or guardian needs to agree."

export const CAMERA_PREALERT = "Serve Coach uses the camera to record your serve. Video is analysed on this phone and isn't uploaded."
// Finding 66: the correction is untested on real phones (VALIDATION §7: pitch came from truth), so it says so.
export const MOTION_PREALERT = "It also reads the phone's motion sensors to measure its tilt, so we can correct for it. This correction hasn't been checked on real phones yet."
export const PAIN_RULE = "If a serve hurts, stop. Sharp pain, pain that builds, or pain that's still there tomorrow is a reason to see a physio or doctor."
