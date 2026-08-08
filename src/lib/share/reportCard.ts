import { SERVE_TYPES } from '../analysis/coaching'
import type { Analysis } from '../analysis/types'
import { plain } from '../analysis/voice'
import { SOFT_READ, STATUS_LABEL, readQuality } from '../../components/statusLabels'
import type { Session } from '../storage/db'

type Report = Analysis | Session

/*
 * This card is the only thing the app makes that ever leaves the phone, and it
 * is therefore the design at its purest rather than at its loudest: warm paper,
 * one large serif numeral, hairlines doing every piece of structural work, very
 * large margins, and exactly one olive element — the mark on the thing to work
 * on next.
 *
 * It should read like the cover of a quiet book about one player's serve. If it
 * ever starts to look like a scoreboard, the card has drifted from the app.
 */
const PAPER = '#fafaf9'
const INK = '#1c1917'
const SURFACE = '#f5f5f4'
/** A rule between passages. Decoration — never the only edge of anything. */
const HAIRLINE = '#e7e5e4'
/** The edge of a resting frame, where a picture has to be told from the paper. */
const LINE = '#d6d3d1'
const MUTED = '#57534e'
/** Placeholder weight only. It never carries a word that has to be read. */
const FAINT = '#a8a29e'
const OLIVE = '#4d7c0f'
const OLIVE_INK = '#3f6212'

/*
 * The score ramp is two maps, and they are not interchangeable — the same split
 * tokens.css makes, for the same reason. Amber is 2.1:1 on this paper, so as
 * type it is not a faint status channel, it is none at all; as a filled bar
 * against its own track it is the clearest of the four.
 *
 * Red appears in neither. Nothing on this card is an injury.
 */
/** The rung as a FILL — a meter bar, sitting on its own track. */
const STATUS_FILL: Record<string, string> = {
  great: '#4d7c0f',
  good: '#57534e',
  fair: '#ca8a04',
  work: '#a16207',
}

/** The rung where it has to be READ: a word set on the paper. */
const STATUS_INK: Record<string, string> = {
  great: '#3f6212',
  good: '#1c1917',
  fair: '#854d0e',
  work: '#854d0e',
}

/* The token stacks, spelled out for canvas — same families, same fallbacks, so a
   shared card is the page it was shared from. */
const DISPLAY = "'Libre Baskerville', Georgia, 'Times New Roman', serif"
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "'Source Code Pro', ui-monospace, 'Fira Code', Consolas, monospace"

/** Libre Baskerville ships 400 and 700, and the system allows no third weight. */
const display = (weight: 400 | 700, size: number) => `${weight} ${size}px ${DISPLAY}`
const sans = (weight: number, size: number) => `${weight} ${size}px ${SANS}`
const mono = (weight: number, size: number) => `${weight} ${size}px ${MONO}`

/**
 * An overline, tracked out by hand.
 *
 * `ctx.letterSpacing` is too recent to rely on — a phone a couple of iOS
 * versions back ignores it silently, and an untracked 11px uppercase run is
 * exactly the cramped, cheap-looking thing this system is trying not to be. So
 * the tracking is applied per character. This runs a handful of times for one
 * still image, not in a loop, so the cost is irrelevant.
 *
 * The size is passed rather than read back off `ctx.font`, which normalises to
 * "<weight> <size>px <family>" — parsing a number out of the front of that gets
 * you the weight.
 *
 * Returns the width drawn, for anything that has to sit after it.
 */
function overline(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
): number {
  const tracking = 0.08 * size
  let cursor = x
  for (const ch of text) {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + tracking
  }
  return cursor - x - tracking
}

/**
 * A soft-cornered rectangle as the current path, ready to fill or stroke.
 *
 * Not `ctx.roundRect`, which throws on browsers this app still supports — and a
 * share that fails is worse than one that is square. Pass `h / 2` as the radius
 * for a pill.
 */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.arcTo(x + w, y, x + w, y + rad, rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
  ctx.lineTo(x + rad, y + h)
  ctx.arcTo(x, y + h, x, y + h - rad, rad)
  ctx.lineTo(x, y + rad)
  ctx.arcTo(x, y, x + rad, y, rad)
  ctx.closePath()
}

/**
 * The one meter shape in the product, drawn the once here and matched by the
 * scrubber and the score meter on screen: a thin track with a rounded fill.
 *
 * It replaced a segmented bar in a heavy frame. Segments imply rungs the score
 * does not have, and the frame was there to give an amber fill an edge it could
 * not hold on its own — which the track now does, quietly, at any value.
 */
function meter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  fill: string,
): void {
  ctx.fillStyle = HAIRLINE
  roundRectPath(ctx, x, y, w, h, h / 2)
  ctx.fill()
  const filled = (w * Math.max(0, Math.min(100, value))) / 100
  if (filled <= 0) return
  ctx.fillStyle = fill
  roundRectPath(ctx, x, y, Math.max(filled, h), h, h / 2)
  ctx.fill()
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
  // Very large. The margin is not leftover space — on a card that will be seen
  // at thumbnail size in a message thread, it is the single thing that makes the
  // difference between a considered page and a printout.
  const PAD = 96
  const stills = report.phases.filter((p) => p.thumbnail)

  // Lay the keyframes out three across; height follows from what is available.
  const cols = 3
  const gap = 20
  const rows = stills.length ? Math.ceil(stills.length / cols) : 0
  const cellW = (W - PAD * 2 - gap * (cols - 1)) / cols
  const cellH = cellW * 1.25
  const stripH = rows ? rows * (cellH + 52) : 0

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

  const headY = PAD + 24 // the wordmark's baseline
  const headRuleY = PAD + 52

  const labelY = PAD + 152 // 'SERVE SCORE' baseline
  const scoreSize = 152
  const scoreY = labelY + 150 // the numeral's baseline
  const meterY = scoreY + 42 // the meter's top edge
  const meterH = 6
  const meterW = Math.min(textW, 520)
  const statusY = meterY + meterH + 36 // the verdict word's baseline

  const chipH = 38
  const chipTop = statusY + 44
  const chipY = chipTop + 25 // chip label baseline
  const chipRuleY = chipTop + chipH + 56

  const oliveRuleY = chipRuleY + 56 // the one olive element
  const kickerY = oliveRuleY + 30 // 'WORK ON THIS NEXT' baseline
  const titleY = kickerY + 60

  ctx.font = sans(400, 20)
  // Flattened: the report marks its key words for the screen, and a canvas has
  // no idea what an asterisk means. A card shared to a coach must not arrive
  // with the markup showing.
  const focusWhy = plain(report.focus.why)
  // Body copy stays inside a reading measure rather than running the full width
  // of the card. 888px of 20px type is about 95 characters a line, which is
  // roughly double what anybody reads comfortably.
  const proseW = Math.min(textW, 700)
  const focusLines = layoutLines(ctx, focusWhy, proseW)
  const focusTop = titleY + 48
  const focusEnd = focusTop + focusLines.length * 34

  const areasRuleY = focusEnd + 28
  const areasTop = areasRuleY + 52 // top edge of the five small meters
  const areasBottom = areasTop + 82

  const stripRuleY = areasBottom + 64
  const stripTop = stripRuleY + 56

  const footRuleY = stripTop + stripH + 76
  const H = footRuleY + 300
  canvas.height = H

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)

  /* --- header ---------------------------------------------------------- */
  // No mark, no logotype block. The name set in the same serif the score is set
  // in is the whole masthead — the hierarchy on this card comes from size and
  // from space, and a filled square at the top of it is a second voice.
  ctx.textBaseline = 'alphabetic'
  ctx.font = display(400, 21)
  ctx.fillStyle = INK
  ctx.fillText('Serve Coach', textX, headY)

  ctx.font = mono(400, 15)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'right'
  ctx.fillText(
    new Date(report.createdAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    W - PAD,
    headY,
  )
  ctx.textAlign = 'left'

  ctx.fillStyle = HAIRLINE
  ctx.fillRect(textX, headRuleY, textW, 1)

  /* --- score ------------------------------------------------------------ */
  ctx.font = sans(600, 13)
  ctx.fillStyle = MUTED
  overline(ctx, 'SERVE SCORE', textX, labelY, 13)

  const scoreText = String(report.overall)
  ctx.font = display(700, scoreSize)
  ctx.fillStyle = INK
  ctx.fillText(scoreText, textX, scoreY)
  const scoreW = ctx.measureText(scoreText).width
  ctx.font = display(400, 30)
  ctx.fillStyle = FAINT
  ctx.fillText('/100', textX + scoreW + 16, scoreY)

  // The tier is carried by the meter and by one word, never by tinting the
  // digits: three of the four ramp colours cannot hold 4.5:1 on this paper, and
  // a score you have to squint at is not a celebration. The numeral is warm
  // black on warm paper and its size is the whole of the emphasis.
  meter(ctx, textX, meterY, meterW, meterH, report.overall, STATUS_FILL[report.overallStatus] ?? INK)

  ctx.font = sans(600, 17)
  ctx.fillStyle = STATUS_INK[report.overallStatus] ?? INK
  ctx.fillText(STATUS_LABEL[report.overallStatus] ?? '', textX, statusY)

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

  let chipX = textX
  ctx.font = sans(400, 14)
  ctx.lineWidth = 1
  for (const { label, soft } of chips) {
    const w = ctx.measureText(label).width + 32
    // Wrap rather than run off the edge: translated or unusually long labels
    // would otherwise silently disappear past the right margin.
    if (chipX + w > W - PAD) break
    // Low confidence is the one of these that changes how the card should be
    // read, so it is the one that gets colour. Amber-deep, not red: a soft read
    // is a caveat on the numbers, not a warning about the player.
    const low = soft === true
    // A wash with a matching -ink edge and -ink type, pill-shaped: the same
    // status chip the report uses, so the card is recognisably the same object.
    roundRectPath(ctx, chipX, chipTop, w, chipH, chipH / 2)
    ctx.fillStyle = low ? '#fbf4e9' : SURFACE
    ctx.fill()
    ctx.strokeStyle = low ? STATUS_INK.work : LINE
    ctx.stroke()
    ctx.fillStyle = low ? STATUS_INK.work : MUTED
    ctx.fillText(label, chipX + 16, chipY)
    chipX += w + 10
  }

  ctx.fillStyle = HAIRLINE
  ctx.fillRect(textX, chipRuleY, textW, 1)

  /* --- focus ------------------------------------------------------------ */
  /*
   * The one olive element on the card, on the one thing the card is asking for.
   *
   * A short rule and an overline set in the ink variant, rather than a filled
   * plate with reversed type. Olive at plate strength next to a 152px numeral is
   * two things shouting at each other; a rule the width of a thumb is enough to
   * say "this part is the point" on a page that is otherwise entirely warm
   * black on warm white.
   */
  ctx.fillStyle = OLIVE
  ctx.fillRect(textX, oliveRuleY, 56, 2)
  ctx.font = sans(600, 12)
  ctx.fillStyle = OLIVE_INK
  overline(ctx, 'WORK ON THIS NEXT', textX, kickerY, 12)

  // The fault titles are written for a person rather than for a box, so the type
  // steps down until it fits rather than running off the right edge.
  let titleSize = 38
  ctx.font = display(400, titleSize)
  while (titleSize > 26 && ctx.measureText(report.focus.title).width > textW) {
    titleSize -= 1
    ctx.font = display(400, titleSize)
  }
  ctx.fillStyle = INK
  ctx.fillText(report.focus.title, textX, titleY)
  ctx.font = sans(400, 20)
  ctx.fillStyle = MUTED
  // The same lines the layout above was measured from, so what is drawn and what
  // was reserved for it cannot disagree.
  drawLines(ctx, focusLines, textX, focusTop, 34)

  /* --- the five areas --------------------------------------------------- */
  ctx.fillStyle = HAIRLINE
  ctx.fillRect(textX, areasRuleY, textW, 1)

  const colGap = 24
  const barW = (textW - colGap * (report.fundamentals.length - 1)) / report.fundamentals.length
  report.fundamentals.forEach((f, i) => {
    const x = textX + i * (barW + colGap)
    // No surface block behind these any more. Five filled boxes in a row is a
    // dashboard; five columns separated by nothing but space is a page. The
    // verdict is the fill in each small meter — the same shape as the score
    // meter above and the scrubber in the player — and the number below it stays
    // warm black so the row reads as one row of scores rather than as five
    // differently coloured things.
    meter(ctx, x, areasTop, barW, 4, f.score, STATUS_FILL[f.status] ?? INK)

    ctx.fillStyle = INK
    ctx.font = display(400, 30)
    ctx.textAlign = 'center'
    ctx.fillText(String(f.score), x + barW / 2, areasTop + 56)
    ctx.font = sans(400, 13)
    ctx.fillStyle = MUTED
    ctx.fillText(f.label, x + barW / 2, areasTop + 82)
    ctx.textAlign = 'left'
  })

  /* --- keyframes -------------------------------------------------------- */
  if (rows) {
    ctx.fillStyle = HAIRLINE
    ctx.fillRect(textX, stripRuleY, textW, 1)

    const images = await Promise.all(stills.map((p) => loadImage(p.thumbnail!)))
    stills.forEach((phase, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = textX + col * (cellW + gap)
      const y = stripTop + row * (cellH + 52)

      ctx.save()
      roundRectPath(ctx, x, y, cellW, cellH, 12)
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

      // A hairline frame on every still, drawn inside the cell so the six line
      // up on the same grid whether or not their picture survived. --line, not
      // --hairline: this edge separates a photograph from the paper, which is
      // work, where a rule between two passages is decoration.
      roundRectPath(ctx, x + 0.5, y + 0.5, cellW - 1, cellH - 1, 12)
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.font = sans(600, 11)
      ctx.fillStyle = MUTED
      overline(ctx, phase.label.toUpperCase(), x, y + cellH + 28, 11)
    })
  }

  /* --- footer ----------------------------------------------------------- */
  // No filled panel and no coloured rule. The drill closes the card the way a
  // last paragraph closes a page: a hairline above it and then the words.
  ctx.fillStyle = HAIRLINE
  ctx.fillRect(textX, footRuleY, textW, 1)

  ctx.font = sans(600, 12)
  ctx.fillStyle = MUTED
  overline(ctx, 'ONE DRILL TO TRY', textX, footRuleY + 44, 12)

  ctx.font = display(400, 22)
  ctx.fillStyle = INK
  ctx.fillText(report.focus.drill.name, textX, footRuleY + 92)
  ctx.font = sans(400, 17)
  ctx.fillStyle = MUTED
  wrap(ctx, report.focus.drill.reps, textX, footRuleY + 128, proseW, 28)

  ctx.font = sans(400, 14)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText('Measured on device · nothing was uploaded', W / 2, H - 44)
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
