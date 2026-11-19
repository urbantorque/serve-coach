import '../styles/firstMore.css'
import { Icon } from './primitives'
import { deviceNoun } from '../lib/device'

interface Props {
  onShowExample: () => void
}

/**
 * What a first-time visitor reads under the promise (N6.1).
 *
 * The first run used to be one screen and one action, which is right on a phone
 * a player has already chosen to open, and thin on a website someone has just
 * landed on. This says how it works, what I can and cannot see, and where the
 * video goes, and offers the sample report again at the foot. Only what the app
 * does today: no prices, no programmes it does not have yet.
 *
 * Lazily loaded below the fold, so the first screen and the entry chunk are
 * exactly what they were.
 */
export default function FirstRunMore({ onShowExample }: Props) {
  const here = deviceNoun()
  return (
    <div className="first-more">
      <section className="first-more-section" aria-labelledby="first-how">
        <h2 id="first-how" className="t-headline">
          From the baseline to a plan in a few minutes.
        </h2>
        <ol className="first-steps">
          <li>
            <Icon name="camera" size={22} />
            <div>
              <strong>Prop your phone on the fence.</strong>
              <span>I check the framing out loud before you serve.</span>
            </div>
          </li>
          <li>
            <Icon name="gauge" size={22} />
            <div>
              <strong>I read every joint, on this {here}.</strong>
              <span>Your toss, your legs, the racket drop and contact, frame by frame.</span>
            </div>
          </li>
          <li>
            <Icon name="target" size={22} />
            <div>
              <strong>You get two to four drills, worst first.</strong>
              <span>Then film again and watch the fault fade.</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="first-more-section" aria-labelledby="first-honest">
        <h2 id="first-honest" className="t-headline">
          I tell you what I cannot see.
        </h2>
        <p className="first-more-lede">
          Every number comes with how sure I am. When one camera cannot support a reading, I say so instead of
          guessing.
        </p>
        <ul className="first-honest">
          <li>
            <span>Knee bend, toss, contact height</span>
            <em>Graded against published serves</em>
          </li>
          <li>
            <span>Hip and shoulder turn</span>
            <em>Shown, never graded</em>
          </li>
          <li>
            <span>Serve speed</span>
            <em>A likely range, never a grade</em>
          </li>
          <li>
            <span>Anything the camera cannot support</span>
            <em>Hedged, or left out</em>
          </li>
        </ul>
      </section>

      <section className="first-more-section first-more-privacy" aria-labelledby="first-private">
        <Icon name="shield" size={26} />
        <h2 id="first-private" className="t-headline">
          Your video never leaves this {here}.
        </h2>
        <p className="first-more-lede">No account and no upload. I read everything in the browser, even with no signal.</p>
      </section>

      <div className="first-more-foot">
        <button className="btn btn--ghost" onClick={onShowExample}>
          See a sample report
        </button>
      </div>
    </div>
  )
}
