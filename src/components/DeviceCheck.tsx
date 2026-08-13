import { useEffect, useState } from 'react'
import { isCachedOffline } from '../lib/pose/poseEngine'
import { deviceReportText, readDeviceReport, type DeviceReport, type Playback } from '../lib/selfCheck'
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
  const [copied, setCopied] = useState<'done' | 'failed'>()

  useEffect(() => {
    void readDeviceReport(isCachedOffline).then(setReport)
  }, [])

  if (!report) return <p className="sheet-note">Asking this phone about itself…</p>

  const { recording, decode, camera, storage, hardware, offline } = report
  const verdict = recording.chosen ? YES : NO

  return (
    <section className="devcheck">
      <p className={`devcheck-verdict devcheck-verdict--${verdict.tone}`}>
        <Icon name={verdict.name} size={15} />
        <span>
          {recording.chosen
            ? 'This phone can record a serve and read it back.'
            : recording.deadEnd
              ? 'This browser only records files it cannot open, so there is no record button. Film with your camera app.'
              : 'This browser will not record. Film with your camera app and pick the video — that path is unaffected.'}
        </span>
      </p>

      <h3 className="block-title">Recording in the app</h3>
      <Row
        label="Will record"
        value={recording.chosen?.replace('video/', '') ?? 'nothing'}
        tone={recording.chosen ? 'ok' : 'bad'}
      />
      {/* Both columns for every container, because the decision above is only
          believable beside the evidence it was made from — and printing them
          next to each other is what showed the recorder was never asking the
          second question at all. */}
      {recording.containers.map((c) => (
        <Row
          key={c.type}
          label={c.type.replace('video/', '')}
          value={`records ${c.records ? 'yes' : 'no'} · opens ${said(c.plays)}`}
          tone={c.records && c.plays === 'no' ? 'bad' : undefined}
        />
      ))}

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

      {/* The block is always on screen and always selectable, and the button is
          an accelerator for it. `navigator.clipboard` is refused often enough on
          a phone — an insecure context, a browser that wants a user gesture it
          did not see — that a copy button which is the only way out is a copy
          button that sometimes strands somebody. */}
      <pre className="devcheck-text">{deviceReportText(report)}</pre>
      <button
        className="btn btn--ghost btn--full"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(deviceReportText(report))
            .then(() => setCopied('done'))
            .catch(() => setCopied('failed'))
        }}
      >
        <Icon name="share" size={17} />
        {copied === 'done' ? 'Copied' : 'Copy this'}
      </button>
      {copied === 'failed' && (
        <p className="storage-outcome">Select the text above and copy it by hand.</p>
      )}
    </section>
  )
}
