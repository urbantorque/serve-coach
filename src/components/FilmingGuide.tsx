/**
 * Filming instructions. Deliberately opinionated and short — the difference
 * between a usable clip and a useless one is four decisions, and every extra
 * line here is a line nobody reads at the court.
 */
const RULES = [
  {
    title: 'Stand side-on, four metres back',
    body:
      'Line the phone up with the baseline, looking across at the player. Only a side view sees how far in front contact happens.',
  },
  {
    title: 'Fit the whole body in, feet included',
    body:
      'Hold the phone upright with room above the racket at full stretch. Every height uses your own body as the ruler.',
  },
  {
    title: 'Start filming before the toss',
    body:
      'Roll from a second before the hands drop until after you land. Three to five seconds, one serve per clip.',
  },
  {
    title: 'Use slow motion if your phone has it',
    body:
      'The racket covers back to ball in a sixth of a second. More frames through there sharpen every swing number.',
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
        A front or back view still works. You lose one measurement — how far in front of your body
        contact happens — because only a side view can see it.
      </p>
    </div>
  )
}
