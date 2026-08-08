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
/** Placeholder weight only. It never carries a word that has to be read. */
const FAINT = '#a3a3a3'
const YELLOW = '#ccff00'
/** The coaching voice, and the rule over the drill — same as a diagnostic card. */
const BLUE = '#1d4ed8'

/*
 * The score ramp is two maps, and they are not interchangeable — the same split
 * tokens.css makes, for the same reason. Amber is 2.06:1 on this white, so as a
 * bare rule under a word it is not a faint status channel, it is none at all;
 * boxed in black or sat on its own wash it is the clearest of the four.
 *
 * Red appears in neither. Nothing on this card is an injury.
 */
/** The rung as a FILL — only inside a black frame or on its own wash. */
const STATUS_FILL: Record<string, string> = {
  great: '#0f7a37',
  good: '#0a0a0a',
  fair: '#f59e0b',
  work: '#9a4404',
}

/** The rung where it has to be SEEN on the page: type, or a rule over a word. */
const STATUS_INK: Record<string, string> = {
  great: '#0f7a37',
  good: '#0a0a0a',
  fair: '#8a5200',
  work: '#9a4404',
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
  //
  // One column, flush left, read top to bottom. The score used to sit in a ring
  // with the coaching text alongside it; the app dropped that arrangement for
  // the reason the report hero now gives — a ring puts the number inside a
  // circle about the size of a thumbnail and then shrinks it to fit, and the
  // number is the entire payoff. The card follows the app, not the other way
  // round: it is the only thing anyone else ever sees of this design.
  const textX = PAD
  const textW = W - PAD * 2

  const labelY = PAD + 104 // 'SERVE SCORE' baseline
  const scoreY = labelY + 96 // the numeral's baseline
  const meterY = scoreY + 28 // the meter's top edge
  const meterH = 20
  const meterW = Math.min(textW, 620)

  const kickerY = meterY + meterH + 64 // 'WORK ON THIS NEXT' baseline
  const titleY = kickerY + 48

  ctx.font = sans(400, 20)
  // Flattened: the report marks its key words for the screen, and a canvas has
  // no idea what an asterisk means. A card shared to a coach must not arrive
  // with the markup showing.
  const focusWhy = plain(report.focus.why)
  const focusLines = layoutLines(ctx, focusWhy, textW)
  const focusTop = titleY + 40
  const focusEnd = focusTop + focusLines.length * 30

  const chipY = focusEnd + 16
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

  /* --- score ------------------------------------------------------------ */
  ctx.font = mono(700, 13)
  ctx.fillStyle = MUTED
  ctx.fillText('SERVE SCORE', textX, labelY)

  const scoreText = String(report.overall)
  ctx.font = display(104)
  ctx.fillStyle = BLACK
  ctx.fillText(scoreText, textX, scoreY)
  const scoreW = ctx.measureText(scoreText).width
  ctx.font = display(32)
  ctx.fillStyle = FAINT
  ctx.fillText('/100', textX + scoreW + 12, scoreY)

  // The tier is carried by the meter rather than by tinting the digits: three of
  // the four ramp colours cannot hold 4.5:1 on this ground, and a score you have
  // to squint at is not a celebration. The black frame is what lets the fill be
  // the fill colour — amber has no edge of its own on near-white.
  ctx.fillStyle = LINE
  ctx.fillRect(textX, meterY, meterW, meterH)
  ctx.fillStyle = STATUS_FILL[report.overallStatus] ?? BLACK
  const filled = (meterW * Math.max(0, Math.min(100, report.overall))) / 100
  ctx.fillRect(textX, meterY, filled, meterH)
  ctx.strokeStyle = BLACK
  ctx.lineWidth = 2
  ctx.strokeRect(textX + 1, meterY + 1, meterW - 2, meterH - 2)

  /* --- what this score is a score of ------------------------------------ */
  /*
   * A shared card is read without the app around it, often by a coach who was
   * not there when it was filmed. "65 out of 100" means nothing on its own: the
   * target bands differ by serve type, and how much the numbers can be trusted
   * depends on how the clip was shot. A kick serve judged against kick targets
   * and a flat serve judged against flat ones are not comparable scores, and
   * without saying which is which the card invites exactly that comparison.
   */
  /*
   * `soft` is carried on the chip rather than recovered from its words.
   *
   * This used to ask `label.endsWith('read')`, which worked only while the
   * confidence phrases happened to be "Sharp read" and "Clear read". Renaming
   * them for legibility silently switched the amber tint off — a caveat the
   * card is supposed to carry, lost with nothing failing. Prose is not an
   * identifier.
   */
  const chips: { label: string; soft?: boolean }[] = [
    { label: SERVE_TYPES[report.serveType ?? 'flat']?.label ?? 'Flat / first serve' },
    { label: report.handedness === 'left' ? 'Left-handed' : 'Right-handed' },
    {
      label:
        report.quality.view === 'side'
          ? 'Side view'
          : report.quality.view === 'front-back'
            ? 'Front / back view'
            : 'Angled view',
    },
    {
      label: readQuality(report.quality.confidence),
      soft: report.quality.confidence < SOFT_READ,
    },
  ]

  let chipX = PAD
  ctx.font = mono(400, 15)
  ctx.lineWidth = 2
  for (const { label, soft } of chips) {
    const w = ctx.measureText(label).width + 26
    // Wrap rather than run off the edge: translated or unusually long labels
    // would otherwise silently disappear past the right margin.
    if (chipX + w > W - PAD) break
    // Low confidence is the one of these that changes how the card should be
    // read, so it is the one that gets colour. Amber-deep, not red: a soft read
    // is a caveat on the numbers, not a warning about the player.
    const low = soft === true
    ctx.fillStyle = low ? '#fdf0e3' : SURFACE
    ctx.fillRect(chipX, chipY - 20, w, 34)
    ctx.strokeStyle = low ? STATUS_INK.work : LINE
    ctx.strokeRect(chipX + 1, chipY - 19, w - 2, 32)
    ctx.fillStyle = low ? STATUS_INK.work : MUTED
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
  ctx.fillRect(textX, kickerY - 18, ctx.measureText(kicker).width + 20, 26)
  ctx.fillStyle = BLACK
  ctx.fillText(kicker, textX + 10, kickerY)

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
  ctx.fillText(report.focus.title, textX, titleY)
  ctx.font = sans(400, 20)
  ctx.fillStyle = MUTED
  // The same lines the layout above was measured from, so what is drawn and what
  // was reserved for it cannot disagree.
  drawLines(ctx, focusLines, textX, focusTop, 30)

  /* --- the five areas --------------------------------------------------- */
  const barW = (W - PAD * 2 - 14 * (report.fundamentals.length - 1)) / report.fundamentals.length
  report.fundamentals.forEach((f, i) => {
    const x = PAD + i * (barW + 14)
    ctx.fillStyle = SURFACE
    ctx.fillRect(x, barY, barW, 74)
    // The verdict is the rule across the top, the way it is on a diagnostic
    // card. The number underneath stays black so five of these read as one row
    // of scores rather than as five differently coloured things. The rule takes
    // the -ink rung: it sits on the page with nothing holding its edge.
    ctx.fillStyle = STATUS_INK[f.status] ?? BLACK
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
