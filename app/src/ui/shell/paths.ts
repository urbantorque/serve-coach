/**
 * Every route in the app, as functions so screens never hand-build URLs. The route table lives in
 * routes.ts; keep the two in step (App.test.tsx renders every path below).
 */
export const paths = {
  today: () => '/',
  onboarding: (step?: string) => (step ? `/onboarding/${step}` : '/onboarding'),
  record: () => '/record',
  setupChoice: () => '/record/setup',
  liveFraming: () => '/record/live',
  importVideo: () => '/record/import',
  processing: (sessionId: string) => `/processing/${sessionId}`,
  sessions: () => '/sessions',
  sessionReport: (sessionId: string) => `/sessions/${sessionId}`,
  serveDetail: (sessionId: string, serveId: string) => `/sessions/${sessionId}/serves/${serveId}`,
  tagging: (sessionId: string) => `/sessions/${sessionId}/tag`,
  /** Match log (PRODUCT §6.11): a new entry, or an existing one to edit. */
  matchLog: (matchId?: string) => (matchId ? `/sessions/matches/${matchId}` : '/sessions/matches/new'),
  focus: () => '/focus',
  drill: () => '/focus/drill',
  practiceLog: () => '/focus/log',
  progress: () => '/progress',
  compare: (experimentId?: string) => (experimentId ? `/progress/compare/${experimentId}` : '/progress/compare'),
  profile: () => '/profile',
  yourServe: () => '/profile/your-serve',
  comfort: () => '/profile/comfort',
  coachFocus: () => '/profile/coach',
  storage: () => '/profile/storage',
  /** Platform addition: local beta usage counts and the report the tester may send. */
  betaData: () => '/profile/beta-data',
  howWeMeasure: () => '/profile/how-we-measure',
  appearance: () => '/profile/appearance',
  about: () => '/profile/about',
  metricInfo: (metricId: string) => `/metric/${metricId}`,
  plan: () => '/plan',
  devComponents: () => '/dev/components',
} as const
