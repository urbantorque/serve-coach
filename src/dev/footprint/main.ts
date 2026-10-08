/**
 * How much memory the swing refinement model holds once it has run (D6.7).
 *
 * Dev only (`footprint.html?model=s` or `?model=m`, one model per page load,
 * because a WASM heap grows and never shrinks). The model heaps are the one
 * thing `lib/footprint.ts` cannot see (`UNSEEN`), so this reads them where they
 * live: every `WebAssembly.Memory` the page creates is recorded before ONNX
 * Runtime loads, and after the session is built and has read thirty crops the
 * largest one's size is the heap. Settings are the app's own
 * (`pose/refineEngine.ts`): the WASM backend, one thread off an isolated page.
 */
const memories: WebAssembly.Memory[] = []
const NativeMemory = WebAssembly.Memory
// Constructed directly, as Emscripten does for a memory it imports.
WebAssembly.Memory = function (descriptor: WebAssembly.MemoryDescriptor) {
  const m = new NativeMemory(descriptor)
  memories.push(m)
  return m
} as unknown as typeof WebAssembly.Memory
WebAssembly.Memory.prototype = NativeMemory.prototype
// Or exported by the instance, when the module defines its own.
const record = (instance: WebAssembly.Instance) => {
  for (const value of Object.values(instance.exports)) if (value instanceof NativeMemory) memories.push(value)
}
const nativeInstantiate = WebAssembly.instantiate
WebAssembly.instantiate = (async (...args: Parameters<typeof WebAssembly.instantiate>) => {
  const out = await (nativeInstantiate as (...a: unknown[]) => Promise<unknown>)(...args)
  record(out instanceof WebAssembly.Instance ? out : (out as WebAssembly.WebAssemblyInstantiatedSource).instance)
  return out
}) as typeof WebAssembly.instantiate
const nativeStreaming = WebAssembly.instantiateStreaming
WebAssembly.instantiateStreaming = (async (...args: Parameters<typeof WebAssembly.instantiateStreaming>) => {
  const out = await nativeStreaming(...args)
  record(out.instance)
  return out
}) as typeof WebAssembly.instantiateStreaming

const out = document.getElementById('out')!
const MB = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10

async function run() {
  const which = new URLSearchParams(location.search).get('model') === 'm' ? 'm' : 's'
  const url = which === 'm' ? '/bench-data/models/onnx/rtmpose-m.onnx' : '/models/rtmpose-s.onnx'
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.wasmPaths = '/ort/'
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
  const afterLoad = Math.max(0, ...memories.map((m) => m.buffer.byteLength))
  const input = new Float32Array(3 * 256 * 192).fill(0.1)
  const t0 = performance.now()
  for (let i = 0; i < 30; i++) {
    await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 256, 192]) })
  }
  const perRead = (performance.now() - t0) / 30
  const afterRun = Math.max(0, ...memories.map((m) => m.buffer.byteLength))
  const result = {
    model: `rtmpose-${which}`,
    modelMB: MB(bytes.byteLength),
    wasmHeapAfterLoadMB: MB(afterLoad),
    wasmHeapAfterRunMB: MB(afterRun),
    memoriesSeen: memories.length,
    msPerRead: Math.round(perRead),
    jsHeapMB: MB((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0),
  }
  ;(window as unknown as { __footprint: typeof result }).__footprint = result
  out.textContent = JSON.stringify(result, null, 2) + '\ndone'
}

run().catch((e) => {
  out.textContent = `FAILED: ${(e as Error).stack ?? e}`
})
