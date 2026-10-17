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
 * COCO 2017, tennis only (cocodataset.org; annotations CC BY 4.0, images under
 * their own Flickr licences, commercial-use ones only): the serve-shaped frames
 * from every camera side, in the same format as Tennis Player Actions. Read by
 * `bench.html?set=coco-tennis` (ANALYSIS-REVIEW.md §7). The annotation archive
 * is 252 MB; only the selection is kept.
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
 * sizes, then each entry's local header for where its data starts. `wanted`
 * picks entries by name before anything is inflated, which matters for COCO:
 * its archive inflates to 834 MB and two of its six files are needed.
 */
function unzip(buf, wanted = () => true) {
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
    if (name.endsWith('/') || !wanted(name)) continue
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

/* --------------------------------------------------------- COCO, tennis only */

/**
 * The serve-shaped tennis frames in COCO 2017, in the benchmark's own format.
 *
 * Tennis Player Actions is one camera position: rear three-quarter, the player
 * a couple of hundred pixels tall. COCO's tennis photographs come from every
 * side, so they ask whether a ranking measured there holds where the phone
 * actually stands. Selected, not hand-picked:
 * - the image has a `tennis racket` box (category 43);
 * - the player has at least 12 labelled keypoints, is not a crowd label, and
 *   is at least 120 px tall;
 * - a wrist is raised at least 12% of the player's height above the higher
 *   shoulder (an overhead: the toss, the trophy, contact or a smash);
 * - a racket box sits beside that player rather than across the court;
 * - the photograph's own Flickr licence allows commercial use (CC BY, BY-SA,
 *   BY-ND, no known restrictions, US government). The non-commercial ones would
 *   roughly triple the count and are left out on purpose.
 * One player per image, the tallest that qualifies.
 *
 * Annotations are CC BY 4.0 (COCO Consortium). Images keep their own licences,
 * listed per file in ATTRIBUTION.txt. The images are fetched over HTTPS from
 * the bucket's path-style address, because images.cocodataset.org itself has
 * no certificate for that name.
 */
async function cocoTennis() {
  const TERMS = 'https://cocodataset.org/dataset/termsofuse.htm'
  const BUCKET = 'https://s3.amazonaws.com/images.cocodataset.org'
  const DEST = path.join(root, 'bench-data', 'coco-tennis')
  const COMMERCIAL = (url) => /creativecommons\.org\/licenses\/by(-sa|-nd)?\/|flickr\.com\/commons|usa\.gov\/copyright/.test(url)

  if (fs.existsSync(path.join(DEST, 'serve.json'))) {
    const have = JSON.parse(fs.readFileSync(path.join(DEST, 'serve.json'), 'utf8'))
    const missing = have.images.filter((im) => !fs.existsSync(path.join(DEST, 'serve', im.file_name)))
    // Built before the racket boxes were kept (L5.11): rebuilt once, so the
    // racket detector has labels to be scored against.
    const rackets = have.images.every((im) => Array.isArray(im.rackets))
    if (!missing.length && rackets) {
      console.log(`  coco-tennis: ${have.images.length} serve-shaped frames (already here)`)
      return
    }
  }

  const terms = (await bytes(TERMS)).toString('utf8')
  if (!terms.includes('creativecommons.org/licenses/by/4.0')) {
    throw new Error('COCO annotation licence is no longer stated as CC BY 4.0; re-check before using')
  }

  const files = unzip(await bytes(`${BUCKET}/annotations/annotations_trainval2017.zip`), (n) =>
    /(instances|person_keypoints)_(train|val)2017\.json$/.test(n),
  )

  /** Regex matches over a large buffer, in overlapping windows, never one giant string. */
  function* scan(buf, re) {
    const W = 64 << 20
    const overlap = 2 << 20
    for (let s = 0; ; s += W - overlap) {
      const text = buf.toString('latin1', s, Math.min(buf.length, s + W))
      re.lastIndex = 0
      let m
      while ((m = re.exec(text))) yield m
      if (s + W >= buf.length) break
    }
  }

  const images = []
  const annotations = []
  const attribution = []
  for (const split of ['train2017', 'val2017']) {
    const instances = files.get(`annotations/instances_${split}.json`)
    const keypoints = files.get(`annotations/person_keypoints_${split}.json`)

    const licences = new Map()
    for (const m of scan(keypoints, /\{"url": ?"([^"]+)","id": ?(\d+),"name": ?"([^"]+)"\}/g)) licences.set(+m[2], { url: m[1], name: m[3] })

    const rackets = new Map()
    const racketIds = new Set()
    for (const m of scan(instances, /"image_id": ?(\d+),"bbox": ?\[([^\]]*)\],"category_id": ?43,"id": ?(\d+)/g)) {
      if (racketIds.has(m[3])) continue
      racketIds.add(m[3])
      if (!rackets.has(+m[1])) rackets.set(+m[1], [])
      rackets.get(+m[1]).push(m[2].split(',').map(Number))
    }

    const meta = new Map()
    const imageRe =
      /\{"license": ?(\d+),"file_name": ?"([^"]+)","coco_url": ?"[^"]+","height": ?(\d+),"width": ?(\d+),"date_captured": ?"[^"]*","flickr_url": ?"([^"]*)","id": ?(\d+)\}/g
    for (const m of scan(keypoints, imageRe)) {
      if (rackets.has(+m[6])) meta.set(+m[6], { license: +m[1], file_name: m[2], height: +m[3], width: +m[4], flickr: m[5] })
    }

    const best = new Map()
    const personIds = new Set()
    const personRe =
      /"num_keypoints": ?(\d+),"area": ?[^,]+,"iscrowd": ?(\d),"keypoints": ?\[([^\]]*)\],"image_id": ?(\d+),"bbox": ?\[([^\]]*)\],"category_id": ?1,"id": ?(\d+)/g
    for (const m of scan(keypoints, personRe)) {
      if (personIds.has(m[6])) continue
      personIds.add(m[6])
      const id = +m[4]
      const image = meta.get(id)
      if (!image || !COMMERCIAL(licences.get(image.license)?.url ?? '')) continue
      const kp = m[3].split(',').map(Number)
      const bbox = m[5].split(',').map(Number)
      if (+m[2] || +m[1] < 12 || bbox[3] < 120) continue
      const at = (j) => (kp[j * 3 + 2] > 0 ? { x: kp[j * 3], y: kp[j * 3 + 1] } : undefined)
      const ls = at(5)
      const rs = at(6)
      if (!ls || !rs) continue
      const raised = [at(9), at(10)].some((w) => w && Math.min(ls.y, rs.y) - w.y > 0.12 * bbox[3])
      if (!raised) continue
      const beside = rackets.get(id).some(([x, y, w, h]) => {
        const cx = x + w / 2
        const cy = y + h / 2
        return (
          cx > bbox[0] - 0.3 * bbox[3] && cx < bbox[0] + bbox[2] + 0.3 * bbox[3] && cy > bbox[1] - 0.5 * bbox[3] && cy < bbox[1] + bbox[3]
        )
      })
      if (!beside) continue
      if ((best.get(id)?.bbox[3] ?? 0) < bbox[3]) best.set(id, { image_id: id, keypoints: kp, bbox, num_keypoints: +m[1] })
    }

    for (const [id, ann] of best) {
      const im = meta.get(id)
      // The racket boxes beside this player, kept for scoring the racket
      // detector (`bench.html?set=coco-tennis&racket=1`, L5.11).
      const near = rackets.get(id).filter(([x, y, w, h]) => {
        const b = ann.bbox
        const cx = x + w / 2
        const cy = y + h / 2
        return cx > b[0] - 0.3 * b[3] && cx < b[0] + b[2] + 0.3 * b[3] && cy > b[1] - 0.5 * b[3] && cy < b[1] + b[3]
      })
      images.push({ id, file_name: im.file_name, width: im.width, height: im.height, split, rackets: near })
      annotations.push(ann)
      attribution.push(`${im.file_name}\t${licences.get(im.license).name}\t${im.flickr}`)
    }
  }

  fs.mkdirSync(path.join(DEST, 'serve'), { recursive: true })
  fs.writeFileSync(path.join(DEST, 'serve.json'), JSON.stringify({ images, annotations }))
  fs.writeFileSync(
    path.join(DEST, 'ATTRIBUTION.txt'),
    `COCO 2017 (Lin et al. 2014, "Microsoft COCO: Common Objects in Context"), https://cocodataset.org
Annotations: COCO Consortium, Creative Commons Attribution 4.0 (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Annotations reduced to one serve-shaped tennis player per image by scripts/fetch-bench.mjs.
Images are unmodified Flickr photographs under their own licences, one per line:
file, licence, source

${attribution.sort().join('\n')}
`,
  )

  let fetched = 0
  await pool(images, 8, async (im) => {
    const dest = path.join(DEST, 'serve', im.file_name)
    if (fs.existsSync(dest)) return
    fs.writeFileSync(dest, await bytes(`${BUCKET}/${im.split}/${im.file_name}`))
    fetched++
  })
  console.log(`  coco-tennis: ${images.length} serve-shaped frames (${fetched} fetched), serve.json`)
}

await tennisPlayerActions()
await bathServe()
await cocoTennis()
