import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { paths } from '../../shell/paths.ts'
import { checkFirstRun, firstRunGateTesting } from './actions.ts'

/**
 * First-run redirect (PRODUCT §6.1, §7.1). Rendered once by the app shell. When Today opens and
 * nothing has happened yet (no profile, no sessions, onboarding not started), it replaces Today with
 * onboarding. It never traps the player: it only acts on Today, set-up can be skipped from its first
 * screen, and leaving set-up early ends the redirect for good. Deep links to other screens are never
 * redirected.
 */
export function FirstRunGate() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = useRef(pathname)
  useEffect(() => {
    current.current = pathname
  }, [pathname])

  useEffect(() => {
    if (pathname !== paths.today()) return
    if (import.meta.env.MODE === 'test' && !firstRunGateTesting.enabled) return
    let cancelled = false
    void checkFirstRun().then((first) => {
      // Only if the player is still on Today when the answer arrives.
      if (first && !cancelled && current.current === paths.today()) navigate(paths.onboarding(), { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [pathname, navigate])

  return null
}
