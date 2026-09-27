import { motion, useReducedMotion } from 'motion/react'
import { Suspense, useEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation, useMatches, useNavigationType } from 'react-router'
import { sweepRetention } from '../../data/retention.ts'
import { DelayedSkeleton, Skeleton, TabBar, ToastViewport } from '../components/index.ts'
import { cx } from '../components/cx.ts'
import { ShellContext, type RouteHandle } from './shellContext.ts'
// First-run redirect to onboarding (ui-profile addition; acts on Today only and can always be skipped).
import { FirstRunGate } from '../screens/onboarding/FirstRunGate.tsx'
// Platform services (platform addition): service worker and update prompt, interrupted-recording
// recovery, storage persistence at the first session, local beta usage counts.
import { PlatformLayer } from '../../platform/ui/PlatformLayer.tsx'

const TAB_ROOTS = new Set(['/', '/record', '/sessions', '/progress'])

function ScreenFallback() {
  return (
    <DelayedSkeleton>
      <div className="gutter mx-auto flex max-w-(--content-max) flex-col gap-3 pt-24">
        <Skeleton variant="text" className="h-8 w-1/2" />
        <Skeleton variant="tile" />
        <Skeleton variant="tile" />
      </div>
    </DelayedSkeleton>
  )
}

/**
 * App shell: the route outlet with the push transition (24 px slide + fade, 220 ms; fade 120 ms with
 * reduced motion; DESIGN §7.2 and §7.3), the tab bar (hidden on full-screen flows), the toast
 * viewport, scroll restoration, the document title, and the retention sweep on start and on return.
 */
export function AppShell() {
  const matches = useMatches()
  const location = useLocation()
  const navType = useNavigationType()
  const reduce = useReducedMotion()
  const handle = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as RouteHandle | undefined
  const tabBar = handle?.tabBar ?? true

  useEffect(() => {
    document.title = handle?.title ? `${handle.title}: Serve Coach` : 'Serve Coach'
  }, [handle?.title])

  useEffect(() => {
    const sweep = () => {
      sweepRetention().catch(() => undefined)
    }
    sweep()
    const onVisible = () => {
      if (document.visibilityState === 'visible') sweep()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const isTabRoot = TAB_ROOTS.has(location.pathname)
  const dx = reduce || isTabRoot ? 0 : navType === 'POP' ? -24 : 24

  return (
    <ShellContext.Provider value={{ tabBar }}>
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-control bg-surface-inverse px-4 py-3 text-headline text-ink-inverse focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className={cx('min-h-[100dvh] bg-bg', tabBar && 'pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))]')}>
        <main id="main" tabIndex={-1} className="outline-none">
          <Suspense fallback={<ScreenFallback />}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: dx }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.2, 0, 0, 1] }}
            >
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
      </div>
      {tabBar ? <TabBar /> : null}
      <ToastViewport aboveTabBar={tabBar} />
      <ScrollRestoration />
      <FirstRunGate />
      <PlatformLayer />
    </ShellContext.Provider>
  )
}
