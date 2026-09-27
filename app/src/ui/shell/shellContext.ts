import { createContext, useContext } from 'react'

export interface ShellState {
  /** The tab bar is visible on this route (hidden on full-screen flows: camera, tagging, drill, serve detail). */
  tabBar: boolean
}

export const ShellContext = createContext<ShellState>({ tabBar: false })

export function useShell(): ShellState {
  return useContext(ShellContext)
}

/** Route `handle` fields read by the app shell (see routes.ts). */
export interface RouteHandle {
  /** Screen title (also the document title). */
  title: string
  /** Show the tab bar (tab roots and pushed screens inside a tab). Default true. */
  tabBar?: boolean
}
