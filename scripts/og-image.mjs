#!/usr/bin/env node
/**
 * The picture a link to the site shows when it is shared (N6.6):
 *
 *   node scripts/og-image.mjs        (needs the dev server on 5180)
 *
 * Draws public/og.jpg, 1200 by 630, with the app's own painting code in
 * Chrome: the model serve, a real serve from the Bath motion capture, laid
 * down as one exposure, beside the promise. Never a photograph of anybody.
 * Dev tooling: nothing here ships but the picture.
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))
const base = process.env.BASE ?? 'http://localhost:5180'

const browser = await pw.chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.goto(base + '/')
await page.waitForTimeout(1500)
const url = await page.evaluate(async () => {
  const card = await import('/src/lib/share/serveCard.ts')
  const stage = await import('/src/lib/figure/stage.ts')
  const motion = await import('/src/lib/figure/modelMotion.ts')
  await card.cardFonts()
  // The canvas draws in whatever face is ready: wait until Archivo really is.
  for (let i = 0; i < 50 && !(document.fonts.check(card.headType(52)) && document.fonts.check(card.textType(28))); i++) {
    await document.fonts.load(card.headType(52))
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!document.fonts.check(card.headType(52))) throw new Error('Archivo never loaded')
  const W = 1200
  const H = 630
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  card.stageBackground(ctx, W, H)
  const m = motion.modelMotion('right')
  const contact = m.phases.find((p) => p.id === 'contact')?.frame ?? m.frames.length - 1
  // The figure on the left half, racket and all inside the picture.
  const at = stage.placeSwing(m.frames, 560, H, { height: 0.5, feet: 0.9, across: 0.52 })
  stage.paintExposure(ctx, m.frames, at, { racket: 'right', from: 0, to: contact })
  const veil = ctx.createLinearGradient(0, H * 0.78, 0, H)
  veil.addColorStop(0, 'rgba(10,12,16,0)')
  veil.addColorStop(1, 'rgba(10,12,16,1)')
  ctx.fillStyle = veil
  ctx.fillRect(0, H * 0.78, W, H * 0.22)
  // The words on the right.
  const x = 600
  ctx.textBaseline = 'alphabetic'
  card.brandMark(ctx, x, 150, 34)
  // Sized to the widest line, so nothing runs off the right edge.
  const lines = ['Film one serve.', 'See the one thing', 'to fix.']
  let size = 62
  ctx.font = card.headType(size)
  while (size > 36 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > W - x - 56) ctx.font = card.headType(--size)
  ctx.fillStyle = '#eef2f6'
  lines.forEach((l, i) => ctx.fillText(l, x, 262 + i * size * 1.18))
  ctx.font = card.textType(28)
  ctx.fillStyle = '#a7b1c2'
  ctx.fillText('Read frame by frame on your own device.', x, 494)
  ctx.fillText('Your video never leaves it.', x, 534)
  return c.toDataURL('image/jpeg', 0.88)
})
writeFileSync(join(root, 'public', 'og.jpg'), Buffer.from(url.split(',')[1], 'base64'))
console.log('wrote public/og.jpg')
await browser.close()
