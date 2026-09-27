import { VideoCameraIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { loadDemoData } from '../../../data/demo.ts'
import { useSessions } from '../../../data/hooks.ts'
import { Button, Card, CaptureQualityLine, DelayedSkeleton, EmptyState, ProfileButton, SampleBanner, Screen, SectionLabel, Skeleton } from '../../components/index.ts'
import { longDate, shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'

/**
 * Today (DESIGN §10.2, PRODUCT §6.2): "What should I do now?" One primary action, contextual.
 * STUB: shows the first-run empty state and the last-session card. The focus card, pre-match card,
 * experiment strip, pain-pause card and comp-night log are for the Today builder.
 */
export function TodayScreen() {
  const sessions = useSessions()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const last = sessions?.[0]

  const seeSample = async () => {
    setLoading(true)
    try {
      await loadDemoData()
      navigate(paths.sessionReport('demo-s3'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen title="Today" variant="root" trailing={<ProfileButton />} banner={last?.isDemo ? <SampleBanner /> : undefined}>
      <p className="-mt-3 text-footnote text-ink-3">{longDate()}</p>
      {sessions === undefined ? (
        <DelayedSkeleton>
          <Skeleton className="h-64 w-full" />
        </DelayedSkeleton>
      ) : !last ? (
        <EmptyState
          icon={VideoCameraIcon}
          title="Record your first serves"
          body="15 serves from one side, about 10 minutes. We'll find one thing to work on."
          action={
            <>
              <Button to={paths.record()}>Set up camera</Button>
              <Button variant="tertiary" onClick={seeSample} loading={loading}>
                See a sample session
              </Button>
            </>
          }
        />
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="last-session">
          <SectionLabel>
            <span id="last-session">Last session</span>
          </SectionLabel>
          <Card className="flex flex-col gap-2">
            <p className="text-headline text-ink">{shortDate(last.visitId)}</p>
            <p className="text-footnote text-ink-2">
              {last.view === 'rear' ? 'View from behind' : 'Side view'}, {last.analysis?.counts.analysed ?? 0} serves
            </p>
            {last.analysis ? (
              <CaptureQualityLine
                overall={last.analysis.capture.quality.overall}
                measured={last.analysis.counts.included}
                detected={last.analysis.counts.analysed}
              />
            ) : null}
            <Button variant="tertiary" to={paths.sessionReport(last.id)} className="self-start">
              Open report
            </Button>
          </Card>
        </section>
      )}
    </Screen>
  )
}
