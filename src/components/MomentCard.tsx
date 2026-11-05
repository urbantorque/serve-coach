import type { Moment } from '../lib/moments'
import { Icon } from './primitives'

/** Something the player earned, in the one bright surface the app keeps for it. */
export default function MomentCard({ moment }: { moment: Moment }) {
  return (
    <section className="moment" aria-label={moment.title}>
      <Icon name={moment.kind === 'fastest' ? 'lightning' : moment.kind === 'fault' || moment.kind === 'goal' ? 'flag' : 'trophy'} size={22} />
      <div>
        <h2>{moment.title}</h2>
        <p>{moment.body}</p>
      </div>
    </section>
  )
}
