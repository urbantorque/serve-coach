/**
 * Hands files to the player (ARCHITECTURE §8.4): the system share sheet when the browser can share
 * files (the player chooses where they go), otherwise a download to this device. Nothing is sent
 * anywhere by the app itself (D8).
 */
export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

export async function saveFiles(files: File[], opts: { title?: string; preferShare?: boolean } = {}): Promise<SaveResult> {
  const nav = globalThis.navigator as Navigator | undefined
  const preferShare = opts.preferShare ?? true
  if (preferShare && nav?.canShare && nav.share) {
    try {
      if (nav.canShare({ files })) {
        await nav.share({ files, title: opts.title })
        return 'shared'
      }
    } catch (e) {
      // AbortError = the player closed the share sheet; anything else falls back to a download.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  for (const file of files) downloadFile(file)
  return 'downloaded'
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "serve-coach-export-2026-09-27.json" (local date). */
export function datedName(prefix: string, ext: string, now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${prefix}-${y}-${m}-${d}.${ext}`
}
