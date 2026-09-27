/**
 * Dev-only Vite middleware that serves the synthetic ground-truth corpus
 * (../validation/synthetic: clips/<id>/<id>.mp4 | .webm, truth.json, truth-extra.json,
 * manifest.json, truth-series.json) under /__synthetic/ to the validation harness.
 *
 * Nothing is copied into public/, so the corpus never reaches a production build: the plugin
 * has `apply: 'serve'` and exists only on the dev server. Byte ranges are supported so the
 * media-element decode path can seek. Only the corpus folder is reachable (path traversal is
 * refused) and only video / JSON / WAV files are served.
 */
import { createReadStream, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

export const SYNTHETIC_CORPUS_PREFIX = '/__synthetic/'

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
}

/** Maps a request path under the prefix to a file inside `root`, or null when it is outside it or not servable. */
export function resolveCorpusPath(root: string, urlPath: string): string | null {
  if (!urlPath.startsWith(SYNTHETIC_CORPUS_PREFIX)) return null
  let rel: string
  try {
    rel = decodeURIComponent(urlPath.slice(SYNTHETIC_CORPUS_PREFIX.length))
  } catch {
    return null
  }
  if (rel.length === 0 || rel.includes('\0')) return null
  const target = resolve(root, rel)
  const fromRoot = relative(root, target)
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot) || fromRoot.split(sep).includes('..')) return null
  if (!(extname(target).toLowerCase() in CONTENT_TYPES)) return null
  return target
}

/** Parses a single `bytes=a-b` range (suffix and open-ended forms too) against a file size. */
export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  let start: number
  let end: number
  if (match[1] === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(match[2])
    if (suffix === 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start >= size || end < start) return 'unsatisfiable'
  return { start, end }
}

function fail(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

export function syntheticCorpusPlugin(corpusRoot: string): Plugin {
  const root = resolve(corpusRoot)
  return {
    name: 'serve-coach:synthetic-corpus',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url ?? '').split('?')[0]
        if (!urlPath.startsWith(SYNTHETIC_CORPUS_PREFIX)) return next()
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'GET or HEAD only')
        const file = resolveCorpusPath(root, urlPath)
        if (!file) return fail(res, 404, 'not in the synthetic corpus')
        let size: number
        try {
          const stat = statSync(file)
          if (!stat.isFile()) return fail(res, 404, 'not a file')
          size = stat.size
        } catch {
          return fail(res, 404, 'not found (render the corpus with tools/synth first)')
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()])
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'no-store')
        const range = parseByteRange(req.headers.range, size)
        if (range === 'unsatisfiable') {
          res.setHeader('Content-Range', `bytes */${size}`)
          return fail(res, 416, 'range not satisfiable')
        }
        const { start, end } = range ?? { start: 0, end: size - 1 }
        res.statusCode = range ? 206 : 200
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        res.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1))
        if (req.method === 'HEAD' || size === 0) return void res.end()
        const stream = createReadStream(file, { start, end })
        stream.on('error', (error) => {
          if (!res.headersSent) fail(res, 500, error.message)
          else res.destroy(error)
        })
        stream.pipe(res)
      })
    },
  }
}
