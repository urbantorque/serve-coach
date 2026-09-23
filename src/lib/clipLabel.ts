/**
 * What to call the clip under the analysing screen's title.
 *
 * The raw file name was shown, and on a phone that is the camera's own —
 * `VID_20260923_174512.mp4`, `PXL_20260923…` — which reads as the app leaking
 * its plumbing. A name somebody chose is kept, without its extension; a
 * camera's, or one too long or too numeric to read, becomes "Your clip".
 */
export function clipLabel(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,4}$/i, '').trim()
  const cameraName = /^(vid|img|pxl|mov|mvi|dsc|dji|gopr|screen[ _-]?recording|trim|video)[\s_.-]?\d/i
  if (!base || cameraName.test(base) || base.length > 32 || !/[a-z]{3}/i.test(base)) return 'Your clip'
  return base
}
