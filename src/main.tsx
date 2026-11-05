import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { watchForUpdates } from './lib/updates'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
/*
 * What every screen needs. A screen's own styles load with the screen, so the
 * first open of the app pays for the first screen and nothing else.
 */
import './styles/tokens.css'
import './styles/shell.css'
import './styles/controls.css'
import './styles/home.css'
import './styles/blocks.css'
import './styles/report.css'
import './styles/states.css'

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
