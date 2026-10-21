import { termSpans } from '../lib/glossary'
import Term from './Term'

/**
 * `Cue`, with the first mention of each glossary word a tap away (N3.4).
 *
 * Its own component rather than a flag on `Cue`, so the glossary stays out of
 * the entry chunk: Home loads this lazily and draws a plain `Cue` meanwhile.
 * Never inside a button: a Term is one.
 */
export default function TermCue({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="cue-key">
            {part}
          </strong>
        ) : (
          <span key={i}>
            {termSpans(part).map((s, k) =>
              'id' in s ? (
                <Term key={k} id={s.id}>
                  {s.text}
                </Term>
              ) : (
                s.text
              ),
            )}
          </span>
        ),
      )}
    </>
  )
}
