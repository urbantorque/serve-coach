/**
 * Fetches the open datasets the dev benchmarks run against.
 *
 * Dev-only and opt-in: `npm run setup:bench`. Nothing here is part of the app,
 * the build or the offline footprint — the data lands in `bench-data/`, which
 * is gitignored and outside `public/`, so Vite serves it to the dev server and
 * never copies it into `dist/`.
 *
 * Tennis Player Actions Dataset for Human Pose Estimation (Mendeley Data,
 * doi:10.17632/nv3rpsxhhk.1), CC BY 4.0: 500 serve frames from self-recorded
 * smartphone video, each with 18 hand-labelled COCO-style keypoints. Read by
 * `bench.html` (ANALYSIS-REVIEW.md §7).
 *
 * Bath serve motion capture (University of Bath Research Data Archive,
 * doi:10.15125/BATH-01454), CC BY 4.0: 42 serves by one player, 75 markers at
 * 180 Hz, with each serve's outcome. Read by `npm run bench:mocap`
 * (ANALYSIS-REVIEW.md §9).
 *
 * Attribution is written next to each dataset, as the licences require. Each
 * licence is re-checked at its source before anything is downloaded, so a
 * change of terms stops the fetch rather than passing unnoticed.
 *
 * Safe to re-run: files already present are skipped.
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function json(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

/**
 * A whole file, by `node:https` rather than `fetch`.
 *
 * The Bath archive answers `fetch` with headers and then a body that never
 * finishes arriving, while the same URL through `https.get` streams in under a
 * minute. Redirects are followed by hand, since `https.get` does not.
 */
function bytes(url, hops = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'serve-coach-bench' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops > 0) {
          res.resume()
          resolve(bytes(new URL(res.headers.location, url).href, hops - 1))
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`${res.statusCode} ${url}`))
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

async function pool(items, n, fn) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

/**
 * Every file in a zip archive, by name.
 *
 * Node has no zip reader, and the two archives here are small and ordinary:
 * stored or deflated entries, under 4 GB, no encryption. Read from the central
 * directory, which is the part of the format that is authoritative about
 * sizes, then each entry's local header for where its data starts.
 */
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('not a zip archive')
  const entries = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip central directory is damaged')
    const method = buf.readUInt16LE(p + 10)
    const compressed = buf.readUInt32LE(p + 20)
    const nameLength = buf.readUInt16LE(p + 28)
    const extraLength = buf.readUInt16LE(p + 30)
    const commentLength = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength)
    p += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + compressed)
    if (method === 0) out.set(name, data)
    else if (method === 8) out.set(name, zlib.inflateRawSync(data))
    else throw new Error(`zip entry ${name} uses compression method ${method}`)
  }
  return out
}

/* ------------------------------------------------- Tennis Player Actions */

async function tennisPlayerActions() {
  const API = 'https://data.mendeley.com/public-api/datasets/nv3rpsxhhk'
  const DEST = path.join(root, 'bench-data', 'tennis-player-actions')
  const ATTRIBUTION = `Tennis Player Actions Dataset for Human Pose Estimation
Mendeley Data, V1, doi:10.17632/nv3rpsxhhk.1
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Used unmodified as a pose-estimation benchmark by Serve Coach's dev tooling.
`

  const meta = await json(API)
  if (meta.data_licence?.short_name !== 'CC BY 4.0') {
    throw new Error(`licence changed to ${meta.data_licence?.short_name}; re-check before using`)
  }
  // The folder ids are only exposed through the dataset page's own API; these
  // are the ones version 1 was published with.
  const ids = {
    annotations: 'd223e372-b3a6-4143-bd45-d628e87d10a9',
    serve: '516418cf-9625-4965-90d3-cef02a5b0cdd',
  }

  async function download(file, dir) {
    const dest = path.join(dir, file.filename)
    if (fs.existsSync(dest) && fs.statSync(dest).size === file.size) return false
    fs.writeFileSync(dest, await bytes(file.content_details.download_url))
    return true
  }

  fs.mkdirSync(path.join(DEST, 'serve'), { recursive: true })
  fs.writeFileSync(path.join(DEST, 'ATTRIBUTION.txt'), ATTRIBUTION)

  const annotations = await json(`${API}/files?folder_id=${ids.annotations}&version=1`)
  const serveJson = annotations.find((f) => f.filename === 'serve.json')
  if (!serveJson) throw new Error('serve.json missing from the annotations folder')
  await download(serveJson, DEST)

  const images = await json(`${API}/files?folder_id=${ids.serve}&version=1`)
  let fetched = 0
  await pool(images, 8, async (f) => {
    if (await download(f, path.join(DEST, 'serve'))) fetched++
  })
  console.log(`  tennis-player-actions: ${images.length} serve images (${fetched} fetched), serve.json`)
}

/* -------------------------------------------------------- Bath serve mocap */

async function bathServe() {
  const PAGE = 'https://researchdata.bath.ac.uk/1454/'
  const DATA = 'https://researchdata.bath.ac.uk/1454/5/Spatio-Temporal%20Serve%20Data.zip'
  const LABELS = 'https://researchdata.bath.ac.uk/1454/6/Data%20Labels.xlsx.zip'
  const DEST = path.join(root, 'bench-data', 'bath-serve')
  const ATTRIBUTION = `Durlind, G., Martinez-Hernandez, U. and Assaf, T. (2025). Dataset for "Exploratory
Proof-of-Concept: Predicting the Outcome of Tennis Serves Using Motion Capture and Deep
Learning". University of Bath Research Data Archive. doi:10.15125/BATH-01454
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Stored here unmodified; Serve Coach's dev tooling converts the 75 markers to joint centres
when it reads them (src/dev/mocap/bath.ts).
`

  // The archive page states each file's licence in its schema.org block.
  const page = (await bytes(PAGE)).toString('utf8')
  const licences = [...page.matchAll(/"license":"([^"]+)"/g)].map((m) => m[1])
  if (!licences.length || licences.some((l) => l !== 'https://creativecommons.org/licenses/by/4.0/')) {
    throw new Error(`Bath serve licence is now ${licences.join(', ') || 'unstated'}; re-check before using`)
  }

  fs.mkdirSync(DEST, { recursive: true })
  fs.writeFileSync(path.join(DEST, 'ATTRIBUTION.txt'), ATTRIBUTION)

  const have = fs.readdirSync(DEST).filter((f) => f.endsWith('.mat')).length
  if (have < 42) {
    for (const [name, data] of unzip(await bytes(DATA))) {
      const base = path.basename(name)
      // macOS resource forks ride along in the archive as `__MACOSX/._name`.
      if (name.includes('__MACOSX') || !base.endsWith('.mat')) continue
      fs.writeFileSync(path.join(DEST, base), data)
    }
  }
  if (!fs.existsSync(path.join(DEST, 'sheet1.xml'))) {
    const xlsx = [...unzip(await bytes(LABELS))].find(([n]) => n.endsWith('.xlsx') && !n.includes('__MACOSX'))
    if (!xlsx) throw new Error('the outcome spreadsheet is missing from its archive')
    const parts = unzip(xlsx[1])
    fs.writeFileSync(path.join(DEST, 'sheet1.xml'), parts.get('xl/worksheets/sheet1.xml'))
    fs.writeFileSync(path.join(DEST, 'sharedStrings.xml'), parts.get('xl/sharedStrings.xml'))
  }
  const count = fs.readdirSync(DEST).filter((f) => f.endsWith('.mat')).length
  console.log(`  bath-serve: ${count} serves, outcome sheet`)
}

await tennisPlayerActions()
await bathServe()
