/**
 * Fetches the open datasets the pose benchmark (`?bench`) runs against.
 *
 * Dev-only and opt-in: `npm run setup:bench`. Nothing here is part of the app,
 * the build or the offline footprint — the data lands in `bench-data/`, which
 * is gitignored and outside `public/`, so Vite serves it to the dev server and
 * never copies it into `dist/`.
 *
 * Tennis Player Actions Dataset for Human Pose Estimation (Mendeley Data,
 * doi:10.17632/nv3rpsxhhk.1), CC BY 4.0: 500 serve frames from self-recorded
 * smartphone video, each with 18 hand-labelled COCO-style keypoints. The only
 * permissively licensed set of labelled serve poses found in the review
 * (ANALYSIS-REVIEW.md §3.4). Attribution is written next to the data, as the
 * licence requires.
 *
 * Safe to re-run: files already present at the expected size are skipped.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://data.mendeley.com/public-api/datasets/nv3rpsxhhk'
const DEST = path.join(root, 'bench-data', 'tennis-player-actions')

const ATTRIBUTION = `Tennis Player Actions Dataset for Human Pose Estimation
Mendeley Data, V1, doi:10.17632/nv3rpsxhhk.1
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Used unmodified as a pose-estimation benchmark by Serve Coach's dev tooling.
`

async function json(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function folders() {
  const meta = await json(API)
  if (meta.data_licence?.short_name !== 'CC BY 4.0') {
    throw new Error(`licence changed to ${meta.data_licence?.short_name}; re-check before using`)
  }
  // The folder ids are only exposed through the dataset page's own API; these
  // are the ones version 1 was published with.
  return {
    annotations: 'd223e372-b3a6-4143-bd45-d628e87d10a9',
    serve: '516418cf-9625-4965-90d3-cef02a5b0cdd',
  }
}

async function download(file, dir) {
  const dest = path.join(dir, file.filename)
  if (fs.existsSync(dest) && fs.statSync(dest).size === file.size) return false
  const res = await fetch(file.content_details.download_url)
  if (!res.ok) throw new Error(`${res.status} ${file.filename}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return true
}

async function pool(items, n, fn) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

const ids = await folders()
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
