import { CompassIcon } from '@phosphor-icons/react'
import { Button, EmptyState, Screen } from '../components/index.ts'
import { paths } from '../shell/paths.ts'

export function NotFoundScreen() {
  return (
    <Screen title="Not found" back={{ to: paths.today(), label: 'Today' }}>
      <EmptyState
        icon={CompassIcon}
        title="We couldn't find that page"
        body="The link may be old. Your sessions and settings are unchanged."
        action={
          <Button variant="secondary" to={paths.today()}>
            Go to Today
          </Button>
        }
      />
    </Screen>
  )
}
