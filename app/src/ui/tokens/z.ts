/**
 * z-index layers (DESIGN §5.4). The same values are CSS variables (--z-*) in styles/tokens.css; use
 * `z-(--z-sheet)` in classes and these constants in inline styles. tokens.test.ts keeps them in step.
 */
export const Z = {
  content: 0,
  sticky: 10,
  tabbar: 20,
  videoControls: 30,
  sheet: 40,
  toast: 50,
  camera: 60,
} as const
