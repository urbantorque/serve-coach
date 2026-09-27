/**
 * Open-source software and assets shipped in the app (versions and licences from package.json of each
 * dependency, checked 2026-09-27). Full licence texts must ship with the release build (known issue).
 */
export interface LicenceEntry {
  name: string
  what: string
  licence: string
  holder: string
}

export const LICENCES: readonly LicenceEntry[] = [
  { name: 'MediaPipe Tasks Vision', what: 'Pose tracking, run on this phone', licence: 'Apache-2.0', holder: 'Google LLC' },
  { name: 'MediaPipe Pose Landmarker models', what: 'Body landmark models, bundled', licence: 'Apache-2.0', holder: 'Google LLC' },
  { name: 'Archivo', what: 'Typeface', licence: 'SIL Open Font Licence 1.1', holder: 'Omnibus-Type' },
  { name: 'Phosphor Icons', what: 'Icons', licence: 'MIT', holder: 'Phosphor Icons' },
  { name: 'React and React DOM', what: 'Interface', licence: 'MIT', holder: 'Meta Platforms, Inc. and affiliates' },
  { name: 'React Router', what: 'Navigation', licence: 'MIT', holder: 'Remix Software Inc. and Shopify Inc.' },
  { name: 'Dexie and dexie-react-hooks', what: 'Storage on this phone', licence: 'Apache-2.0', holder: 'David Fahlander' },
  { name: 'Motion', what: 'Animation', licence: 'MIT', holder: 'Motion Division Ltd' },
  { name: 'Zustand', what: 'App state', licence: 'MIT', holder: 'Paul Henschel' },
  { name: 'mp4box.js', what: 'Reading video files', licence: 'BSD-3-Clause', holder: 'Telecom Paris (GPAC)' },
  { name: 'Capacitor', what: 'iPhone app shell', licence: 'MIT', holder: 'Ionic' },
]
