import { useContext, type MouseEvent, type ReactNode } from 'react'
import '../styles/locked.css'
import { Icon } from './primitives'
import { PageNav } from './pageNav'
import { FEATURE_COPY } from '../lib/planCopy'
import type { Feature } from '../lib/plans'
import { pathFor } from '../lib/routes'

/**
 * A paid feature, closed (N6.4). It shows what is behind it on the player's
 * own data, passed in as `children`, says what the feature does, and leads to
 * the plans. Never a blank box and never a nag: one panel, where the feature
 * would have been.
 */
export default function Locked({ feature, children }: { feature: Feature; children?: ReactNode }) {
  const openPage = useContext(PageNav)
  const copy = FEATURE_COPY[feature]
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    openPage('pricing')
  }
  return (
    <section className="locked" aria-labelledby={`locked-${feature}`} data-locked={feature}>
      <span className="locked-kicker">
        <Icon name="lightning" size={15} />
        Part of Plus
      </span>
      <h2 className="locked-title" id={`locked-${feature}`}>
        {copy.name}
      </h2>
      {children && <div className="locked-preview">{children}</div>}
      <p className="locked-line">{copy.line}</p>
      <a className="btn btn--ghost btn--full" href={pathFor({ kind: 'page', page: 'pricing' }, import.meta.env.BASE_URL)} onClick={go}>
        See what Plus adds
      </a>
    </section>
  )
}
