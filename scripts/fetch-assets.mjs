/**
 * Vendors everything the app needs to run with the network switched off:
 *   public/models/pose_landmarker_full.task  — downloaded once from Google
 *   public/wasm/*                            — copied out of node_modules
 *   public/icon-*.png, public/favicon.png    — generated here, no image deps
 *
 * Run once after `npm install`. Safe to re-run; it skips work already done.
 */
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'public')

const MODEL = {
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  dest: path.join(pub, 'models', 'pose_landmarker_full.task'),
  minBytes: 5_000_000,
}

const log = (...a) => console.log('  ', ...a)

async function vendorModel() {
  if (fs.existsSync(MODEL.dest) && fs.statSync(MODEL.dest).size > MODEL.minBytes) {
    log('model already vendored →', path.relative(root, MODEL.dest))
    return
  }
  log('downloading pose model (~9 MB, one time only)…')
  const res = await fetch(MODEL.url)
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < MODEL.minBytes) throw new Error(`model download truncated (${buf.length} bytes)`)
  fs.mkdirSync(path.dirname(MODEL.dest), { recursive: true })
  fs.writeFileSync(MODEL.dest, buf)
  log(`model saved — ${(buf.length / 1e6).toFixed(1)} MB, sha256 ${createHash('sha256').update(buf).digest('hex').slice(0, 12)}`)
}

function vendorWasm() {
  const src = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
  const dest = path.join(pub, 'wasm')
  if (!fs.existsSync(src)) throw new Error('@mediapipe/tasks-vision not installed — run npm install first')
  fs.mkdirSync(dest, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f))
    n++
  }
  log(`copied ${n} wasm runtime files → public/wasm`)
}

/* ---------------------------------------------------------------- PNG writer */

function crc32(buf) {
  let c, table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba: Uint8Array of size w*h*4 */
function encodePng(rgba, w, h) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ the icon */

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/**
 * A tennis ball on the app's ink background. The seam is the classic pair of
 * mirrored arcs: the locus of points a fixed distance from two centres parked
 * just outside the ball on either side.
 */
function drawIcon(size, { maskable = false } = {}) {
  const S = 3 // supersampling factor per axis
  const px = new Uint8Array(size * size * 4)
  const bg = [10, 12, 16]
  const ballLight = [214, 255, 79]
  const ballDark = [126, 168, 20]
  const seam = [248, 250, 245]

  const cx = size / 2
  const cy = size / 2
  // maskable icons must survive a circular crop, so keep the ball smaller
  const R = size * (maskable ? 0.3 : 0.38)
  const corner = size * 0.235
  // A seam is the arc through both poles bowing out to `bulge` at the equator.
  // The ball's two seams sit 90° apart on the sphere, so face-on you see one
  // crossing near the middle and one hugging the limb — never a matched pair,
  // which is what makes symmetric arcs read as a football instead of a ball.
  const seamWidth = R * 0.075
  const arc = (bulge, side) => {
    const off = (R * R - bulge * bulge) / (2 * bulge)
    return { cx: -side * off, r: off + bulge, side }
  }
  const seams = [arc(0.34 * R, -1), arc(0.9 * R, 1)]
  const tilt = (-20 * Math.PI) / 180
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0]
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px_ = x + (sx + 0.5) / S
          const py_ = y + (sy + 0.5) / S

          // rounded-rect background (full bleed when maskable)
          let inBg = true
          if (!maskable) {
            const qx = Math.max(corner - px_, px_ - (size - corner), 0)
            const qy = Math.max(corner - py_, py_ - (size - corner), 0)
            inBg = Math.hypot(qx, qy) <= corner
          }
          if (!inBg) {
            acc[3] += 0
            continue
          }

          const d = Math.hypot(px_ - cx, py_ - cy)
          let col = bg
          if (d <= R) {
            // soft top-left lit sphere
            const shade = Math.min(1, Math.max(0, (px_ - cx + R * 0.75) / (2.1 * R) + (py_ - cy + R * 0.9) / (2.6 * R)))
            col = mix(ballLight, ballDark, shade)
            // seam test happens in the tilted frame
            const rx = (px_ - cx) * cosT - (py_ - cy) * sinT
            const ry = (px_ - cx) * sinT + (py_ - cy) * cosT
            for (const s of seams) {
              // keep the bulging branch only, or the circle doubles back on itself
              if (s.side * (rx - s.cx) < 0) continue
              if (Math.abs(Math.hypot(rx - s.cx, ry) - s.r) < seamWidth) {
                col = seam
                break
              }
            }
          }
          acc[0] += col[0]
          acc[1] += col[1]
          acc[2] += col[2]
          acc[3] += 255
        }
      }
      const n = S * S
      const i = (y * size + x) * 4
      const a = acc[3] / n
      px[i] = Math.round(acc[0] / n)
      px[i + 1] = Math.round(acc[1] / n)
      px[i + 2] = Math.round(acc[2] / n)
      px[i + 3] = Math.round(a)
    }
  }
  return encodePng(px, size, size)
}

function generateIcons() {
  const targets = [
    ['favicon.png', 64, {}],
    ['apple-touch-icon.png', 180, {}],
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-maskable-512.png', 512, { maskable: true }],
  ]
  fs.mkdirSync(pub, { recursive: true })
  for (const [name, size, opts] of targets) {
    fs.writeFileSync(path.join(pub, name), drawIcon(size, opts))
  }
  log(`generated ${targets.length} app icons`)
}

console.log('\nServe Coach — vendoring offline assets\n')
generateIcons()
vendorWasm()
await vendorModel()
console.log('\nDone. The app now runs with no network at all.\n')
