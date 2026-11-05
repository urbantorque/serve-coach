/**
 * A report a coach can open (M3.2).
 *
 * One self-contained HTML file: the serve's keyframe stills with the tracked
 * body drawn on, the faults in the order the plan ranks them, each with its
 * drill, and every measurement beside the band it was held to. No script, and
 * no reference that leaves the file — the stills are data URIs, the styles are
 * inline — so it opens offline on any device, and it reaches a coach only if
 * the player sends it.
 *
 * Pure: the caller draws the stills and hands them over as data URIs.
 */
import type { Analysis } from '../analysis/types'

export interface CoachStill {
  label: string
  /** A `data:image/png;base64,` URI, drawn by the caller. */
  src: string
}

export interface CoachPlanItem {
  title: string
  why: string
  drill: { name: string; how: string; reps: string }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Bold markers in coaching copy, as text: a coach reads the words, not the emphasis. */
const plain = (s: string): string => s.replace(/\*\*/g, '')

export function coachReportHtml(
  analysis: Pick<Analysis, 'createdAt' | 'overall' | 'handedness' | 'serveType' | 'fundamentals'>,
  plan: readonly CoachPlanItem[],
  stills: readonly CoachStill[],
): string {
  const when = new Date(analysis.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const safeStills = stills.filter((s) => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.src))
  const rows = analysis.fundamentals
    .flatMap((f) => f.metrics.map((m) => ({ area: f.label, m })))
    .map(
      ({ area, m }) =>
        `<tr><td>${esc(area)}</td><td>${esc(m.label)}</td><td>${esc(m.display)}</td><td>${esc(m.target)}</td><td>${esc(m.status)}</td></tr>`,
    )
    .join('')
  const faults = plan
    .map(
      (p, i) =>
        `<li><h3>${i + 1}. ${esc(plain(p.title))}</h3><p>${esc(plain(p.why))}</p>` +
        `<p class="drill"><strong>${esc(p.drill.name)}</strong>: ${esc(p.drill.how)} <em>${esc(p.drill.reps)}</em></p></li>`,
    )
    .join('')
  const pics = safeStills.map((s) => `<figure><img src="${s.src}" alt="${esc(s.label)}, as the tracked body"><figcaption>${esc(s.label)}</figcaption></figure>`).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Serve report, ${esc(when)}</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0 auto;max-width:760px;padding:24px 16px;color:#111;background:#fff}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}h3{font-size:15px;margin:0 0 4px}
.meta{color:#555;margin:0 0 16px}ol{padding-left:0;list-style:none}li{margin:0 0 14px}.drill{color:#333}
.stills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}figure{margin:0}img{width:100%;background:#0f1218;border-radius:6px}
figcaption{font-size:12px;color:#555}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:6px 4px;border-bottom:1px solid #ddd}
.foot{color:#777;font-size:12px;margin-top:24px}
</style>
</head>
<body>
<h1>Serve report</h1>
<p class="meta">${esc(when)} · ${esc(analysis.handedness)}-handed · ${esc(analysis.serveType)} serve · overall ${Math.round(analysis.overall)}</p>
<h2>What to work on, in order</h2>
<ol>${faults || '<li>Nothing stood out on this serve.</li>'}</ol>
${pics ? `<h2>Six moments, as the tracked body</h2><div class="stills">${pics}</div>` : ''}
<h2>Every measurement, against its band</h2>
<table><thead><tr><th>Area</th><th>Measurement</th><th>Reading</th><th>Band</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table>
<p class="foot">Measured on the player's phone by Serve Coach from one filmed serve. The video was not sent; this page holds no script and loads nothing.</p>
</body>
</html>
`
}
