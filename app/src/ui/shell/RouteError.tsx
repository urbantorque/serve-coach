import { WarningCircleIcon } from '@phosphor-icons/react'
import { useRouteError } from 'react-router'
import { Button, EmptyState } from '../components/index.ts'

/**
 * Last-resort error screen for a route that threw (for example a failed chunk load after an update).
 * Says what happened and what to do; the player's data is untouched (PRODUCT §6 standard states).
 */
export function RouteError() {
  const error = useRouteError()
  if (import.meta.env.DEV) console.error(error)
  return (
    <div className="gutter mx-auto flex min-h-[100dvh] max-w-(--content-max) items-center">
      <EmptyState
        icon={WarningCircleIcon}
        title="This screen didn't load"
        body="Your sessions and settings are safe. Reload to try again."
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      />
    </div>
  )
}
