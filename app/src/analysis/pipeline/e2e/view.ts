/**
 * Dev-only view for the pipeline end-to-end page (pipeline-e2e.html). Plain DOM, no framework, so
 * it runs without the app shell. It mirrors the Processing screen's four rows (DESIGN §8.18) and
 * then lists what the run stored. Honesty rules still hold: every number is shown with its status
 * word (never alone), unavailable values show their reason, experimental values are hidden unless
 * the page was opened with ?experimental=1.
 */
import { metricName } from '../../../ui/copy/metricNames.ts'
import { REAR_ONLY_METRIC_IDS, SIDE_ONLY_METRIC_IDS, type CameraView, type KeyFrameEvent, type MetricValue } from '../../types.ts'
import type { PipelineProgress, PipelineTimings } from '../types.ts'

/** Key-frame captions from the player glossary (DESIGN §8.9). */
export const EVENT_CAPTION: Record<KeyFrameEvent, string> = {
  setup: 'Setup',
  release: 'Release',
  apex: 'Peak',
  trophy: 'Top of swing',
  lowestHip: 'Lowest point',
  contact: 'Contact',
  landing: 'Landing',
  recovery: 'Recovery',
}

const STATUS_ORDER: Record<MetricValue['status'], number> = { measured: 0, estimated: 1, 'player-entered': 2, experimental: 3, unavailable: 4 }

/**
 * Metrics a screen may show for this view (D1: views never mix, so a side-view session never lists
 * rear-only metrics, not even as unavailable), experimental ones only with the toggle, values first.
 */
export function visibleMetrics(metrics: readonly MetricValue[], view: CameraView, showExperimental: boolean): MetricValue[] {
  const hidden = new Set<string>(view === 'rear' ? SIDE_ONLY_METRIC_IDS : REAR_ONLY_METRIC_IDS)
  return metrics
    .filter((m) => !hidden.has(m.id) && (m.status !== 'experimental' || showExperimental))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
}

export const ROWS = [
  { id: 'find', label: 'Finding serves', span: [0, 0.32] },
  { id: 'toss', label: 'Tracking the toss', span: [0.32, 0.92] },
  { id: 'time', label: 'Timing each phase', span: [0.92, 0.96] },
  { id: 'focus', label: 'Choosing your focus', span: [0.96, 1] },
] as const

const STATUS_WORD: Record<MetricValue['status'], string> = {
  measured: 'Measured',
  estimated: 'Estimate',
  'player-entered': 'You logged',
  experimental: 'Experimental',
  unavailable: 'Not available',
}

export interface ServeSummary {
  index: number
  included: boolean
  metrics: MetricValue[]
  thumbs: { event: KeyFrameEvent; url: string }[]
}

export interface ViewState {
  clipLabel: string
  status: 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
  view: CameraView
  progress?: PipelineProgress
  error?: { code: string; message: string }
  showExperimental: boolean
  summary?: {
    servesFound: number
    servesIncluded: number
    keyFrames: number
    coaching: string
    warnings: string[]
    serves: ServeSummary[]
    timings: PipelineTimings
    baseline?: { label: string; poseS: number; ballS: number; totalS: number; frames: number }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  Object.assign(node, props)
  for (const child of children) node.append(child)
  return node
}

/** Which row is active, from the overall fraction (the same spans as ui/screens/record/flow/stages.ts). */
export function activeRowFor(p: PipelineProgress | undefined, status: ViewState['status']): number {
  if (status === 'done') return ROWS.length
  if (!p) return 0
  for (let i = ROWS.length - 1; i >= 0; i--) if (p.overall >= ROWS[i].span[0] && (p.overall < ROWS[i].span[1] || i === ROWS.length - 1)) return i
  return 0
}

export function etaWords(p: PipelineProgress | undefined): string {
  if (!p || p.etaS === undefined) return 'Working out how long this takes…'
  if (p.etaS < 60) return 'Less than a minute left.'
  const minutes = Math.round(p.etaS / 60)
  return `About ${minutes} minute${minutes === 1 ? '' : 's'} left.`
}

const sig3 = new Intl.NumberFormat('en-AU', { maximumSignificantDigits: 3 })
const whole = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })
const tenths = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 })
/** Range ends no more precise than the value itself: whole numbers from 10 up, tenths below. */
const rangeEnd = (v: number, ref: number) => (Math.abs(ref) >= 10 ? whole : tenths).format(v)
const oneDecimal = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const twoDecimals = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Metric text: always the value WITH its status word, the reason when unavailable. Engine rounding (`display`) wins. */
export function metricText(m: MetricValue): { value: string; status: string } {
  const status = STATUS_WORD[m.status]
  if (m.status === 'unavailable' || m.value === null || m.value === undefined) {
    return { value: m.unavailableReason ?? m.reasonCode ?? 'Not available', status }
  }
  const unit = m.unit ? ` ${m.unit}` : ''
  let value = m.display ?? (typeof m.value === 'number' ? `${sig3.format(m.value)}${unit}` : `${m.value}${unit}`)
  if (m.status === 'estimated' && !value.startsWith('≈')) value = `≈ ${value}`
  if (m.uncertainty && m.status !== 'experimental') {
    const ref = typeof m.value === 'number' ? m.value : Math.max(Math.abs(m.uncertainty.low), Math.abs(m.uncertainty.high))
    value += ` (range ${rangeEnd(m.uncertainty.low, ref)} to ${rangeEnd(m.uncertainty.high, ref)})`
  }
  if (m.n !== undefined) value += `, n = ${m.n}`
  return { value, status }
}

const seconds = (ms: number) => oneDecimal.format(ms / 1000)

export function renderView(root: HTMLElement, state: ViewState, handlers: { onCancel?: () => void } = {}): void {
  root.replaceChildren()
  root.append(el('h1', { textContent: 'Pipeline end-to-end' }), el('p', { className: 'sub', textContent: state.clipLabel, translate: false }))

  const active = activeRowFor(state.progress, state.status)
  const card = el('section', { className: 'card' })
  card.setAttribute('aria-label', 'Analysis progress')
  const list = el('ol', { className: 'rows' })
  ROWS.forEach((row, i) => {
    const rowState = state.status === 'done' || i < active ? 'done' : i === active ? (state.status === 'failed' ? 'failed' : state.status === 'cancelled' ? 'paused' : 'active') : 'waiting'
    const item = el('li', { className: `row row-${rowState}` })
    item.dataset.state = rowState
    const [a, b] = row.span
    const fraction = rowState === 'done' ? 1 : rowState === 'waiting' || !state.progress ? 0 : Math.min(1, Math.max(0, (state.progress.overall - a) / (b - a)))
    const detail = rowState === 'active' && state.progress ? (/\(([^)]+)\)/.exec(state.progress.label)?.[1] ?? '') : rowState === 'done' ? 'Done' : ''
    const mark = el('span', { className: 'mark', textContent: String(i + 1) })
    mark.setAttribute('aria-hidden', 'true')
    const bar = el('div', { className: 'bar' })
    bar.setAttribute('role', 'progressbar')
    bar.setAttribute('aria-label', row.label)
    bar.setAttribute('aria-valuemin', '0')
    bar.setAttribute('aria-valuemax', '100')
    bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)))
    const fill = el('div', { className: 'fill' })
    fill.style.transform = `scaleX(${fraction})`
    bar.append(fill)
    item.append(mark, el('div', { className: 'row-body' }, [el('span', { className: 'row-label', textContent: row.label }), el('span', { className: 'row-detail', textContent: detail }), bar]))
    list.append(item)
  })
  card.append(list)
  const live = el('p', { className: 'live' })
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  live.textContent =
    state.status === 'running'
      ? `${state.progress ? `${state.progress.label}.` : 'Starting…'} ${etaWords(state.progress)}`
      : state.status === 'done'
        ? 'Analysis finished and saved.'
        : state.status === 'failed'
          ? (state.error?.message ?? 'Analysis failed.')
          : state.status === 'cancelled'
            ? 'Analysis stopped. Nothing from this run was saved.'
            : 'Ready.'
  card.append(live)
  if (state.status === 'running' && handlers.onCancel) {
    const cancel = el('button', { type: 'button', className: 'secondary', textContent: 'Stop analysis' })
    cancel.addEventListener('click', handlers.onCancel)
    card.append(cancel)
  }
  root.append(card)

  const s = state.summary
  if (!s) return
  const facts = el('section', { className: 'card' })
  facts.setAttribute('aria-label', 'What was stored')
  facts.append(
    el('h2', { textContent: 'Stored' }),
    el('dl', { className: 'facts' }, [
      el('dt', { textContent: 'Serves found' }),
      el('dd', { textContent: `${s.servesFound} (${s.servesIncluded} counted in stats)` }),
      el('dt', { textContent: 'Key frames' }),
      el('dd', { textContent: String(s.keyFrames) }),
      el('dt', { textContent: 'Coaching' }),
      el('dd', { textContent: s.coaching }),
    ]),
  )
  if (s.warnings.length) facts.append(el('ul', { className: 'warnings' }, s.warnings.map((w) => el('li', { textContent: w }))))
  root.append(facts)

  const t = s.timings
  const timing = el('section', { className: 'card' })
  timing.setAttribute('aria-label', 'Processing time by stage')
  const rows: [string, string, string][] = [
    ['Probe', seconds(t.probeMs), 'None'],
    ['Model start-up', seconds(t.poseInitMs), s.baseline ? '≈1.2' : 'None'],
    ['Finding serves (sparse pose)', seconds(t.sparseMs), 'None'],
    ['Tracking (pose and ball in parallel)', seconds(t.denseMs), s.baseline ? `${oneDecimal.format(s.baseline.poseS + s.baseline.ballS)} (in series)` : 'None'],
    ['  of which pose busy', seconds(t.densePoseMs), s.baseline ? oneDecimal.format(s.baseline.poseS) : 'None'],
    ['  of which ball busy (worker)', seconds(t.denseBallMs), s.baseline ? oneDecimal.format(s.baseline.ballS) : 'None'],
    [`    readback (crop ×${twoDecimals.format(t.ballCropScale)})`, seconds(t.ballReadbackMs), 'None'],
    ['Measuring', seconds(t.measureMs), 'None'],
    ['Key frames', seconds(t.keyFramesMs), 'None'],
    ['Saving', seconds(t.saveMs), 'None'],
    ['Total', seconds(t.totalMs), s.baseline ? oneDecimal.format(s.baseline.totalS) : 'None'],
  ]
  const table = el('table', { className: 'timings' })
  table.append(
    el('caption', { textContent: s.baseline ? `Seconds, against the smoke run (${s.baseline.label})` : 'Seconds' }),
    el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', textContent: 'Stage' }), el('th', { scope: 'col', textContent: 'This run' }), el('th', { scope: 'col', textContent: 'Smoke' })])]),
    el('tbody', {}, rows.map(([a, b, c]) => el('tr', {}, [el('th', { scope: 'row', textContent: a }), el('td', { textContent: b }), el('td', { textContent: c })]))),
  )
  timing.append(el('h2', { textContent: 'Time' }), table)
  root.append(timing)

  for (const serve of s.serves) {
    const section = el('section', { className: 'card serve' })
    section.setAttribute('aria-label', `Serve ${serve.index}`)
    section.append(el('h2', { textContent: `Serve ${serve.index}${serve.included ? '' : ' (not counted)'}` }))
    if (serve.thumbs.length) {
      const strip = el('ul', { className: 'strip' })
      for (const thumb of serve.thumbs) {
        const caption = EVENT_CAPTION[thumb.event] ?? thumb.event
        const img = el('img', { src: thumb.url, alt: `Serve ${serve.index}, ${caption}`, loading: 'lazy', decoding: 'async' })
        img.width = 50
        img.height = 88
        strip.append(el('li', {}, [img, el('span', { textContent: caption })]))
      }
      section.append(strip)
    }
    const dl = el('dl', { className: 'metrics' })
    for (const m of visibleMetrics(serve.metrics, state.view, state.showExperimental)) {
      const { value, status } = metricText(m)
      const dd = el('dd', {}, [el('span', { className: 'value', textContent: value }), el('span', { className: `chip chip-${m.status}`, textContent: status })])
      dd.dataset.metric = m.id
      dd.dataset.status = m.status
      dl.append(el('dt', { textContent: metricName(m.id) }), dd)
    }
    section.append(dl)
    root.append(section)
  }
}
