import { FlaskIcon } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { Button, Card } from '../../components/index.ts'

interface ManifestClip {
  id: string
  description: string
  files: { mp4?: string }
  video?: { fps?: number; width?: number; height?: number }
  camera?: { view?: string }
}

/**
 * Dev only (never in a production build: the dev server serves /__synthetic/ and ImportScreen loads
 * this lazily behind import.meta.env.DEV). Loads a clip from the synthetic corpus as a File so the
 * whole import flow, the probe and the analysis hand-off can be exercised without a phone.
 * `/record/live?dev-clip=<id>` does the same for the live framing screen.
 */
export function DevSyntheticPicker({ onPick }: { onPick: (file: File) => void }) {
  const selectId = useId()
  const [clips, setClips] = useState<ManifestClip[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    let live = true
    fetch('/__synthetic/manifest.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: { clips: ManifestClip[] }) => {
        if (!live) return
        const list = m.clips.filter((c) => c.files.mp4)
        setClips(list)
        setChosen(list.find((c) => c.id.startsWith('baseline'))?.id ?? list[0]?.id ?? '')
      })
      .catch(() => live && setClips([]))
    return () => {
      live = false
    }
  }, [])

  if (clips === null || clips.length === 0) return null
  const clip = clips.find((c) => c.id === chosen)

  const load = async () => {
    if (!clip?.files.mp4) return
    setState('loading')
    try {
      const res = await fetch(`/__synthetic/${clip.files.mp4}`)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      onPick(new File([blob], `${clip.id}.mp4`, { type: 'video/mp4' }))
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <Card className="flex flex-col gap-3 border-dashed">
      <p className="flex items-center gap-2 text-footnote font-label text-ink-2">
        <FlaskIcon size={20} aria-hidden="true" />
        Developer: synthetic clip
      </p>
      <label htmlFor={selectId} className="text-footnote text-ink-2">
        Clip from the synthetic corpus
      </label>
      <select
        id={selectId}
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
        className="h-13 rounded-control border-token border-line-strong bg-surface px-3 text-body text-ink"
      >
        {clips.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id}
          </option>
        ))}
      </select>
      {clip ? <p className="text-footnote text-ink-3">{clip.description}</p> : null}
      <Button variant="secondary" compact onClick={() => void load()} loading={state === 'loading'}>
        Load clip
      </Button>
      {state === 'error' ? <p className="text-footnote text-ink-2">That clip could not be loaded from the dev server.</p> : null}
    </Card>
  )
}
