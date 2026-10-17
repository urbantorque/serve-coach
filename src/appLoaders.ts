/**
 * The app's lazily loaded screens and modules, as functions that fetch them
 * (L6.11). Shared by `App.tsx`, which renders the screens, and
 * `useAnalysisRun`, which starts fetching them the moment a clip is picked, so
 * the two cannot name different chunks.
 */
export const loadAnalysis = () => import('./lib/analysis/analyze')
export const loadAnalyzing = () => import('./screens/Analyzing')
export const loadReport = () => import('./screens/Report')
export const loadSessionScreen = () => import('./screens/Session')
export const loadSessionLive = () => import('./lib/session/live')
export const loadGlance = () => import('./screens/Glance')
