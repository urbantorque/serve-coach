import { InfoIcon } from '@phosphor-icons/react'
import { UI } from '../copy/strings.ts'

/**
 * Sample data banner (DESIGN §8.21, PRODUCT §4.4 rule 11): full-width 36 px bar under the app bar on
 * every screen that shows demo data. "Remove" appears on Profile only.
 */
export function SampleBanner({ onRemove }: { onRemove?: () => void }) {
  return (
    <div role="note" className="gutter flex min-h-9 items-center gap-2 bg-surface-2 text-footnote text-ink-2">
      <InfoIcon size={16} aria-hidden="true" className="shrink-0" />
      <span className="flex-1">{UI.sampleBanner}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="-mr-2 h-11 rounded-control px-2 text-footnote font-label text-ink underline underline-offset-[3px]">
          Remove
        </button>
      ) : null}
    </div>
  )
}
