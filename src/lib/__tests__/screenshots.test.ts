/**
 * The install-sheet screenshots the manifest lists are the files it says (M4.2).
 *
 * Read off `vite.config.ts` and the PNG headers: every entry's file exists, its
 * stated size is its real size, narrow ones are tall and wide ones wide, and
 * none is precached.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e?: string) => { readUInt32BE: (o: number) => number } & string; existsSync: (p: string) => boolean }

const config = fs.readFileSync('vite.config.ts', 'utf8') as unknown as string
const entries = [...config.matchAll(/\{ src: '(screenshots\/[^']+)', sizes: '(\d+)x(\d+)', type: 'image\/png', form_factor: '(narrow|wide)'/g)].map((m) => ({
  src: m[1],
  w: Number(m[2]),
  h: Number(m[3]),
  form: m[4],
}))

heading('Install-sheet screenshots')

check('the manifest lists narrow and wide screenshots, each the size its file really is', () => {
  assert(entries.length >= 4, `${entries.length} screenshots listed`)
  assert(entries.some((e) => e.form === 'narrow') && entries.some((e) => e.form === 'wide'), 'no narrow or no wide shot')
  for (const e of entries) {
    const path = `public/${e.src}`
    assert(fs.existsSync(path), `${path} is listed but missing`)
    const png = fs.readFileSync(path) as unknown as { readUInt32BE: (o: number) => number }
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    assert(w === e.w && h === e.h, `${e.src} says ${e.w}x${e.h} and is ${w}x${h}`)
    assert(e.form === 'narrow' ? h > w : w > h, `${e.src} is ${e.form} but shaped the other way`)
  }
  note(entries.map((e) => `${e.src} ${e.w}x${e.h}`).join(' · '))
})

check('the screenshots are not precached into every install', () => {
  assert(config.includes("'**/screenshots/**'"), 'screenshots would be precached')
})

report()
