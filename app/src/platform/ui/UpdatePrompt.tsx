import { ArrowsClockwiseIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useUiStore } from '../../data/index.ts'
import { useToastStore } from '../../data/stores/toast.ts'
import { cx } from '../../ui/components/cx.ts'
import { useShell } from '../../ui/shell/shellContext.ts'
import { usePwa } from '../pwa/register.ts'

/**
 * The calm update prompt: one inverse pill above the tab bar, like a toast that waits (DESIGN §8.19
 * surface, §7 motion). It never reloads on its own and stays out of the way: not on full-screen flows
 * (camera, tagging, drill), not while an analysis runs, and not over a toast. "Later" hides it until the
 * next launch; the new version then waits for the next Reload.
 */
export function UpdatePrompt() {
  const updateReady = usePwa((s) => s.updateReady)
  const dismissed = usePwa((s) => s.updateDismissed)
  const applyUpdate = usePwa((s) => s.applyUpdate)
  const dismissUpdate = usePwa((s) => s.dismissUpdate)
  const { tabBar } = useShell()
  const analysing = useUiStore((s) => s.activeJob !== null)
  const toastShowing = useToastStore((s) => s.queue.length > 0)
  const reduce = useReducedMotion()
  const show = updateReady && !dismissed && tabBar && !analysing && !toastShowing

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+12px)] z-(--z-toast) flex justify-center gutter"
    >
      <AnimatePresence>
        {show ? (
          <motion.div
            key="update"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.16 }}
            className="pointer-events-auto flex w-full max-w-[350px] items-center gap-3 rounded-card bg-surface-inverse py-2 pr-2 pl-4 text-callout text-ink-inverse"
            data-update-prompt
          >
            <ArrowsClockwiseIcon size={20} aria-hidden="true" className="shrink-0" />
            <span className="flex-1">A new version is ready.</span>
            <button type="button" onClick={dismissUpdate} className={cx(PILL_BUTTON, 'font-label')}>
              Later
            </button>
            <button type="button" onClick={applyUpdate} className={cx(PILL_BUTTON, 'font-strong underline underline-offset-[3px]')}>
              Reload
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

const PILL_BUTTON = 'h-11 shrink-0 rounded-control px-3 text-ink-inverse hover:bg-ink-inverse/10 focus-visible:outline-ink-inverse'
