/**
 * "Share a session with your coach" (PRODUCT §6.13 item 3, M12; ARCHITECTURE §8.4 coach summary).
 * Built on the phone from stored records, so it works after the video is deleted. Two files the
 * player chooses to send through their own share sheet: a one-page HTML summary (no PDF library, no
 * external fonts or images) and a JSON copy of the same content. Nothing is sent by the app (D8).
 *
 * Honesty (D2, D7): every stat carries its data-state word and n; experimental values are never
 * included (they stay out of the story); unavailable values are left out rather than shown as a dash.
 * No pain or comfort data, no notes and no name are included.
 */
import type { MetricId, MetricValue } from '../../../analysis/types.ts'
import type { CoachingDecision, SessionStats } from '../../../data/domain.ts'
import type { SessionRecord } from '../../../data/records.ts'
import { metricName } from '../../copy/metricNames.ts'
import { STATUS_LABEL, UI } from '../../copy/strings.ts'
import { exportDate, shortDate } from '../../format/dates.ts'
import { formatMetric } from '../../format/metricFormat.ts'

/** Preferred order after the focus evidence (hero metrics first, D5; outcomes last, D3). */
const STAT_ORDER: readonly MetricId[] = [
  'toss-height-spread',
  'toss-forward-spread',
  'toss-drop',
  'contact-height-ratio',
  'rhythm-release-to-contact',
  'rhythm-spread',
  'leg-drive',
  'landing-distance',
  'first-serve-in-rate',
  'serve-in-rate',
  'second-serve-in-rate',
  'double-faults',
]
export const MAX_STATS = 5

export interface CoachStat {
  metricId: MetricId
  name: string
  /** Display text from the one formatter ("≈ 11 cm", "8 of 12 in"). */
  text: string
  status: MetricValue['status']
  statusLabel: string
  nLine?: string
  detail?: string
  earlyRead: boolean
  value: MetricValue
}

/** 3 to 5 stats: the focus evidence first, then the hero metrics; never experimental or unavailable. */
export function pickStats(stats: SessionStats | null | undefined, decision: CoachingDecision | null | undefined): CoachStat[] {
  if (!stats) return []
  const ids = [...(decision?.evidence?.metricIds ?? []), ...STAT_ORDER]
  const seen = new Set<MetricId>()
  const out: CoachStat[] = []
  for (const id of ids) {
    if (seen.has(id) || out.length >= MAX_STATS) continue
    seen.add(id)
    const v = stats.metrics[id]
    if (!v?.status || v.status === 'experimental' || v.status === 'unavailable') continue
    const f = formatMetric(id, v)
    out.push({
      metricId: id,
      name: metricName(id),
      text: f.percent ? `${f.text} ${f.percent}` : f.text,
      status: v.status,
      statusLabel: STATUS_LABEL[v.status],
      nLine: f.nLine,
      detail: f.detail,
      earlyRead: v.provisional === true,
      value: v,
    })
  }
  return out
}

export interface CoachSummary {
  title: string
  fileBase: string
  html: string
  json: string
}

export interface CoachSummaryInput {
  session: SessionRecord
  stats: SessionStats | null | undefined
  decision: CoachingDecision | null | undefined
  now?: Date
}

const VIEW_WORDS = { side: 'Side view', rear: 'View from behind' } as const

function viewWords(view: string): string {
  return (VIEW_WORDS as Record<string, string>)[view] ?? 'Side view'
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function servesLine(stats: SessionStats | null | undefined): string | null {
  const v = stats?.metrics['serve-count']
  if (!v || v.status === 'unavailable' || typeof v.value !== 'number') return null
  return v.nEligible !== undefined ? `${v.value} serves, ${v.nEligible} analysed` : `${v.value} serves`
}

export function buildCoachSummary({ session, stats, decision, now = new Date() }: CoachSummaryInput): CoachSummary {
  const date = shortDate(session.visitId)
  const title = `Serve summary, ${date}`
  const picked = pickStats(stats, decision)
  const sample = session.isDemo === 1
  const serves = servesLine(stats)
  const paused = decision?.gate === 'pain-referral'
  // Coaching content is left out when coaching was paused by a body check (the reason stays private).
  const focus = paused ? undefined : decision?.focus
  const cue = paused ? undefined : decision?.cue
  const drill = paused ? undefined : decision?.drill

  const data = {
    format: 'serve-coach-coach-summary',
    version: 1,
    createdAt: now.toISOString(),
    sample,
    session: { date: session.visitId, view: session.view, cameraSide: session.cameraSide ?? null, serves },
    headline: stats?.headline ?? null,
    focus: focus ? { title: focus.title, evidenceTier: focus.evidenceTier, why: focus.whyChosen } : null,
    cue: cue?.text ?? null,
    drill: drill ? { title: drill.title, minutes: drill.minutes, steps: drill.steps } : null,
    stats: picked.map((s) => ({
      metricId: s.metricId,
      name: s.name,
      display: s.text,
      status: s.status,
      value: s.value.value,
      unit: s.value.unit,
      n: s.value.n ?? null,
      nEligible: s.value.nEligible ?? null,
      low: s.value.uncertainty?.low ?? null,
      high: s.value.uncertainty?.high ?? null,
      earlyRead: s.earlyRead,
    })),
    validation: UI.validationFooter,
    notIncluded: 'No video, no pain or comfort answers, no notes and no name.',
  }

  const e = escapeHtml
  const rows = picked
    .map(
      (s) => `<tr><th scope="row">${e(s.name)}</th><td><strong>${e(s.text)}</strong>${s.detail ? `<br><span class="muted">${e(s.detail)}</span>` : ''}</td><td><span class="chip">${e(s.statusLabel)}</span>${s.earlyRead ? ' <span class="chip">Early read</span>' : ''}${s.nLine ? `<br><span class="muted">${e(s.nLine)}</span>` : ''}</td></tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #ffffff; color: #15201b; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 4px; }
  h2 { font-size: 15px; color: #56615b; margin: 28px 0 8px; font-weight: 600; }
  p { margin: 0 0 8px; }
  .muted { color: #56615b; font-size: 14px; }
  .banner { background: #eef1ec; border-radius: 10px; padding: 8px 12px; font-size: 14px; margin-bottom: 16px; }
  .cue { font-size: 20px; font-weight: 600; margin: 4px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 10px 8px 10px 0; border-top: 1px solid #d9ded8; font-size: 15px; }
  th { font-weight: 600; width: 38%; }
  .chip { display: inline-block; border: 1px solid #9aa39d; border-radius: 999px; padding: 0 8px; font-size: 13px; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d9ded8; }
  @media print { main { padding: 0; } }
</style>
</head>
<body>
<main>
${sample ? '<p class="banner">Sample data · synthetic player. Real engine output on computer-generated video, not a real serve.</p>' : ''}
<h1>${e(title)}</h1>
<p class="muted">${e([viewWords(session.view), serves, exportDate(session.visitId)].filter(Boolean).join(' · '))}</p>
${stats?.headline ? `<h2>Headline</h2><p>${e(stats.headline)}</p>` : ''}
${focus ? `<h2>Focus</h2><p><strong>${e(focus.title)}</strong></p><p class="muted">${e(focus.whyChosen)}</p>` : ''}
${cue ? `<h2>Cue</h2><p class="cue">“${e(cue.text)}”</p>` : ''}
${drill ? `<h2>Drill</h2><p><strong>${e(drill.title)}</strong>, about ${e(String(drill.minutes))} minutes</p><ol>${drill.steps.map((s) => `<li>${e(s)}</li>`).join('')}</ol>` : ''}
${picked.length ? `<h2>Stats</h2><table><tbody>${rows}</tbody></table><p class="muted">Measured: worked out directly from the video. Estimate: worked out from the video and the player's height, so it has a margin of error. You logged: entered by the player.</p>` : '<h2>Stats</h2><p class="muted">No stats could be measured in this session.</p>'}
<footer>
<p class="muted">${e(UI.validationFooter)}</p>
<p class="muted">Made with Serve Coach on ${e(exportDate(now))}. Not included: video, pain or comfort answers, notes and names.</p>
</footer>
</main>
</body>
</html>
`
  const fileBase = `serve-summary-${session.visitId}`
  return { title, fileBase, html, json: JSON.stringify(data, null, 2) }
}
