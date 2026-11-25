import type { Moment } from '../lib/moments'
import { Icon } from './primitives'

/**
 * Something the player earned, in the one bright surface the app keeps for it.
 *
 * `quiet` on a screen whose main action is already lime (the report): two
 * lime surfaces stacked read as two main things, and the sticky drill button
 * slid over the card's lime top (2026-11-25). There it's a panel with a lime
 * icon instead.
 */
export default function MomentCard({ moment, quiet = false }: { moment: Moment; quiet?: boolean }) {
  return (
    <section className={quiet ? 'moment moment--quiet' : 'moment'} aria-label={moment.title}>
      <Icon name={moment.kind === 'fastest' ? 'lightning' : moment.kind === 'fault' || moment.kind === 'goal' ? 'flag' : 'trophy'} size={22} />
      <div>
        <h2>{moment.title}</h2>
        <p>{moment.body}</p>
      </div>
    </section>
  )
}
