// UI test setup (jsdom): DOM matchers, cleanup, an in-memory IndexedDB for the data layer, and the
// browser APIs jsdom lacks (matchMedia, IntersectionObserver, ResizeObserver, scrollTo).
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
if (!('IntersectionObserver' in window)) {
  Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: NoopObserver })
  Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: NoopObserver })
}
if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: NoopObserver })
  Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: NoopObserver })
}
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
