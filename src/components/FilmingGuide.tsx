/**
 * Filming instructions. Deliberately opinionated and short — the difference
 * between a usable clip and a useless one is four decisions, and every extra
 * line here is a line nobody reads at the court.
 */
const RULES = [
  {
    title: 'Stand side-on, 4–5 metres away',
    body:
      'Level with the baseline, looking across at the player. A side view is the only angle that can see how far in front contact happens.',
  },
  {
    title: 'Fit the whole body in, feet included',
    body:
      'Hold the phone upright and leave room above the racket at full stretch. Heights are measured against your own body, so cropped feet blur the numbers.',
  },
  {
    title: 'Start filming before the toss',
    body:
      'Roll from a second before the hands go down until after you land. Around three to five seconds. One serve per clip.',
  },
  {
    title: 'Use slow motion if your phone has it',
    body:
      'The racket goes from behind your back to the ball in about a sixth of a second. More frames through there means sharper swing numbers.',
  },
]

const AVOID = [
  'Other players moving in the background',
  'Filming into the sun, or heavy shade across the court',
  'Holding the phone by hand if you can prop it on a fence or bag',
]

export default function FilmingGuide() {
  return (
    <div className="guide">
      <ol className="guide-list">
        {RULES.map((r, i) => (
          <li key={r.title}>
            <span className="guide-num tnum">{i + 1}</span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="guide-avoid">
        <h3>Worth avoiding</h3>
        <ul>
          {AVOID.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <p className="guide-note">
        A front or back view still works — you will get every measurement except how far in front
        of your body contact happens, which only a side view can see.
      </p>
    </div>
  )
}
