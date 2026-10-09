/**
 * Two small things the app needs before it has loaded the extractor: the
 * error a stopped read throws, and the check that refuses a file that is not a
 * video by its declared type.
 *
 * They lived in `extract.ts`, and `App.tsx` importing them from there carried
 * the whole extractor, the serve scan and the serve finder into the bundle every
 * cold open parses. `extract.ts` re-exports both, so every other import of them
 * is unchanged, and `Cancelled` stays one class for `instanceof`.
 */

export class Cancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'Cancelled'
  }
}

/**
 * Whether a file's own declared type already rules out its being a video,
 * before the decoder is ever asked to explain a failure it did not have.
 *
 * `describeDecodeFailure` below reads one `MediaError` code for two very
 * different situations — a genuine video this browser cannot decode, and a
 * file that was never a video at all — and on a browser with no HEVC
 * support it guesses the first for both, because that is the one it is
 * actually built to help with. A photo or a document picked by mistake then
 * comes back as "this is most likely HEVC" with hints about an iPhone
 * camera setting that have nothing to do with the actual file — confidently
 * wrong, not merely unhelpful, and on exactly the browsers most likely to
 * lack HEVC support and so most likely to hit this path.
 *
 * `type` is a container MIME type, not a codec, so a real HEVC `.mov` or
 * `.mp4` still reports `video/quicktime` or `video/mp4` and is untouched by
 * this — only a type the browser has already positively named as something
 * else is caught here. `false` for an empty type or an `audio/*` one, on
 * purpose: an empty type is a browser declining to guess, not evidence the
 * file is not a video, and an audio-only file already gets a more specific
 * answer once the decoder has actually looked at it ("There is no picture
 * in that file", in `loadVideo` below).
 */
export function looksLikeNonVideo(type: string): boolean {
  return type !== '' && !type.startsWith('video/') && !type.startsWith('audio/')
}
