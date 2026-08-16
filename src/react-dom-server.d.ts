/**
 * `react-dom/server.browser`, which React ships and DefinitelyTyped does not
 * declare.
 *
 * The suite renders the screens through `renderToStaticMarkup` to catch the
 * class of defect an engine test cannot see — a component that throws while
 * rendering stored data. The default `react-dom/server` entry is the Node one,
 * and it reaches `stream` through a dynamic `require` that esbuild cannot bundle
 * into the ESM the runner executes. The browser entry is the same renderer with
 * the streaming half left out, and `renderToStaticMarkup` is not the streaming
 * half — it returns a string.
 *
 * Declared here rather than suppressed at the import with `@ts-expect-error`,
 * because that would type the renderer as `any` and quietly stop checking that
 * a screen is being handed the props it actually takes — which is most of what
 * the render tests are for.
 */
declare module 'react-dom/server.browser' {
  export { renderToStaticMarkup, renderToString } from 'react-dom/server'
}
