// Renders the app icon (icon.mjs) to the PNG sizes the web app manifest and iOS need, with the Playwright
// library in headless Edge, and writes public/favicon.svg. Run after changing icon.mjs:
//
//   node src/platform/icons/render-icons.mjs [--preview <dir>]
//
// --preview also writes a contact sheet (each icon at display size on Day and Night backgrounds, the
// maskable icon under a circle mask) for review. Outputs are committed; the build does not run this.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { iconSvg } from './icon.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const publicDir = resolve(appDir, 'public')
const iconsDir = resolve(publicDir, 'icons')

/** "any" icons are rounded tiles with transparent corners; maskable and Apple icons are full bleed. */
export const ICONS = [
  { file: 'icon-192.png', size: 192, shape: 'rounded', detail: 'full' },
  { file: 'icon-512.png', size: 512, shape: 'rounded', detail: 'full' },
  { file: 'icon-maskable-192.png', size: 192, shape: 'square', detail: 'full' },
  { file: 'icon-maskable-512.png', size: 512, shape: 'square', detail: 'full' },
  { file: 'apple-touch-icon.png', size: 180, shape: 'square', detail: 'full' },
  { file: 'favicon-32.png', size: 32, shape: 'rounded', detail: 'small' },
]

const previewArg = process.argv.indexOf('--preview')
const previewDir = previewArg > 0 ? resolve(process.argv[previewArg + 1]) : null

mkdirSync(iconsDir, { recursive: true })
writeFileSync(resolve(publicDir, 'favicon.svg'), iconSvg({ shape: 'rounded', detail: 'small' }))

const browser = await chromium.launch({ channel: 'msedge' })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size })
    const svg = iconSvg(icon).replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `)
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
    const png = await page.screenshot({ omitBackground: icon.shape === 'rounded', clip: { x: 0, y: 0, width: icon.size, height: icon.size } })
    writeFileSync(resolve(iconsDir, icon.file), png)
    console.log(`render-icons: ${icon.file} (${icon.size} px, ${png.length} bytes)`)
  }

  if (previewDir) {
    mkdirSync(previewDir, { recursive: true })
    const src = (file) => `data:image/png;base64,${readFileSync(resolve(iconsDir, file)).toString('base64')}`
    const cell = (bg, file, size, mask = false) =>
      `<figure style="margin:0;display:grid;gap:6px;justify-items:center;padding:16px;background:${bg};border-radius:12px">
        <img src="${src(file)}" width="${size}" height="${size}" style="${mask ? 'border-radius:50%' : ''}">
        <figcaption style="font:12px system-ui;color:${bg === '#0B0F0D' ? '#EBEFE9' : '#121714'}">${size} px${mask ? ', masked' : ''}</figcaption>
      </figure>`
    const row = (bg) =>
      `<div style="display:flex;gap:12px;align-items:end">${cell(bg, 'icon-512.png', 128)}${cell(bg, 'icon-maskable-512.png', 128, true)}${cell(bg, 'apple-touch-icon.png', 90)}${cell(bg, 'icon-192.png', 48)}${cell(bg, 'favicon-32.png', 32)}${cell(bg, 'favicon-32.png', 16)}</div>`
    await page.setViewportSize({ width: 760, height: 420 })
    await page.setContent(`<!doctype html><html><body style="margin:16px;display:grid;gap:12px;background:#E6EAE4">${row('#F1F3EF')}${row('#0B0F0D')}</body></html>`)
    await page.screenshot({ path: resolve(previewDir, 'icons-contact-sheet.png') })
    console.log(`render-icons: contact sheet in ${previewDir}`)
  }
} finally {
  await browser.close()
}
