// Types for fixtures.mjs (Node-only helper), so TypeScript tests can import it
// without pulling @types/node into the app program.

export declare const CLIP_DIR: string
export declare const BARCODE: { blocks: number; heightFraction: number; bits: number }
export declare const AUDIO_TRUTH: { sampleRate: number; contacts: number[]; bounces: number[] }
export declare function ensureFixtures(options?: { force?: boolean; perf?: boolean }): string[]
export declare function fixturePath(name: string): string
export declare function readFixture(name: string): Uint8Array<ArrayBuffer>
