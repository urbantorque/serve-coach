import { ListChecksIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Card, Screen, SectionLabel, type ScreenProps } from '../components/index.ts'

export interface StubScreenProps extends Omit<ScreenProps, 'children'> {
  /** One sentence: the question this screen answers. */
  purpose: string
  /** Where the full spec is, e.g. ['DESIGN §10.6', 'PRODUCT §6.5']. */
  specs: string[]
  children?: ReactNode
}

/**
 * Placeholder page for a screen a feature builder has not filled yet. It is titled and reachable,
 * states its purpose and points at its spec. Replace the whole body when you build the screen.
 */
export function StubScreen({ purpose, specs, children, ...screen }: StubScreenProps) {
  return (
    <Screen {...screen}>
      {children}
      <Card className="flex flex-col gap-3" label="Placeholder">
        <div className="flex items-center gap-2 text-ink-2">
          <ListChecksIcon size={20} aria-hidden="true" />
          <SectionLabel as="p" className="text-ink-2">
            Placeholder screen
          </SectionLabel>
        </div>
        <p className="text-callout text-ink">{purpose}</p>
        <p className="text-footnote text-ink-3">Build from {specs.join(', ')}.</p>
      </Card>
    </Screen>
  )
}
