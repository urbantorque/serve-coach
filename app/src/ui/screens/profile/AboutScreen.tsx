import { useRef } from 'react'
import { CATALOGUE_VERSION, ENGINE_VERSION } from '../../../analysis/metrics/catalogue.ts'
import { LIBRARY_VERSION } from '../../../coaching/library.ts'
import { setSetting, showToast } from '../../../data/index.ts'
import { useSetting } from '../../../data/hooks.ts'
import { APP_VERSION } from '../../../data/export.ts'
import { Card, ListGroup, ListRow, Screen, SectionLabel } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { PRIVACY_POLICY_SUMMARY } from './copy.ts'
import { LICENCES } from './licences.ts'

const TAPS_FOR_VALIDATION = 7

/**
 * About and legal (PRODUCT §6.13 items 6 and 11, §11): versions (tap the app version 7 times for
 * validation mode, ARCHITECTURE §12), the privacy summary, how we coach and our independence, the
 * prototype's terms, and open-source licences (MediaPipe Apache-2.0, Archivo OFL-1.1 and the rest).
 */
export function AboutScreen() {
  const validation = useSetting('validationMode')
  const taps = useRef<{ n: number; at: number }>({ n: 0, at: 0 })

  const tapVersion = () => {
    const now = Date.now()
    taps.current = now - taps.current.at > 1500 ? { n: 1, at: now } : { n: taps.current.n + 1, at: now }
    if (taps.current.n >= TAPS_FOR_VALIDATION) {
      taps.current = { n: 0, at: 0 }
      const next = !validation
      void setSetting('validationMode', next).then(() => showToast(next ? 'Validation mode on.' : 'Validation mode off.'))
    }
  }

  return (
    <Screen title="About and legal" back={{ to: paths.profile(), label: 'You' }}>
      <section className="flex flex-col gap-2" aria-labelledby="about-versions">
        <SectionLabel>
          <span id="about-versions">Versions</span>
        </SectionLabel>
        <ListGroup>
          <li>
            <button
              type="button"
              onClick={tapVersion}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left hover:bg-surface-2"
              aria-describedby={validation ? 'about-validation' : undefined}
            >
              <span className="text-headline text-ink">Serve Coach</span>
              <span className="text-subhead tabular-nums text-ink-2">{APP_VERSION} (beta)</span>
            </button>
          </li>
          <ListRow title="Analysis engine" trailing={ENGINE_VERSION} />
          <ListRow title="Metric catalogue" trailing={CATALOGUE_VERSION} />
          <ListRow title="Coaching library" trailing={LIBRARY_VERSION.replace(/^lib-/, '')} />
        </ListGroup>
        {validation ? (
          <p id="about-validation" className="text-footnote text-ink-2">
            Validation mode is on. Tap the version {TAPS_FOR_VALIDATION} times to turn it off.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="privacy">
        <SectionLabel>
          <span id="privacy">Privacy</span>
        </SectionLabel>
        <Card className="flex flex-col gap-3">
          {PRIVACY_POLICY_SUMMARY.map((p) => (
            <p key={p} className="text-callout text-ink">
              {p}
            </p>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="about-coach">
        <SectionLabel>
          <span id="about-coach">How we coach</span>
        </SectionLabel>
        <Card className="flex flex-col gap-3">
          <p className="text-callout text-ink">Cues and drills are coaching practice, not proven by trials for players like you.</p>
          <p className="text-callout text-ink">
            Serve Coach is independent. It isn't affiliated with, sponsored by or endorsed by any coach or coaching business we cite. Names appear only
            to cite published coaching material.
          </p>
          <p className="text-callout text-ink-2">Serve Coach is not a medical service. If something hurts, see a GP, physiotherapist or sports doctor.</p>
        </Card>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="about-terms">
        <SectionLabel>
          <span id="about-terms">Terms</span>
        </SectionLabel>
        <Card className="flex flex-col gap-3">
          <p className="text-callout text-ink">
            This is a closed beta prototype for adults. Nothing is sold, and no payment details are ever asked for or stored.
          </p>
          <p className="text-callout text-ink-2">Full terms of use and the full privacy policy will be published before the public release.</p>
        </Card>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="about-licences">
        <SectionLabel>
          <span id="about-licences">Open-source licences</span>
        </SectionLabel>
        <ListGroup>
          {LICENCES.map((l) => (
            <ListRow key={l.name} title={l.name} subtitle={`${l.what} · ${l.holder}`} trailing={l.licence} />
          ))}
        </ListGroup>
        <p className="text-footnote text-ink-3">Thank you to everyone who builds and shares these projects.</p>
      </section>
    </Screen>
  )
}
