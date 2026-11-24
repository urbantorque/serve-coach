import type { MouseEvent } from 'react'
import '../styles/firstMore.css'
import { Icon } from './primitives'
import { deviceNoun } from '../lib/device'
import { PLACEMENT } from '../lib/placement'
import { INFO_PAGES, INFO_TITLES, pathFor, type InfoPageId } from '../lib/routes'
import { GATED, PRICE_LINE } from '../lib/billing/config'
import { FEATURES } from '../lib/plans'
import { FEATURE_COPY, FREE_COPY } from '../lib/planCopy'

interface Props {
  /** How sure I am, privacy, terms and credits, linked from the foot (N6.3). */
  onShowPage?: (page: InfoPageId) => void
}

/** The "More" tap: a link, without the browser's triangle; what it opens, spaced like a section. */
const MORE = { display: 'grid', gap: 14, marginTop: 8 } as const
const SUMMARY = { listStyle: 'none', cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' } as const

/**
 * What a first-time visitor reads under the promise (N6.1).
 *
 * One short "How it works": the three steps, then the three things a visitor
 * asks before trying it (what I cannot see, where the video goes, what it
 * costs), a line each. The detail behind those lines (the reading table, the
 * privacy paragraph, Free and Plus side by side) is one tap down, under More.
 * It was four sections and a second pair of buttons, nearly four phone screens;
 * the buttons now follow the reader in the sticky bar (Home), so they are not
 * repeated here. Only what the app does today: no prices it does not have.
 *
 * Lazily loaded below the fold, so the first screen and the entry chunk are
 * exactly what they were.
 */
export default function FirstRunMore({ onShowPage }: Props) {
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
          How it works
        </h2>
        <ol className="first-steps">
          <li>
            <Icon name="camera" size={22} />
            <div>
              <strong>Prop your phone on a bag, {PLACEMENT.distance} to your side.</strong>
              <span>I check the framing out loud before you serve. Or upload a video you already have.</span>
            </div>
          </li>
          <li>
            <Icon name="gauge" size={22} />
            <div>
              <strong>I track every joint, on this {here}.</strong>
              <span>Your toss, your legs, the racket drop and contact, frame by frame.</span>
            </div>
          </li>
          <li>
            <Icon name="target" size={22} />
            <div>
              <strong>You get two to four drills, worst first.</strong>
              <span>Then film again to see if the fault is going away.</span>
            </div>
          </li>
        </ol>

        <ul className="first-steps first-steps--plain" aria-label="Good to know">
          <li>
            <Icon name="info" size={22} />
            <div>
              <strong>I tell you what I cannot see.</strong>
              <span>Every number says how sure I am. Speed is a likely range, never a grade.</span>
            </div>
          </li>
          <li>
            <Icon name="shield" size={22} />
            <div>
              <strong>No account. Your video stays on this {here}.</strong>
              <span>I check it in your browser, and it works with no signal.</span>
            </div>
          </li>
          <li>
            <Icon name="check" size={22} />
            <div>
              <strong>Every serve checked for free.</strong>
              <span>{GATED ? 'Your score and the top fix are free. Plus adds the full results.' : 'Everything is free while Plus is not on sale.'}</span>
            </div>
          </li>
        </ul>

        <details className="first-more-details">
          <summary className="link-btn" style={SUMMARY}>
            More about accuracy, privacy and plans
          </summary>
          <div style={MORE}>
          <h3 className="t-subhead">What I grade, and what I only show</h3>
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
              <span>Anything the camera cannot see well</span>
              <em>Marked as unsure, or left out</em>
            </li>
          </ul>
          {onShowPage && (
            <a className="first-more-link" href={pathFor({ kind: 'page', page: 'accuracy' }, import.meta.env.BASE_URL)} onClick={open('accuracy')}>
              How accurate each measurement is, and how I know
              <Icon name="chevron" size={16} />
            </a>
          )}

          <h3 className="t-subhead">Where your video goes</h3>
          <p className="first-more-lede">
            Nowhere. I check your serve in the browser on this {here}, and the video never leaves it, even one you upload.
          </p>

          {onShowPage && (
            <>
              <h3 className="t-subhead">Free and Plus</h3>
              <p className="first-more-lede">Your score and the top fix for every serve are free. Plus adds the full results, a step-by-step plan and more.</p>
              {PRICE_LINE && <p className="first-more-lede">Plus is {PRICE_LINE}.</p>}
              {!GATED && <p className="first-more-lede">Everything is free while Plus is not on sale.</p>}
              <a className="first-more-link" href={pathFor({ kind: 'page', page: 'pricing' }, import.meta.env.BASE_URL)} onClick={open('pricing')}>
                See the plans
                <Icon name="chevron" size={16} />
              </a>
              <div className="first-tiers">
                <div>
                  <h4>Free</h4>
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
                  <h4>Plus adds</h4>
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
            </>
          )}
          </div>
        </details>
      </section>

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
