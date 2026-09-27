/**
 * Route table. Every screen in PRODUCT §6 / DESIGN §10 has a route, a title and a tab-bar rule.
 * Screens are code-split (React.lazy) so each feature builder's screen ships in its own chunk.
 * To build a screen, replace the body of the file its lazy import points at; keep the path.
 */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import { AppShell } from './AppShell.tsx'
import { RouteError } from './RouteError.tsx'
import type { RouteHandle } from './shellContext.ts'

const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const TodayScreen = named(() => import('../screens/today/TodayScreen.tsx'), 'TodayScreen')
const OnboardingScreen = named(() => import('../screens/onboarding/OnboardingScreen.tsx'), 'OnboardingScreen')
const RecordScreen = named(() => import('../screens/record/RecordScreen.tsx'), 'RecordScreen')
const SetupChoiceScreen = named(() => import('../screens/record/SetupChoiceScreen.tsx'), 'SetupChoiceScreen')
const LiveFramingScreen = named(() => import('../screens/record/LiveFramingScreen.tsx'), 'LiveFramingScreen')
const ImportScreen = named(() => import('../screens/record/ImportScreen.tsx'), 'ImportScreen')
const ProcessingScreen = named(() => import('../screens/record/ProcessingScreen.tsx'), 'ProcessingScreen')
const SessionsScreen = named(() => import('../screens/sessions/SessionsScreen.tsx'), 'SessionsScreen')
const SessionReportScreen = named(() => import('../screens/sessions/SessionReportScreen.tsx'), 'SessionReportScreen')
// Serve detail and Tagging live in screens/playback.
const ServeDetailScreen = named(() => import('../screens/playback/ServeDetailScreen.tsx'), 'ServeDetailScreen')
const TaggingScreen = named(() => import('../screens/playback/TaggingScreen.tsx'), 'TaggingScreen')
const FocusDrillScreen = named(() => import('../screens/focus/FocusDrillScreen.tsx'), 'FocusDrillScreen')
const DrillPlayerScreen = named(() => import('../screens/focus/DrillPlayerScreen.tsx'), 'DrillPlayerScreen')
const PracticeLogScreen = named(() => import('../screens/focus/PracticeLogScreen.tsx'), 'PracticeLogScreen')
const ProgressScreen = named(() => import('../screens/progress/ProgressScreen.tsx'), 'ProgressScreen')
const CompareScreen = named(() => import('../screens/progress/CompareScreen.tsx'), 'CompareScreen')
const ProfileScreen = named(() => import('../screens/profile/ProfileScreen.tsx'), 'ProfileScreen')
const YourServeScreen = named(() => import('../screens/profile/ProfileSections.tsx'), 'YourServeScreen')
const ComfortScreen = named(() => import('../screens/profile/ProfileSections.tsx'), 'ComfortScreen')
const CoachFocusScreen = named(() => import('../screens/profile/ProfileSections.tsx'), 'CoachFocusScreen')
const StoragePrivacyScreen = named(() => import('../screens/profile/ProfileSections.tsx'), 'StoragePrivacyScreen')
const AboutScreen = named(() => import('../screens/profile/ProfileSections.tsx'), 'AboutScreen')
const HowWeMeasureScreen = named(() => import('../screens/profile/HowWeMeasureScreen.tsx'), 'HowWeMeasureScreen')
const AppearanceScreen = named(() => import('../screens/profile/AppearanceScreen.tsx'), 'AppearanceScreen')
const MetricInfoScreen = named(() => import('../screens/metric/MetricInfoScreen.tsx'), 'MetricInfoScreen')
const PaywallScreen = named(() => import('../screens/plan/PaywallScreen.tsx'), 'PaywallScreen')
const NotFoundScreen = named(() => import('../screens/NotFoundScreen.tsx'), 'NotFoundScreen')
const ComponentGallery = named(() => import('../dev/ComponentGallery.tsx'), 'ComponentGallery')

const h = (title: string, tabBar = true): RouteHandle => ({ title, tabBar })

/** Screen catalogue: path, title, tab bar. Full-screen flows hide the tab bar (DESIGN §5.1, §8.2). */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: TodayScreen, handle: h('Today') },
      { path: 'onboarding/:step?', Component: OnboardingScreen, handle: h('Welcome', false) },
      { path: 'record', Component: RecordScreen, handle: h('Record') },
      { path: 'record/setup', Component: SetupChoiceScreen, handle: h('Set-up', false) },
      { path: 'record/live', Component: LiveFramingScreen, handle: h('Live framing', false) },
      { path: 'record/import', Component: ImportScreen, handle: h('Import a video') },
      { path: 'processing/:sessionId', Component: ProcessingScreen, handle: h('Analysing') },
      { path: 'sessions', Component: SessionsScreen, handle: h('Sessions') },
      { path: 'sessions/:sessionId', Component: SessionReportScreen, handle: h('Session report') },
      { path: 'sessions/:sessionId/serves/:serveId', Component: ServeDetailScreen, handle: h('Serve detail', false) },
      { path: 'sessions/:sessionId/tag', Component: TaggingScreen, handle: h('Tag serves', false) },
      { path: 'focus', Component: FocusDrillScreen, handle: h('Focus and drill') },
      { path: 'focus/drill', Component: DrillPlayerScreen, handle: h('Drill', false) },
      { path: 'focus/log', Component: PracticeLogScreen, handle: h('Log practice') },
      { path: 'progress', Component: ProgressScreen, handle: h('Progress') },
      { path: 'progress/compare/:experimentId?', Component: CompareScreen, handle: h('Did it work?') },
      { path: 'profile', Component: ProfileScreen, handle: h('Profile', false) },
      { path: 'profile/your-serve', Component: YourServeScreen, handle: h('Your serve', false) },
      { path: 'profile/comfort', Component: ComfortScreen, handle: h('Comfort and body', false) },
      { path: 'profile/coach', Component: CoachFocusScreen, handle: h("My coach's focus", false) },
      { path: 'profile/storage', Component: StoragePrivacyScreen, handle: h('Storage and privacy', false) },
      { path: 'profile/how-we-measure', Component: HowWeMeasureScreen, handle: h('How we measure', false) },
      { path: 'profile/appearance', Component: AppearanceScreen, handle: h('Appearance', false) },
      { path: 'profile/about', Component: AboutScreen, handle: h('About and legal', false) },
      { path: 'metric/:metricId', Component: MetricInfoScreen, handle: h('How we measure', false) },
      { path: 'plan', Component: PaywallScreen, handle: h('Plan', false) },
      { path: 'dev/components', Component: ComponentGallery, handle: h('Components') },
      { path: '*', Component: NotFoundScreen, handle: h('Not found') },
    ],
  },
]
