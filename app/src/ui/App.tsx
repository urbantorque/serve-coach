import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './shell/routes.ts'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

/** App root: theme (Day / Night / Court-side, Phosphor defaults) and the router. */
export function App() {
  const [router] = useState(() => createBrowserRouter(routes))
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
