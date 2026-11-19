import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import '../styles/info.css'
import { Icon } from '../components/primitives'
import { accuracyRows, unmeasuredRows, wobbleText } from '../lib/accuracy'
import { deviceNoun } from '../lib/device'
import { ATTRIBUTION } from '../lib/figure/modelCredit'
import { INFO_PAGES, INFO_TITLES, pathFor, type InfoPageId } from '../lib/routes'
import { POLICY_DATE, SITE } from '../lib/site'
import { FEATURES, hasPlus } from '../lib/plans'
import { useEntitlement } from '../components/usePlan'
import { FEATURE_COPY, FREE_COPY } from '../lib/planCopy'
import { GATED, PAYMENTS, PRICE_LINE } from '../lib/billing/config'

interface Props {
  page: InfoPageId
  onBack: () => void
  onPage: (page: InfoPageId) => void
}

const LEDES: Record<InfoPageId, string> = {
  pricing: 'What stays free, what Plus adds, and what it costs. Your video never leaves your device on either.',
  accuracy: 'What I measure, how steady each reading is, how I know, and what I cannot see. Built from the tables I grade with.',
  privacy: 'Your video never leaves your device. Here is everything I keep, and where it lives.',
  terms: 'What Serve Coach is, what it is not, and what you agree to by using it.',
  credits: 'The research, the models and the tools this app stands on.',
}

/**
 * The pages a visitor reads rather than uses (N6.3): how sure I am, privacy,
 * the terms and the credits. One screen with an address per page. On a laptop
 * the title and the list of pages hold the left pane while the page scrolls on
 * the right, the same pattern as the report; on a phone they stack.
 */
export default function InfoPage({ page, onBack, onPage }: Props) {
  // What a search engine reads for this page, while it shows (N6.6): its own
  // description, and its own address as the canonical one where the site has one.
  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]')
    const canon = document.querySelector('link[rel="canonical"]')
    const said = meta?.getAttribute('content')
    const was = canon?.getAttribute('href')
    meta?.setAttribute('content', LEDES[page])
    if (canon && SITE.url) canon.setAttribute('href', `${SITE.url}/${page}`)
    return () => {
      if (said) meta?.setAttribute('content', said)
      if (was) canon?.setAttribute('href', was)
    }
  }, [page])
  const go = (p: InfoPageId) => (e: MouseEvent<HTMLAnchorElement>) => {
    // A plain click stays in the app; a modified one opens the address as the browser would.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onPage(p)
  }
  return (
    <div className="screen info">
      <div className="info-side">
        <button className="icon-btn info-back" onClick={onBack} aria-label="Back">
          <Icon name="back" size={22} />
        </button>
        <h1 className="t-display">{INFO_TITLES[page]}</h1>
        <p className="info-lede">{LEDES[page]}</p>
        <nav className="info-nav" aria-label="About Serve Coach">
          {INFO_PAGES.map((p) => (
            <a
              key={p}
              href={pathFor({ kind: 'page', page: p }, import.meta.env.BASE_URL)}
              aria-current={p === page ? 'page' : undefined}
              onClick={go(p)}
            >
              {INFO_TITLES[p]}
            </a>
          ))}
        </nav>
      </div>
      <article className="info-body" aria-label={INFO_TITLES[page]}>
        {page === 'pricing' && <Pricing />}
        {page === 'accuracy' && <Accuracy onPage={go} />}
        {page === 'privacy' && <Privacy />}
        {page === 'terms' && <Terms onPage={go} />}
        {page === 'credits' && <Credits />}
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="info-section">
      <h2 className="t-headline">{title}</h2>
      {children}
    </section>
  )
}

type Go = (p: InfoPageId) => (e: MouseEvent<HTMLAnchorElement>) => void

/* ----------------------------------------------------------------- pricing */

function Pricing() {
  const entitlement = useEntitlement()
  const plus = hasPlus(entitlement)
  return (
    <>
      {!GATED && (
        <Section title="Everything is open for now">
          <p>Every feature on this page is free while Plus is not on sale. When it starts, the free column is what stays free.</p>
        </Section>
      )}
      {PAYMENTS !== 'off' && (plus ? <YourPlus until={entitlement.until} /> : <GetPlus />)}
      <div className="tiers">
        <section className="tier" aria-labelledby="plan-free">
          <h2 className="t-headline" id="plan-free">
            Free
          </h2>
          <ul className="tier-list">
            {FREE_COPY.map((line) => (
              <li key={line}>
                <Icon name="check" size={16} />
                {line}
              </li>
            ))}
          </ul>
        </section>
        <section className="tier tier--plus" aria-labelledby="plan-plus">
          <h2 className="t-headline" id="plan-plus">
            Plus
          </h2>
          {PRICE_LINE && <p className="tier-price">{PRICE_LINE}</p>}
          <p className="tier-lede">Everything in free, and:</p>
          <ul className="tier-list">
            {FEATURES.map((f) => (
              <li key={f}>
                <Icon name="lightning" size={16} />
                <span>
                  <strong>{FEATURE_COPY[f].name}.</strong> {FEATURE_COPY[f].line}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Section title="On either plan">
        <p>Your video never leaves your device, and nothing about your serve leaves unless you send it.</p>
      </Section>
    </>
  )
}

/** Plus on sale and not held: the price, and the way to Stripe's checkout (N6.5). */
function GetPlus() {
  const [state, setState] = useState<'idle' | 'going' | string>('idle')
  const go = async () => {
    setState('going')
    const { startCheckout } = await import('../lib/billing/client')
    const problem = await startCheckout()
    setState(problem ?? 'going')
  }
  return (
    <section className="plus-act" aria-label="Get Plus">
      {PRICE_LINE && <p className="tier-price">{PRICE_LINE}</p>}
      <button className="btn btn--primary btn--big btn--full" onClick={() => void go()} disabled={state === 'going'}>
        <Icon name="lightning" size={20} />
        {state === 'going' ? 'Opening the checkout…' : 'Get Plus'}
      </button>
      <p className="plus-note">Stripe takes the payment on its own page. Cancel any time, and Plus runs to the end of what you paid for.</p>
      {state !== 'idle' && state !== 'going' && (
        <p className="plus-problem" role="alert">
          {state}
        </p>
      )}
    </section>
  )
}

/** Plus held: until when, Stripe's page to change it, and a way to bring it to another device. */
function YourPlus({ until }: { until?: number }) {
  const [problem, setProblem] = useState<string>()
  const [copied, setCopied] = useState(false)
  const manage = async () => {
    const { manage } = await import('../lib/billing/client')
    setProblem(await manage())
  }
  const share = async () => {
    const { anotherDevice } = await import('../lib/billing/client')
    const link = anotherDevice()
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setProblem('Copying was refused here. Open this page on the other device after paying there instead.')
    }
  }
  return (
    <section className="plus-act plus-act--held" aria-label="Your Plus">
      <p className="plus-held">
        <Icon name="check" size={18} />
        <span>
          You have Plus{until ? `, until ${new Date(until).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : ''}. It renews
          by itself until you cancel.
        </span>
      </p>
      <button className="btn btn--ghost btn--full" onClick={() => void manage()}>
        Change your card or cancel
      </button>
      <button className="btn btn--quiet btn--full" onClick={() => void share()}>
        {copied ? 'Link copied. Open it on the other device.' : 'Use Plus on another device'}
      </button>
      {problem && (
        <p className="plus-problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- accuracy */

function Accuracy({ onPage }: { onPage: Go }) {
  const rows = accuracyRows()
  const ball = unmeasuredRows()
  return (
    <>
      <Section title="What I grade, and how steady it is">
        <p>
          For each reading: how far it moves when I read the same serve again, and how often a steady serve keeps its
          grade.
        </p>
        <ul className="acc-rows">
          {rows.map((r) => (
            <li key={r.id} className="acc-row">
              <h3>{r.label}</h3>
              <dl className="acc-figures">
                <div>
                  <dt>Read again, it moves about</dt>
                  <dd className="tnum">{wobbleText(r.unit, r.wobble)}</dd>
                </div>
                <div>
                  <dt>A steady serve keeps its grade</dt>
                  <dd className="tnum">{r.keepsGrade} times in 100</dd>
                </div>
                {r.onSmallClips !== undefined && (
                  <div>
                    <dt>On two small, dark public clips</dt>
                    <dd className="tnum">{wobbleText(r.unit, r.onSmallClips)}</dd>
                  </div>
                )}
              </dl>
              <p className="acc-against">
                <span>Graded against:</span> {r.against}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {ball.length > 0 && (
        <Section title="Graded, with nothing measured under it">
          <ul className="info-list">
            {ball.map((b) => (
              <li key={b.id}>{b.label}</li>
            ))}
          </ul>
          <p>My test serves come from a lab with no ball in it, so nothing has measured how steady these are.</p>
        </Section>
      )}

      <Section title="Shown, never graded">
        <p>Hip and shoulder turn. One camera cannot see them well enough to grade, so I show them and say so.</p>
        <p>Serve speed comes as a likely range, worked out from your racket and body. No radar has checked it.</p>
      </Section>

      <Section title="How I know">
        <p>I read six serves recorded in a motion capture lab, 240 times each, adding a phone camera's noise every time.</p>
        <p>Every take goes through the same steps as your clip. That shows how far a reading wobbles on one serve.</p>
        <p>Where a source above names the rig, it means my own serve, built to make each fault on purpose.</p>
        <p>It does not prove a reading matches the lab. One camera cannot reach that, and I do not claim it.</p>
        <p>A real camera can wobble more than the noise I add, so every figure here is the least it moves.</p>
        <p>I also re-read two small public clips darker, further away, smaller and a frame later.</p>
        <p>Heights moved most there, because the body I measure them against moved with them. Those figures wait for sharper footage.</p>
      </Section>

      <Section title="What I cannot see">
        <ul className="info-list">
          <li>Depth. One camera sees a flat picture, so a part moving toward it or away reads less well.</li>
          <li>Slow motion. My tests cover video filmed at normal speed, and a slow-motion file sits outside them.</li>
          <li>A racket drop the camera blurs. I can miss one entirely, and that gap is still open.</li>
          <li>Your real height. I measure heights against your own body in the picture, never in metres.</li>
        </ul>
        <p>
          When a clip cannot support a reading, I hedge it or leave it out. The{' '}
          <a href={pathFor({ kind: 'page', page: 'privacy' }, import.meta.env.BASE_URL)} onClick={onPage('privacy')}>
            privacy page
          </a>{' '}
          says where your video goes: nowhere.
        </p>
      </Section>
    </>
  )
}

/* ----------------------------------------------------------------- privacy */

function Privacy() {
  const here = deviceNoun()
  return (
    <>
      <Section title="Your video stays here">
        <p>I read your serve inside this browser, on this {here}. The video never goes to a server, mine or anyone else's.</p>
        <p>A clip you choose to keep stays in this browser's own storage, on this {here}.</p>
      </Section>
      <Section title="What I keep, and where">
        <p>Your scores, the joint positions I read and your settings live in this browser, on this {here}.</p>
        <p>Clearing this site's data in your browser deletes them. A backup file you export stays yours to keep or delete.</p>
      </Section>
      <Section title="What leaves, and when">
        <p>The pose models download from this site the first time you read a serve. After that the app works with no signal.</p>
        <p>Nothing about your serve leaves unless you send it yourself: a poster, a clip or a report for your coach.</p>
        <p>A poster or a clip shows a drawn figure, never a photo of you.</p>
      </Section>
      <Section title="No tracking">
        <p>No analytics, no advertising and no cookies that follow you. I do not know who you are.</p>
      </Section>
      {PAYMENTS !== 'off' && (
        <Section title="If you buy Plus">
          <p>Stripe takes the payment on its own page and keeps your card and email. I never see either.</p>
          <p>This {here} keeps a signed pass saying Plus runs until a date. It holds no name, no email and nothing about a serve.</p>
        </Section>
      )}
      <Section title="Questions">
        {SITE.contact && <p>Write to {SITE.contact} about anything on this page.</p>}
        <p className="info-date">Last changed {POLICY_DATE}.</p>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------- terms */

function Terms({ onPage }: { onPage: Go }) {
  return (
    <>
      <Section title="What this is">
        <p>Serve Coach reads a tennis serve from a video and suggests what to work on. It is a coaching aid, not a coach.</p>
        {SITE.operator && <p>{SITE.operator} runs Serve Coach.</p>}
      </Section>
      <Section title="How far to trust it">
        <p>
          Every number comes with how sure I am, and{' '}
          <a href={pathFor({ kind: 'page', page: 'accuracy' }, import.meta.env.BASE_URL)} onClick={onPage('accuracy')}>
            a page of its own
          </a>{' '}
          sets out how I know.
        </p>
        <p>Treat a reading as a guide, not a lab measurement or a radar reading.</p>
      </Section>
      <Section title="Look after your body">
        <p>Stop if anything hurts, and see someone qualified about pain. A drill on this app is no answer to an injury.</p>
      </Section>
      <Section title="Your videos and readings">
        <p>Your videos and readings stay yours, on your own device. You can delete them from your browser at any time.</p>
      </Section>
      <Section title="Fair use">
        <p>Use the app for your own serve, or for someone else's with their permission. Do not try to break, copy or resell it.</p>
      </Section>
      {PAYMENTS !== 'off' && (
        <Section title="Plus">
          <p>Plus renews each period until you cancel, at the price the plans page shows before you pay.</p>
          <p>Cancel any time from the plans page. Plus then runs to the end of the period you paid for.</p>
        </Section>
      )}
      <Section title="As it is">
        <p>The app comes as it is, with no promise that it suits your purpose.</p>
        <p>As far as the law allows, liability goes no further than what you paid.</p>
      </Section>
      <Section title="Changes">
        <p>The app and these terms can change. A change that matters to you shows in the app before it applies.</p>
        {SITE.contact && <p>Write to {SITE.contact} with any question about these terms.</p>}
        <p className="info-date">Last changed {POLICY_DATE}.</p>
      </Section>
    </>
  )
}

/* ----------------------------------------------------------------- credits */

const CREDITS: { what: string; who: string; licence: string }[] = [
  { what: 'Pose Landmarker', who: 'Google, MediaPipe', licence: 'Apache License 2.0' },
  { what: 'EfficientDet-Lite0, the racket finder', who: 'Google, MediaPipe', licence: 'Apache License 2.0' },
  { what: 'RTMPose-s, the sharper swing model', who: 'OpenMMLab', licence: 'Apache License 2.0' },
  { what: 'MediaPipe Tasks', who: 'Google', licence: 'Apache License 2.0' },
  { what: 'ONNX Runtime Web', who: 'Microsoft', licence: 'MIT License' },
  { what: 'React', who: 'Meta and contributors', licence: 'MIT License' },
  { what: 'Workbox, for working offline', who: 'Google', licence: 'MIT License' },
  { what: 'Archivo, the typeface', who: 'The Archivo Project Authors', licence: 'SIL Open Font License' },
  { what: 'Icons', who: 'Phosphor', licence: 'MIT License' },
]

function Credits() {
  return (
    <>
      <Section title="The model serve">
        <p className="info-cite">{ATTRIBUTION}</p>
      </Section>
      <Section title="Models and tools">
        <ul className="credit-list">
          {CREDITS.map((c) => (
            <li key={c.what}>
              <strong>{c.what}</strong>
              <span>
                {c.who}, {c.licence}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
