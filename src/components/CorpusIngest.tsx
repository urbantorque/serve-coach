import { useRef, useState } from 'react'
import type { Corpus, IngestProgress } from '../dev/corpus'
import { Icon } from './primitives'

/**
 * Drop a folder of clips in, get landmark dumps out. Dev builds only.
 *
 * The one screen in this app that is not for a player. `CORPUS.md` explains what
 * a folder of unlabelled footage is and is not worth; this is the door. It runs
 * the real pipeline over every clip in the folder, one at a time, and downloads
 * the landmarks — never the video, which stays on the machine exactly as a
 * player's does.
 *
 * Deliberately plain. There is no design here beyond a button and a running
 * count, because the audience is whoever is building the engine and the job is
 * measured in hours: a hundred clips is a hundred full passes.
 */
export default function CorpusIngest() {
  const pick = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController>()
  const [progress, setProgress] = useState<IngestProgress>()
  const [done, setDone] = useState<Corpus>()
  const [failed, setFailed] = useState<string>()

  const run = async (files: FileList | null) => {
    if (!files?.length) return
    setDone(undefined)
    setFailed(undefined)
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const { ingest, downloadCorpus, videosIn } = await import('../dev/corpus')
      const list = [...files]
      if (videosIn(list).length === 0) {
        setFailed('No video files in that folder.')
        return
      }
      const corpus = await ingest(list, setProgress, controller.signal)
      setDone(corpus)
      downloadCorpus(corpus)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setProgress(undefined)
    }
  }

  const read = done?.clips.filter((c) => !c.refused).length ?? 0
  const refused = done?.clips.filter((c) => c.refused).length ?? 0

  return (
    <section className="devcheck">
      <p className="sheet-note">
        Every clip in the folder is analysed here, on this device, exactly as a player&apos;s own
        would be. What downloads is the tracked landmarks and the measurements — never the video.
        See CORPUS.md.
      </p>

      {/* `webkitdirectory` is how a folder is picked. Non-standard and
          universally supported, and the one-word label the distribution layer
          wants comes from the sub-folder each clip sits in — so `pro/` and
          `club/` are the whole labelling interface. */}
      <input
        ref={pick}
        type="file"
        hidden
        multiple
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={(e) => {
          void run(e.target.files)
          e.target.value = ''
        }}
      />

      <button
        className="btn btn--primary btn--full"
        onClick={() => pick.current?.click()}
        disabled={progress !== undefined}
      >
        <Icon name="film" size={18} />
        {progress ? 'Reading…' : 'Pick a folder of clips'}
      </button>

      {progress && (
        <>
          <p className="devcheck-row" role="status" aria-live="polite">
            <span className="devcheck-label">
              {progress.n} of {progress.total}
            </span>
            <span className="devcheck-value">{progress.name}</span>
          </p>
          <button className="btn btn--ghost btn--full" onClick={() => abort.current?.abort()}>
            Stop and keep what is read
          </button>
        </>
      )}

      {done && (
        <p className="devcheck-row">
          <span className="devcheck-label">Downloaded</span>
          <span className="devcheck-value">
            {read} read, {refused} refused
          </span>
        </p>
      )}

      {failed && <p className="storage-outcome">{failed}</p>}
    </section>
  )
}
