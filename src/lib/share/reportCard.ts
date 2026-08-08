import { SERVE_TYPES } from '../analysis/coaching'
import type { Analysis } from '../analysis/types'
import { plain } from '../analysis/voice'
import { SOFT_READ, readQuality } from '../../components/statusLabels'
import type { Session } from '../storage/db'

type Report = Analysis | Session

/*
 * This card is the only thing the app makes that ever leaves the phone, so it
 * is the design at its plainest: a white ground, black display numerals, square
 * everything, borders doing the structural work, and exactly one optic yellow
 * element — the label on the thing to work on next.
 */
const WHITE = '#fafafa'
const BLACK = '#0a0a0a'
const SURFACE = '#f5f5f5'
const LINE = '#e5e5e5'
const MUTED = '#525252'
const YELLOW = '#ccff00'
/** The coaching voice, and the rule over the drill — same as a diagnostic card. */
const BLUE = '#2563eb'

/* The score ramp, four rungs, bottom one amber-deep. Red is the injury flag and
   nothing on this card is an injury, so red does not appear here at all. */
const STATUS_COLOR: Record<string, string> = {
  great: '#16a34a',
  good: '#0a0a0a',
  fair: '#f59e0b',
  work: '#b45309',
}

/* The token stacks, spelled out for canvas — same families, same fallbacks, so a
   shared card is the page it was shared from. */
const DISPLAY = "'Archivo Black', Impact, 'Haettenschweiler', 'Arial Black', sans-serif"
const SANS =
  "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "'Space Mono', ui-monospace, 'Cascadia Mono', 'Courier New', Consolas, monospace"

/** Archivo Black ships one weight; asking for a bolder one only synthesises it. */
const display = (size: number) => `400 ${size}px ${DISPLAY}`
const sans = (weight: number, size: number) => `${weight} ${size}px ${SANS}`
const mono = (weight: number, size: number) => `${weight} ${size}px ${MONO}`

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

  ctx.font = sans(400, 20)
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

  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, W, H)

  // What used to be a soft glow over the header. Hierarchy here comes from a
  // hard rule and from the size of the numerals, not from light.
  ctx.fillStyle = BLACK
  ctx.fillRect(PAD, HEADER - 30, W - PAD * 2, 2)

  /* --- header ---------------------------------------------------------- */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = BLACK
  ctx.fillRect(PAD, PAD + 5, 18, 18)
  ctx.font = display(22)
  ctx.fillStyle = BLACK
  ctx.fillText('Serve Coach', PAD + 32, PAD + 22)

  ctx.font = mono(400, 17)
  ctx.fillStyle = MUTED
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
  const status = STATUS_COLOR[report.overallStatus] ?? BLACK

  ctx.lineWidth = 14
  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = status
  // Butt ends, not round. The ring is a chart, so its geometry stays; the soft
  // cap on it was chrome, and this system has none.
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (report.overall / 100) * Math.PI * 2)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = display(54)
  ctx.fillStyle = BLACK
  ctx.fillText(String(report.overall), cx, cy + 12)
  ctx.font = mono(700, 13)
  ctx.fillStyle = MUTED
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
  ctx.font = mono(400, 15)
  ctx.lineWidth = 2
  for (const label of chips) {
    const w = ctx.measureText(label).width + 26
    // Wrap rather than run off the edge: translated or unusually long labels
    // would otherwise silently disappear past the right margin.
    if (chipX + w > W - PAD) break
    // Low confidence is the one of these that changes how the card should be
    // read, so it is the one that gets colour. Amber-deep, not red: a soft read
    // is a caveat on the numbers, not a warning about the player.
    const low = label.endsWith('read') && report.quality.confidence < SOFT_READ
    ctx.fillStyle = low ? '#fdf0e3' : SURFACE
    ctx.fillRect(chipX, chipY - 20, w, 34)
    ctx.strokeStyle = low ? STATUS_COLOR.work : LINE
    ctx.strokeRect(chipX + 1, chipY - 19, w - 2, 32)
    ctx.fillStyle = low ? STATUS_COLOR.work : MUTED
    ctx.fillText(label, chipX + 13, chipY + 3)
    chipX += w + 8
  }

  /* --- focus ------------------------------------------------------------ */
  // The one yellow thing on the card, on the one thing the card is asking for.
  // Yellow is a fill and never type, so the plate is yellow and the words on it
  // are black — the reverse is invisible.
  const kicker = 'WORK ON THIS NEXT'
  ctx.font = mono(700, 14)
  ctx.fillStyle = YELLOW
  ctx.fillRect(textX, cy - 76, ctx.measureText(kicker).width + 20, 26)
  ctx.fillStyle = BLACK
  ctx.fillText(kicker, textX + 10, cy - 58)

  // Archivo Black is much wider per character than the sans it replaced, and the
  // fault titles are written for a person rather than for a box, so the type
  // steps down until it fits rather than running off the right edge.
  let titleSize = 34
  ctx.font = display(titleSize)
  while (titleSize > 22 && ctx.measureText(report.focus.title).width > textW) {
    titleSize -= 1
    ctx.font = display(titleSize)
  }
  ctx.fillStyle = BLACK
  ctx.fillText(report.focus.title, textX, cy - 16)
  ctx.font = sans(400, 20)
  ctx.fillStyle = MUTED
  // The same lines the layout above was measured from, so what is drawn and what
  // was reserved for it cannot disagree.
  drawLines(ctx, focusLines, textX, cy + 20, 30)

  /* --- the five areas --------------------------------------------------- */
  const barW = (W - PAD * 2 - 14 * (report.fundamentals.length - 1)) / report.fundamentals.length
  report.fundamentals.forEach((f, i) => {
    const x = PAD + i * (barW + 14)
    ctx.fillStyle = SURFACE
    ctx.fillRect(x, barY, barW, 74)
    // The verdict is the rule across the top, the way it is on a diagnostic
    // card. The number underneath stays black so five of these read as one row
    // of scores rather than as five differently coloured things.
    ctx.fillStyle = STATUS_COLOR[f.status] ?? BLACK
    ctx.fillRect(x, barY, barW, 4)

    ctx.fillStyle = BLACK
    ctx.font = display(30)
    ctx.textAlign = 'center'
    ctx.fillText(String(f.score), x + barW / 2, barY + 42)
    ctx.font = mono(400, 12)
    ctx.fillStyle = MUTED
    ctx.fillText(f.label, x + barW / 2, barY + 62)
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
      ctx.beginPath()
      ctx.rect(x, y, cellW, cellH)
      ctx.clip()
      ctx.fillStyle = SURFACE
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

      // A hard frame on every still, drawn inside the cell so the six line up on
      // the same grid whether or not their picture survived.
      ctx.strokeStyle = BLACK
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2)

      ctx.font = mono(700, 14)
      ctx.fillStyle = BLACK
      ctx.fillText(phase.label.toUpperCase(), x, y + cellH + 26)
    })
  }

  /* --- footer ----------------------------------------------------------- */
  const footY = H - 150
  ctx.fillStyle = SURFACE
  ctx.fillRect(PAD, footY, W - PAD * 2, 100)
  // The drill is the coaching voice, so it carries the blue rule a diagnostic
  // card carries — the one place on this card that is not black, white or yellow.
  ctx.fillStyle = BLUE
  ctx.fillRect(PAD, footY, W - PAD * 2, 4)

  ctx.font = display(19)
  ctx.fillStyle = BLACK
  ctx.fillText(report.focus.drill.name, PAD + 26, footY + 40)
  ctx.font = sans(400, 17)
  ctx.fillStyle = MUTED
  wrap(ctx, report.focus.drill.reps, PAD + 26, footY + 68, W - PAD * 2 - 52, 24)

  ctx.font = sans(400, 15)
  ctx.fillStyle = MUTED
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
