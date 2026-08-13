import { useEffect, useState } from 'react'
import { isCachedOffline } from '../lib/pose/poseEngine'
import { readDeviceReport, type DeviceReport, type Playback } from '../lib/selfCheck'
import { Icon } from './primitives'

/**
 * What this phone will actually do, shown on the phone.
 *
 * Reached by a button at the foot of the history sheet and by opening the app at
 * `?check`, which is the form the court protocol hands out — a player standing on
 * a baseline can be given a URL and cannot be given a navigation path.
 *
 * PLAIN, NOT REASSURING, which is the same standard `StoragePanel` holds. Every
 * line here is a fact about the device, and where the fact is bad the panel says
 * so and names the way round it. There is nothing to press: the check changes
 * nothing, it reports.
 */

const YES = { name: 'check', tone: 'ok' } as const
const NO = { name: 'warn', tone: 'bad' } as const

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="devcheck-row">
      <span className="devcheck-label">{label}</span>
      <span className={`devcheck-value${tone ? ` devcheck-value--${tone}` : ''}`}>{value}</span>
    </div>
  )
}

/** `maybe` is printed as itself. Safari says it about files it plays perfectly. */
const said = (p: Playback) => (p === 'yes' ? 'yes' : p === 'maybe' ? 'probably' : 'no')
const tone = (p: Playback) => (p === 'no' ? ('bad' as const) : ('ok' as const))

export default function DeviceCheck() {
  const [report, setReport] = useState<DeviceReport>()

  useEffect(() => {
    void readDeviceReport(isCachedOffline).then(setReport)
  }, [])

  if (!report) return <p className="sheet-note">Asking this phone about itself…</p>

  const { recording, decode, camera, storage, hardware, offline } = report
  const verdict = recording.chosen && !recording.deadEnd ? YES : NO

  return (
    <section className="devcheck">
      <p className={`devcheck-verdict devcheck-verdict--${verdict.tone}`}>
        <Icon name={verdict.name} size={15} />
        <span>
          {!recording.chosen
            ? 'This browser will not record. Film with your camera app and pick the video — that path is unaffected.'
            : recording.deadEnd
              ? 'This browser records a file it cannot then open. Film with your camera app until that is fixed.'
              : 'This phone can record a serve and read it back.'}
        </span>
      </p>

      <h3 className="block-title">Recording in the app</h3>
      {recording.chosen ? (
        <Row label="Records" value={recording.chosen.replace('video/', '')} tone="ok" />
      ) : (
        <Row label="Records" value="nothing" tone="bad" />
      )}
      {recording.chosen && (
        <Row
          label="Plays that back"
          value={said(recording.containers.find((c) => c.type === recording.chosen)?.plays ?? 'no')}
          tone={recording.deadEnd ? 'bad' : 'ok'}
        />
      )}
      {recording.playable && (
        <Row label="Could have used" value={recording.playable.replace('video/', '')} tone="bad" />
      )}

      <h3 className="block-title">Opening a file you filmed elsewhere</h3>
      {decode.map((d) => (
        <Row key={d.label} label={d.label} value={said(d.plays)} tone={tone(d.plays)} />
      ))}

      <h3 className="block-title">Camera and storage</h3>
      <Row
        label="Live preview"
        value={camera.api ? 'available' : camera.secure ? 'not on this browser' : 'needs https'}
        tone={camera.api ? 'ok' : 'bad'}
      />
      <Row
        label="Works with no signal"
        value={offline ? 'yes, downloaded' : 'not downloaded yet'}
        tone={offline ? 'ok' : 'bad'}
      />
      <Row
        label="Room for reports"
        value={
          storage.quotaMb === undefined
            ? 'this browser would not say'
            : `${storage.usedMb ?? 0} MB used of ${storage.quotaMb} MB`
        }
      />
      <Row
        label="Promised not to clear it"
        value={
          storage.persisted === undefined ? 'unknown' : storage.persisted ? 'yes' : 'no'
        }
        tone={storage.persisted === false ? 'bad' : undefined}
      />

      <h3 className="block-title">This phone</h3>
      <Row label="Screen" value={`${hardware.screen ?? '?'} at ${hardware.dpr ?? '?'}×`} />
      <Row
        label="Cores"
        value={hardware.cores === undefined ? 'not reported' : String(hardware.cores)}
      />
      <Row
        label="Memory"
        value={hardware.memoryGb === undefined ? 'not reported' : `about ${hardware.memoryGb} GB`}
      />

      <p className="sheet-note">
        Nothing here is sent anywhere. It is read from your browser, shown to you, and forgotten
        when you close this.
      </p>
    </section>
  )
}
