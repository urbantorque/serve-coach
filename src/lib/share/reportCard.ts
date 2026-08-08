import { SERVE_TYPES } from '../analysis/coaching'
import type { Analysis } from '../analysis/types'
import { plain } from '../analysis/voice'
import { SOFT_READ, readQuality } from '../../components/statusLabels'
import type { Session } from '../storage/db'

type Report = Analysis | Session

const INK = '#0a0c10'
const INK_2 = '#141822'
const FG = '#eef2f6'
const MUTED = '#98a2b3'
const FAINT = '#616b7d'
const LIME = '#cdf94a'

const STATUS_COLOR: Record<string, string> = {
  great: '#5fe3a1',
  good: '#cdf94a',
  fair: '#ffb648',
  work: '#ff7a6b',
}

const font = (weight: number, size: number) =>
  `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Break text into lines that fit, without drawing any of them.
 *
 * Separate from the drawing so the card's layout can be computed before the
 * canvas is sized. The coaching copy is written for a person rather than for a
 * fixed box — the longest `fix` string runs to four lines where most run to two —
 * so anything positioned below it has to be placed from its measured height. The
 * alternative is a card that looks right for most faults and overlaps for one.
 *
 * Depends on the current `ctx.font`, so set it before calling.
 */
function layoutLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Draw pre-measured lines, returning the y position after the last one. */
function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
): number {
  let cursor = y
  for (const line of lines) {
    ctx.fillText(line, x, cursor)
    cursor += lineHeight
  }
  return cursor
}

/** Measure and draw in one go, for text nothing is positioned beneath. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  return drawLines(ctx, layoutLines(ctx, text, maxWidth), x, y, lineHeight)
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(undefined)
    img.src = src
  })

/**
 * Draw the report as a single shareable image.
 *
 * Everything a coach needs to react to without the app: the score, the one
 * thing to work on, the five areas, and the keyframes with the tracking drawn
 * on. The video itself is never stored and never leaves the device, so these
 * stills are what there is to show — which is also why they carry the skeleton.
 */
export async function renderReportCard(report: Report): Promise<Blob | undefined> {
  const W = 1080
  const PAD = 64
  const stills = report.phases.filter((p) => p.thumbnail)

  // Lay the keyframes out three across; height follows from what is available.
  const cols = 3
  const rows = stills.length ? Math.ceil(stills.length / cols) : 0
  const cellW = (W - PAD * 2 - 16 * (cols - 1)) / cols
  const cellH = cellW * 1.25
  const stripH = rows ? rows * (cellH + 44) + 30 : 0

  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  /* --- layout ----------------------------------------------------------- */
  // Everything below the focus paragraph is placed from its measured height, so
  // a long coaching line pushes the card taller instead of running into what
  // comes next. Measured before the canvas is sized because the card's height is
  // one of the things it decides.
  const cy = 250
  const ringR = 78
  const textX = PAD + 210
  const textW = W - textX - PAD

  ctx.font = font(400, 20)
  // Flattened: the report marks its key words for the screen, and a canvas has
  // no idea what an asterisk means. A card shared to a coach must not arrive
  // with the markup showing.
  const focusWhy = plain(report.focus.why)
  const focusLines = layoutLines(ctx, focusWhy, textW)
  const focusEnd = cy + 20 + focusLines.length * 30

  // Clear both the paragraph and the bottom of the score ring: on a short fault
  // the ring is the taller of the two.
  const chipY = Math.max(focusEnd + 22, cy + ringR + 40)
  const barY = chipY + 48
  const HEADER = barY + 74 + 36

  const H = HEADER + stripH + 260
  canvas.height = H

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W / 2, -140, 40, W / 2, -140, 760)
  glow.addColorStop(0, 'rgba(205,249,74,0.16)')
  glow.addColorStop(1, 'rgba(205,249,74,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, HEADER)

  /* --- header ---------------------------------------------------------- */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(PAD + 9, PAD + 14, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = font(640, 24)
  ctx.fillStyle = FG
  ctx.fillText('Serve Coach', PAD + 30, PAD + 22)

  ctx.font = font(500, 20)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'right'
  ctx.fillText(
    new Date(report.createdAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    W - PAD,
    PAD + 22,
  )
  ctx.textAlign = 'left'

  /* --- score ring ------------------------------------------------------- */
  const cx = PAD + 92
  const r = ringR
  const status = STATUS_COLOR[report.overallStatus] ?? LIME

  ctx.lineWidth = 14
  ctx.strokeStyle = '#1b2130'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = status
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (report.overall / 100) * Math.PI * 2)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = font(680, 54)
  ctx.fillStyle = FG
  ctx.fillText(String(report.overall), cx, cy + 12)
  ctx.font = font(600, 14)
  ctx.fillStyle = FAINT
  ctx.fillText('OVERALL', cx, cy + 38)
  ctx.textAlign = 'left'

  /* --- what this score is a score of ------------------------------------ */
  /*
   * A shared card is read without the app around it, often by a coach who was
   * not there when it was filmed. "65 out of 100" means nothing on its own: the
   * target bands differ by serve type, and how much the numbers can be trusted
   * depends on how the clip was shot. A kick serve judged against kick targets
   * and a flat serve judged against flat ones are not comparable scores, and
   * without saying which is which the card invites exactly that comparison.
   */
  const chips: string[] = [
    SERVE_TYPES[report.serveType ?? 'flat']?.label ?? 'Flat / first serve',
    report.handedness === 'left' ? 'Left-handed' : 'Right-handed',
    report.quality.view === 'side'
      ? 'Side view'
      : report.quality.view === 'front-back'
        ? 'Front / back view'
        : 'Angled view',
    readQuality(report.quality.confidence),
  ]

  let chipX = PAD
  ctx.font = font(560, 17)
  for (const label of chips) {
    const w = ctx.measureText(label).width + 26
    // Wrap rather than run off the edge: translated or unusually long labels
    // would otherwise silently disappear past the right margin.
    if (chipX + w > W - PAD) break
    ctx.fillStyle = INK_2
    roundRect(ctx, chipX, chipY - 20, w, 34, 17)
    ctx.fill()
    // Low confidence is the one of these that changes how the card should be
    // read, so it is the one that gets colour.
    const low = label.endsWith('read') && report.quality.confidence < SOFT_READ
    ctx.fillStyle = low ? STATUS_COLOR.fair : MUTED
    ctx.fillText(label, chipX + 13, chipY + 3)
    chipX += w + 8
  }

  /* --- focus ------------------------------------------------------------ */
  ctx.font = font(700, 16)
  ctx.fillStyle = LIME
  ctx.fillText('WORK ON THIS NEXT', textX, cy - 58)
  ctx.font = font(640, 34)
  ctx.fillStyle = FG
  ctx.fillText(report.focus.title, textX, cy - 16)
  ctx.font = font(400, 20)
  ctx.fillStyle = MUTED
  // The same lines the layout above was measured from, so what is drawn and what
  // was reserved for it cannot disagree.
  drawLines(ctx, focusLines, textX, cy + 20, 30)

  /* --- the five areas --------------------------------------------------- */
  const barW = (W - PAD * 2 - 14 * (report.fundamentals.length - 1)) / report.fundamentals.length
  report.fundamentals.forEach((f, i) => {
    const x = PAD + i * (barW + 14)
    ctx.fillStyle = INK_2
    roundRect(ctx, x, barY, barW, 74, 14)
    ctx.fill()

    ctx.fillStyle = STATUS_COLOR[f.status] ?? LIME
    ctx.font = font(660, 30)
    ctx.textAlign = 'center'
    ctx.fillText(String(f.score), x + barW / 2, barY + 38)
    ctx.font = font(500, 15)
    ctx.fillStyle = FAINT
    ctx.fillText(f.label, x + barW / 2, barY + 60)
    ctx.textAlign = 'left'
  })

  /* --- keyframes -------------------------------------------------------- */
  if (rows) {
    const top = HEADER
    const images = await Promise.all(stills.map((p) => loadImage(p.thumbnail!)))
    stills.forEach((phase, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = PAD + col * (cellW + 16)
      const y = top + row * (cellH + 44)

      ctx.save()
      roundRect(ctx, x, y, cellW, cellH, 16)
      ctx.clip()
      ctx.fillStyle = INK_2
      ctx.fillRect(x, y, cellW, cellH)
      const img = images[i]
      if (img) {
        // cover, so the still fills the cell without distorting
        const s = Math.max(cellW / img.width, cellH / img.height)
        const dw = img.width * s
        const dh = img.height * s
        ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh)
      }
      ctx.restore()

      ctx.font = font(620, 18)
      ctx.fillStyle = FG
      ctx.fillText(phase.label, x, y + cellH + 26)
    })
  }

  /* --- footer ----------------------------------------------------------- */
  const footY = H - 150
  ctx.fillStyle = INK_2
  roundRect(ctx, PAD, footY, W - PAD * 2, 100, 18)
  ctx.fill()

  ctx.font = font(620, 19)
  ctx.fillStyle = FG
  ctx.fillText(report.focus.drill.name, PAD + 26, footY + 36)
  ctx.font = font(400, 17)
  ctx.fillStyle = MUTED
  wrap(ctx, report.focus.drill.reps, PAD + 26, footY + 64, W - PAD * 2 - 52, 24)

  ctx.font = font(400, 15)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'center'
  ctx.fillText('Measured on device · nothing was uploaded', W / 2, H - 22)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

/**
 * Hand the card to the OS share sheet where there is one, otherwise download it.
 * Both paths are local; nothing is sent anywhere by the app itself.
 */
export async function shareReportCard(report: Report): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await renderReportCard(report)
  if (!blob) return 'failed'

  // Local date, matching the one drawn on the card face — toISOString is UTC,
  // and an evening serve west of Greenwich would be named for tomorrow.
  const d = new Date(report.createdAt)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const name = `serve-${stamp}.png`
  const file = new File([blob], name, { type: 'image/png' })

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string }) => Promise<void>
  }

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'My serve' })
      return 'shared'
    } catch {
      // Dismissing the share sheet lands here; fall through to a download
      // rather than leaving the button looking broken.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
