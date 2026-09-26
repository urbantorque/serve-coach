// Copies the MediaPipe Tasks Vision wasm runtime into public/ so the app loads it
// from its own origin (offline-capable, no CDN). Runs on postinstall.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(appDir, 'node_modules/@mediapipe/tasks-vision/wasm')
const targetDir = resolve(appDir, 'public/mediapipe/wasm')

if (!existsSync(sourceDir)) {
  console.error(`copy-mediapipe: ${sourceDir} not found. Is @mediapipe/tasks-vision installed?`)
  process.exit(1)
}

rmSync(targetDir, { recursive: true, force: true })
cpSync(sourceDir, targetDir, { recursive: true })
console.log(`copy-mediapipe: copied wasm runtime to ${targetDir}`)
