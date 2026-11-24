import { UNIT_LABEL, type SpeedUnit } from '../lib/speedCopy'

interface Props {
  value: SpeedUnit
  onChange: (unit: SpeedUnit) => void
}

/**
 * Which unit a serve speed is said in. It starts as the phone's locale, so most
 * players never see this. It lives in Settings now that speeds appear on several
 * screens, so no one of them has to carry the switch.
 */
export default function SpeedUnitPicker({ value, onChange }: Props) {
  return (
    <fieldset className="hand-pick">
      <legend>Show speeds in</legend>
      <div className="hand-pick-options">
        {(['kmh', 'mph'] as const).map((unit) => (
          <button
            key={unit}
            type="button"
            className={`hand-option${value === unit ? ' is-on' : ''}`}
            aria-pressed={value === unit}
            onClick={() => onChange(unit)}
          >
            {UNIT_LABEL[unit]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
