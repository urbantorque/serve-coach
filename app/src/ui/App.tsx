import { TennisBallIcon } from '@phosphor-icons/react'

/** Placeholder shell until the record, analyse and review screens exist. */
export function App() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-end gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] font-sans">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent text-on-accent">
        <TennisBallIcon size={32} weight="regular" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-3">
        <h1 translate="no" className="text-4xl font-semibold tracking-tight text-balance text-ink">Serve Coach</h1>
        <p className="max-w-[34ch] text-base leading-relaxed text-pretty text-ink-muted">
          Film your serve on your phone and get feedback that says how sure it is.
        </p>
      </div>
      <p className="border-t border-line pt-4 text-sm text-ink-muted">
        Early build. Recording and analysis are not available yet.
      </p>
    </main>
  )
}
