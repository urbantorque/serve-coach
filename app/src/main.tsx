import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Archivo, self-hosted (DESIGN §4.1): the width-axis file declares weight 100-900 and width 62-125%.
import '@fontsource-variable/archivo/wdth.css'
import './index.css'
import { App } from './ui/App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
