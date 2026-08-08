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
      'Hit record a second before the ball leaves your hand. Three to five seconds for one serve, or keep rolling for a whole basket.',
  },
  {
    title: 'Use slow motion if your phone has it',
    body:
      'The racket travels from behind your back to the ball in a fraction of a second. More frames make that part sharper.',
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
        <h3 className="t-overline">Worth avoiding</h3>
        <ul>
          {AVOID.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <p className="guide-note">
        A front or back view still works. You just lose one reading: how far in front of you the
        ball is hit.
      </p>
    </div>
  )
}
