// Applies the theme before first paint (DESIGN.md §13.3). Loaded with a plain <script src> in <head>,
// which the CSP ('self') allows. Mirrors resolveTheme() in src/ui/theme/resolveTheme.ts; keep them in step.
;(function () {
  var root = document.documentElement
  var pref = { scheme: 'system', courtSide: 'camera' }
  try {
    var raw = window.localStorage.getItem('serve-coach:theme')
    if (raw) {
      var parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (parsed.scheme) pref.scheme = parsed.scheme
        if (parsed.courtSide) pref.courtSide = parsed.courtSide
      }
    }
  } catch (e) {
    // Storage unavailable: fall back to the system appearance.
  }
  var mm = function (q) {
    try {
      return window.matchMedia(q).matches
    } catch (e) {
      return false
    }
  }
  var dark = pref.scheme === 'dark' || (pref.scheme === 'system' && mm('(prefers-color-scheme: dark)'))
  root.dataset.theme = dark ? 'dark' : 'light'
  if (pref.courtSide === 'always' || (pref.courtSide === 'camera' && mm('(prefers-contrast: more)'))) {
    root.dataset.contrast = 'court'
  }
})()
