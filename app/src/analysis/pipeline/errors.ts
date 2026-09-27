/**
 * Pipeline errors and their player-facing copy (ARCHITECTURE §5.12, PRODUCT §6.4 states).
 * Every failure leaves the pipeline as an AnalysisError with a code, one calm sentence for the
 * player (Australian English, no jargon, no blame) and whether trying again can help. The
 * technical detail stays in `detail` for logs and never reaches the screen.
 */
import type { AnalysisErrorCode } from '../../data/domain.ts'
import type { PlayerFacingError } from './types.ts'

export const PLAYER_MESSAGES: Record<AnalysisErrorCode, string> = {
  'unsupported-codec':
    "This video format can't be read on this phone. In Settings, open Camera, then Formats, choose Most Compatible, then record again.",
  'probe-failed': "We couldn't read this video file. Try saving it again from your camera roll, or choose another video.",
  'too-long': 'This video is too long to analyse on the phone. Trim it to the serves you want and try again.',
  'storage-full': "Your phone is out of space, so we couldn't save this analysis. Free up some space and try again.",
  'no-webgl': "This phone's browser can't run the analysis. You can still explore the sample session.",
  'pose-init-failed': "The body tracker couldn't start on this phone. Close other apps and try again.",
  'decoder-reclaimed': 'The video stopped decoding while Serve Coach was in the background. Keep the app open and try again.',
  cancelled: 'Analysis stopped before it finished, so nothing from this run was saved.',
  internal: 'The analysis stopped part-way through this video. Try again, and if it stops again, try a shorter clip.',
  'no-serves': "We couldn't find a serve in this video.",
}

const RECOVERABLE: Record<AnalysisErrorCode, boolean> = {
  'unsupported-codec': false,
  'probe-failed': false,
  'too-long': false,
  'storage-full': true,
  'no-webgl': false,
  'pose-init-failed': true,
  'decoder-reclaimed': true,
  cancelled: true,
  internal: true,
  'no-serves': false,
}

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode
  /** Player-facing sentence (safe to show as is). */
  readonly playerMessage: string
  readonly recoverable: boolean
  /** Technical detail for logs; never shown to the player. */
  readonly detail: string

  constructor(code: AnalysisErrorCode, detail = '', playerMessage?: string) {
    const message = playerMessage ?? PLAYER_MESSAGES[code]
    super(message)
    this.name = 'AnalysisError'
    this.code = code
    this.playerMessage = message
    this.recoverable = RECOVERABLE[code]
    this.detail = detail
  }

  toPlayerFacing(): PlayerFacingError {
    return { code: this.code, message: this.playerMessage, recoverable: this.recoverable }
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const e = error as { name?: unknown; inner?: unknown }
  if (typeof e.name === 'string' && e.name !== 'Error') {
    // Dexie wraps the IndexedDB error (e.g. AbortError around QuotaExceededError): prefer the inner one.
    if (e.inner && typeof e.inner === 'object') return errorName(e.inner) ?? e.name
    return e.name
  }
  if (e.inner) return errorName(e.inner)
  return undefined
}

/** True for a DOMException/Error named AbortError, or a wrapped AnalysisError('cancelled'). */
export function isAbort(error: unknown): boolean {
  if (error instanceof AnalysisError) return error.code === 'cancelled'
  return errorName(error) === 'AbortError'
}

/** Throws the pipeline's cancellation error when the signal has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AnalysisError('cancelled', 'signal aborted')
}

/**
 * Maps anything thrown inside the pipeline to an AnalysisError. `fallback` names the code for an
 * unrecognised error in a known stage (e.g. 'unsupported-codec' while opening the decoder).
 */
export function toAnalysisError(error: unknown, fallback: AnalysisErrorCode = 'internal'): AnalysisError {
  if (error instanceof AnalysisError) return error
  const name = errorName(error)
  const detail = describe(error)
  if (name === 'AbortError') return new AnalysisError('cancelled', detail)
  if (name === 'QuotaExceededError') return new AnalysisError('storage-full', detail)
  if (name === 'ProbeError') {
    const code = (error as { code?: string }).code
    return new AnalysisError(code === 'unsupported-container' ? 'unsupported-codec' : 'probe-failed', detail)
  }
  if (/webgl/i.test(detail) && fallback === 'pose-init-failed') return new AnalysisError('no-webgl', detail)
  return new AnalysisError(fallback, detail)
}
