import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
/*
 * Order is cascade order. These were one 3,200-line `app.css`; splitting it by
 * screen is what lets two people (or two agents) touch the report and the
 * player in the same sitting without fighting over the same file. Nothing was
 * reordered in the split, so the cascade is exactly what it was before.
 */
import './styles/tokens.css'
import './styles/shell.css'
import './styles/controls.css'
import './styles/home.css'
import './styles/progress.css'
import './styles/blocks.css'
import './styles/analysing.css'
import './styles/report.css'
import './styles/player.css'
import './styles/fundamentals.css'
import './styles/states.css'
import './styles/guide.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
