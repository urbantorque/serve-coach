import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { watchForUpdates } from './lib/updates'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { loadMoreGlyphs } from './components/glyphs'
/*
 * What every screen needs. A screen's own styles load with the screen, so the
 * first open of the app pays for the first screen and nothing else.
 */
import './styles/tokens.css'
import './styles/shell.css'
import './styles/controls.css'
import './styles/today.css'
// Today draws the serve cards for every returning player, so their rules ride
// with Today's rather than in a sheet of their own (Mirror M0.4).
import './styles/serveCards.css'
import './styles/states.css'
import './styles/wide.css'

// A new version is discovered here and taken later, at a moment that costs
// nothing — see `lib/updates.ts` for why this app cannot reload on its own
// schedule.
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// The glyphs behind the first screen, once it has painted (E0.3).
setTimeout(() => void loadMoreGlyphs(), 1200)
