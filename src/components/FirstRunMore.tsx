import type { MouseEvent } from 'react'
import '../styles/firstMore.css'
import { Icon } from './primitives'
import { deviceNoun } from '../lib/device'
import { INFO_PAGES, INFO_TITLES, pathFor, type InfoPageId } from '../lib/routes'
import { GATED, PRICE_LINE } from '../lib/billing/config'
import { FEATURES } from '../lib/plans'
import { FEATURE_COPY, FREE_COPY } from '../lib/planCopy'

interface Props {
  onFilm: () => void
  onShowExample: () => void
  /** How sure I am, privacy, terms and credits, linked from the foot (N6.3). */
  onShowPage?: (page: InfoPageId) => void
}

/**
 * What a first-time visitor reads under the promise (N6.1).
 *
 * The first run used to be one screen and one action, which is right on a phone
 * a player has already chosen to open, and thin on a website someone has just
 * landed on. This says how it works, what I can and cannot see, and where the
 * video goes, and ends on the same two choices the promise offered, under the
 * same names (N5.2): one label for one intent. Only what the app
 * does today: no prices, no programmes it does not have yet.
 *
 * Lazily loaded below the fold, so the first screen and the entry chunk are
 * exactly what they were.
 */
export default function FirstRunMore({ onFilm, onShowExample, onShowPage }: Props) {
  const here = deviceNoun()
  // A plain click stays in the app; a modified one opens the address as the browser would.
  const open = (p: InfoPageId) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onShowPage || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onShowPage(p)
  }
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
        {onShowPage && (
          <a className="first-more-link" href={pathFor({ kind: 'page', page: 'accuracy' }, import.meta.env.BASE_URL)} onClick={open('accuracy')}>
            Every reading, how steady it is and what it rests on
            <Icon name="chevron" size={16} />
          </a>
        )}
      </section>

      <section className="first-more-section first-more-privacy" aria-labelledby="first-private">
        <Icon name="shield" size={26} />
        <h2 id="first-private" className="t-headline">
          No account, and no upload.
        </h2>
        <p className="first-more-lede">I read your serve in the browser on this {here}, even with no signal. The video stays where you filmed it.</p>
      </section>

      {onShowPage && (
        <section className="first-more-section first-more-price" aria-labelledby="first-price">
          <h2 id="first-price" className="t-headline">
            Free to read every serve.
          </h2>
          <p className="first-more-lede">Your score and the top fix on every serve, free. Plus adds the whole breakdown, a plan in steps and more.</p>
          {PRICE_LINE && <p className="first-more-lede">Plus is {PRICE_LINE}.</p>}
          {!GATED && <p className="first-more-lede">Everything is open while Plus is not on sale.</p>}
          <a className="first-more-link" href={pathFor({ kind: 'page', page: 'pricing' }, import.meta.env.BASE_URL)} onClick={open('pricing')}>
            See the plans
            <Icon name="chevron" size={16} />
          </a>
          <div className="first-tiers">
            <div>
              <h3>Free</h3>
              <ul>
                {FREE_COPY.map((line) => (
                  <li key={line}>
                    <Icon name="check" size={15} />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Plus adds</h3>
              <ul>
                {FEATURES.map((f) => (
                  <li key={f}>
                    <Icon name="lightning" size={15} />
                    {FEATURE_COPY[f].name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="first-more-foot">
        <button className="btn btn--primary btn--big btn--full" onClick={onFilm}>
          <Icon name="camera" size={21} />
          Film my serve
        </button>
        <button className="btn btn--quiet btn--full" onClick={onShowExample}>
          See a sample report first
        </button>
      </div>

      {onShowPage && (
        <nav className="first-more-pages" aria-label="About Serve Coach">
          {INFO_PAGES.map((p) => (
            <a
              key={p}
              href={pathFor({ kind: 'page', page: p }, import.meta.env.BASE_URL)}
              onClick={open(p)}
            >
              {INFO_TITLES[p]}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
