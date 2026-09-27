import { ChartLineUpIcon, HouseIcon, ListBulletsIcon, VideoCameraIcon, type Icon } from '@phosphor-icons/react'
import { NavLink } from 'react-router'
import { cx } from './cx.ts'

interface Tab {
  to: string
  label: string
  icon: Icon
  end?: boolean
}

/** D10: four tabs, fixed order, single-word labels. Profile is reached from Today's app bar. */
const TABS: Tab[] = [
  { to: '/', label: 'Today', icon: HouseIcon, end: true },
  { to: '/record', label: 'Record', icon: VideoCameraIcon },
  { to: '/sessions', label: 'Sessions', icon: ListBulletsIcon },
  { to: '/progress', label: 'Progress', icon: ChartLineUpIcon },
]

/**
 * Tab bar (DESIGN §8.2): 56 px + bottom safe area, level-2 glass, 1 px top line. Selected tab: a
 * 56 x 32 optic pill behind the icon with the optic edge (ink pill in Court-side) and a 700 label.
 * No badges or counters. `aria-current="page"` marks the selected link.
 */
export function TabBar() {
  return (
    <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-(--z-tabbar) border-t border-line pad-safe-bottom court:border-t-2">
      <ul className="mx-auto grid min-h-14 max-w-(--content-max) grid-cols-4">
        {TABS.map(({ to, label, icon: G, end }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              end={end}
              className="group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control focus-visible:-outline-offset-2"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'grid h-8 w-14 place-items-center rounded-full',
                      isActive
                        ? 'border-token border-optic-edge bg-optic text-on-optic court:border-ink court:bg-ink court:text-ink-inverse'
                        : 'text-ink-3 group-hover:bg-surface-2',
                    )}
                  >
                    <G aria-hidden="true" />
                  </span>
                  <span className={cx('tab-label whitespace-nowrap', isActive ? 'font-strong text-ink' : 'text-ink-3')}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
