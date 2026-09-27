import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseByteRange, resolveCorpusPath } from './syntheticCorpus.ts'

const root = resolve('/corpus/validation/synthetic')

describe('synthetic corpus middleware', () => {
  it('maps corpus URLs to files inside the corpus only', () => {
    expect(resolveCorpusPath(root, '/__synthetic/clips/baseline-s1/baseline-s1.mp4')).toBe(join(root, 'clips/baseline-s1/baseline-s1.mp4'))
    expect(resolveCorpusPath(root, '/__synthetic/manifest.json')).toBe(join(root, 'manifest.json'))
    expect(resolveCorpusPath(root, '/__synthetic/clips/a%20b/truth.json')).toBe(join(root, 'clips/a b/truth.json'))
    expect(resolveCorpusPath(root, '/__synthetic/../package.json')).toBeNull()
    expect(resolveCorpusPath(root, '/__synthetic/clips/%2e%2e/%2e%2e/secret.json')).toBeNull()
    expect(resolveCorpusPath(root, '/__synthetic/..%5c..%5capp%5cpackage.json')).toBeNull()
    expect(resolveCorpusPath(root, '/__synthetic/clips/x/notes.txt')).toBeNull()
    expect(resolveCorpusPath(root, '/__synthetic/')).toBeNull()
    expect(resolveCorpusPath(root, '/src/main.tsx')).toBeNull()
    expect(resolveCorpusPath(root, '/__synthetic/%E0%A4%A')).toBeNull()
  })

  it('parses byte ranges', () => {
    expect(parseByteRange(undefined, 100)).toBeNull()
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseByteRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 })
    expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=-0', 100)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=0-1,5-6', 100)).toBeNull()
  })
})
