/**
 * Player-facing explanations for Metric info (DESIGN §10.14, PRODUCT §6.14). Names, questions,
 * statuses, prerequisites, reason hints and reference ranges come from metrics.json (via
 * data/catalogue.json); this file adds the plain-words "what it is" and "how we measure it" steps
 * and maps METRICS §6 known limitations to metrics. Australian English, no dashes, second person.
 */
import type { MetricId, MetricStatus } from '../../../analysis/types.ts'

export interface MetricCopy {
  /** Two sentences at most. */
  what: string
  /** 3 to 5 plain steps. */
  how: string[]
  /** Published context in words, never a target (not for bands and legs, DESIGN §10.14). */
  context?: string
}

const TOSS_PEAK = 'We follow the ball from your toss hand, fit its path, and find the top of its flight.'

export const METRIC_COPY: Partial<Record<MetricId, MetricCopy>> = {
  'toss-height-spread': {
    what: 'How much your toss peak height varies from serve to serve. Spread is the typical distance of a toss from your average.',
    how: [TOSS_PEAK, 'We turn each peak into centimetres using your height and your standing height in the video.', 'We work out how far each peak sits from your average, and remove the part that comes from our own tracking noise.'],
    context: 'Professional women: about 6 cm from serve to serve (8 players). Not a target.',
  },
  'toss-forward-spread': {
    what: 'How much the spot where your toss peaks moves forward and back from serve to serve.',
    how: [TOSS_PEAK, 'We measure each peak from your front toe, along the line into the court.', 'We work out how far each peak sits from your average spot.'],
  },
  'toss-lateral-spread': {
    what: 'How much your toss drifts left and right from serve to serve, seen from behind.',
    how: [TOSS_PEAK, 'From behind we measure each peak sideways from the middle of your body.', 'We work out how far each peak sits from your average.'],
  },
  'toss-apex-height': {
    what: 'How high your toss peaks, as a multiple of your height.',
    how: [TOSS_PEAK, 'We measure the peak above the court using your height as the scale.', 'Peaks above the picture are estimated from the curve of the ball and marked "Peak estimated".'],
  },
  'toss-forward': {
    what: 'How far in front of your front toe your toss peaks. Behind the toe is written as "behind".',
    how: [TOSS_PEAK, 'We find your front toe at the start of the serve.', 'We measure the distance between them along the line into the court.'],
  },
  'toss-lateral': {
    what: 'Where your toss peaks left or right of your body, seen from behind.',
    how: [TOSS_PEAK, 'From behind we measure the peak sideways from the middle of your body.'],
  },
  'toss-drop': {
    what: 'How far the ball falls from the top of your toss to the moment you hit it.',
    how: [TOSS_PEAK, 'We find contact from the ball and your hitting arm.', 'We measure the height difference between the peak and contact.'],
  },
  'contact-height-ratio': {
    what: 'How high you hit the ball, as a multiple of your height.',
    how: ['We find the moment of contact from the ball and your hitting arm.', 'We measure the ball height above the court at that moment.', 'We divide it by your height, so taller and shorter players compare with themselves.'],
    context: 'Published studies of men found contact at about 1.43 times height in beginners and 1.49 in elite players. Not a target.',
  },
  'contact-height-spread': {
    what: 'How much your contact height varies from serve to serve.',
    how: ['We find contact height on each serve.', 'We work out how far each one sits from your average.'],
  },
  'contact-forward': {
    what: 'How far in front of your front toe you hit the ball.',
    how: ['We find contact from the ball and your hitting arm.', 'We measure its distance from your starting front toe, along the line into the court.'],
  },
  'rhythm-release-to-contact': {
    what: 'The time from letting go of the toss to hitting the ball. It describes your tempo; there is no correct value.',
    how: ['We find the frame where the ball leaves your toss hand.', 'We find the contact frame (and the hit sound, if you turned it on).', 'We count the time between them.'],
  },
  'rhythm-spread': {
    what: 'How much your toss-to-hit time varies from serve to serve. A small spread means a repeatable rhythm.',
    how: ['We measure the toss-to-hit time on each serve.', 'We work out how far each one sits from your average, and remove the part that comes from frame timing.'],
  },
  'trophy-pause': {
    what: 'How long you hold still at the top of your swing before driving up.',
    how: ['We look for the frames where your arms and hips barely move near the top of the swing.', 'We time that still window.'],
  },
  'leg-drive': {
    what: 'How far your hips rise from their lowest point to contact, as a share of your height. It describes how you use your legs, compared with your own serves.',
    how: ['We track the middle of your hips through the serve.', 'We find their lowest point after the toss.', 'We measure how far they rise by contact, as a share of your height.'],
  },
  'drive-time': {
    what: 'The time from your hips’ lowest point to contact.',
    how: ['We find the lowest hip point and the contact frame.', 'We count the time between them.'],
  },
  'loading-depth': {
    what: 'How far your hips dip as you load, as a share of your height. This is a description. Deeper isn’t the goal.',
    how: ['We track the middle of your hips from the toss release.', 'We measure how far they drop before rising.'],
  },
  'deep-bend-flag': {
    what: 'Whether your knees bent deeply at the top of the swing, as a yes or no. Experimental.',
    how: ['We look at the drop of your hips and the shape of your legs at the top of the swing.'],
  },
  'shoulder-tilt-trophy': {
    what: 'How much your shoulder line tilts at the top of your swing, compared with your own usual serves. Shown as words, never degrees.',
    how: ['We find the frame at the top of your swing.', 'We draw the line through both shoulders, corrected for phone tilt.', 'We compare it with your own usual range: lower, typical or higher.'],
  },
  'knee-bend-band': {
    what: 'How much your knee bends at the top of the swing, compared with your own usual serves.',
    how: ['From behind, the knee nearer the camera is side-on.', 'We read its bend at the top of the swing and compare it with your own serves.'],
  },
  'shoulder-over-shoulder-contact': {
    what: 'Whether your hitting shoulder tilts up above the other one at contact, compared with your own serves.',
    how: ['From behind, we draw the shoulder line at contact and compare it with your usual.'],
  },
  'landing-distance': {
    what: 'How far into the court your front foot lands, measured from your start position.',
    how: ['We find your front toe at the start.', 'We find where your front foot lands after the hit.', 'We measure the distance between them.'],
  },
  repeatability: {
    what: 'How similar the whole shape of your serves is from one to the next, from 0 to 100.',
    how: ['We line up your serves by their phases.', 'We compare the body positions frame by frame.'],
  },
  'serve-in-rate': { what: 'How many of your serves went in, from what you logged.', how: ['You tag each serve as in, net, long or wide, or enter a tally.', 'We count the ins and give the likely range for your real rate.'] },
  'first-serve-in-rate': {
    what: 'How many of your first serves went in, from what you logged.',
    how: ['You tag each serve, or enter a tally after the session.', 'We count the ins and give the likely range for your real rate.', 'Rates move slowly: small changes take many serves to confirm.'],
  },
  'second-serve-in-rate': {
    what: 'How many of your second serves went in, from what you logged.',
    how: ['You tag each serve, or enter a tally.', 'We count the ins and give the likely range.'],
  },
  'double-faults': { what: 'How many double faults you logged.', how: ['You log double faults in your tally or with point-play tagging.'] },
  'placement-zone': { what: 'Which zone you logged for each serve: T, body or wide.', how: ['You tag the zone while reviewing your serves.', 'We draw a schematic of the box. It is not a measured landing spot.'] },
  'serve-type-mix': { what: 'Which serve types you practised, as you logged them.', how: ['You pick flat, slice or kick for a block or a serve.'] },
  'speed-experimental': {
    what: 'A rough range for how fast the ball left the racquet, from the side. Always a range, and experimental.',
    how: ['At 120 fps or more we track the ball for a few frames after contact.', 'Your height sets the scale, and your target tag tells us the angle out of the picture.', 'We give a rounded range, never one number.'],
  },
  'speed-average-rear': {
    what: 'A rough range for the average speed from contact to the bounce, from behind. Experimental.',
    how: ['After you tap the court corners, we find the bounce in the video.', 'We divide the flight distance by the flight time and give a rounded range.'],
  },
  'speed-radar-entered': { what: 'A speed you read off your radar and logged.', how: ['You enter the reading in the serve details. We keep it as you logged it.'] },
  spin: {
    what: 'How much spin you put on the ball.',
    how: ['A phone video cannot see the ball spinning: it is too small and too blurred. We never estimate it.'],
  },
  'serve-count': { what: 'How many serves we found in the video.', how: ['We find each serve from your toss arm, the ball above your head and the hit.'] },
  'retoss-count': { what: 'How often you caught a toss instead of hitting it.', how: ['A toss with no hit soon after is counted as caught, and left out of contact measurements.'] },
  'capture-quality': {
    what: 'How well we could see this session: Good, Fair or Limited.',
    how: ['We check framing, light, steadiness, frame rate and how clearly we saw the ball and your body on each serve.'],
  },
}

/** Player words for metrics.json prerequisite keys (the ones we can check per session). */
export const PREREQ_WORDS: Record<string, string> = {
  'view:side': 'Side view',
  'view:rear': 'View from behind',
  'fps>=30': '30 fps or more',
  'fps>=60': '60 fps or more',
  'fps>=120': '120 fps or more',
  playerHeight: 'Your height entered',
  pitch: 'Phone tilt known',
  timebase: 'Frame timing known',
  'timebase:proven': 'Frame timing proven',
  'n>=5': '5 measured serves',
  'n>=8': '8 measured serves',
  'n>=12': '12 measured serves',
  'n>=16': '16 measured serves',
  'entry:targetZone': 'Target tagged',
  'toggle:experimental': 'Experimental metrics on',
  floor: 'Feet in the picture',
  bodyHeight: 'Standing height in the picture',
  'event:tossApex': 'Toss peak seen',
  'event:tossRelease': 'Toss release found',
  'event:contact': 'Contact found',
  'event:contact-ball': 'Ball found at contact',
  'event:landing': 'Landing found',
  'event:trophy': 'Top of the swing found',
  stability: 'Phone kept still',
  startToe: 'Front toe seen at the start',
  'hips:visible': 'Hips visible',
  'shoulders:visible': 'Shoulders visible',
}

/** PRODUCT §6.14 item 3: the data state in one line. */
export const STATUS_MEANING: Record<MetricStatus, string> = {
  measured: 'Measured: worked out directly from your video.',
  estimated: 'Estimate: worked out from your video and your height, so it has a margin of error.',
  'player-entered': 'You logged this.',
  experimental: "Experimental: we're still checking this method, so treat it as a rough guide. It never gets a verdict, and it can suggest a focus only while experimental metrics are on, marked Experimental.",
  unavailable: 'Not available from this footage.',
}

/** METRICS §6 known limitations, in player words, by metric. */
export const LIMITS: { ids: MetricId[]; text: string }[] = [
  {
    ids: ['toss-apex-height', 'toss-height-spread', 'toss-drop'],
    // Engine: a typical toss offset is corrected for (METRICS §3.2); after it, synthetic D1 peak
    // heights: MAE 1.1% of height, bias −0.9%, n 11 (validation-summary.json; VALIDATION §5 item 3).
    text: "From the side we can't see how far out towards the camera you toss, so we allow for a typical toss. A toss further out than that reads a little high, one closer to your body a little low, and sideways wobble adds a few centimetres to the spread. On 11 simulated serves from the recommended distance, peak heights were typically within about 1% of your height, reading slightly low on average. A view from behind separates the two.",
  },
  {
    ids: ['toss-apex-height', 'contact-height-ratio', 'toss-drop', 'toss-forward', 'contact-forward', 'landing-distance'],
    text: 'Heights and distances depend on your entered height, so the whole set could sit a few centimetres high or low. Comparisons with your own serves are sharper than the absolute numbers.',
  },
  {
    ids: ['contact-height-ratio', 'toss-drop', 'rhythm-release-to-contact', 'rhythm-spread'],
    // Per-serve ranges come from the engine's fused contact timing (about 2 ms on simulated serves);
    // METRICS §2.7's 13 ms is the planning figure for real footage, still unmeasured.
    text: 'On simulated serves at 60 fps with the hit sound off, we timed contact to within a few milliseconds, under 1 cm of ball height, and that is what each serve’s range shows. On real courts this timing is not yet checked: one frame out would move contact height and ball drop by about 4 to 5 cm. 120 fps or the hit sound sharpens it.',
  },
  {
    ids: ['knee-bend-band', 'loading-depth', 'deep-bend-flag', 'leg-drive'],
    text: 'From the side your knees point at the camera at the top of the swing, so we describe your legs by hip rise and hip drop instead of a knee angle. A knee-bend band needs the view from behind.',
  },
  {
    ids: ['shoulder-tilt-trophy', 'shoulder-over-shoulder-contact'],
    text: "Shoulder tilt is compared only with your own serves, never with published trunk angles, which measure something different. Shoulder tilt at contact needs the view from behind.",
  },
  {
    ids: ['leg-drive', 'drive-time', 'loading-depth', 'shoulder-tilt-trophy', 'contact-height-ratio', 'landing-distance'],
    text: 'Body tracking from phone video is noisier than lab systems, and left and right can swap. We assign sides from the shape of the serve.',
  },
  {
    ids: ['speed-experimental', 'speed-average-rear', 'spin'],
    text: 'From the side, speed needs 120 fps or more, your height and where you aimed. From behind it needs the court corners tapped and a bounce in the video. The hit sound never gives speed. Spin is never available.',
  },
  {
    ids: ['landing-distance'],
    text: 'There are no published landing distances for club players, so this is shown as your own trend only.',
  },
]

/** Metrics that never get an outside comparison (DESIGN §10.14; PRODUCT §4.4 rule 9). */
export const NO_OUTSIDE = new Set<MetricId>(['shoulder-tilt-trophy', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag', 'landing-distance'])
