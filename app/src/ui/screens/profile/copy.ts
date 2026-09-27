/**
 * Profile, privacy and legal copy (PRODUCT §6.1 O8, §6.13; DESIGN §10.12). Australian English,
 * sentence case, no dashes, no exclamation marks (DESIGN §11). The copy lint runs over these in tests.
 */

/** PRODUCT §6.1 O8, verbatim (the usage-counts question is omitted: the D8 amendment is not accepted). */
export const PRIVACY_FACTS = [
  'We analyse your video on this phone. Nothing is uploaded.',
  'Videos delete themselves after 30 days. Your stats and key frames stay. You can change this.',
  'Export or delete anything, any time, in Profile.',
  'No account needed.',
] as const

/** DESIGN §10.12 Storage and privacy facts. */
export const STORAGE_FACTS = [
  'Analysis runs on this phone.',
  'No account. Nothing is uploaded.',
  'Comfort answers never leave this phone.',
] as const

/**
 * Short privacy statement for the beta. The full APP 1 policy is a release prerequisite (PRODUCT §11
 * item 1) and is not written yet, so this says so rather than linking to a page that does not exist.
 */
export const PRIVACY_POLICY_SUMMARY = [
  'Serve Coach analyses your videos on this phone. There is no account, and the app sends nothing to us or anyone else.',
  'Your videos, stats, key frames, logs and profile are stored only on this phone. Comfort answers are stored only if you say yes, and are never exported unless you choose.',
  'Pose tracking uses Google’s MediaPipe, bundled inside the app. Its usage reporting is blocked, so it cannot send anything either.',
  'You can export everything as JSON or CSV, and delete a session, all videos or everything, in Profile → Storage and privacy.',
  'The full privacy policy will be published before the public release.',
] as const

export const NO_NETWORK_LINE =
  'Serve Coach has no servers. Pose tracking (Google MediaPipe) runs inside the app with its usage reporting blocked, so nothing leaves this phone.'

/** One-line version for the Profile switch row (DESIGN §10.12). */
export const EXPERIMENTAL_SHORT = "Numbers we're still checking, like speed ranges. When on, they can also suggest your focus, marked Experimental."

export const RETENTION_FOOTNOTE = 'Videos older than {days} days are deleted the next time you open Serve Coach.'

export const EXPORT_FAILED = "Couldn't create the file. Try again, or free some space."
