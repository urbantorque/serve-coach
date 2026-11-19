/**
 * What to call the device the player is holding (N3.4).
 *
 * The app was written for a phone, and thirty lines said "this phone". On a
 * laptop, where the review studio is the reason to open it, that is wrong in
 * front of the person reading it. A coarse pointer on a small screen is a
 * phone, a coarse pointer on a larger one a tablet, and anything else a
 * computer. Where there is no window at all (the Node suite) it is a phone, so
 * every line the suite holds reads exactly as before.
 */
export type DeviceNoun = 'phone' | 'tablet' | 'computer'

export function deviceNoun(
  env: { coarse?: boolean; shortSide?: number } = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? {}
    : {
        coarse: window.matchMedia('(pointer: coarse)').matches,
        shortSide: Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0),
      },
): DeviceNoun {
  if (env.coarse === undefined) return 'phone'
  if (!env.coarse) return 'computer'
  return (env.shortSide ?? 0) >= 600 ? 'tablet' : 'phone'
}
