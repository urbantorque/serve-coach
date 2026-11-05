#!/usr/bin/env node
/**
 * The model serve, as an app asset: `node scripts/model-serve.mjs`.
 *
 * One real serve from the Bath capture, thinned from 180 to 60 frames a second
 * and packed the way the fixture packs it (millimetres, int16, base64), so the
 * figure a player is shown as "good" is a real body rather than a drawn one.
 * Bath 39: it landed in, and the engine scores it 84 and names no fault on it.
 *
 * The data is CC BY 4.0, so the attribution travels with the file and shows in
 * the app (`ATTRIBUTION` in `src/lib/figure/modelMotion.ts`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const fixture = JSON.parse(readFileSync(join(root, 'src/lib/analysis/__tests__/fixtures/bath-serves.json'), 'utf8'))
const serve = fixture.serves.find((s) => s.id === 'bath-39')
const points = serve.points.length

const bytes = Buffer.from(serve.mm, 'base64')
const ints = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
const step = 3
const count = Math.floor((serve.count - 1) / step) + 1
const kept = new Int16Array(count * points * 3)
for (let f = 0; f < count; f++) {
  const from = f * step * points * 3
  kept.set(ints.subarray(from, from + points * 3), f * points * 3)
}

const out = {
  id: serve.id,
  rate: serve.rate / step,
  count,
  hand: serve.hand,
  outcome: serve.outcome,
  points: serve.points,
  mm: Buffer.from(kept.buffer).toString('base64'),
}
writeFileSync(join(root, 'src/lib/figure/modelServe.json'), JSON.stringify(out))
console.log(`${count} frames at ${out.rate} Hz, ${out.mm.length} base64 characters`)
