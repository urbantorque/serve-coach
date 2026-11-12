/**
 * A folder of clips, turned into landmark dumps the suite can run over.
 *
 * WHY IN THE APP RATHER THAN IN A SCRIPT. The pipeline needs a video decoder and
 * the MediaPipe WASM runtime, both of which are browser facilities. A Node-side
 * ingest would mean a second decoder and a second way of sampling frames — which
 * is to say a second engine, quietly disagreeing with the one that ships. This
 * runs the real `analyzeServe` over each clip, so what comes out is exactly what
 * a player's own phone would have produced.
 *
 * WHAT COMES OUT, AND WHAT DOES NOT. Landmarks, timings and the measurements the
 * engine arrived at. Not pixels: the video stays on the machine it was analysed
 * on, exactly as a player's does, which is what makes a corpus something that can
 * be kept and shared when the clips themselves cannot. See `CORPUS.md`.
 *
 * DEV ONLY, and dynamically imported, so none of this reaches the bundle a
 * player downloads.
 */
import { analyzeServe } from '../lib/analysis/analyze'
import type { Analysis, Frame } from '../lib/analysis/types'

/** One clip, as the corpus stores it. */
export interface CorpusClip {
  /** The file name, which is the only thing tying this back to a video. */
  name: string
  /**
   * What the folder said this was, when the folder said anything.
   *
   * The one-word label the distribution layer in `CORPUS.md` needs, taken from
   * the immediate parent directory rather than asked for per clip — dropping
   * files into `pro/` and `club/` is a labelling interface nobody has to be
   * taught.
   */
  group?: string
  fps: number
  /** Aspect ratio, which the mirror transform needs and cannot recover. */
  aspect: number
  frames: Frame[]
  /** What the engine made of it, so a drift can be measured against something. */
  read?: {
    handedness: Analysis['handedness']
    view: Analysis['quality']['view']
    confidence: number
    overall: number
    metrics: { id: string; value: number; ideal: [number, number] }[]
    /** Wall clock for the pass, which is a reading about the machine. */
    costMs?: number
  }
  /** Why there is no `read`, when the engine refused the clip. */
  refused?: string
}

export interface Corpus {
  format: 'serve-coach-corpus'
  version: 1
  builtAt: number
  clips: CorpusClip[]
}

export interface IngestProgress {
  /** Which clip is being read, one-based. */
  n: number
  total: number
  name: string
  /** What that clip came to, once it is finished. */
  outcome?: 'read' | 'refused'
}

/**
 * The group a file belongs to, from the folder it was dropped in.
 *
 * `webkitRelativePath` is `chosen-folder/pro/serve-01.mp4`, so the parent
 * directory is the label and the top level is just where the picker started.
 * Absent for a flat folder, which is the ordinary case and not a problem — the
 * invariance layer needs no labels at all.
 */
export function groupOf(relativePath: string): string | undefined {
  const parts = relativePath.split('/').filter(Boolean)
  return parts.length >= 3 ? parts[parts.length - 2] : undefined
}

/** Files worth trying, from whatever the folder picker handed over. */
export function videosIn(files: readonly File[]): File[] {
  return files.filter(
    (f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name),
  )
}

/**
 * Read every clip, one at a time, and hand back the corpus.
 *
 * SERIALLY, and not because it is simpler. Each pass holds a decoded video, the
 * MediaPipe heap and up to `MAX_FINE_FRAMES` of landmarks; two at once on a
 * laptop is survivable and on a phone is not, and this is exactly the accounting
 * `footprint.ts` exists to keep honest. A folder of a hundred clips is an
 * overnight job either way — the cost is the decoder, not the scheduling.
 *
 * A clip the engine refuses is kept, with the refusal recorded. Those are the
 * most valuable rows in the file: a refusal is behaviour with its own failure
 * modes, and "it refused a real serve" is the complaint this project has already
 * had.
 */
export async function ingest(
  files: readonly File[],
  onProgress: (p: IngestProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<Corpus> {
  const videos = videosIn(files)
  const clips: CorpusClip[] = []

  for (const [i, file] of videos.entries()) {
    if (signal?.aborted) break
    const name = file.name
    onProgress({ n: i + 1, total: videos.length, name })

    const url = URL.createObjectURL(file)
    try {
      const analysis = await analyzeServe({
        videoUrl: url,
        fileName: name,
        // The file itself, so its rate is read and the frames are walked, as the
        // app does with a clip the player picks.
        file,
        signal,
        // Nothing here draws a picture, and the stills are the expensive half of
        // a pass — six seeks and six JPEG encodes per clip, for a file that
        // stores no images.
        skipThumbnails: true,
      })
      clips.push({
        name,
        group: groupOf((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''),
        fps: analysis.quality.sampledFps,
        aspect: analysis.video.width / Math.max(1, analysis.video.height),
        frames: analysis.frames,
        read: {
          handedness: analysis.handedness,
          view: analysis.quality.view,
          confidence: analysis.quality.confidence,
          overall: analysis.overall,
          metrics: analysis.fundamentals
            .flatMap((f) => f.metrics)
            .map((m) => ({ id: m.id, value: m.value, ideal: m.ideal })),
          costMs: analysis.cost?.ms,
        },
      })
      onProgress({ n: i + 1, total: videos.length, name, outcome: 'read' })
    } catch (err) {
      // A refusal carries frames only when the caller asked for them, and this
      // one deliberately does not: a clip with no serve found in it has nothing
      // the invariance harness can transform. The refusal itself is the datum.
      clips.push({
        name,
        group: groupOf((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''),
        fps: 0,
        aspect: 1,
        frames: [],
        refused: (err as Error).message,
      })
      onProgress({ n: i + 1, total: videos.length, name, outcome: 'refused' })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return { format: 'serve-coach-corpus', version: 1, builtAt: Date.now(), clips }
}

/** Hand the corpus to the player as a file, the way a backup is handed over. */
export function downloadCorpus(corpus: Corpus): void {
  const blob = new Blob([JSON.stringify(corpus)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `serve-coach-corpus-${corpus.clips.length}-clips.json`
  a.click()
  // Long enough for the download to start; the click is asynchronous inside the
  // browser and revoking immediately cancels it on some of them.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
