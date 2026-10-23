import { useState, type CSSProperties } from 'react'
import Term from './Term'
import { SPEED_SCALE, UNIT_LABEL, defaultSpeedUnit, speedFigures, type SpeedUnit } from '../lib/speedCopy'
import { readPrefs, writePrefs } from '../lib/storage/prefs'
import type { ServeSpeed } from '../lib/vision/serveSpeed'
import '../styles/speed.css'

/** The unit speeds are said in: the player's pick, or their locale's. */
function useSpeedUnit(): [SpeedUnit, (unit: SpeedUnit) => void] {
  const [unit, setUnit] = useState<SpeedUnit>(() => readPrefs().speedUnit ?? defaultSpeedUnit())
  return [
    unit,
    (next) => {
      writePrefs({ speedUnit: next })
      setUnit(next)
    },
  ]
}

/**
 * The serve's speed under the hero (N2.7): the best figure, the range it is
 * good to, and that range drawn on a short scale so a faster serve is seen to
 * move it.
 *
 * Never a grade. No status colour, no target, nothing that feeds the score: it
 * is a reading beside the coaching, as the heights are. The unit switch is
 * here rather than in Settings because this is the only place it means
 * anything, and it is remembered.
 */
export default function SpeedRow({ speed }: { speed: ServeSpeed }) {
  const [unit, setUnit] = useSpeedUnit()
  const f = speedFigures(speed, unit)
  const [from, to] = SPEED_SCALE[unit]
  return (
    <section className="speed" aria-label="Serve speed">
      <div className="speed-head">
        <span className="block-title">Serve speed</span>
        <span className="seg" role="group" aria-label="Speed unit">
          {(['kmh', 'mph'] as const).map((u) => (
            <button
              key={u}
              type="button"
              className={`seg-item${unit === u ? ' is-on' : ''}`}
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
        </span>
      </div>
      <p className="speed-figure">
        <strong>{f.best}</strong> {f.unit}
      </p>
      {/* The band is the claim; the tick inside it is the best figure. */}
      <div className="speed-scale" aria-hidden="true">
        <span
          className="speed-band"
          style={
            {
              left: `${f.at.low * 100}%`,
              width: `${(f.at.high - f.at.low) * 100}%`,
              // Where the best figure sits inside the band: the band grows out from it.
              '--at': (f.at.best - f.at.low) / Math.max(1e-6, f.at.high - f.at.low),
            } as CSSProperties
          }
        />
        <span className="speed-best" style={{ left: `${f.at.best * 100}%` }} />
      </div>
      <div className="speed-ends" aria-hidden="true">
        <span>{from}</span>
        <span>{to}</span>
      </div>
      <p className="speed-range">
        <Term id="likelyRange">Likely</Term> {f.low}–{f.high} {f.unit}
      </p>
    </section>
  )
}
