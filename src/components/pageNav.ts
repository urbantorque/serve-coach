import { createContext } from 'react'
import type { InfoPageId } from '../lib/routes'

/**
 * Opens a page a visitor reads (N6.3), from anywhere below `App`: a paywall's
 * way to the plans, without threading a prop through every screen (N6.4).
 */
export const PageNav = createContext<(page: InfoPageId) => void>(() => {})
