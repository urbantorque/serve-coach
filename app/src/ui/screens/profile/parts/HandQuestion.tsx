import { useId } from 'react'
import type { Handedness } from '../../../../analysis/types.ts'
import { ChoiceList } from './ChoiceList.tsx'

/** "Which hand do you serve with?" (PRODUCT O5): Right / Left, none preselected. */
export function HandQuestion({ value, onChange }: { value: Handedness | null; onChange: (v: Handedness) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="text-footnote font-label text-ink-2">
        Which hand do you serve with?
      </p>
      <ChoiceList
        labelledBy={id}
        mode="single"
        size="pair"
        options={[
          { value: 'right', label: 'Right' },
          { value: 'left', label: 'Left' },
        ]}
        value={value ? [value] : []}
        onChange={([v]) => onChange(v)}
      />
    </div>
  )
}
